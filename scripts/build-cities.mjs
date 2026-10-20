// Erzeugt src/cities.json – ALLE Orte in Deutschland im Umkreis von 200 km um Raunheim
// (Städte, Gemeinden, Dörfer, Stadtteile) inkl. Postleitzahlen, gruppiert nach Bundesland.
// Quellen: GeoNames-Ortsverzeichnis (DE.zip) + GeoNames-PLZ-Datei (zip/DE.zip), CC BY 4.0.
// Ausführen: npm run cities   (lädt die Daten einmalig herunter)
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = [50.0097, 8.4536]; // Raunheim
const RADIUS_KM = 200; // Luftlinie, wie auf der Karte

const STATES = {
  '01': 'Baden-Württemberg', '02': 'Bayern', '03': 'Bremen', '04': 'Hamburg', '05': 'Hessen',
  '06': 'Niedersachsen', '07': 'Nordrhein-Westfalen', '08': 'Rheinland-Pfalz', '09': 'Saarland',
  '10': 'Schleswig-Holstein', '11': 'Brandenburg', '12': 'Mecklenburg-Vorpommern', '13': 'Sachsen',
  '14': 'Sachsen-Anhalt', '15': 'Thüringen', '16': 'Berlin',
};

// Siedlungstypen aus GeoNames; ohne historische/verlassene/zerstörte Orte
const KEEP = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLL', 'PPLS', 'PPLX']);
// Großkunden-PLZ (Firmen, Behörden) aus der PLZ-Datei aussortieren
const NOT_A_PLACE = /\d|GmbH|mbH|\bAG\b|\bKG\b|e\.\s?V\.|Bank|Kasse|Versicherung|Verlag|Amt\b|amt\b|gericht|Agentur|Behörde|Bundes|Landes|Ministerium|Universität|Hochschule|Klinik|Krankenhaus|Service|Deutschland|Gesellschaft|Verband|Zentrale|Direktion|Postfach|&|,|\(|\//;

const STATE_NAMES = new Set(Object.values(STATES));

const rad = (d) => (d * Math.PI) / 180;
function km([la1, lo1], [la2, lo2]) {
  const h = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// --- Daten laden (einmalig in den Temp-Ordner) ---
const dir = join(tmpdir(), 'einfach-umzuege-geonames');
mkdirSync(dir, { recursive: true });
const fetchZip = (url, zip, file) => {
  const out = join(dir, file);
  if (!existsSync(out)) {
    execSync(`curl -sSL -o "${join(dir, zip)}" "${url}" && unzip -o -q "${join(dir, zip)}" DE.txt -d "${join(dir, file.split('/')[0])}"`);
  }
  return readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
};
const gazetteer = fetchZip('https://download.geonames.org/export/dump/DE.zip', 'dump.zip', 'dump/DE.txt');
const postal = fetchZip('https://download.geonames.org/export/zip/DE.zip', 'zip.zip', 'zip/DE.txt');

// --- 1) Orte aus dem Ortsverzeichnis ---
let places = gazetteer
  .filter((f) => f[6] === 'P' && KEEP.has(f[7]) && STATES[f[10]])
  .map((f) => ({ name: f[1], lat: +f[4], lon: +f[5], code: f[7], pop: +f[14] || 0, state: STATES[f[10]], key: f.slice(10, 14).join('|'), plz: new Set() }))
  .filter((p) => km(BASE, [p.lat, p.lon]) <= RADIUS_KM);

// --- 2) PLZ den Orten zuordnen (nur bekannte Orte; offizielle Langnamen übernehmen) ---
const near = (a, b, d) => km([a.lat, a.lon], [b.lat, b.lon]) <= d;
for (const f of postal) {
  // Bundesland steht hier als Name („Hessen"), nicht als Code
  const [plz, name, stateName, , , , , , lat, lon] = f.slice(1);
  if (!lat || NOT_A_PLACE.test(name) || !STATE_NAMES.has(stateName)) continue;
  const p = { name, lat: +lat, lon: +lon };
  if (km(BASE, [p.lat, p.lon]) > RADIUS_KM) continue;
  // gleicher Name in der Nähe → PLZ ergänzen
  let hit = places.find((q) => q.name === name && near(q, p, 12));
  // Kurz-/Langform desselben Orts in den beiden Quellen
  if (!hit) {
    // Verzeichnis „Biebesheim", PLZ-Datei „Biebesheim am Rhein" → offiziellen Namen übernehmen;
    // PLZ-Datei „Stuttgart Bad Cannstatt" (Stadtbezirk) → nur PLZ zur Stadt
    hit = places.find((q) => q.code !== 'PPLX' && name.startsWith(`${q.name} `) && near(q, p, 8));
    const suffix = hit && name.slice(hit.name.length + 1);
    if (hit && /^(am|an|im|in|ob|vor|bei|auf|unter|ob)\b/.test(suffix)) hit.name = name;
  }
  if (!hit) {
    // Verzeichnis „Rüsselsheim am Main", PLZ-Datei „Rüsselsheim"
    hit = places.find((q) => q.code !== 'PPLX' && q.name.startsWith(`${name} `) && near(q, p, 8));
  }
  // Kein passender Ort → Großkunden-PLZ einer Firma/Behörde: nicht als Ort aufnehmen
  if (hit) hit.plz.add(plz);
}

// --- 3) Stadt-/Ortsteile mit ihrer Gemeinde kennzeichnen: „Höchst (Frankfurt am Main)", „Okriftel (Hattersheim am Main)" ---
// Zuordnung über den Gemeindeschlüssel (admin1–4) zum Verwaltungssitz (PPLA*)
const seats = new Map();
for (const p of places) {
  if (!p.code.startsWith('PPLA') || !p.key) continue;
  const cur = seats.get(p.key);
  if (!cur || p.pop > cur.pop) seats.set(p.key, p);
}
const big = places.filter((p) => p.pop >= 20000 && p.code !== 'PPLX');
const nearestBig = (p, maxKm) => {
  let best = null;
  let bestD = maxKm;
  for (const b of big) {
    const d = km([p.lat, p.lon], [b.lat, b.lon]);
    if (b !== p && d < bestD) { best = b; bestD = d; }
  }
  return best;
};
places = places.filter((p) => {
  if (p.code.startsWith('PPLA')) return true;
  const seat = p.key && seats.get(p.key);
  const parent = seat && seat.name !== p.name ? seat : null;
  if (p.code === 'PPLX') {
    const city = parent ?? nearestBig(p, 8);
    if (!city) return false;
    p.name = `${p.name} (${city.name})`;
  } else if (parent && p.pop < 20000) {
    p.name = `${p.name} (${parent.name})`;
  }
  return true;
});

// --- 4) Dubletten: gleicher Name nah beieinander → einer; weit auseinander → „(bei X)" ---
places.sort((a, b) => b.pop - a.pop || b.plz.size - a.plz.size);
const kept = [];
for (const p of places) {
  const twin = kept.find((q) => q.name === p.name && near(q, p, 4));
  if (twin) { p.plz.forEach((z) => twin.plz.add(z)); continue; }
  kept.push(p);
}
const byName = new Map();
kept.forEach((p) => byName.set(p.name, [...(byName.get(p.name) ?? []), p]));
for (const group of byName.values()) {
  if (group.length < 2) continue;
  group.slice(1).forEach((p) => { // größter Ort behält den reinen Namen
    const ref = nearestBig(p, 40);
    p.name = ref ? `${p.name} (bei ${ref.name})` : `${p.name} (${p.state})`;
  });
}

// --- 5) Einzelne Höfe/Mühlen ohne Einwohnerzahl und PLZ weglassen (keine Umzugsziele, nur Ballast) ---
const FARM = /(hof|höfe|mühle|hütte|haus|häuser|siedlung|ziegelei|forsthaus|gut|schäferei|säge|werk)$/i;
for (let i = kept.length - 1; i >= 0; i--) {
  const p = kept[i];
  if (p.pop === 0 && p.plz.size === 0 && FARM.test(p.name.split(' (')[0])) kept.splice(i, 1);
}

// --- Ausgabe ---
const states = [...new Set(kept.map((c) => c.state))];
const nearest = (s) => Math.min(...kept.filter((c) => c.state === s).map((c) => km(BASE, [c.lat, c.lon])));
states.sort((a, b) => nearest(a) - nearest(b));

const out = {
  states,
  cities: kept.map((c) => [c.name, +c.lat.toFixed(2), +c.lon.toFixed(2), states.indexOf(c.state), c.pop, [...c.plz].sort().join(' ')]),
};
writeFileSync(new URL('../src/cities.json', import.meta.url), JSON.stringify(out));
console.log(`${out.cities.length} Orte (${out.cities.filter((c) => c[5]).length} mit PLZ) in ${states.length} Bundesländern`);
