// Erzeugt src/cities.json – alle Orte in Deutschland im Umkreis von 200 km um Raunheim,
// gruppiert nach Bundesland. Ausführen: npm run cities
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const all = require('all-the-cities');

const BASE = [50.0097, 8.4536]; // Raunheim
const RADIUS_KM = 200; // Luftlinie, wie auf der Karte

// GeoNames admin1-Codes für Deutschland
const STATES = {
  '01': 'Baden-Württemberg', '02': 'Bayern', '03': 'Bremen', '04': 'Hamburg', '05': 'Hessen',
  '06': 'Niedersachsen', '07': 'Nordrhein-Westfalen', '08': 'Rheinland-Pfalz', '09': 'Saarland',
  '10': 'Schleswig-Holstein', '11': 'Brandenburg', '12': 'Mecklenburg-Vorpommern', '13': 'Sachsen',
  '14': 'Sachsen-Anhalt', '15': 'Thüringen', '16': 'Berlin',
};

const rad = (d) => (d * Math.PI) / 180;
function km([la1, lo1], [la2, lo2]) {
  const h = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const inZone = all
  .filter((c) => c.country === 'DE' && STATES[c.adminCode])
  .map((c) => ({ name: c.name, lat: c.loc.coordinates[1], lon: c.loc.coordinates[0], pop: c.population, state: STATES[c.adminCode] }))
  .filter((c) => km(BASE, [c.lat, c.lon]) <= RADIUS_KM)
  .sort((a, b) => b.pop - a.pop);

// Doppelte Namen innerhalb eines Bundeslands: größeren Ort behalten
const seen = new Set();
const unique = inZone.filter((c) => {
  const id = `${c.state}|${c.name}`;
  return !seen.has(id) && seen.add(id);
});

// Bundesländer nach Nähe zu Raunheim sortieren (Hessen zuerst)
const states = [...new Set(unique.map((c) => c.state))];
const nearest = (s) => Math.min(...unique.filter((c) => c.state === s).map((c) => km(BASE, [c.lat, c.lon])));
states.sort((a, b) => nearest(a) - nearest(b));

const out = {
  states,
  cities: unique.map((c) => [c.name, +c.lat.toFixed(3), +c.lon.toFixed(3), states.indexOf(c.state), c.pop]),
};
writeFileSync(new URL('../src/cities.json', import.meta.url), JSON.stringify(out));
console.log(`${out.cities.length} Orte in ${states.length} Bundesländern: ${states.join(', ')}`);
