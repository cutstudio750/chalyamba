import { api, esc, icon, fmtDate, fmtTime, fmtEuro, fmtPhone, toast, parisNow, showFieldError, clearFieldErrors } from './api.js';
import { attachAddress } from './address.js';

const views = Object.fromEntries([...document.querySelectorAll('[data-driver-view]')].map((v) => [v.dataset.driverView, v]));
const list = document.querySelector('[data-driver-list]');
const sheet = document.querySelector('[data-sheet]');
const sheetForm = document.querySelector('[data-sheet-form]');
let data = { bookings: [], messages: [] };
let onSheetSubmit = null;

const show = (name) => { for (const [k, v] of Object.entries(views)) v.hidden = k !== name; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Connexion ───────────────────────────────────────────────────────
document.querySelector('[data-driver-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const alert = form.querySelector('[data-form-alert]');
  alert.hidden = true;
  try {
    await api('/driver/login', { method: 'POST', body: { password: form.elements.password.value } });
    start();
  } catch (err) { alert.textContent = err.message; alert.hidden = false; }
});

async function load() {
  data = await api('/driver/bookings');
  render();
}

async function start() {
  show('board');
  await load();
  setInterval(() => { if (document.visibilityState === 'visible' && !sheet.open) load().catch(() => {}); }, 60000);
}

// ── Liste ───────────────────────────────────────────────────────────
function card(b) {
  const when = b.asap ? '<strong>Dès que possible</strong>' : `<strong>${esc(cap(fmtDate(b.date)))}</strong><span>${fmtTime(b.time)}</span>`;
  const details = [b.serviceLabel, `${b.passengers} pass.`, `${b.luggage} bag.`, b.travelRef && `Vol/train ${b.travelRef}`, ...(b.options || [])].filter(Boolean).map(esc).join(' · ');
  const medical = b.medical ? `<p class="drv-med">${icon('medical', 'icon icon--sm')} Prescription : ${b.medical.prescription ? 'oui' : '<b>non</b>'}${b.medical.series ? ' · soins en série' : ''}${b.medical.establishment ? ` · ${esc(b.medical.establishment)}` : ''}</p>` : '';
  const account = b.account ? `<span class="badge">Compte client${b.account.loyalty.available ? ` · ${b.account.loyalty.available} avantage dispo` : ''}</span>` : '<span class="badge">Sans compte</span>';
  const actions = {
    pending: `<button class="btn btn--noir btn--sm" data-act="confirm" data-id="${b.id}">Confirmer</button><button class="btn btn--quiet" data-act="decline" data-id="${b.id}">Refuser</button>`,
    confirmed: `<button class="btn btn--noir btn--sm" data-act="complete" data-id="${b.id}">Terminer · facture</button><button class="btn btn--quiet" data-act="edit" data-id="${b.id}">Modifier</button><button class="btn btn--quiet" data-act="cancel" data-id="${b.id}">Annuler</button>`,
    completed: b.invoice ? `<a class="btn btn--outline btn--sm" href="/facture?id=${encodeURIComponent(b.invoice.id)}" target="_blank">${esc(b.invoice.number)} · ${fmtEuro(b.invoice.amountTTC)}</a>` : '',
  }[b.status] || '';
  return `<article class="drv-card card drv-card--${b.status}">
    <div class="drv-card__when">${when}<span class="muted">${esc(b.ref)}</span></div>
    <div class="drv-card__main">
      <p class="drv-route">${esc(b.pickup)} ${icon('arrow', 'icon icon--sm')} ${esc(b.dropoff)}</p>
      ${b.returnTrip ? `<p class="muted">Retour ${esc(fmtDate(b.returnTrip.date))} à ${fmtTime(b.returnTrip.time)}</p>` : ''}
      <p class="muted">${details}</p>
      ${medical}
      ${b.notes ? `<p class="drv-notes">« ${esc(b.notes)} »</p>` : ''}
      ${b.driverNote ? `<p class="muted">Note : ${esc(b.driverNote)}</p>` : ''}
    </div>
    <div class="drv-card__client">
      <strong>${esc(b.contact.name)}</strong>
      <a class="text-link" href="tel:${esc(b.contact.phone)}">${esc(fmtPhone(b.contact.phone))}</a>
      ${b.contact.email ? `<span class="muted">${esc(b.contact.email)}</span>` : ''}
      ${account}
      <div class="btn-row mt-1">
        <a class="btn btn--outline btn--sm" href="tel:${esc(b.contact.phone)}">${icon('phone', 'icon icon--sm')}Appeler</a>
        <a class="btn btn--quiet" href="sms:${esc(b.contact.phone)}">SMS</a>
      </div>
    </div>
    <div class="drv-card__actions">${actions}</div>
  </article>`;
}

