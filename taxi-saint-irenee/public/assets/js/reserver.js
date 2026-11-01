import { api, getMe, toast, showFieldError, clearFieldErrors, fmtDate, fmtTime, parisNow, fmtPhone, esc } from './api.js';
import { attachAddress, locate, PLACES } from './address.js';

const form = document.querySelector('[data-booking-form]');
const steps = [...form.querySelectorAll('[data-step]')];
const stepper = [...document.querySelectorAll('[data-stepper] li')];
const progress = document.querySelector('[data-progress]');
const DRAFT_KEY = 'tsi-booking-draft';
const SERVICES = { ville: 'Course en ville', aeroport: 'Aéroport', gare: 'Gare', conventionne: 'Transport conventionné', longue: 'Longue distance', dispo: 'Mise à disposition' };
const OPTION_LABELS = { 'siege-enfant': 'Siège enfant', rehausseur: 'Rehausseur', fauteuil: 'Fauteuil pliable', aide: 'Aide à la montée', animal: 'Animal' };
let current = 1;
let user = null;
const store = {
  get() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  clear() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* idem */ } },
};

const $ = (name) => form.elements[name];
const val = (name) => (form.elements[name]?.value || '').trim();

// ── Valeurs par défaut : maintenant + 1 h, arrondi à 5 min ─────────
function defaultDateTime() {
  const now = parisNow();
  const [h, m] = now.time.split(':').map(Number);
  let mins = h * 60 + m + 60;
  mins = Math.ceil(mins / 5) * 5;
  let date = now.date;
  if (mins >= 24 * 60) {
    mins -= 24 * 60;
    const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); date = d.toISOString().slice(0, 10);
  }
  return { date, time: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, today: now.date };
}
const def = defaultDateTime();
$('date').min = def.today;
$('returnDate').min = def.today;

// ── Pré-remplissage : brouillon, puis paramètres d'URL ─────────────
const params = new URLSearchParams(location.search);
const draft = store.get();
function applyValues(v) {
  if (!v) return;
  if (v.service && SERVICES[v.service]) form.querySelector(`[name="service"][value="${v.service}"]`).checked = true;
  for (const [k, name] of [['pickup', 'pickup'], ['dropoff', 'dropoff'], ['date', 'date'], ['time', 'time'], ['travelRef', 'travelRef'], ['notes', 'notes'], ['establishment', 'establishment'], ['name', 'name'], ['phone', 'phone'], ['email', 'email'], ['returnDate', 'returnDate'], ['returnTime', 'returnTime']]) {
    if (v[k]) $(name).value = v[k];
  }
  if (v.when === 'asap') form.querySelector('[name="when"][value="asap"]').checked = true;
  if (v.roundtrip) $('roundtrip').checked = true;
  if (v.passengers) setCounter('passengers', v.passengers);
  if (v.luggage) setCounter('luggage', v.luggage);
  if (Array.isArray(v.options)) form.querySelectorAll('[name="options"]').forEach((o) => { o.checked = v.options.includes(o.value); });
  if (v.prescription) $('prescription').checked = true;
  if (v.series) $('series').checked = true;
}
const fromUrl = ['service', 'from', 'to', 'date', 'time', 'retour'].some((k) => params.has(k));
if (draft && !fromUrl && Date.now() - (draft.savedAt || 0) < 3 * 86400000) applyValues(draft);
if (fromUrl) {
  applyValues({
    service: params.get('service'), pickup: params.get('from'), dropoff: params.get('to'),
    date: params.get('date'), time: params.get('time'),
  });
  if (/^\d{2}:\d{2}$/.test(params.get('retour') || '')) {
    $('roundtrip').checked = true;
    $('returnDate').value = params.get('date') || '';
    $('returnTime').value = params.get('retour');
  }
}
if (!$('date').value || $('date').value < def.today) $('date').value = def.date;
if (!$('time').value) $('time').value = def.time;

