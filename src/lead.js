import { COMPANY, FORM_ENDPOINT } from './config.js';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Alle Angaben als flaches Objekt – eine Spalte pro Feld in der Tabelle */
function payload({ input, result }, lead) {
  const extras = [
    input.packing && 'Verpackung',
    input.assembly && 'Möbelmontage',
    input.parking && 'Halteverbotszone',
    input.disposal && 'Entsorgung',
    input.kitchen && `Küche ab-/aufbauen (${String(input.kitchenM).replace('.', ',')} m)`,
    input.piano && 'Klavier',
    input.washer && 'Waschmaschine',
    input.bigWardrobe && 'Schrank > 2 m',
    input.cellar && 'Keller/Dachboden',
  ].filter(Boolean).join(', ') || 'keine';
  const fillText = { wenig: 'wenig möbliert', normal: 'normal möbliert', voll: 'voll möbliert' }[input.fill] ?? '';
  const floor = (n, lift) => `${n === 0 ? 'EG' : `${n}. OG`} ${lift ? 'mit' : 'ohne'} Aufzug`;
  return {
    name: lead.name.trim(),
    phone: lead.phone.trim(),
    date: lead.date ? new Date(lead.date).toLocaleDateString('de-DE') : 'flexibel',
    from: input.from,
    to: input.to,
    sqm: input.sqm,
    km: input.km,
    approachKm: input.approachKm || '',
    floorFrom: floor(input.floorFrom, input.liftFrom),
    floorTo: floor(input.floorTo, input.liftTo),
    extras: `${fillText} · ${extras}`,
    jobcenter: lead.jobcenter ? 'Ja' : 'Nein',
    price: result.price,
    website: lead.website ?? '', // Honeypot
  };
}

function summary(p) {
  return [
    `Umzugsanfrage – ${p.name}`,
    `Telefon: ${p.phone}`,
    `Wunschtermin: ${p.date}`,
    `Von: ${p.from} → Nach: ${p.to}`,
    `Wohnfläche: ${p.sqm} m² · Strecke: ${p.km} km · Anfahrt: ${p.approachKm ? `${p.approachKm} km` : 'unbekannt'}`,
    `Auszug: ${p.floorFrom} · Einzug: ${p.floorTo}`,
    `Zusatzleistungen: ${p.extras}`,
    `Bezahlung über Jobcenter: ${p.jobcenter}`,
    `Online-Preis: ${eur.format(p.price)}`,
  ].join('\n');
}


// --- Rückmeldung nach dem Absenden: deutlich sichtbar statt kleiner Statuszeile ---
const el = (tag, className, ...children) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
};

/** Formular durch eine Erfolgsmeldung ersetzen; „Neue Anfrage" bringt es zurück */
function showSuccess(form, { title, text, details = [] }) {
  const check = el('span', 'grid size-12 shrink-0 place-items-center rounded-full bg-[#16a34a] text-white');
  check.innerHTML = '<svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const again = el('button', 'mt-5 text-sm font-semibold text-navy-700 underline underline-offset-4 hover:text-navy', 'Weitere Anfrage senden');
  again.type = 'button';
  const panel = el('div', 'success-panel mt-6 rounded-lg border border-[#16a34a]/30 bg-[#f0fdf4] p-6 sm:col-span-3',
    el('div', 'flex items-start gap-4', check,
      el('div', '',
        el('p', 'text-xl font-bold', title),
        el('p', 'mt-1 leading-relaxed text-navy-700', text),
        ...(details.length ? [el('ul', 'mt-3 space-y-1 text-sm text-navy-700', ...details.map((d) => el('li', '', d)))] : []),
      )),
    again);
  panel.setAttribute('role', 'status');
  panel.tabIndex = -1;
  form.hidden = true;
  form.after(panel);
  panel.focus({ preventScroll: true });
  panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  again.addEventListener('click', () => { panel.remove(); form.hidden = false; });
}

/** Button während des Sendens sperren und beschriften */
function sending(button, on) {
  if (on) { button.dataset.label = button.textContent; button.textContent = 'Wird gesendet …'; }
  else if (button.dataset.label) button.textContent = button.dataset.label;
  button.disabled = on;
  button.classList.toggle('opacity-70', on);
}

