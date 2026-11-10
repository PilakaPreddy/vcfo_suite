import { createHash, constants, verify, X509Certificate } from 'node:crypto';

/**
 * PDF SIGNATURE READER — pure. It finds each signature in a PDF Buffer (`/ByteRange` and the hex
 * `/Contents` between the two ranges), walks the CMS with a small DER reader, checks the
 * messageDigest attribute against the digest of the ByteRange bytes, and verifies the signature
 * with the signer's certificate through node:crypto.
 *
 * WHAT THIS DOES NOT CHECK: the trust chain to the CCA India root, revocation (CRL or OCSP) and
 * any timestamp token. A certificate that any key could have made passes `signatureOk`. The
 * result says "these bytes were signed by the private key of the certificate inside the file,
 * whose name and dates are these"; it never says that a licensed authority issued it. The MCA
 * portal makes that check when the form is uploaded. Software never signs.
 */
export const TRUST_CHAIN_CHECKED = false;

export interface PdfSignatureReport {
  /** 1-based, in file order. */
  index: number;
  /** The certificate subject CN, or null when no signer certificate could be read. */
  signerName: string | null;
  serial: string | null;
  issuerName: string | null;
  /** ISO times from the certificate. */
  validFrom: string | null;
  validTo: string | null;
  /** The signed signingTime attribute, else the signature dictionary's /M; null when neither exists. */
  signingTime: string | null;
  digestAlgorithm: string | null;
  /** The messageDigest attribute equals the digest of the ByteRange bytes. */
  digestOk: boolean;
  /** The signature verifies with the signer certificate's public key. */
  signatureOk: boolean;
  /** Signing time outside the certificate's dates; null when the signing time is unknown. */
  expiredAtSigning: boolean | null;
  /** The ByteRange reaches the end of the file, so nothing was appended after this signature. */
  coversFile: boolean;
  /** Why the signature could not be read; null when it was read. */
  error: string | null;
}

/* ------------------------------------------------------------------------------------------ */
/* A small DER reader. It accepts BER indefinite lengths too, which some signing tools write.  */
/* ------------------------------------------------------------------------------------------ */

interface Der {
  tag: number;
  constructed: boolean;
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  children: Der[];
}

const MAX_DEPTH = 40;
const MAX_NODES = 200_000;

function readDer(buf: Buffer, pos: number, limit: number, depth: number, count: { n: number }): Der {
  if (depth > MAX_DEPTH) throw new Error('der_too_deep');
  if (++count.n > MAX_NODES) throw new Error('der_too_large');
  if (pos + 2 > limit) throw new Error('der_truncated');
  const start = pos;
  const tag = buf[pos++]!;
  if ((tag & 0x1f) === 0x1f) throw new Error('der_long_tag');
  const constructed = (tag & 0x20) !== 0;
  const first = buf[pos++]!;
  let length = -1;
  if (first < 0x80) length = first;
  else if (first > 0x80) {
    const bytes = first & 0x7f;
    if (bytes > 4 || pos + bytes > limit) throw new Error('der_bad_length');
    length = 0;
    for (let i = 0; i < bytes; i += 1) length = length * 256 + buf[pos++]!;
  } else if (!constructed) throw new Error('der_bad_length');

  const children: Der[] = [];
  if (length < 0) {
    // Indefinite: children until the 00 00 end marker.
    for (;;) {
      if (pos + 2 > limit) throw new Error('der_truncated');
      if (buf[pos] === 0 && buf[pos + 1] === 0) break;
      const child = readDer(buf, pos, limit, depth + 1, count);
      children.push(child);
      pos = child.end;
    }
    return { tag, constructed, start, contentStart: children[0]?.start ?? pos, contentEnd: pos, end: pos + 2, children };
  }
  const contentStart = pos;
  const contentEnd = pos + length;
  if (contentEnd > limit) throw new Error('der_truncated');
  if (constructed) {
    let at = contentStart;
    while (at < contentEnd) {
      const child = readDer(buf, at, contentEnd, depth + 1, count);
      children.push(child);
      at = child.end;
    }
  }
  return { tag, constructed, start, contentStart, contentEnd, end: contentEnd, children };
}