// ── Compteurs passagers / bagages ───────────────────────────────────
function setCounter(name, value) {
  const box = form.querySelector(`[data-counter="${name}"]`);
  const min = Number(box.dataset.min); const max = Number(box.dataset.max);
  const v = Math.min(max, Math.max(min, Number(value) || min));
  box.querySelector('output').value = v;
  box.querySelector('output').textContent = v;
  box.querySelector('[data-dec]').disabled = v <= min;
  box.querySelector('[data-inc]').disabled = v >= max;
  return v;
}
form.querySelectorAll('[data-counter]').forEach((box) => {
  const name = box.dataset.counter;
  setCounter(name, box.querySelector('output').value);
  box.addEventListener('click', (e) => {
    const out = box.querySelector('output');
    if (e.target.closest('[data-inc]')) setCounter(name, Number(out.value) + 1);
    if (e.target.closest('[data-dec]')) setCounter(name, Number(out.value) - 1);
    out.animate?.([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.34,1.4,.64,1)' });
    update();
  });
});

// ── Champs conditionnels ────────────────────────────────────────────
function syncConditional() {
  const service = form.querySelector('[name="service"]:checked').value;
  form.querySelectorAll('[data-show-for]').forEach((el) => { el.hidden = !el.dataset.showFor.split(' ').includes(service); });
  const asap = form.querySelector('[name="when"]:checked').value === 'asap';
  document.querySelector('[data-when-fields]').hidden = asap;
  document.querySelector('[data-asap-note]').hidden = !asap;
  document.querySelector('[data-return-fields]').hidden = !$('roundtrip').checked;
  const create = $('createAccount').checked;
  document.querySelector('[data-password-field]').hidden = !create;
  document.querySelector('[data-email-optional]').hidden = create;
}

// ── Raccourcis d'adresses ──────────────────────────────────────────
function renderChips() {
  const saved = user?.addresses || [];
  const fill = (target, list) => {
    const box = document.querySelector(`[data-chips="${target}"]`);
    box.innerHTML = list.map((p, i) => `<button type="button" class="chip chip--sm" data-i="${i}">${esc(p.label)}</button>`).join('');
    box.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $(target).value = list[Number(b.dataset.i)].address;
      $(target).dispatchEvent(new Event('input', { bubbles: true }));
      clearFieldErrors(form);
      update();
    };
  };
  fill('pickup', saved.slice(0, 4));
  const service = form.querySelector('[name="service"]:checked').value;
  const popular = service === 'conventionne' ? PLACES.filter((p) => p.icon === 'medical') : PLACES.filter((p) => p.icon !== 'medical');
  fill('dropoff', [...saved.slice(0, 3), ...popular.slice(0, saved.length ? 3 : 4)]);
}

// ── Récapitulatif en direct ─────────────────────────────────────────
const sum = (key) => document.querySelector(`[data-sum="${key}"]`);
function data() {
  const service = form.querySelector('[name="service"]:checked').value;
  const asap = form.querySelector('[name="when"]:checked').value === 'asap';
  return {
    service, asap,
    pickup: val('pickup'), dropoff: val('dropoff'), date: val('date'), time: val('time'),
    returnTrip: $('roundtrip').checked ? { date: val('returnDate'), time: val('returnTime') } : null,
    passengers: Number(form.querySelector('[data-counter="passengers"] output').value),
    luggage: Number(form.querySelector('[data-counter="luggage"] output').value),
    options: [...form.querySelectorAll('[name="options"]:checked')].map((o) => o.value),
    travelRef: ['aeroport', 'gare'].includes(service) ? val('travelRef') : '',
    medical: service === 'conventionne' ? { prescription: $('prescription').checked, series: $('series').checked, establishment: val('establishment') } : null,
    notes: val('notes'),
    contact: { name: val('name'), phone: val('phone'), email: val('email') },
  };
}
function update() {
  const d = data();
  const setText = (key, text, empty) => { const el = sum(key); el.textContent = text || empty; el.classList.toggle('summary__empty', !text); };
  setText('pickup', d.pickup, 'Départ');
  setText('dropoff', d.dropoff, 'Arrivée');
  sum('service').textContent = SERVICES[d.service];
  sum('when').textContent = d.asap ? 'Dès que possible' : d.date && d.time ? `${fmtDate(d.date)}, ${fmtTime(d.time)}` : 'À préciser';
  document.querySelector('[data-sum-row="return"]').hidden = !d.returnTrip;
  if (d.returnTrip) sum('return').textContent = d.returnTrip.date && d.returnTrip.time ? `${fmtDate(d.returnTrip.date)}, ${fmtTime(d.returnTrip.time)}` : 'À préciser';
  sum('pax').textContent = `${d.passengers} passager${d.passengers > 1 ? 's' : ''} · ${d.luggage} bagage${d.luggage > 1 ? 's' : ''}`;
  document.querySelector('[data-sum-row="options"]').hidden = !d.options.length;
  sum('options').textContent = d.options.map((o) => OPTION_LABELS[o]).join(', ');
  syncConditional();
  saveDraft();
}
let draftTimer = 0;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const d = data();
    store.set({
      savedAt: Date.now(), service: d.service, pickup: d.pickup, dropoff: d.dropoff, date: d.date, time: d.time,
      when: d.asap ? 'asap' : 'later', roundtrip: Boolean(d.returnTrip), returnDate: val('returnDate'), returnTime: val('returnTime'),
      passengers: d.passengers, luggage: d.luggage, options: d.options, travelRef: val('travelRef'), notes: d.notes,
      prescription: $('prescription').checked, series: $('series').checked, establishment: val('establishment'),
      name: user ? '' : d.contact.name, phone: user ? '' : d.contact.phone, email: user ? '' : d.contact.email,
    });
  }, 250);
}
form.addEventListener('input', update);
form.addEventListener('change', (e) => {
  if (e.target.name === 'service') renderChips();
  if (e.target.matches('[aria-invalid]')) e.target.removeAttribute('aria-invalid');
  update();
});

