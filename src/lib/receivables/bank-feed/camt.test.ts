import { describe, expect, it } from 'vitest';
import { parseCamt } from './camt';
import { parseXml } from './xml';

/** A camt.053 statement in the ISO 20022 layout, with the cases a real HSBC file carries. */
const STATEMENT = `<?xml version="1.0" encoding="UTF-8"?>
<!-- statement export -->
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STMT-20261103</MsgId></GrpHdr>
    <Stmt>
      <Acct><Id><Othr><Id>071-123456-001</Id></Othr></Id><Ccy>INR</Ccy></Acct>
      <Ntry>
        <Amt Ccy="INR">22757764.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-01</Dt></BookgDt>
        <ValDt><Dt>2026-11-01</Dt></ValDt>
        <AcctSvcrRef>HSBC-IN-0001</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>INV-SEP-EMB</EndToEndId></Refs>
          <AmtDtls><InstdAmt><Amt Ccy="USD">272800.00</Amt></InstdAmt></AmtDtls>
          <RltdPties><Dbtr><Nm>EMBURSE INC</Nm></Dbtr></RltdPties>
          <RmtInf><Ustrd>September services</Ustrd><Ustrd>SC/09/01</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="INR">50000.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-01</Dt></BookgDt>
        <AcctSvcrRef>HSBC-IN-0002</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="INR">3138560.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><DtTm>2026-11-03T10:12:00+05:30</DtTm></BookgDt>
        <NtryRef>HSBC-IN-0003</NtryRef>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Pty><Nm>INSPIRED EDUCATION LTD &amp; CO</Nm></Pty></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="INR">1000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>PDNG</Sts>
        <BookgDt><Dt>2026-11-03</Dt></BookgDt>
        <AcctSvcrRef>HSBC-IN-0004</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="INR">2000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-03</Dt></BookgDt>
        <AddtlNtryInf>NEFT CR BONTERRA</AddtlNtryInf>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe('parseCamt', () => {
  it('reads booked INR credits from a camt.053 statement', () => {
    const r = parseCamt(STATEMENT);
    expect(r.kind).toBe('camt.053');
    expect(r.account).toBe('071-123456-001');
    expect(r.credits).toEqual([
      { source: 'manual', externalRef: 'HSBC-IN-0001', valueDate: '2026-11-01', payer: 'EMBURSE INC', currency: 'USD', fcAmount: 272800, inrAmount: 22757764, narration: 'September services · SC/09/01' },
      { source: 'manual', externalRef: 'HSBC-IN-0003', valueDate: '2026-11-03', payer: 'INSPIRED EDUCATION LTD & CO', currency: 'INR', fcAmount: null, inrAmount: 3138560, narration: '' },
    ]);
    expect(r.skipped).toEqual(['Entry 4: not booked yet (PDNG).', 'Entry 5: no bank reference, so it could be counted twice.']);
  });

  it('reads a camt.054 credit notification with namespace prefixes', () => {
    const xml = `<n:Document xmlns:n="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08"><n:BkToCstmrDbtCdtNtfctn><n:Ntfctn>
      <n:Acct><n:Id><n:IBAN>IN00HSBC0001</n:IBAN></n:Id></n:Acct>
      <n:Ntry><n:Amt Ccy='INR'>1661450</n:Amt><n:CdtDbtInd>CRDT</n:CdtDbtInd><n:Sts><n:Cd>BOOK</n:Cd></n:Sts>
        <n:ValDt><n:Dt>2026-11-03</n:Dt></n:ValDt>
        <n:NtryDtls><n:TxDtls><n:Refs><n:TxId>TX-9</n:TxId></n:Refs><n:RltdPties><n:UltmtDbtr><n:Nm>Bonterra Inc</n:Nm></n:UltmtDbtr></n:RltdPties></n:TxDtls></n:NtryDtls>
      </n:Ntry></n:Ntfctn></n:BkToCstmrDbtCdtNtfctn></n:Document>`;
    const r = parseCamt(xml, 'hsbc_api');
    expect(r).toMatchObject({ kind: 'camt.054', account: 'IN00HSBC0001', skipped: [] });
    expect(r.credits).toEqual([{ source: 'hsbc_api', externalRef: 'TX-9', valueDate: '2026-11-03', payer: 'Bonterra Inc', currency: 'INR', fcAmount: null, inrAmount: 1661450, narration: '' }]);
  });

  it('skips entries in another currency', () => {
    const xml = `<Document><BkToCstmrStmt><Stmt><Ntry><Amt Ccy="USD">10</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-03</Dt></BookgDt><AcctSvcrRef>X</AcctSvcrRef></Ntry></Stmt></BkToCstmrStmt></Document>`;
    expect(parseCamt(xml)).toMatchObject({ credits: [], skipped: ['Entry 1: USD 10, not an INR account entry.'] });
  });

  it('says unknown for a file that is not a statement', () => {
    expect(parseCamt('<Document><Other/></Document>')).toMatchObject({ kind: 'unknown', credits: [] });
  });
});

describe('parseXml', () => {
  it('handles CDATA, entities and self-closing tags, and refuses broken files', () => {
    const t = parseXml('<a x="1 &lt; 2"><b/><c><![CDATA[<raw>]]> &#65;&#x42;</c></a>');
    expect(t.children[0].attrs.x).toBe('1 < 2');
    expect(t.children[0].children.map((c) => c.name)).toEqual(['b', 'c']);
    expect(t.children[0].children[1].text).toBe('<raw> AB');
    expect(() => parseXml('<a><b></a>')).toThrow('xml_mismatched_tag');
    expect(() => parseXml('<a>')).toThrow('xml_unclosed_tag');
  });

  it('ignores a DOCTYPE and never expands custom entities', () => {
    const t = parseXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><a>&e;</a>');
    expect(t.children.at(-1)?.text).toBe('&e;');
  });
});
