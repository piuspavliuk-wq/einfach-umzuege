import './style.css';
import { COMPANY } from './config.js';
import { initCalculator } from './calculator.js';
import { initCallbackForm, initLeadForm } from './lead.js';

// WhatsApp- und Telefon-Links zentral aus der Config setzen
document.querySelectorAll('[data-whatsapp]').forEach((a) => {
  const text = a.dataset.whatsappText || 'Hallo Einfach Umzüge, ich interessiere mich für einen Umzug.';
  a.href = `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(text)}`;
});
document.querySelectorAll('[data-phone]').forEach((a) => {
  a.href = `tel:${COMPANY.phone.replace(/\s/g, '')}`;
  if (a.dataset.phone === 'text') a.textContent = COMPANY.phone;
});

// Mobile Navigation
// Öffnen/Schließen per Attribut am Header – Animation übernimmt CSS (.nav-panel, .burger)
const header = document.querySelector('header');
const toggle = document.querySelector('#nav-toggle');
const nav = document.querySelector('#nav-menu');
const setMenu = (open) => {
  header.toggleAttribute('data-menu-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
};
toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
document.addEventListener('click', (e) => { if (toggle && !header.contains(e.target)) setMenu(false); });
matchMedia('(min-width: 768px)').addEventListener('change', () => setMenu(false));

const calc = document.querySelector('#rechner');
if (calc) initCalculator(calc).then((getEstimate) => initLeadForm(calc.querySelector('#lead-form'), getEstimate));

document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

// Rückruf-Formular (Startseite und Standortseiten)
document.querySelectorAll('form[data-callback]').forEach(initCallbackForm);
