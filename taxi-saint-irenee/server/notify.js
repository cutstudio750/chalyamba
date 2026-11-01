// Notifications : push sur le téléphone du chauffeur (ntfy) et e-mails (Resend).
// Chaque canal est facultatif ; l'espace /chauffeur liste toujours les demandes.
import { config } from './config.js';
import { SERVICES, formatDate } from './insights.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function push(title, body, { priority = 'high', click = `${config.siteUrl}/chauffeur`, tags = '' } = {}) {
  if (!config.ntfyUrl) return;
  try {
    await fetch(config.ntfyUrl, {
      method: 'POST',
      headers: { Title: encodeURIComponent(title), Priority: priority, Click: click, Tags: tags, 'Content-Type': 'text/plain; charset=utf-8' },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.warn('[notify] ntfy en échec', err.message);
  }
}

export async function sendMail({ to, subject, html, text }) {
  if (!config.resendKey || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.warn('[notify] e-mail refusé', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.warn('[notify] e-mail en échec', err.message);
    return false;
  }
}

function mailLayout(title, inner) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F3EDE4;font-family:Jost,Helvetica,Arial,sans-serif;color:#161514">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#161514;padding:28px 32px;text-align:center"><img src="${config.siteUrl}/assets/img/logo-creme.png" width="180" alt="Taxi Saint-Irénée" style="display:inline-block"></td></tr>
    <tr><td style="padding:32px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#8A7A66">${esc(title)}</p>
      ${inner}
      <p style="margin:28px 0 0;font-size:14px;color:#8A7A66">Une question : ${config.phoneDisplay}</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

const row = (k, v) => (v ? `<tr><td style="padding:6px 0;color:#8A7A66;font-size:14px;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:15px">${esc(v)}</td></tr>` : '');

function bookingSummary(b) {
  return [
    ['Service', SERVICES[b.service] || b.service],
    ['Date', b.asap ? 'Dès que possible' : `${formatDate(b.date, { withYear: true })} à ${b.time}`],
    ['Départ', b.pickup],
    ['Arrivée', b.dropoff],
    ['Retour', b.returnTrip ? `${formatDate(b.returnTrip.date)} à ${b.returnTrip.time}` : ''],
    ['Passagers', `${b.passengers} · bagages : ${b.luggage}`],
    ['Vol / train', b.travelRef],
    ['Options', (b.options || []).join(', ')],
    ['Message', b.notes],
  ];
}

export function notifyNewBooking(b) {
  const when = b.asap ? 'DÈS QUE POSSIBLE' : `${formatDate(b.date)} ${b.time}`;
  const lines = [
    `${when} · ${SERVICES[b.service] || b.service}`,
    `${b.pickup} → ${b.dropoff}`,
    `${b.contact.name} · ${b.contact.phone}`,
    b.medical?.prescription !== undefined && b.service === 'conventionne' ? `Bon de transport : ${b.medical.prescription ? 'oui' : 'non'}${b.medical.series ? ' · soins en série' : ''}` : '',
    b.notes ? `« ${b.notes} »` : '',
  ].filter(Boolean);
  push(`Nouvelle demande ${b.ref}`, lines.join('\n'), { tags: 'taxi', priority: b.asap ? 'urgent' : 'high' });
  if (config.driverEmail) {
    sendMail({
      to: config.driverEmail,
      subject: `Nouvelle demande ${b.ref} · ${when}`,
      text: lines.join('\n'),
      html: mailLayout(`Nouvelle demande ${b.ref}`, `<h1 style="font-size:22px;margin:0 0 18px">${esc(b.contact.name)} · <a href="tel:${esc(b.contact.phone)}" style="color:#161514">${esc(b.contact.phone)}</a></h1>
        <table role="presentation" width="100%">${bookingSummary(b).map(([k, v]) => row(k, v)).join('')}</table>
        <p style="margin:24px 0 0"><a href="${config.siteUrl}/chauffeur" style="display:inline-block;background:#161514;color:#F3EDE4;padding:12px 20px;border-radius:999px;text-decoration:none">Ouvrir l'espace chauffeur</a></p>`),
    });
  }
}

export function notifyClientReceived(b) {
  if (!b.contact.email) return;
  sendMail({
    to: b.contact.email,
    subject: `Demande reçue · ${b.ref}`,
    text: `Bonjour ${b.contact.name},\n\nVotre demande ${b.ref} est bien reçue. Salim vous rappelle au ${b.contact.phone} pour confirmer la course.\n\nTaxi Saint-Irénée · ${config.phoneDisplay}`,
    html: mailLayout('Demande reçue', `<h1 style="font-size:22px;margin:0 0 12px">Merci ${esc(b.contact.name.split(' ')[0])}.</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Votre demande <strong>${esc(b.ref)}</strong> est bien reçue. Salim vous rappelle au ${esc(b.contact.phone)} pour confirmer l'horaire et les détails. La course n'est confirmée qu'après cet appel.</p>
      <table role="presentation" width="100%">${bookingSummary(b).map(([k, v]) => row(k, v)).join('')}</table>`),
  });
}

export function notifyClientConfirmed(b) {
  if (!b.contact.email) return;
  sendMail({
    to: b.contact.email,
    subject: `Course confirmée · ${b.asap ? 'dès que possible' : `${formatDate(b.date)} à ${b.time}`}`,
    text: `Votre course ${b.ref} est confirmée.\n${b.pickup} → ${b.dropoff}\n${b.driverNote || ''}`,
    html: mailLayout('Course confirmée', `<h1 style="font-size:22px;margin:0 0 12px">C'est noté.</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Votre course <strong>${esc(b.ref)}</strong> est confirmée.${b.driverNote ? ` ${esc(b.driverNote)}` : ''}</p>
      <table role="presentation" width="100%">${bookingSummary(b).map(([k, v]) => row(k, v)).join('')}</table>`),
  });
}

export function notifyInvoice(invoice, link, email, name) {
  if (!email) return;
  sendMail({
    to: email,
    subject: `Votre facture ${invoice.number}`,
    text: `Bonjour ${name},\n\nVotre facture ${invoice.number} est disponible : ${link}\n\nMerci et à bientôt.`,
    html: mailLayout(`Facture ${invoice.number}`, `<h1 style="font-size:22px;margin:0 0 12px">Merci pour ce trajet.</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6">${esc(invoice.pickup)} → ${esc(invoice.dropoff)}<br>Montant : ${invoice.amountTTC.toFixed(2).replace('.', ',')} € TTC</p>
      <p style="margin:0"><a href="${esc(link)}" style="display:inline-block;background:#161514;color:#F3EDE4;padding:12px 20px;border-radius:999px;text-decoration:none">Voir la facture</a></p>`),
  });
}

export function notifyCancelled(b) {
  push(`Annulation ${b.ref}`, `${b.contact.name} a annulé : ${b.asap ? 'dès que possible' : `${formatDate(b.date)} ${b.time}`}\n${b.pickup} → ${b.dropoff}`, { tags: 'x', priority: 'high' });
  if (config.driverEmail) sendMail({ to: config.driverEmail, subject: `Annulation ${b.ref}`, text: `${b.contact.name} a annulé la course ${b.ref} (${b.date} ${b.time}).` });
}

export function notifyContact(msg) {
  push(`Message de ${msg.name}`, `${msg.phone || ''} ${msg.email || ''}\n${msg.message}`, { priority: 'default', tags: 'speech_balloon' });
  if (config.driverEmail) sendMail({ to: config.driverEmail, subject: `Message du site : ${msg.name}`, text: `${msg.name}\n${msg.phone || ''}\n${msg.email || ''}\n\n${msg.message}` });
}

export function sendResetMail(email, name, link) {
  return sendMail({
    to: email,
    subject: 'Réinitialisation de votre mot de passe',
    text: `Bonjour ${name},\n\nPour choisir un nouveau mot de passe : ${link}\nCe lien est valable une heure.`,
    html: mailLayout('Mot de passe', `<p style="font-size:15px;line-height:1.6">Bonjour ${esc(name)},<br>pour choisir un nouveau mot de passe, utilisez ce lien valable une heure.</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#161514;color:#F3EDE4;padding:12px 20px;border-radius:999px;text-decoration:none">Choisir un mot de passe</a></p>
      <p style="font-size:13px;color:#8A7A66">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`),
  });
}
