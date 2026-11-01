import { api, showFieldError, clearFieldErrors } from './api.js';

const form = document.querySelector('[data-contact-form]');
const params = new URLSearchParams(location.search);
if (params.get('sujet') === 'entreprise') form.elements.subject.value = 'entreprise';

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
    alert.textContent = 'Message envoyé. Salim vous répond rapidement.';
    alert.classList.add('alert--ok');
    alert.hidden = false;
  } catch (err) {
    if (!showFieldError(form, err)) { alert.textContent = err.message; alert.classList.remove('alert--ok'); alert.hidden = false; }
  } finally {
    btn.removeAttribute('aria-busy');
  }
});