// ── Inverser départ / arrivée ───────────────────────────────────────
document.querySelector('[data-swap]').addEventListener('click', (e) => {
  const a = val('pickup'); $('pickup').value = val('dropoff'); $('dropoff').value = a;
  e.currentTarget.animate?.([{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: 420, easing: 'cubic-bezier(.22,.8,.24,1)' });
  update();
});

// ── Navigation entre étapes ─────────────────────────────────────────
function localError(name, message) {
  showFieldError(form, { field: name, message });
  return false;
}
function validate(step) {
  clearFieldErrors(form);
  const d = data();
  if (step === 1) {
    if (d.pickup.length < 3) return localError('pickup', "Indiquez l'adresse de départ.");
    if (d.dropoff.length < 3) return localError('dropoff', "Indiquez l'adresse d'arrivée.");
    if (!d.asap) {
      if (!d.date) return localError('date', 'Choisissez une date.');
      if (!d.time) return localError('time', 'Choisissez une heure.');
      const now = parisNow();
      if (`${d.date}T${d.time}` < `${now.date}T${now.time}`) return localError('time', 'Cet horaire est déjà passé.');
    }
    if (d.returnTrip) {
      if (!d.returnTrip.date || !d.returnTrip.time) return localError('returnDate', 'Précisez la date et l’heure du retour.');
      const out = d.asap ? `${parisNow().date}T${parisNow().time}` : `${d.date}T${d.time}`;
      if (`${d.returnTrip.date}T${d.returnTrip.time}` <= out) return localError('returnDate', 'Le retour doit avoir lieu après l’aller.');
    }
  }
  if (step === 3) {
    if (d.contact.name.length < 2) return localError('name', 'Indiquez votre nom.');
    if (d.contact.phone.replace(/\D/g, '').length < 9) return localError('phone', 'Indiquez un numéro de téléphone valide.');
    if ($('createAccount').checked) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.contact.email)) return localError('email', 'Une adresse e-mail est nécessaire pour créer le compte.');
      if (val('password').length < 8) return localError('password', 'Le mot de passe doit contenir au moins 8 caractères.');
    }
    if (!$('consent').checked) return localError('consent', 'Merci de cocher cette case pour envoyer la demande.');
  }
  return true;
}
function go(step, { focus = true } = {}) {
  const prev = current;
  current = step;
  steps.forEach((s) => {
    const n = Number(s.dataset.step);
    s.hidden = n !== step;
    s.classList.toggle('is-active', n === step);
    s.classList.toggle('from-left', n === step && step < prev);
  });
  stepper.forEach((li, i) => {
    li.classList.toggle('is-current', i + 1 === step);
    li.classList.toggle('is-done', i + 1 < step);
    if (i + 1 === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  progress.style.transform = `scaleX(${step / steps.length})`;
  if (focus) {
    const top = document.querySelector('[data-stepper]').getBoundingClientRect().top + scrollY - 110;
    if (scrollY > top) scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    steps[step - 1].querySelector('input:not([type=radio]):not([hidden]), textarea')?.focus({ preventScroll: true });
  }
}
form.addEventListener('click', (e) => {
  if (e.target.closest('[data-next]')) { if (validate(current)) go(current + 1); }
  if (e.target.closest('[data-prev]')) go(current - 1);
});
stepper.forEach((li, i) => li.addEventListener('click', () => {
  if (i + 1 < current) go(i + 1);
  else if (i + 1 > current && [...Array(i + 1 - current)].every((_, k) => validate(current + k))) go(i + 1);
}));
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input') && current < 3 && !e.target.closest('.input-icon')?.querySelector('[aria-expanded="true"]')) {
    e.preventDefault();
    if (validate(current)) go(current + 1);
  }
});

