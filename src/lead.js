import { COMPANY, FORM_ENDPOINT } from './config.js';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Alle Angaben als flaches Objekt – eine Spalte pro Feld in der Tabelle */
function payload({ input, result }, lead) {
  const extras = [
    input.packing && 'Verpackung',
    input.assembly && 'Möbelmontage',
    input.parking && 'Halteverbotszone',
    input.disposal && 'Entsorgung',
  ].filter(Boolean).join(', ') || 'keine';
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
    extras,
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

    submit.disabled = true;
    status.textContent = 'Wird gesendet …';
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
      status.textContent = 'Vielen Dank! Wir melden uns innerhalb von 24 Stunden mit Ihrem Festpreis-Angebot.';
    } catch {
      // Anfrage nicht verlieren: WhatsApp als Ausweg anbieten
      status.replaceChildren(
        'Senden fehlgeschlagen. ',
        Object.assign(document.createElement('a'), {
          href: whatsappUrl(summary(data)), target: '_blank', rel: 'noopener',
          className: 'underline font-semibold', textContent: 'Anfrage per WhatsApp senden',
        }),
        `, anrufen: ${COMPANY.phone} oder per E-Mail: ${COMPANY.email}`,
      );
    } finally {
      submit.disabled = false;
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

    submit.disabled = true;
    status.textContent = 'Wird gesendet …';
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
      status.textContent = 'Danke! Wir rufen Sie zurück – meist innerhalb von 1 Stunde (Mo–Sa, 7–20 Uhr).';
    } catch {
      status.replaceChildren(
        'Senden fehlgeschlagen. Bitte rufen Sie uns an: ',
        Object.assign(document.createElement('a'), { href: `tel:${COMPANY.phone.replace(/\s/g, '')}`, className: 'underline font-semibold', textContent: COMPANY.phone }),
        ' oder ',
        Object.assign(document.createElement('a'), { href: whatsappUrl(text), target: '_blank', rel: 'noopener', className: 'underline font-semibold', textContent: 'per WhatsApp' }),
        '.',
      );
    } finally {
      submit.disabled = false;
    }
  });
}
