// Zentrale Firmendaten – vor dem Go-Live mit echten Daten ersetzen.
// Die gleichen Werte stehen im Schema.org-Block in index.html.
export const COMPANY = {
  name: 'Einfach Umzüge',
  phone: '+49 15568 716603',
  whatsapp: '4915568716603',         // ohne + und Leerzeichen
  email: 'info@einfach-umzuege.de',  // TODO
};

// Google-Apps-Script-URL (endet auf /exec) – Anfragen landen in Google Sheets + E-Mail.
// Einrichtung: google-apps-script/ANLEITUNG.md
// Leer lassen → Anfrage wird als vorausgefüllte WhatsApp-Nachricht geöffnet.
export const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbznZVhxjQwZtVgHM_ssQOSG8iB_oAgpiTQNcFTa4hdwX5c52E5s-qLTF3bsW6dErqXC/exec';

// Firmensitz: Startpunkt der Anfahrt
export const BASE = { name: 'Raunheim', lat: 50.0097, lon: 8.4536 };

// Preislogik des Rechners (alle Werte in Euro, Richtwerte).
export const PRICING = {
  base: 249,              // Grundpauschale (LKW, Team-Einsatz)
  perSqm: 6.9,            // Transport & Tragen je m² Wohnfläche
  includedKm: 15,         // im Grundpreis enthaltene Strecke
  perKm: 1.8,             // je weiterem Kilometer
  includedApproachKm: 25, // Anfahrt ab Firmensitz bis hier kostenlos (Rhein-Main)
  approachPerKm: 1.5,     // je weiterem Anfahrts-Kilometer
  roadFactor: 1.25,       // Luftlinie → geschätzte Straßen-Kilometer
  floorNoLift: 0.05,      // +5 % je Etage ohne Aufzug (je Adresse)
  floorWithLift: 0.01,    // +1 % je Etage mit Aufzug
  packingPerSqm: 3.5,     // Verpackungsservice inkl. Material
  assemblyPerSqm: 2.4,    // Möbel De-/Montage
  parkingZone: 129,       // Halteverbotszone je Adresse
  disposal: 149,          // Entrümpelung / Entsorgung (Pauschale)
  minimum: 299,
};
