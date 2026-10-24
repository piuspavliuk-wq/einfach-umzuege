/**
 * Einfach Umzüge – Anfragen aus dem Preisrechner empfangen.
 * Jede Anfrage wird als Zeile in diese Google-Tabelle geschrieben
 * und per E-Mail an den Inhaber des Google-Kontos geschickt.
 *
 * Einrichtung: siehe google-apps-script/ANLEITUNG.md
 */

// Optional: andere Empfänger-Adresse. Leer = E-Mail an das Google-Konto, dem dieses Skript gehört.
const NOTIFY_EMAIL = ''; // z. B. 'name@gmail.com' – im Google-Editor eintragen, nicht im öffentlichen Repo
// Wird unter der /exec-URL angezeigt – so lässt sich prüfen, ob die neue Version veröffentlicht ist
const VERSION = 4;

// Rückruf-Wünsche gehen zusätzlich immer an diese Adresse(n), Komma-getrennt
const CALLBACK_EMAIL = 'anfrage@einfach-umzuege.de';
const SHEET_NAME = 'Anfragen';

// Bestätigung an den Kunden: Absender/Antwortadresse
const CUSTOMER_FROM = { email: 'anfrage@einfach-umzuege.de', name: 'Einfach Umzüge' };
const COMPANY = { phone: '+49 15568 716603', whatsapp: '4915568716603', site: 'https://www.einfach-umzuege.de',
  address: 'Einfach Umzüge · Inh. Bohdan Pavliuk · Römerstraße 16 · 65479 Raunheim' };
// Echter Absender anfrage@… über Brevo: API-Schlüssel unter „Projekteinstellungen → Skripteigenschaften"
// als BREVO_API_KEY eintragen (nicht hier im Code!). Ohne Schlüssel: Versand über Gmail mit Antwortadresse anfrage@.

const COLUMNS = [
  ['receivedAt', 'Eingang'],
  ['name', 'Name'],
  ['phone', 'Telefon'],
  ['date', 'Wunschtermin'],
  ['from', 'Von'],
  ['to', 'Nach'],
  ['sqm', 'm²'],
  ['km', 'Strecke km'],
  ['approachKm', 'Anfahrt km'],
  ['floorFrom', 'Etage Auszug'],
  ['floorTo', 'Etage Einzug'],
  ['extras', 'Zusatzleistungen'],
  ['jobcenter', 'Jobcenter'],
  ['price', 'Online-Preis €'],
  ['status', 'Status'],
  ['type', 'Art'], // „Anfrage" (Preisrechner) oder „Rückruf" – hinten, damit alte Zeilen passen
  ['email', 'E-Mail'],
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Honeypot: echte Besucher sehen dieses Feld nicht, Spam-Bots füllen es aus
    if (data.website) return json({ ok: true });
    if (!data.name || !data.phone) return json({ ok: false, error: 'missing fields' });

    const row = { ...data, type: data.type || 'Anfrage', receivedAt: new Date(), status: 'Neu' };
    appendRow(row);
    sendMail(row);
    if (row.type !== 'Rückruf') {
      try { sendCustomerConfirmation(row); } catch (err) { console.error('Bestätigung fehlgeschlagen', err); }
    }
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) });
  }
}

// Test im Apps-Script-Editor: Funktion „testAnfrage" auswählen → ▶ Ausführen.
// Schreibt eine Beispielzeile in die Tabelle und schickt eine Test-E-Mail.
function testAnfrage() {
  const res = doPost({ postData: { contents: JSON.stringify({
    name: 'TEST – bitte löschen', firstName: 'TEST', lastName: 'bitte löschen', phone: '0170 1234567', date: 'flexibel',
    email: NOTIFY_EMAIL.split(',')[0] || Session.getEffectiveUser().getEmail(), // Bestätigung an Sie selbst
    from: 'Rüsselsheim', to: 'Mainz', sqm: 70, km: 13, approachKm: 4,
    floorFrom: '2. OG ohne Aufzug', floorTo: '1. OG ohne Aufzug', extras: 'Verpackung', price: 1090,
  }) } });
  console.log(res.getContent());
}

function testRueckruf() {
  const res = doPost({ postData: { contents: JSON.stringify({ type: 'Rückruf', name: 'TEST Rückruf – bitte löschen', phone: '0170 1234567' }) } });
  console.log(res.getContent());
}

