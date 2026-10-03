import { PRICING as P, BASE } from './config.js';
import { attachCityCombobox } from './city-combobox.js';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const round10 = (n) => Math.round(n / 10) * 10;

const rad = (d) => (d * Math.PI) / 180;
function airKm(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** Geschätzte Straßen-Kilometer zwischen zwei Orten */
export const roadKm = (a, b) => Math.round(airKm(a, b) * P.roadFactor);

/** Reine Preisfunktion – ohne DOM, damit leicht testbar. */
export function estimate({ km, approachKm, sqm, floorFrom, floorTo, liftFrom, liftTo, packing, assembly, parking, disposal }) {
  const lines = [];
  const transport = P.base + sqm * P.perSqm;
  lines.push(['Transport & Team', transport]);

  const extraApproach = Math.max(0, approachKm - P.includedApproachKm);
  if (extraApproach) lines.push([`Anfahrt ab ${BASE.name} (${approachKm} km)`, extraApproach * P.approachPerKm]);

  const extraKm = Math.max(0, km - P.includedKm);
  if (extraKm) lines.push([`Fahrtstrecke (${km} km)`, extraKm * P.perKm]);

  const floorFactor = (floor, lift) => floor * (lift ? P.floorWithLift : P.floorNoLift);
  const floors = transport * (floorFactor(floorFrom, liftFrom) + floorFactor(floorTo, liftTo));
  if (floors) lines.push(['Etagen-Zuschlag', floors]);

  if (packing) lines.push(['Verpackungsservice', sqm * P.packingPerSqm]);
  if (assembly) lines.push(['Möbel De-/Montage', sqm * P.assemblyPerSqm]);
  if (parking) lines.push(['Halteverbotszonen (2×)', P.parkingZone * 2]);
  if (disposal) lines.push(['Entsorgung', P.disposal]);

  const total = Math.max(P.minimum, lines.reduce((s, [, v]) => s + v, 0));
  return { lines, price: round10(total) };
}

// Städtesuche: exakter Name, sonst größte Stadt, die mit der Eingabe beginnt
// (Liste ist nach Relevanz sortiert → „Frankfurt" findet Frankfurt am Main).
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase().trim();
function cityFinder(entries) {
  const exact = new Map();
  for (const c of entries) if (!exact.has(c.key)) exact.set(c.key, c);
  return (query) => {
    const q = norm(query);
    if (q.length < 2) return null;
    return exact.get(q) ?? entries.find((c) => c.key.startsWith(q)) ?? null;
  };
}

// Preis sanft hoch-/runterzählen
function animateNumber(el, to) {
  const from = Number(el.dataset.value) || to;
  el.dataset.value = to;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = eur.format(to);
    return;
  }
  const start = performance.now();
  cancelAnimationFrame(el._raf);
  const step = (now) => {
    const t = Math.min(1, (now - start) / 350);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = eur.format(round10(from + (to - from) * eased));
    if (t < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

export async function initCalculator(root) {
  const form = root.querySelector('#calc-form');
  const $ = (id) => root.querySelector(`#${id}`);

  // Städteliste nachladen (eigener Chunk, blockiert den Seitenaufbau nicht)
  const { default: { states, cities } } = await import('./cities.json');
  // Relevanz: nah und groß zuerst (Köln vor Kölbingen, Bad Soden vor Bad Hersfeld)
  const entries = cities
    .map(([name, lat, lon, state, pop]) => {
      const km = roadKm(BASE, { lat, lon });
      return { name, lat, lon, state, key: norm(name), km, rank: (km + 5) / pop ** 0.3 };
    })
    .sort((a, b) => a.rank - b.rank);
  const findCity = cityFinder(entries);
  const meta = (city) => `${city.km} km`;
  ['from', 'to'].forEach((id) => attachCityCombobox($(id), { entries, states, norm, meta }));

  const read = () => {
    const d = new FormData(form);
    const from = findCity(d.get('from'));
    const to = findCity(d.get('to'));
    const bothEntered = Boolean(d.get('from').trim() && d.get('to').trim());
    const routeKnown = Boolean(from && to);
    // Manuelle Entfernung nur, wenn beide Orte eingegeben, aber nicht gefunden wurden
    const manual = bothEntered && !routeKnown;
    $('km-manual').classList.toggle('hidden', !manual);
    return {
      ready: routeKnown || manual,
      from: from?.name ?? d.get('from').trim(),
      to: to?.name ?? d.get('to').trim(),
      routeKnown,
      km: routeKnown ? roadKm(from, to) : Number(d.get('km')) || 0,
      // Unbekannter Beladeort → Anfahrt wird erst im Angebot berechnet
      approachKm: from ? roadKm(BASE, from) : 0,
      sqm: Number(d.get('sqm')) || 0,
      floorFrom: Number(d.get('floorFrom')),
      floorTo: Number(d.get('floorTo')),
      liftFrom: d.has('liftFrom'),
      liftTo: d.has('liftTo'),
      packing: d.has('packing'),
      assembly: d.has('assembly'),
      parking: d.has('parking'),
      disposal: d.has('disposal'),
    };
  };

  // Slider und Zahlenfeld synchron halten, Füllstand des Sliders über --p
  root.querySelectorAll('[data-sync]').forEach((range) => {
    const number = $(range.dataset.sync);
    const fill = () => {
      const p = ((range.value - range.min) / (range.max - range.min)) * 100;
      range.style.setProperty('--p', `${p}%`);
    };
    range.addEventListener('input', () => { number.value = range.value; fill(); });
    number.addEventListener('input', () => { range.value = number.value; fill(); });
    fill();
  });

  const routeText = (i) => {
    if (i.routeKnown) return `Strecke ca. ${i.km} km · Anfahrt ab ${BASE.name} ca. ${i.approachKm} km`;
    if (!i.ready) return 'Beladeort und Entladeort eingeben – der Preis erscheint sofort.';
    return 'Ort nicht gefunden – bitte Entfernung unten einstellen.';
  };

  let last;
  const render = () => {
    const input = read();
    last = { input, result: estimate(input) };
    const { result } = last;
    $('route-info').textContent = routeText(input);
    const price = $('price');
    if (!input.ready) {
      price.textContent = '– €';
      delete price.dataset.value;
    } else {
      animateNumber(price, result.price);
    }
    $('price-breakdown').replaceChildren(...result.lines.map(([label, v]) => {
      const li = document.createElement('li');
      li.className = 'flex justify-between gap-4';
      li.append(Object.assign(document.createElement('span'), { textContent: label }));
      li.append(Object.assign(document.createElement('span'), { className: 'tabular-nums', textContent: eur.format(v) }));
      return li;
    }));
  };

  form.addEventListener('input', render);
  render();
  return () => last;
}