// ── Envoi ───────────────────────────────────────────────────────────
let lastBooking = null;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate(1)) { go(1); validate(1); return; }
  if (!validate(3)) return;
  const btn = form.querySelector('[type="submit"]');
  const alert = form.querySelector('[data-form-alert]');
  alert.hidden = true;
  btn.setAttribute('aria-busy', 'true');
  const d = data();
  const payload = {
    ...d,
    consent: true,
    website: val('website'),
    createAccount: !user && $('createAccount').checked ? { password: $('password').value } : null,
  };
  if (d.asap) { delete payload.date; delete payload.time; }
  try {
    const res = await api('/bookings', { method: 'POST', body: payload });
    lastBooking = res.booking;
    store.clear();
    showDone(res);
  } catch (err) {
    const step = { pickup: 1, dropoff: 1, date: 1, time: 1, returnDate: 1, service: 1 }[err.field];
    if (step) go(step);
    if (!showFieldError(form, err)) { alert.textContent = err.message; alert.hidden = false; }
  } finally {
    btn.removeAttribute('aria-busy');
  }
});

function showDone(res) {
  const b = res.booking;
  form.hidden = true;
  document.querySelector('[data-stepper]').hidden = true;
  document.querySelector('.stepper__bar').hidden = true;
  const done = document.querySelector('[data-done]');
  done.hidden = false;
  document.querySelector('[data-done-ref]').textContent = b.ref;
  const phone = fmtPhone(res.booking.contact?.phone) || val('phone');
  document.querySelector('[data-done-text]').textContent = b.asap
    ? `Votre demande pour un départ dès que possible est transmise. Salim vous rappelle au ${phone} dans les plus brefs délais.`
    : `Salim vous rappelle au ${phone} pour confirmer votre course du ${fmtDate(b.date)} à ${fmtTime(b.time)}. Elle n'est réservée qu'après cet appel.`;
  if (user || res.accountCreated) document.querySelector('[data-done-account]').hidden = false;
  if (res.accountCreated) toast('Votre compte est créé. Bienvenue !');
  done.focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: 'smooth' });
}

// Fichier agenda (.ics) pour la demande envoyée
document.querySelector('[data-ics]').addEventListener('click', () => {
  if (!lastBooking) return;
  const b = lastBooking;
  const stamp = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const end = (() => { const [h, m] = b.time.split(':').map(Number); const t = h * 60 + m + 45; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
  const escIcs = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taxi Saint-Irenee//FR', 'BEGIN:VEVENT',
    `UID:${b.ref}@taxi-saint-irenee`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Paris:${stamp(b.date, b.time)}`, `DTEND;TZID=Europe/Paris:${stamp(b.date, end)}`,
    `SUMMARY:${escIcs(`Taxi Saint-Irénée · ${b.ref}`)}`,
    `LOCATION:${escIcs(b.pickup)}`,
    `DESCRIPTION:${escIcs(`${b.pickup} → ${b.dropoff}\nDemande à confirmer par Salim. Contact : 06 61 88 27 07`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `taxi-${b.ref}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ── Initialisation ─────────────────────────────────────────────────
form.querySelectorAll('[data-address]').forEach((input) => attachAddress(input, { saved: () => user?.addresses || [] }));
locate($('pickup'), document.querySelector('[data-locate]'));
document.addEventListener('address:select', update);
renderChips();
update();
go(1, { focus: false });

getMe().then((me) => {
  user = me;
  if (!me) return;
  document.querySelector('[data-signed-in]').hidden = false;
  document.querySelector('[data-signed-name]').textContent = `${me.firstName} ${me.lastName} · ${fmtPhone(me.phone)}`;
  document.querySelector('[data-guest-note]').hidden = true;
  document.querySelector('[data-account-offer]').hidden = true;
  if (!val('name')) $('name').value = `${me.firstName} ${me.lastName}`;
  if (!val('phone')) $('phone').value = fmtPhone(me.phone);
  if (!val('email')) $('email').value = me.email;
  if (!val('pickup') && me.addresses?.[0] && !fromUrl) $('pickup').value = me.addresses[0].address;
  renderChips();
  update();
});
