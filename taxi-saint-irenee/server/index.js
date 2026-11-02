import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { ROOT, config } from './config.js';
import { db } from './db.js';
import { handleApi } from './api.js';
import { renderPage, PAGES } from './render.js';
import { qrTarget, recordScan } from './qr.js';

const PUBLIC = path.join(ROOT, 'public');
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.json', '.webmanifest', '.txt', '.xml']);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://data.geopf.fr https://api-adresse.data.gouv.fr",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

const compressedCache = new Map();
async function sendBody(req, res, status, body, ext, headers = {}) {
  const accept = req.headers['accept-encoding'] || '';
  let payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', Vary: 'Accept-Encoding', ...headers };
  if (COMPRESSIBLE.has(ext) && payload.length > 1024) {
    const enc = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null;
    if (enc) {
      const key = headers['X-Cache-Key'] ? `${enc}:${headers['X-Cache-Key']}` : null;
      let out = key && compressedCache.get(key);
      if (!out) {
        out = enc === 'br' ? await brotli(payload, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : await gzip(payload);
        if (key) compressedCache.set(key, out);
      }
      payload = out;
      h['Content-Encoding'] = enc;
    }
  }
  delete h['X-Cache-Key'];
  h['Content-Length'] = payload.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : payload);
}

async function serveStatic(req, res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC, decoded));
  if (!file.startsWith(PUBLIC + path.sep)) return false;
  let info;
  try { info = await stat(file); } catch { return false; }
  if (!info.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return true; }
  const immutable = pathname.startsWith('/assets/');
  await sendBody(req, res, 200, await readFile(file), ext, {
    ETag: etag,
    'Cache-Control': immutable && !config.dev ? 'public, max-age=604800, stale-while-revalidate=86400' : 'public, max-age=3600',
    'X-Cache-Key': `${file}:${info.mtimeMs}`,
  });
  return true;
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
  const { pathname } = url;

  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }

    // Anciennes adresses en .html → adresses propres
    if (pathname.endsWith('.html')) {
      const clean = pathname === '/index.html' ? '/' : pathname.replace(/\.html$/, '');
      if (PAGES[clean]) { res.writeHead(301, { Location: clean + url.search }); res.end(); return; }
    }
    // QR code permanent : redirection temporaire (302) pour que la destination reste modifiable
    if (pathname === '/qr' || pathname === '/qr/') {
      recordScan();
      res.writeHead(302, { Location: qrTarget(), 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    const page = PAGES[pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname];
    if (page) {
      const html = await renderPage(page, pathname);
      return sendBody(req, res, 200, html, '.html', { 'Cache-Control': 'no-cache', 'X-Cache-Key': config.dev ? undefined : `page:${page}` });
    }
    if (pathname === '/sitemap.xml') return sendBody(req, res, 200, sitemap(), '.xml', { 'Cache-Control': 'public, max-age=86400' });
    if (pathname === '/robots.txt') return sendBody(req, res, 200, `User-agent: *\nDisallow: /compte\nDisallow: /chauffeur\nDisallow: /facture\nDisallow: /api/\nSitemap: ${config.siteUrl}/sitemap.xml\n`, '.txt');
    if (await serveStatic(req, res, pathname)) return;

    const html = await renderPage('404', pathname);
    return sendBody(req, res, 404, html || 'Page introuvable', '.html', { 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Erreur serveur'); }
  }
});

function sitemap() {
  const pub = ['/', '/prestations', '/aeroport-gares', '/conventionne', '/a-propos', '/contact', '/reserver', '/mentions-legales'];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pub.map((p) => `  <url><loc>${config.siteUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
}

await db.load();
server.listen(config.port, () => {
  console.log(`Taxi Saint-Irénée en ligne sur http://localhost:${config.port}`);
  if (!config.driverPassword) console.warn('⚠ DRIVER_PASSWORD non défini : l’espace /chauffeur est inaccessible.');
  if (!config.ntfyUrl && !config.resendKey) console.warn('⚠ Aucune notification configurée (NTFY_URL ou RESEND_API_KEY) : consultez /chauffeur pour voir les demandes.');
});
