// Comportements communs : en-tête, menu, dock, apparitions, reflets du verre.
import { getMe } from './api.js';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

// ── En-tête et dock selon le défilement ─────────────────────────────
const header = document.querySelector('[data-header]');
const dock = document.querySelector('[data-dock]');
let lastY = scrollY;
let ticking = false;
function onScroll() {
  const y = scrollY;
  header?.classList.toggle('is-scrolled', y > 24);
  if (dock && !document.body.classList.contains('menu-open')) {
    const goingDown = y > lastY + 6;
    const goingUp = y < lastY - 6;
    if (goingDown && y > 320) dock.classList.add('is-hidden');
    else if (goingUp || y < 120) dock.classList.remove('is-hidden');
  }
  lastY = y;
  ticking = false;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

// Le dock s'efface quand le clavier virtuel est ouvert
document.addEventListener('focusin', (e) => {
  if (dock && e.target.matches('input, textarea, select')) dock.classList.add('is-hidden');
});
document.addEventListener('focusout', (e) => {
  if (dock && e.target.matches('input, textarea, select')) setTimeout(() => {
    if (!document.activeElement?.matches('input, textarea, select')) dock.classList.remove('is-hidden');
  }, 120);
});

// ── Menu mobile ─────────────────────────────────────────────────────
const toggle = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
if (toggle && menu) {
  menu.querySelectorAll('.mobile-menu__links a').forEach((a, i) => a.style.setProperty('--i', i));
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    } else {
      menu.classList.remove('is-open');
      setTimeout(() => { if (toggle.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, reduceMotion ? 0 : 350);
    }
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); } });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  matchMedia('(min-width: 1041px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
}

// ── Variables CSS portées par des attributs (CSP sans style en ligne) ─
export function applyVars(scope = document) {
  scope.querySelectorAll('[data-d], [data-n], [data-w]').forEach((el) => {
    if (el.dataset.d) el.style.setProperty('--d', el.dataset.d);
    if (el.dataset.n) el.style.setProperty('--n', el.dataset.n);
    if (el.dataset.w) el.style.setProperty('--w', el.dataset.w);
  });
}
applyVars();

// ── Apparitions au défilement ───────────────────────────────────────
document.querySelectorAll('[data-stagger]').forEach((group) => {
  [...group.children].forEach((child, i) => {
    if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', group.dataset.stagger || '');
    child.style.setProperty('--d', Math.min(i, 8));
  });
});
const revealables = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealables.forEach((el) => io.observe(el));
} else {
  revealables.forEach((el) => el.classList.add('is-in'));
}
export function reveal(scope = document) {
  applyVars(scope);
  const items = scope.querySelectorAll('[data-reveal]:not(.is-in)');
  items.forEach((el, i) => { if (!el.dataset.d) el.style.setProperty('--d', Math.min(i, 8)); });
  requestAnimationFrame(() => requestAnimationFrame(() => items.forEach((el) => el.classList.add('is-in'))));
}

// ── Reflet du verre qui suit le pointeur ────────────────────────────
if (finePointer && !reduceMotion) {
  let target = null;
  let frame = 0;
  let pos = { x: 0, y: 0 };
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.glass, [data-glow]');
    if (!el) return;
    target = el;
    pos = { x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${pos.x - r.left}px`);
      target.style.setProperty('--my', `${pos.y - r.top}px`);
    });
  }, { passive: true });
}

// ── Lien « compte » selon la connexion ──────────────────────────────
getMe().then((user) => {
  if (!user) return;
  document.querySelectorAll('[data-account-label]').forEach((el) => { el.textContent = 'Espace'; });
  document.querySelectorAll('[data-account-link]').forEach((el) => el.setAttribute('aria-label', `Espace client de ${user.firstName}`));
});

// Année courante, liens d'appel suivis, etc.
root.classList.add('js');