function render() {
  const filter = document.querySelector('[name="df"]:checked').value;
  const counts = {
    pending: data.bookings.filter((b) => b.status === 'pending').length,
    confirmed: data.bookings.filter((b) => b.status === 'confirmed').length,
    messages: data.messages.filter((m) => !m.read).length,
  };
  for (const [k, v] of Object.entries(counts)) document.querySelector(`[data-count="${k}"]`).textContent = v ? v : '';
  if (filter === 'messages') {
    list.innerHTML = data.messages.length ? data.messages.map((m) => `<article class="card drv-msg${m.read ? '' : ' is-unread'}">
      <div class="panel-head panel-head--flat"><strong>${esc(m.name)}</strong><span class="muted">${new Date(m.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
      <p class="mt-1">${esc(m.message)}</p>
      <div class="btn-row mt-2">${m.phone ? `<a class="btn btn--outline btn--sm" href="tel:${esc(m.phone)}">${esc(fmtPhone(m.phone))}</a>` : ''}${m.email ? `<a class="btn btn--outline btn--sm" href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''}${m.read ? '' : `<button class="btn btn--quiet" data-read="${m.id}">Marquer comme lu</button>`}</div></article>`).join('')
      : '<p class="empty">Aucun message.</p>';
    return;
  }
  const now = parisNow();
  let items = data.bookings.filter((b) => (filter === 'done' ? ['completed', 'cancelled', 'declined'].includes(b.status) : b.status === filter));
  if (filter === 'done') items = items.reverse().slice(0, 60);
  const today = items.filter((b) => b.date === now.date);
  const later = items.filter((b) => b.date !== now.date);
  const section = (title, arr) => (arr.length ? `<h2 class="caps muted drv-section">${title}</h2>${arr.map(card).join('')}` : '');
  list.innerHTML = items.length
    ? (filter === 'done' ? items.map(card).join('') : section("Aujourd'hui", today) + section('Prochainement', later.filter((b) => b.date > now.date)) + section('Dates passées', later.filter((b) => b.date < now.date)))
    : '<p class="empty">Rien pour le moment.</p>';
}
document.querySelector('[data-driver-filter]').addEventListener('change', render);
document.querySelector('[data-refresh]').addEventListener('click', () => load().then(() => toast('À jour.')));

// ── Feuille de saisie ───────────────────────────────────────────────
function openSheet(title, body, submitLabel, handler) {
  document.querySelector('[data-sheet-title]').textContent = title;
  document.querySelector('[data-sheet-body]').innerHTML = body;
  document.querySelector('[data-sheet-submit]').textContent = submitLabel;
  sheetForm.querySelector('[data-form-alert]').hidden = true;
  onSheetSubmit = handler;
  sheet.showModal();
  sheet.querySelectorAll('[data-address]').forEach((i) => attachAddress(i));
  sheet.querySelector('input, select, textarea')?.focus();
}
sheetForm.addEventListener('submit', async (e) => {
  if (e.submitter?.value === 'cancel') return;
  e.preventDefault();
  clearFieldErrors(sheetForm);
  const btn = document.querySelector('[data-sheet-submit]');
  btn.setAttribute('aria-busy', 'true');
  try {
    await onSheetSubmit(Object.fromEntries(new FormData(sheetForm)), sheetForm);
    sheet.close();
    await load();
  } catch (err) {
    if (!showFieldError(sheetForm, err)) { const a = sheetForm.querySelector('[data-form-alert]'); a.textContent = err.message; a.hidden = false; }
  } finally { btn.removeAttribute('aria-busy'); }
});

const find = (id) => data.bookings.find((b) => b.id === id);
list.addEventListener('click', async (e) => {
  const read = e.target.closest('[data-read]');
  if (read) { await api(`/driver/messages/${read.dataset.read}/read`, { method: 'POST' }); return load(); }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const b = find(btn.dataset.id);
  const act = btn.dataset.act;
  if (act === 'confirm' || act === 'edit') {
    openSheet(act === 'confirm' ? 'Confirmer la course' : 'Modifier la course', `
      <p class="muted">${esc(b.pickup)} → ${esc(b.dropoff)}</p>
      <div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" name="date" value="${esc(b.date)}"></div>
      <div class="field"><label>Heure</label><input class="input" type="time" name="time" value="${esc(b.time)}" step="300"></div></div>
      <div class="field"><label>Note pour le client <span class="muted">(visible dans son espace et l'e-mail)</span></label><input class="input" name="driverNote" value="${esc(b.driverNote || '')}" placeholder="Ex. Rendez-vous devant l'entrée principale"></div>`,
    act === 'confirm' ? 'Confirmer' : 'Enregistrer', (d) => api(`/driver/bookings/${b.id}`, { method: 'PATCH', body: { status: 'confirmed', date: d.date, time: d.time, driverNote: d.driverNote } }));
  }
  if (act === 'decline' || act === 'cancel') {
    if (!confirm(act === 'decline' ? 'Refuser cette demande ? Pensez à prévenir le client.' : 'Annuler cette course ?')) return;
    await api(`/driver/bookings/${b.id}`, { method: 'PATCH', body: { status: act === 'decline' ? 'declined' : 'cancelled' } }).catch((err) => toast(err.message));
    load();
  }
  if (act === 'complete') {
    const medical = b.service === 'conventionne';
    openSheet('Terminer la course', `
      <p class="muted">${esc(b.contact.name)} · ${esc(b.pickup)} → ${esc(b.dropoff)}</p>
      <div class="row-2">
        <div class="field"><label for="s-amount">Montant TTC (compteur)</label><input class="input" id="s-amount" name="amountTTC" inputmode="decimal" placeholder="0,00" required></div>
        <div class="field"><label for="s-km">Distance (km)</label><input class="input" id="s-km" name="distanceKm" inputmode="decimal" placeholder="Facultatif"></div>
      </div>
      ${medical ? '<div class="field"><label for="s-share">Reste à charge du patient</label><input class="input" id="s-share" name="patientShare" inputmode="decimal" placeholder="0,00"></div>' : ''}
      <div class="field"><label for="s-pay">Règlement</label><select class="select" id="s-pay" name="paymentMethod">
        ${(medical ? ['Tiers payant Assurance Maladie', 'Carte bancaire', 'Espèces'] : ['Carte bancaire', 'Espèces', 'Virement', 'Compte entreprise']).map((m) => `<option>${m}</option>`).join('')}
      </select></div>
      ${!medical && b.account?.loyalty.available ? '<label class="check"><input type="checkbox" name="loyaltyApplied" value="1"><span>Avantage fidélité appliqué sur cette course</span></label>' : ''}
      <div class="field"><label for="s-note">Mention sur la facture <span class="muted">(facultatif)</span></label><input class="input" id="s-note" name="note" maxlength="200"></div>`,
    'Créer la facture', async (d) => {
      const res = await api(`/driver/bookings/${b.id}/complete`, { method: 'POST', body: { ...d, loyaltyApplied: d.loyaltyApplied === '1' } });
      toast(`Facture ${res.invoice.number} créée${b.contact.email ? ' et envoyée' : ''}.`);
    });
  }
});

