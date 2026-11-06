import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pin Turbopack root to this repo (avoids wrong root when a parent lockfile exists). */
const projectRoot = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));

/**
 * Allow LAN + Cloudflare quick-tunnel browsers to load `/_next/*` during `next dev`.
 * Without this, phones/tablets or tunnel hostnames get HTML but blocked JS/HMR —
 * login fields never hydrate, toggles do nothing.
 *
 * Next 16 `allowedDevOrigins` matches Origin/Referer hostname (`*.example.com`
 * wildcards are supported). The process still listens on localhost / 0.0.0.0, so
 * a trycloudflare hostname is a foreign origin even though HTML/API GETs 200.
 *
 * Extra hosts: ALLOWED_DEV_ORIGINS / DEV_TUNNEL_HOST (comma-separated host or URL).
 * AUTH_URL / NEXTAUTH_URL / NEXT_PUBLIC_SITE_URL hostnames are also included.
 *
 * Next compares Origin/Referer *hostname* (no scheme, no port) via
 * `isCsrfOriginAllowed` (`*.example.com` = one label, `**.example.com` = rest).
 */
function extraDevOriginsFromEnv() {
  return [
    process.env.ALLOWED_DEV_ORIGINS,
    process.env.DEV_TUNNEL_HOST,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      try {
        if (entry.includes('://')) {
          const u = new URL(entry);
          return [u.hostname, u.host];
        }
      } catch {
        /* plain host */
      }
      // Next matches hostname only; keep `host:port` and the hostname without port.
      const withPort = entry.match(/^([^[\]]+):(\d+)$/);
      if (withPort) return [entry, withPort[1]];
      return [entry];
    });
}

function warnIfAuthUrlPinnedToQuickTunnel() {
  if (process.env.NODE_ENV !== 'development') return;
  for (const key of ['AUTH_URL', 'NEXTAUTH_URL', 'NEXT_PUBLIC_SITE_URL']) {
    const raw = process.env[key];
    if (!raw) continue;
    try {
      const host = raw.includes('://') ? new URL(raw).hostname : raw.split(':')[0];
      if (host === 'trycloudflare.com' || host.endsWith('.trycloudflare.com')) {
        console.warn(
          `[vcfo] ${key} is pinned to a Cloudflare quick-tunnel hostname. Those rotate every \`cloudflared\` run. Leave it unset (keep AUTH_TRUST_HOST=true) so Auth.js uses the Host the browser opened.`,
        );
        return;
      }
    } catch {
      /* ignore malformed */
    }
  }
}

function lanAllowedDevOrigins() {
  const defaults = [
    '127.0.0.1',
    '127.0.0.1:3000',
    'localhost',
    'localhost:3000',
    '192.168.*.*',
    '10.*.*.*',
    '172.16.*.*',
    '172.17.*.*',
    '172.18.*.*',
    '172.19.*.*',
    '172.20.*.*',
    '172.21.*.*',
    '172.22.*.*',
    '172.23.*.*',
    '172.24.*.*',
    '172.25.*.*',
    '172.26.*.*',
    '172.27.*.*',
    '172.28.*.*',
    '172.29.*.*',
    '172.30.*.*',
    '172.31.*.*',
    // Cloudflare quick tunnels rotate the subdomain every `cloudflared tunnel` run.
    // `*` = one label (quick tunnels); `**` = nested labels (same convention as Next's `**.localhost`).
    '*.trycloudflare.com',
    '**.trycloudflare.com',
  ];
  return [...new Set([...defaults, ...extraDevOriginsFromEnv()])];
}

warnIfAuthUrlPinnedToQuickTunnel();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker image copies `.next/standalone` + `.next/static` + `public` only.
  output: 'standalone',
  // Dev-only; ignored by `next start`. Required for office-WiFi / phone testing.
  allowedDevOrigins: lanAllowedDevOrigins(),
  turbopack: {
    root: projectRoot,
  },
  // fs.readFileSync(process.cwd(), 'public/templates/...') is not auto-traced on Vercel.
  // react-pdf ships its own font/layout engine; bundling it breaks at runtime.
  serverExternalPackages: ['@react-pdf/renderer', 'unpdf'],
  outputFileTracingIncludes: {
    // Pre-2 picks the foreign or an Indian (NOC) template per project.
    '/api/engagements/[id]/board-resolution/generate': [
      './public/templates/boardResolution*.docx',
      './public/templates/board-resolution-template.docx',
    ],
    '/api/engagements/[id]/board-resolution/status': [
      './public/templates/boardResolution*.docx',
    ],
    '/api/engagements/[id]/incorporation-docs/generate': [
      './public/templates/dir-2.docx',
      './public/templates/dir-8.docx',
      './public/templates/inc-9.docx',
      './public/templates/pan-undertaking.docx',
    ],
    '/api/engagements/[id]/dir-2/generate': ['./public/templates/dir-2.docx'],
  },
};

export default nextConfig;