const raw = (buf: Buffer, n: Der): Buffer => buf.subarray(n.start, n.end);
const content = (buf: Buffer, n: Der): Buffer => buf.subarray(n.contentStart, n.contentEnd);

function oidOf(buf: Buffer, n: Der | undefined): string | null {
  if (!n || n.tag !== 0x06) return null;
  const bytes = content(buf, n);
  if (bytes.length === 0) return null;
  const parts: number[] = [Math.min(Math.floor(bytes[0]! / 40), 2)];
  parts.push(bytes[0]! - parts[0]! * 40);
  let value = 0;
  for (let i = 1; i < bytes.length; i += 1) {
    value = value * 128 + (bytes[i]! & 0x7f);
    if ((bytes[i]! & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

/** An OCTET STRING's bytes; a BER constructed one is joined. */
function octets(buf: Buffer, n: Der): Buffer {
  if (!n.constructed) return content(buf, n);
  return Buffer.concat(n.children.map((c) => octets(buf, c)));
}

function derTime(buf: Buffer, n: Der | undefined): Date | null {
  if (!n || (n.tag !== 0x17 && n.tag !== 0x18)) return null;
  const s = content(buf, n).toString('latin1');
  const m = n.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(s);
  if (!m) return null;
  let year = Number(m[1]);
  if (n.tag === 0x17) year += year < 50 ? 2000 : 1900;
  const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------------------------------ */
/* Algorithms                                                                                   */
/* ------------------------------------------------------------------------------------------ */

const DIGESTS: Record<string, string> = {
  '1.3.14.3.2.26': 'sha1',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
  '2.16.840.1.101.3.4.2.4': 'sha224',
};
const RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const RSA_PSS = '1.2.840.113549.1.1.10';
const EC_PUBLIC_KEY = '1.2.840.10045.2.1';
/** A signature algorithm that names its own hash. */
const HASH_IN_SIGNATURE: Record<string, string> = {
  '1.2.840.113549.1.1.5': 'sha1',
  '1.2.840.113549.1.1.11': 'sha256',
  '1.2.840.113549.1.1.12': 'sha384',
  '1.2.840.113549.1.1.13': 'sha512',
  '1.2.840.113549.1.1.14': 'sha224',
  '1.2.840.10045.4.1': 'sha1',
  '1.2.840.10045.4.3.1': 'sha224',
  '1.2.840.10045.4.3.2': 'sha256',
  '1.2.840.10045.4.3.3': 'sha384',
  '1.2.840.10045.4.3.4': 'sha512',
};
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

/* ------------------------------------------------------------------------------------------ */
/* The signature in the PDF                                                                     */
/* ------------------------------------------------------------------------------------------ */

const BYTE_RANGE = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
const PDF_DATE = /\/M\s*\(D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([+-])(\d{2})'?(\d{2})?'?|Z)?[^)]*\)/;

function hashRanges(pdf: Buffer, algorithm: string, a: number, b: number, c: number, d: number): Buffer {
  return createHash(algorithm).update(pdf.subarray(a, a + b)).update(pdf.subarray(c, c + d)).digest();
}

/** The /M date of the signature dictionary around this /ByteRange. */
function dictionaryDate(latin: string, at: number): Date | null {
  const from = Math.max(latin.lastIndexOf(' obj', at), 0);
  const end = latin.indexOf('endobj', at);
  const m = PDF_DATE.exec(latin.slice(from, end < 0 ? at + 4000 : end));
  if (!m) return null;
  const offset = m[7] ? (m[7] === '-' ? -1 : 1) * (Number(m[8] ?? 0) * 60 + Number(m[9] ?? 0)) : 0;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2] ?? 1) - 1, Number(m[3] ?? 1), Number(m[4] ?? 0), Number(m[5] ?? 0) - offset, Number(m[6] ?? 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

function coversWholeFile(pdf: Buffer, rangeEnd: number): boolean {
  // A trailing newline after %%EOF changes nothing a reader shows; anything else is new content.
  for (let i = rangeEnd; i < pdf.length; i += 1) {
    const ch = pdf[i]!;
    if (ch !== 0x0a && ch !== 0x0d && ch !== 0x20 && ch !== 0x00) return false;
  }
  return true;
}

function empty(index: number, coversFile: boolean, error: string): PdfSignatureReport {
  return {
    index,
    signerName: null,
    serial: null,
    issuerName: null,
    validFrom: null,
    validTo: null,
    signingTime: null,
    digestAlgorithm: null,
    digestOk: false,
    signatureOk: false,
    expiredAtSigning: null,
    coversFile,
    error,
  };
}

function subjectCn(multiLine: string): string | null {
  for (const line of multiLine.split('\n')) {
    const m = /^CN=(.*)$/.exec(line.trim());
    if (m) return m[1]!.replace(/\\(.)/g, '$1').replace(/^"|"$/g, '').trim() || null;
  }
  return null;
}

/** The certificate the signer identifier names, from the CMS `certificates` set. */
function findSignerCert(cms: Buffer, certs: Der[], sid: Der): X509Certificate | null {
  for (const cert of certs) {
    if (cert.tag !== 0x30) continue;
    const tbs = cert.children[0];
    if (!tbs) continue;
    const hasVersion = tbs.children[0]?.tag === 0xa0;
    const serial = tbs.children[hasVersion ? 1 : 0];
    const issuer = tbs.children[hasVersion ? 3 : 2];
    if (!serial || !issuer) continue;
    let match = false;
    if (sid.tag === 0x30) {
      const [sidIssuer, sidSerial] = sid.children;
      match = Boolean(sidIssuer && sidSerial) && raw(cms, issuer).equals(raw(cms, sidIssuer!)) && content(cms, serial).equals(content(cms, sidSerial!));
    }
    // A subject key identifier: the bytes sit in the certificate's extension. A wrong pick
    // cannot pass, because the signature is then verified with that certificate's key.
    if (sid.tag === 0x80) match = raw(cms, cert).includes(content(cms, sid));
    if (match) {
      try {
        return new X509Certificate(raw(cms, cert));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function verifySignature(input: {
  sigOid: string | null;
  sigParams: Der | undefined;
  digestName: string;
  data: Buffer;
  signature: Buffer;
  cert: X509Certificate;
  cms: Buffer;
}): boolean {
  const { sigOid, sigParams, digestName, data, signature, cert, cms } = input;
  if (!sigOid) return false;
  try {
    if (sigOid === RSA_PSS) {
      // RSASSA-PSS-params [0] holds the hash; absent means SHA-1 by the standard's default.
      const hashNode = sigParams?.children.find((c) => c.tag === 0xa0)?.children[0]?.children[0];
      const hash = (hashNode && DIGESTS[oidOf(cms, hashNode) ?? '']) || 'sha1';
      return verify(hash, data, { key: cert.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_AUTO }, signature);
    }
    const hash = sigOid === RSA_ENCRYPTION || sigOid === EC_PUBLIC_KEY ? digestName : HASH_IN_SIGNATURE[sigOid];
    if (!hash) return false;
    return verify(hash, data, cert.publicKey, signature);
  } catch {
    return false;
  }
}

function readOne(pdf: Buffer, latin: string, index: number, at: number, range: [number, number, number, number]): PdfSignatureReport {
  const [a, b, c, d] = range;
  const inFile = a === 0 && b > 0 && c >= a + b + 2 && c + d <= pdf.length;
  const coversFile = inFile && coversWholeFile(pdf, c + d);
  if (!inFile) return empty(index, false, 'bad_byte_range');
  if (pdf[a + b] !== 0x3c || pdf[c - 1] !== 0x3e) return empty(index, coversFile, 'bad_contents');

  const hex = latin.slice(a + b + 1, c - 1).replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length < 2) return empty(index, coversFile, 'bad_contents');
  const cms = Buffer.from(hex, 'hex');

  try {
    const count = { n: 0 };
    const root = readDer(cms, 0, cms.length, 0, count);
    if (oidOf(cms, root.children[0]) !== OID_SIGNED_DATA) return empty(index, coversFile, 'not_signed_data');
    const signedData = root.children[1]?.children[0];
    if (!signedData) return empty(index, coversFile, 'not_signed_data');

    // SignedData: version, digestAlgorithms, encapContentInfo, [0] certificates, [1] crls, signerInfos.
    const encap = signedData.children[2];
    const certs = signedData.children.find((n) => n.tag === 0xa0)?.children ?? [];
    const signerInfos = signedData.children[signedData.children.length - 1];
    const signerInfo = signerInfos?.tag === 0x31 ? signerInfos.children[0] : undefined;
    if (!signerInfo) return empty(index, coversFile, 'no_signer_info');

    // SignerInfo: version, sid, digestAlgorithm, [0] signedAttrs, signatureAlgorithm, signature, ...
    const parts = signerInfo.children;
    const sid = parts[1];
    const digestAlgId = parts[2];
    const hasAttrs = parts[3]?.tag === 0xa0;
    const signedAttrs = hasAttrs ? parts[3] : undefined;
    const sigAlg = parts[hasAttrs ? 4 : 3];
    const sigValue = parts[hasAttrs ? 5 : 4];
    if (!sid || !digestAlgId || !sigAlg || !sigValue) return empty(index, coversFile, 'bad_signer_info');

    const digestOid = oidOf(cms, digestAlgId.children[0]);
    const digestName = digestOid ? DIGESTS[digestOid] : undefined;
    if (!digestName) return empty(index, coversFile, 'unsupported_digest');

    const actual = hashRanges(pdf, digestName, a, b, c, d);
    let digestOk = false;
    let detachedNoAttrs = false;
    let attrTime: Date | null = null;
    let verifiedData: Buffer;
    if (signedAttrs) {
      for (const attr of signedAttrs.children) {
        const oid = oidOf(cms, attr.children[0]);
        const value = attr.children[1]?.children[0];
        if (oid === OID_MESSAGE_DIGEST && value) digestOk = octets(cms, value).equals(actual);
        if (oid === OID_SIGNING_TIME) attrTime = derTime(cms, value);
      }
      // The signature covers the attributes as a SET (the [0] tag replaced by 0x31).
      verifiedData = Buffer.from(raw(cms, signedAttrs));
      verifiedData[0] = 0x31;
    } else {
      // No signed attributes: the old adbe.pkcs7.sha1 carries the digest as the content; a
      // detached one signs the bytes themselves.
      const econtent = encap?.children[1]?.children[0];
      if (econtent) {
        const inner = octets(cms, econtent);
        digestOk = inner.equals(actual);
        verifiedData = Buffer.from(inner);
      } else {
        detachedNoAttrs = true;
        verifiedData = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]);
      }
    }

    const cert = findSignerCert(cms, certs, sid);
    if (!cert) return { ...empty(index, coversFile, 'no_signer_certificate'), digestAlgorithm: digestName, digestOk };

    const signatureOk = verifySignature({
      sigOid: oidOf(cms, sigAlg.children[0]),
      sigParams: sigAlg.children[1],
      digestName,
      data: verifiedData,
      signature: octets(cms, sigValue),
      cert,
      cms,
    });
    // A detached signature with no attributes has no separate digest: its signature is the check.
    if (detachedNoAttrs) digestOk = signatureOk;

    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const when = attrTime ?? dictionaryDate(latin, at);
    return {
      index,
      signerName: subjectCn(cert.subject),
      serial: cert.serialNumber,
      issuerName: subjectCn(cert.issuer),
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      signingTime: when ? when.toISOString() : null,
      digestAlgorithm: digestName,
      digestOk,
      signatureOk,
      expiredAtSigning: when ? when.getTime() > validTo.getTime() || when.getTime() < validFrom.getTime() : null,
      coversFile,
      error: null,
    };
  } catch (e) {
    return empty(index, coversFile, e instanceof Error && e.message.startsWith('der_') ? e.message : 'unreadable_signature');
  }
}

/** Every signature in the PDF, in file order; empty when there is none. Never throws. */
export function readPdfSignatures(pdf: Buffer): PdfSignatureReport[] {
  const latin = pdf.toString('latin1');
  const seen = new Set<string>();
  const found: Array<{ at: number; range: [number, number, number, number] }> = [];
  BYTE_RANGE.lastIndex = 0;
  for (let m = BYTE_RANGE.exec(latin); m; m = BYTE_RANGE.exec(latin)) {
    const range: [number, number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    const key = range.join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ at: m.index, range });
  }
  found.sort((x, y) => x.range[2] - y.range[2]);
  return found.map((f, i) => readOne(pdf, latin, i + 1, f.at, f.range));
}
