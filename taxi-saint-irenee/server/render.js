// Assemblage des pages : chaque vue (views/*.html) déclare ses métadonnées en
// tête, puis est insérée dans le gabarit commun (en-tête, pied de page).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, config } from './config.js';

const VIEWS = path.join(ROOT, 'views');
const PARTIALS = path.join(VIEWS, 'partials');
let cache = null;

const NAV = [
  ['prestations', '/prestations', 'Prestations'],
  ['aeroport', '/aeroport-gares', 'Aéroport & gares'],
  ['conventionne', '/conventionne', 'Conventionné'],
  ['apropos', '/a-propos', 'À propos'],
  ['contact', '/contact', 'Contact'],
];

function parseView(raw) {
  const m = raw.match(/^<!--meta\n([\s\S]*?)\n-->\n?/);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m ? raw.slice(m[0].length) : raw };
}

async function load() {
  const [layout, header, footer, dock] = await Promise.all(['layout', 'header', 'footer', 'dock'].map((n) => readFile(path.join(PARTIALS, `${n}.html`), 'utf8')));
  const views = {};
  for (const file of await readdir(VIEWS)) {
    if (!file.endsWith('.html')) continue;
    views[file.replace(/\.html$/, '')] = parseView(await readFile(path.join(VIEWS, file), 'utf8'));
  }
  return { layout, header, footer, dock, views };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (all, key) => (key in vars ? vars[key] : all));
}

export const PAGES = {
  '/': 'index',
  '/prestations': 'prestations',
  '/aeroport-gares': 'aeroport-gares',
  '/conventionne': 'conventionne',
  '/a-propos': 'a-propos',
  '/contact': 'contact',
  '/reserver': 'reserver',
  '/compte': 'compte',
  '/facture': 'facture',
  '/chauffeur': 'chauffeur',
  '/mentions-legales': 'mentions-legales',
};

export async function renderPage(name, pathname) {
  if (!cache || config.dev) cache = await load();
  const view = cache.views[name];
  if (!view) return null;
  const { meta } = view;
  const nav = NAV.map(([key, href, label]) => `<li><a href="${href}"${meta.nav === key ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const shared = {
    PHONE: config.phoneDisplay, PHONE_TEL: config.phoneTel, WHATSAPP: config.whatsapp,
    YEAR: String(new Date().getFullYear()), SITE_URL: config.siteUrl,
    LOYALTY_STEP: String(config.loyalty.step), LOYALTY_REWARD: esc(config.loyalty.reward),
    COMPANY_LEGAL_NAME: esc(config.company.legalName), COMPANY_ADDRESS: esc(config.company.address || '[adresse du siège à compléter]'),
    COMPANY_SIRET: esc(config.company.siret || '[à compléter]'), COMPANY_ADS: esc(config.company.ads || '[à compléter]'),
    COMPANY_CPAM: esc(config.company.cpam || '[à compléter]'), COMPANY_EMAIL: esc(config.company.email || '[à compléter]'),
    COMPANY_VAT: esc(config.company.vatNumber || '[à compléter]'),
  };
  const body = fill(view.body, shared);
  const header = fill(cache.header, { ...shared, NAV: nav, HEADER_CLASS: meta.header === 'light' ? 'site-header--light' : '' });
  const footer = meta.footer === 'none' ? '' : fill(cache.footer, shared);
  const scripts = (meta.scripts || '').split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => `<script type="module" src="/assets/js/${s}"></script>`).join('\n');
  return fill(cache.layout, {
    ...shared,
    TITLE: esc(meta.title || 'Taxi Saint-Irénée'),
    DESCRIPTION: esc(meta.description || ''),
    CANONICAL: `${config.siteUrl}${pathname === '/' ? '/' : pathname}`,
    ROBOTS: meta.robots || 'index, follow',
    BODY_CLASS: meta.bodyClass || '',
    HEADER: meta.header === 'none' ? '' : header,
    FOOTER: footer,
    DOCK: meta.dock === 'none' ? '' : fill(cache.dock, shared),
    CONTENT: body,
    SCRIPTS: scripts,
    JSONLD: meta.jsonld === 'business' ? businessJsonLd() : '',
  });
}

function businessJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TaxiService',
    name: 'Taxi Saint-Irénée',
    description: 'Taxi conventionné haut de gamme à Lyon et dans la métropole depuis 2014 : courses, aéroport Saint-Exupéry, gares, transport médical assis.',
    url: config.siteUrl,
    telephone: config.phoneTel,
    image: `${config.siteUrl}/assets/img/og-image.png`,
    logo: `${config.siteUrl}/assets/img/apple-touch-icon.png`,
    foundingDate: '2014',
    founder: { '@type': 'Person', name: 'Salim Belgasmi' },
    areaServed: [{ '@type': 'City', name: 'Lyon' }, { '@type': 'AdministrativeArea', name: 'Métropole de Lyon' }],
    provider: { '@type': 'LocalBusiness', name: 'Taxi Saint-Irénée', telephone: config.phoneTel, address: { '@type': 'PostalAddress', addressLocality: 'Lyon', addressCountry: 'FR' } },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}
