/**
 * Einfach Umzüge – Anfragen aus dem Preisrechner empfangen.
 * Jede Anfrage wird als Zeile in diese Google-Tabelle geschrieben
 * und per E-Mail an den Inhaber des Google-Kontos geschickt.
 *
 * Einrichtung: siehe google-apps-script/ANLEITUNG.md
 */

// Optional: andere Empfänger-Adresse. Leer = E-Mail an das Google-Konto, dem dieses Skript gehört.
const NOTIFY_EMAIL = ''; // z. B. 'name@gmail.com' – im Google-Editor eintragen, nicht im öffentlichen Repo
const SHEET_NAME = 'Anfragen';

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
  ['price', 'Online-Preis €'],
  ['status', 'Status'],
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Honeypot: echte Besucher sehen dieses Feld nicht, Spam-Bots füllen es aus
    if (data.website) return json({ ok: true });
    if (!data.name || !data.phone) return json({ ok: false, error: 'missing fields' });

    const row = { ...data, receivedAt: new Date(), status: 'Neu' };
    appendRow(row);
    sendMail(row);
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
    name: 'TEST – bitte löschen', phone: '0170 1234567', date: 'flexibel',
    from: 'Rüsselsheim', to: 'Mainz', sqm: 70, km: 13, approachKm: 4,
    floorFrom: '2. OG ohne Aufzug', floorTo: '1. OG ohne Aufzug', extras: 'Verpackung', price: 1090,
  }) } });
  console.log(res.getContent());
}

// Zum Testen im Browser: zeigt, dass der Endpoint erreichbar ist
function doGet() {
  return json({ ok: true, service: 'Einfach Umzüge Anfragen' });
}

function appendRow(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS.map(([, label]) => label));
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#0F172A').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  // Mit ' vorangestellt, damit Google Telefonnummern/Termine nicht umformatiert
  const values = COLUMNS.map(([key]) => {
    const v = row[key] ?? '';
    return key === 'phone' || key === 'date' ? `'${v}` : v;
  });
  sheet.appendRow(values);
}

function sendMail(row) {
  const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  const phoneDigits = String(row.phone).replace(/[^\d+]/g, '');
  // Deutsche Nummer für WhatsApp: 0170… → 49170…
  const wa = phoneDigits.replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '49');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const lines = [
    ['Name', row.name], ['Telefon', row.phone], ['Wunschtermin', row.date || 'flexibel'],
    ['Von → Nach', `${row.from} → ${row.to}`], ['Wohnfläche', `${row.sqm} m²`],
    ['Strecke', `${row.km} km`], ['Anfahrt ab Raunheim', row.approachKm ? `${row.approachKm} km` : 'unbekannt'],
    ['Etagen', `Auszug: ${row.floorFrom} · Einzug: ${row.floorTo}`], ['Zusatzleistungen', row.extras || 'keine'],
    ['Online-Preis', `${row.price} €`],
  ];

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0F172A;max-width:560px">
      <h2 style="margin:0 0 16px">Neue Umzugsanfrage</h2>
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
    subject: `Neue Anfrage: ${row.name} – ${row.from} → ${row.to} – ${row.price} €`,
    htmlBody: html,
    body: lines.map(([k, v]) => `${k}: ${v}`).join('\n'),
  });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
