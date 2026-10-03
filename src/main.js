import './style.css';
import { COMPANY } from './config.js';
import { initCalculator } from './calculator.js';
import { initLeadForm } from './lead.js';

// WhatsApp- und Telefon-Links zentral aus der Config setzen
document.querySelectorAll('[data-whatsapp]').forEach((a) => {
  a.href = `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent('Hallo Einfach Umzüge, ich interessiere mich für einen Umzug.')}`;
});
document.querySelectorAll('[data-phone]').forEach((a) => {
  a.href = `tel:${COMPANY.phone.replace(/\s/g, '')}`;
  if (a.dataset.phone === 'text') a.textContent = COMPANY.phone;
});

// Mobile Navigation
const toggle = document.querySelector('#nav-toggle');
const nav = document.querySelector('#nav-menu');
toggle?.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('hidden', open);
});
nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
  if (window.innerWidth < 768) { nav.classList.add('hidden'); toggle.setAttribute('aria-expanded', 'false'); }
}));

const calc = document.querySelector('#rechner');
if (calc) initCalculator(calc).then((getEstimate) => initLeadForm(calc.querySelector('#lead-form'), getEstimate));

document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