/** Fehlermeldung rot hervorheben */
const showError = (status, ...nodes) => {
  status.classList.add('text-red-600');
  status.replaceChildren(...nodes);
};

const whatsappUrl = (text) => `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(text)}`;

export function initLeadForm(form, getEstimate) {
  const status = form.querySelector('[data-status]');
  const submit = form.querySelector('button[type=submit]');
  // Kein Termin in der Vergangenheit
  form.elements.date.min = new Date().toISOString().slice(0, 10);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const estimate = getEstimate();
    if (!estimate.input.ready) {
      status.textContent = 'Bitte zuerst Beladeort und Entladeort im Rechner eingeben.';
      document.querySelector('#from')?.focus();
      return;
    }
    const data = payload(estimate, Object.fromEntries(new FormData(form)));

    if (!FORM_ENDPOINT) {
      window.open(whatsappUrl(summary(data)), '_blank', 'noopener');
      status.textContent = 'WhatsApp wurde geöffnet – senden Sie die Nachricht einfach ab.';
      return;
    }

    sending(submit, true);
    status.classList.remove('text-red-600');
    status.textContent = '';
    try {
      // text/plain vermeidet den CORS-Preflight, den Google Apps Script nicht beantwortet
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || res.statusText);
      form.reset();
      showSuccess(form, {
        title: `Vielen Dank, ${data.name}!`,
        text: 'Ihre Anfrage ist bei uns angekommen. Wir rufen Sie meist innerhalb von 1 Stunde zurück (Mo–Sa, 7–20 Uhr) und bestätigen Ihren Festpreis.',
        details: [`Umzug: ${data.from} → ${data.to}`, `Ihr Festpreis: ${eur.format(data.price)}`, `Wir erreichen Sie unter: ${data.phone}`],
      });
    } catch {
      // Anfrage nicht verlieren: WhatsApp als Ausweg anbieten
      showError(status,
        'Senden fehlgeschlagen. ',
        Object.assign(document.createElement('a'), {
          href: whatsappUrl(summary(data)), target: '_blank', rel: 'noopener',
          className: 'underline font-semibold', textContent: 'Anfrage per WhatsApp senden',
        }),
        `, anrufen: ${COMPANY.phone} oder per E-Mail: ${COMPANY.email}`,
      );
    } finally {
      sending(submit, false);
    }
  });
}

/** Rückruf-Formular (nur Name + Telefon) – landet in derselben Tabelle wie die Anfragen */
export function initCallbackForm(form) {
  const status = form.querySelector('[data-status]');
  const submit = form.querySelector('button[type=submit]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const { name, phone, website = '' } = Object.fromEntries(new FormData(form));
    const text = `Bitte um Rückruf – ${name.trim()}, Telefon: ${phone.trim()}`;

    if (!FORM_ENDPOINT) {
      window.open(whatsappUrl(text), '_blank', 'noopener');
      status.textContent = 'WhatsApp wurde geöffnet – senden Sie die Nachricht einfach ab.';
      return;
    }

    sending(submit, true);
    status.classList.remove('text-red-600');
    status.textContent = '';
    try {
      // Felder so gefüllt, dass auch ältere Skript-Versionen eine lesbare Zeile/E-Mail erzeugen
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          type: 'Rückruf', name: name.trim(), phone: phone.trim(), website,
          from: 'Rückruf erbeten', to: '–', date: '–', extras: '–', jobcenter: '–', price: '–',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || res.statusText);
      form.reset();
      showSuccess(form, {
        title: `Danke, ${name.trim()}!`,
        text: `Ihre Rückruf-Anfrage ist angekommen. Wir rufen Sie unter ${phone.trim()} zurück – meist innerhalb von 1 Stunde (Mo–Sa, 7–20 Uhr).`,
      });
    } catch {
      showError(status,
        'Senden fehlgeschlagen. Bitte rufen Sie uns an: ',
        Object.assign(document.createElement('a'), { href: `tel:${COMPANY.phone.replace(/\s/g, '')}`, className: 'underline font-semibold', textContent: COMPANY.phone }),
        ' oder ',
        Object.assign(document.createElement('a'), { href: whatsappUrl(text), target: '_blank', rel: 'noopener', className: 'underline font-semibold', textContent: 'per WhatsApp' }),
        '.',
      );
    } finally {
      sending(submit, false);
    }
  });
}
