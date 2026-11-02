import { api, showFieldError, clearFieldErrors } from './api.js';
import { t, lang } from './i18n.js';

// Messages d'erreur du serveur traduits pour la version anglaise
const EN_FIELDS = { name: 'err.name', phone: 'contact.reach', email: 'err.email', message: 'contact.empty', consent: 'contact.consent' };

const form = document.querySelector('[data-contact-form]');
const params = new URLSearchParams(location.search);
if (['entreprise', 'business'].includes(params.get('sujet') || params.get('topic'))) form.elements.subject.value = 'entreprise';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  const alert = form.querySelector('[data-form-alert]');
  alert.hidden = true;
  const d = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('[type="submit"]');
  btn.setAttribute('aria-busy', 'true');
  try {
    const subject = form.elements.subject.selectedOptions[0].textContent;
    await api('/contact', {
      method: 'POST',
      body: { name: d.name, phone: d.phone, email: d.email, message: d.message?.trim() ? `[${subject}] ${d.message.trim()}` : '', consent: form.elements.consent.checked, website: d.website },
    });
    form.reset();
    alert.textContent = t('contact.sent');
    alert.classList.add('alert--ok');
    alert.hidden = false;
  } catch (err) {
    if (lang === 'en' && err.field && EN_FIELDS[err.field]) err.message = t(err.field === 'phone' && /valide/.test(err.message) ? 'err.phone' : EN_FIELDS[err.field]);
    else if (lang === 'en' && err.status !== 400) err.message = t('err.network');
    if (!showFieldError(form, err)) { alert.textContent = err.message; alert.classList.remove('alert--ok'); alert.hidden = false; }
  } finally {
    btn.removeAttribute('aria-busy');
  }
});
