// Erzeugt die Einsatzgebiet-Karte (200 km um Raunheim) als Inline-SVG in index.html.
// Keine externen Kartendienste → keine Cookies, keine DSGVO-Einwilligung nötig.
// Ausführen: npm run map
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoCircle, geoConicConformal, geoPath, geoDistance } from 'd3-geo';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-50m.json');

const CENTER = { name: 'Raunheim', lon: 8.4536, lat: 50.0097 };
const RADIUS_KM = 200;
const W = 800;
const H = 760;

// Städte mit Beschriftung; dx/dy verschieben das Label, anchor = Textausrichtung
const CITIES = [
  ['Frankfurt', 8.6821, 50.1109, 8, -8, 'start'],
  ['Limburg', 8.0628, 50.3836, 8, -6, 'start'],
  ['Mannheim', 8.466, 49.4875, 8, 4, 'start'],
  ['Koblenz', 7.589, 50.3569, -8, 12, 'end'],
  ['Würzburg', 9.9534, 49.7913, 8, 4, 'start'],
  ['Karlsruhe', 8.4037, 49.0069, 8, 4, 'start'],
  ['Stuttgart', 9.1829, 48.7758, 8, 4, 'start'],
  ['Köln', 6.9603, 50.9375, -8, 4, 'end'],
  ['Düsseldorf', 6.7735, 51.2277, -8, 4, 'end'],
  ['Dortmund', 7.4653, 51.5136, 8, 4, 'start'],
  ['Kassel', 9.4797, 51.3127, 8, 4, 'start'],
  ['Nürnberg', 11.0767, 49.4521, -8, -8, 'end'],
  ['Saarbrücken', 6.9969, 49.2402, -8, 4, 'end'],
  ['Luxemburg', 6.1296, 49.6116, 8, 4, 'start'],
  ['Straßburg', 7.7521, 48.5734, -8, 4, 'end'],
];

const center = [CENTER.lon, CENTER.lat];
const circle = geoCircle().center(center).radius((RADIUS_KM / 6371) * (180 / Math.PI)).precision(1)();

const projection = geoConicConformal()
  .parallels([48, 52])
  .rotate([-CENTER.lon, 0])
  .fitExtent([[40, 40], [W - 40, H - 40]], circle)
  .clipExtent([[0, 0], [W, H]]);
const path = geoPath(projection).digits(1);

const countries = feature(world, world.objects.countries).features;
const GERMANY = '276';
const km = (lon, lat) => Math.round(geoDistance(center, [lon, lat]) * 6371);

let svg = `<svg viewBox="0 0 ${W} ${H}" class="h-auto w-full" role="img" aria-labelledby="map-title map-desc">
  <title id="map-title">Einsatzgebiet: ${RADIUS_KM} km um ${CENTER.name}</title>
  <desc id="map-desc">Karte mit einem Umkreis von ${RADIUS_KM} Kilometern um ${CENTER.name}. Enthalten sind u. a. ${CITIES.map((c) => c[0]).join(', ')}.</desc>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <g fill="#f1f5f9" stroke="#fff" stroke-width="1.5">`;
for (const f of countries) {
  const d = path(f);
  if (d && f.id !== GERMANY) svg += `<path d="${d}"/>`;
}
svg += `</g>
  <path d="${path(countries.find((f) => f.id === GERMANY))}" fill="#e2e8f0" stroke="#fff" stroke-width="1.5"/>
  <path d="${path(circle)}" fill="#f97316" fill-opacity="0.06" stroke="#f97316" stroke-width="2" stroke-dasharray="6 6"/>
  <g font-size="14" fill="#334155">`;
for (const [name, lon, lat, dx, dy, anchor] of CITIES) {
  const [x, y] = projection([lon, lat]);
  svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#0f172a"/>`;
  svg += `<text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${name}<tspan fill="#94a3b8"> ${km(lon, lat)} km</tspan></text>`;
}
const [cx, cy] = projection(center);
svg += `</g>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="14" fill="#f97316" fill-opacity="0.25"/>
  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="#f97316"/>
  <text x="${(cx - 20).toFixed(1)}" y="${(cy + 6).toFixed(1)}" text-anchor="end" font-size="16" font-weight="700" fill="#0f172a">${CENTER.name}</text>
  <text x="${cx.toFixed(1)}" y="${(projection([CENTER.lon, CENTER.lat + (RADIUS_KM / 111.2)])[1] - 10).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="600" fill="#f97316">${RADIUS_KM} km</text>
</svg>`;

const file = new URL('../index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const re = /(<!-- MAP:START -->)[\s\S]*?(<!-- MAP:END -->)/;
if (!re.test(html)) throw new Error('MAP-Marker in index.html nicht gefunden');
writeFileSync(file, html.replace(re, `$1\n${svg}\n$2`));
console.log(`Karte geschrieben (${(svg.length / 1024).toFixed(1)} KB)`);