document.querySelector('[data-new-booking]').addEventListener('click', () => {
  const now = parisNow();
  openSheet('Course prise par téléphone', `
    <div class="field"><label>Type</label><select class="select" name="service">
      <option value="ville">Course en ville</option><option value="aeroport">Aéroport</option><option value="gare">Gare</option>
      <option value="conventionne">Transport conventionné</option><option value="longue">Longue distance</option><option value="dispo">Mise à disposition</option></select></div>
    <div class="field"><label>Départ</label><div class="input-icon">${icon('dot')}<input class="input" name="pickup" data-address required></div></div>
    <div class="field"><label>Arrivée</label><div class="input-icon">${icon('pin')}<input class="input" name="dropoff" data-address required></div></div>
    <div class="row-2"><div class="field"><label>Date</label><input class="input" type="date" name="date" value="${now.date}"></div>
    <div class="field"><label>Heure</label><input class="input" type="time" name="time" step="300"></div></div>
    <div class="field"><label>E-mail du compte client <span class="muted">(pour rattacher la course à son espace)</span></label><input class="input" type="email" name="accountEmail"></div>
    <div class="row-2"><div class="field"><label>Nom</label><input class="input" name="name"></div><div class="field"><label>Téléphone</label><input class="input" name="phone" type="tel"></div></div>
    <div class="field"><label>Note</label><input class="input" name="notes"></div>
    <label class="check"><input type="checkbox" name="confirmed" value="1" checked><span>Course déjà confirmée avec le client</span></label>`,
  'Enregistrer', (d) => api('/driver/bookings', {
    method: 'POST',
    body: {
      service: d.service, pickup: d.pickup, dropoff: d.dropoff, date: d.date, time: d.time, notes: d.notes,
      accountEmail: d.accountEmail || undefined, confirmed: d.confirmed === '1',
      contact: { name: d.name, phone: d.phone }, passengers: 1, luggage: 0,
    },
  }));
});

// ── Démarrage ───────────────────────────────────────────────────────
api('/driver/session').then(({ driver }) => (driver ? start() : show('login'))).catch(() => show('login'));