// Zum Testen im Browser: zeigt, dass der Endpoint erreichbar ist
function doGet() {
  return json({ ok: true, service: 'Einfach Umzüge Anfragen', version: VERSION, callbackTo: CALLBACK_EMAIL });
}

function appendRow(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.setFrozenRows(1);
  }
  // Kopfzeile immer aktuell halten (neue Spalten erscheinen auch in bestehenden Tabellen)
  sheet.getRange(1, 1, 1, COLUMNS.length)
    .setValues([COLUMNS.map(([, label]) => label)])
    .setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
  // Mit ' vorangestellt, damit Google Telefonnummern/Termine nicht umformatiert
  const values = COLUMNS.map(([key]) => {
    const v = row[key] ?? '';
    return key === 'phone' || key === 'date' ? `'${v}` : v;
  });
  sheet.appendRow(values);
}

function sendMail(row) {
  const base = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  const callbackFlag = row.type === 'Rückruf';
  // Empfänger ohne Dubletten (z. B. falls anfrage@ schon in NOTIFY_EMAIL steht)
  const to = [...new Set(`${base},${callbackFlag ? CALLBACK_EMAIL : ''}`.split(',').map((x) => x.trim()).filter(Boolean))].join(',');
  const phoneDigits = String(row.phone).replace(/[^\d+]/g, '');
  // Deutsche Nummer für WhatsApp: 0170… → 49170…
  const wa = phoneDigits.replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '49');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const callback = row.type === 'Rückruf';
  const lines = callback ? [['Name', row.name], ['Telefon', row.phone], ['Wunsch', 'Bitte zurückrufen']] : [
    ['Name', row.name], ['Telefon', row.phone], ['E-Mail', row.email || '–'], ['Wunschtermin', row.date || 'flexibel'],
    ['Von → Nach', `${row.from} → ${row.to}`], ['Wohnfläche', `${row.sqm} m²`],
    ['Strecke', `${row.km} km`], ['Anfahrt ab Raunheim', row.approachKm ? `${row.approachKm} km` : 'unbekannt'],
    ['Etagen', `Auszug: ${row.floorFrom} · Einzug: ${row.floorTo}`], ['Zusatzleistungen', row.extras || 'keine'], ['Bezahlung über Jobcenter', row.jobcenter || 'Nein'],
    ['Online-Preis', `${row.price} €`],
  ];

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0F172A;max-width:560px">
      <h2 style="margin:0 0 16px">${callback ? 'Rückruf erbeten' : 'Neue Umzugsanfrage'}</h2>
      <table style="border-collapse:collapse;width:100%">
        ${lines.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748B;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0"><b>${esc(v)}</b></td></tr>`).join('')}
      </table>
      <p style="margin:24px 0 0">
        <a href="tel:${esc(phoneDigits)}" style="background:#F97316;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Anrufen</a>
        &nbsp;
        <a href="https://wa.me/${esc(wa)}" style="background:#25D366;color:#0F172A;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">WhatsApp</a>
      </p>
      <p style="margin-top:24px;font-size:12px;color:#94A3B8">Alle Anfragen: ${esc(SpreadsheetApp.getActiveSpreadsheet().getUrl())}</p>
    </div>`;

  MailApp.sendEmail({
    to,
    subject: callback
      ? `Rückruf erbeten: ${row.name} – ${row.phone}`
      : `Neue Anfrage: ${row.name} – ${row.from} → ${row.to} – ${row.price} €`,
    htmlBody: html,
    body: lines.map(([k, v]) => `${k}: ${v}`).join('\n'),
    ...(isEmail(row.email) ? { replyTo: row.email } : {}), // „Antworten" geht direkt an den Kunden
  });
}

const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || ''));

/** Automatische Bestätigung an den Kunden mit allen Angaben und dem Festpreis */
function sendCustomerConfirmation(row) {
  if (!isEmail(row.email)) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const greeting = row.lastName ? `Guten Tag ${row.firstName} ${row.lastName}` : `Guten Tag ${row.name}`;
  const lines = [
    ['Umzug', `${row.from} → ${row.to}`],
    ['Wunschtermin', row.date || 'flexibel'],
    ['Wohnfläche', `${row.sqm} m²`],
    ['Etagen', `Auszug: ${row.floorFrom} · Einzug: ${row.floorTo}`],
    ['Ausstattung & Leistungen', row.extras || '–'],
    ['Bezahlung über Jobcenter', row.jobcenter || 'Nein'],
  ];
  const subject = `Ihre Umzugsanfrage bei Einfach Umzüge – Festpreis ${row.price} €`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0F172A;max-width:560px;line-height:1.5">
      <p style="font-size:20px;font-weight:bold;margin:0 0 4px">Einfach <span style="color:#F97316">Umzüge</span></p>
      <p style="margin:24px 0 0">${esc(greeting)},</p>
      <p>vielen Dank für Ihre Anfrage! Wir rufen Sie <b>meist innerhalb von 1 Stunde</b> (Mo–Sa, 7–20 Uhr) unter
         <b>${esc(row.phone)}</b> an und bestätigen Ihren Festpreis.</p>
      <p style="background:#FFF7ED;border-left:3px solid #F97316;padding:10px 14px;margin:16px 0">📞 Wir rufen Sie von <b>${COMPANY.phone}</b> an – speichern Sie gern unsere Nummer, damit Sie uns erkennen.</p>
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="margin:0;color:#64748B;font-size:13px">Ihr Festpreis inkl. MwSt.</p>
        <p style="margin:2px 0 12px;font-size:28px;font-weight:bold">${esc(row.price)} €</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          ${lines.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748B;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join('')}
        </table>
      </div>
      <p style="font-size:13px;color:#475569">Der Festpreis gilt, wenn Ihre Angaben stimmen. Falls etwas fehlt oder sich ändert,
         sagen Sie es uns einfach – einen Aufpreis gibt es nie ohne Ihre Zustimmung.</p>
      <p>Fragen? Antworten Sie einfach auf diese E-Mail, rufen Sie an unter <a href="tel:${COMPANY.phone.replace(/\s/g, '')}">${COMPANY.phone}</a>
         oder schreiben Sie uns per <a href="https://wa.me/${COMPANY.whatsapp}">WhatsApp</a>.</p>
      <p>Viele Grüße<br>Bohdan, Vasyl und Oleksandr Pavliuk<br>Einfach Umzüge</p>
      <p style="margin-top:28px;font-size:12px;color:#94A3B8">${esc(COMPANY.address)} · <a href="${COMPANY.site}" style="color:#94A3B8">einfach-umzuege.de</a></p>
    </div>`;
  const text = [
    `${greeting},`, '',
    `vielen Dank für Ihre Anfrage! Wir rufen Sie meist innerhalb von 1 Stunde (Mo–Sa, 7–20 Uhr) unter ${row.phone} an und bestätigen Ihren Festpreis.`, '',
    `Wir rufen Sie von ${COMPANY.phone} an – speichern Sie gern unsere Nummer.`, '',
    `Ihr Festpreis inkl. MwSt.: ${row.price} €`, ...lines.map(([k, v]) => `${k}: ${v}`), '',
    'Der Festpreis gilt, wenn Ihre Angaben stimmen. Einen Aufpreis gibt es nie ohne Ihre Zustimmung.', '',
    `Fragen? Antworten Sie auf diese E-Mail, rufen Sie an (${COMPANY.phone}) oder schreiben Sie per WhatsApp.`, '',
    'Viele Grüße', 'Bohdan, Vasyl und Oleksandr Pavliuk', 'Einfach Umzüge', '', COMPANY.address,
  ].join('\n');

  // 1) Bevorzugt: Brevo – echter Absender anfrage@einfach-umzuege.de
  const key = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
  if (key) {
    const res = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'api-key': key, accept: 'application/json' },
      payload: JSON.stringify({
        sender: CUSTOMER_FROM, replyTo: CUSTOMER_FROM,
        to: [{ email: row.email, name: row.name }],
        subject, htmlContent: html, textContent: text,
      }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() < 300) return;
    console.error('Brevo-Fehler', res.getResponseCode(), res.getContentText());
  }
  // 2) Rückfall: Gmail des Skript-Inhabers, Name „Einfach Umzüge", Antworten gehen an anfrage@
  MailApp.sendEmail({ to: row.email, subject, htmlBody: html, body: text, name: CUSTOMER_FROM.name, replyTo: CUSTOMER_FROM.email });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
