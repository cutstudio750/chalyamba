// Autocomplétion d'adresses : Base Adresse Nationale (Géoplateforme IGN),
// lieux fréquents de Lyon et adresses enregistrées du client.
import { esc, icon } from './api.js';

export const PLACES = [
  { label: 'Aéroport Lyon Saint-Exupéry', address: 'Aéroport Lyon Saint-Exupéry, 69125 Colombier-Saugnieu', icon: 'plane' },
  { label: 'Gare Part-Dieu', address: 'Gare de Lyon Part-Dieu, 5 Place Charles Béraudier, 69003 Lyon', icon: 'train' },
  { label: 'Gare de Perrache', address: 'Gare de Lyon Perrache, 14 Cours de Verdun Rambaud, 69002 Lyon', icon: 'train' },
  { label: 'Gare Saint-Exupéry TGV', address: 'Gare Lyon Saint-Exupéry TGV, 69125 Colombier-Saugnieu', icon: 'train' },
  { label: 'Hôpital Édouard Herriot', address: "Hôpital Édouard Herriot, 5 Place d'Arsonval, 69003 Lyon", icon: 'medical' },
  { label: 'Centre hospitalier Lyon Sud', address: 'Centre hospitalier Lyon Sud, 165 Chemin du Grand Revoyet, 69310 Pierre-Bénite', icon: 'medical' },
  { label: 'Centre Léon Bérard', address: 'Centre Léon Bérard, 28 Rue Laennec, 69008 Lyon', icon: 'medical' },
  { label: 'Hôpital de la Croix-Rousse', address: 'Hôpital de la Croix-Rousse, 103 Grande Rue de la Croix-Rousse, 69004 Lyon', icon: 'medical' },
];

const ENDPOINTS = [
  (q) => `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=6&lat=45.7578&lon=4.832`,
  (q) => `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6&lat=45.7578&lon=4.832`,
];
const REVERSE = [
  (lat, lon) => `https://data.geopf.fr/geocodage/reverse?lat=${lat}&lon=${lon}&limit=1`,
  (lat, lon) => `https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}&limit=1`,
];

async function fetchFirst(urls, signal) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.features)) return data.features;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
    }
  }
  return [];
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let uid = 0;

export function attachAddress(input, { saved = () => [] } = {}) {
  const wrap = input.closest('.input-icon') || input.parentElement;
  wrap.style.position = 'relative';
  const list = document.createElement('ul');
  const id = `ac-${++uid}`;
  list.id = id;
  list.className = 'ac-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.append(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', id);
  input.setAttribute('autocomplete', 'off');

  let items = [];
  let active = -1;
  let ctrl = null;
  let timer = 0;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); };
  const choose = (item) => {
    input.value = item.address;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new CustomEvent('address:select', { bubbles: true, detail: item }));
    close();
  };
  const render = (groups) => {
    items = [];
    const html = [];
    for (const g of groups) {
      if (!g.items.length) continue;
      if (g.title) html.push(`<li class="ac-list__group" role="presentation">${esc(g.title)}</li>`);
      for (const it of g.items) {
        const i = items.push(it) - 1;
        html.push(`<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="false">${icon(it.icon || 'pin')}<span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></li>`);
      }
    }
    if (!items.length) { close(); return; }
    list.innerHTML = html.join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const setActive = (i) => {
    const opts = list.querySelectorAll('[role="option"]');
    opts.forEach((o) => o.setAttribute('aria-selected', 'false'));
    active = (i + items.length) % items.length;
    const el = opts[active];
    if (el) { el.setAttribute('aria-selected', 'true'); el.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', el.id); }
  };

  const suggestDefaults = (q = '') => {
    const nq = norm(q);
    const mine = saved().map((a) => ({ label: a.label, sub: a.address, address: a.address, icon: a.label.toLowerCase().includes('domicile') ? 'home' : 'star' }));
    const match = (it) => !nq || norm(`${it.label} ${it.address}`).includes(nq);
    return [
      { title: mine.length ? 'Vos adresses' : '', items: mine.filter(match).slice(0, 5) },
      { title: 'Lieux fréquents', items: PLACES.filter(match).map((p) => ({ ...p, sub: p.address.split(', ').slice(1).join(', ') })).slice(0, nq ? 3 : 4) },
    ];
  };

  input.addEventListener('focus', () => { if (!input.value.trim()) render(suggestDefaults()); });
  input.addEventListener('input', (e) => {
    if (e.isTrusted === false) return;
    const q = input.value.trim();
    clearTimeout(timer);
    ctrl?.abort();
    if (q.length < 3) { render(suggestDefaults(q)); return; }
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      const local = suggestDefaults(q);
      try {
        const features = await fetchFirst(ENDPOINTS.map((f) => f(q)), ctrl.signal);
        const results = features.map((f) => {
          const p = f.properties || {};
          const main = p.name || p.label;
          const sub = [p.postcode, p.city].filter(Boolean).join(' ');
          return { label: main, sub: sub && !main.includes(sub) ? sub : (p.context || ''), address: p.label || main, icon: 'pin' };
        });
        render([...local.filter((g) => g.items.length).map((g) => ({ ...g, items: g.items.slice(0, 2) })), { title: results.length ? 'Adresses' : '', items: results }]);
      } catch { /* requête annulée */ }
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 160));
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) { e.preventDefault(); choose(items[Number(li.dataset.i)]); }
  });
}

export function locate(input, button) {
  if (!('geolocation' in navigator)) return;
  button.hidden = false;
  button.addEventListener('click', () => {
    button.setAttribute('aria-busy', 'true');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const features = await fetchFirst(REVERSE.map((f) => f(lat.toFixed(6), lon.toFixed(6))), undefined).catch(() => []);
      button.removeAttribute('aria-busy');
      if (features[0]) {
        input.value = features[0].properties.label;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new CustomEvent('address:select', { bubbles: true, detail: { address: input.value } }));
      } else {
        input.value = `Ma position (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
      }
    }, () => { button.removeAttribute('aria-busy'); input.focus(); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}
