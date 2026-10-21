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
export function estimate({ km, approachKm, sqm, floorFrom, floorTo, liftFrom, liftTo, packing, assembly, parking, disposal, kitchen, kitchenM = 0,
  fill = 'normal', piano, washer, bigWardrobe, cellar }) {
  const lines = [];
  const f = P.fill[fill] ?? 1;
  const volume = sqm * f; // „gefühlte" Wohnfläche je nach Möblierung
  const transport = P.base + volume * P.perSqm;
  const fillLabel = { wenig: ' – wenig möbliert', voll: ' – voll möbliert' }[fill] ?? '';
  lines.push([`Transport & Team${fillLabel}`, transport]);

  const extraApproach = Math.max(0, approachKm - P.includedApproachKm);
  if (extraApproach) lines.push([`Anfahrt ab ${BASE.name} (${approachKm} km)`, extraApproach * P.approachPerKm]);

  const extraKm = Math.max(0, km - P.includedKm);
  if (extraKm) lines.push([`Fahrtstrecke (${km} km)`, extraKm * P.perKm]);

  const floorFactor = (floor, lift) => floor * (lift ? P.floorWithLift : P.floorNoLift);
  const floors = transport * (floorFactor(floorFrom, liftFrom) + floorFactor(floorTo, liftTo));
  if (floors) lines.push(['Etagen-Zuschlag', floors]);

  if (packing) lines.push(['Verpackungsservice', volume * P.packingPerSqm]);
  if (assembly) lines.push(['Möbel De-/Montage', volume * P.assemblyPerSqm]);
  if (parking) lines.push(['Halteverbotszonen (2×)', P.parkingZone * 2]);
  if (disposal) lines.push(['Entsorgung', P.disposal]);
  if (piano) lines.push(['Klavier', P.piano]);
  if (washer) lines.push(['Waschmaschine', P.washer]);
  if (bigWardrobe) lines.push(['Schrank über 2 m', P.bigWardrobe]);
  if (cellar) lines.push(['Keller / Dachboden', P.cellar]);
  if (kitchen) lines.push([`Küche ab- & aufbauen (${String(kitchenM).replace('.', ',')} m)`, Math.max(P.kitchenMin, kitchenM * P.kitchenPerM)]);

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
    // Postleitzahl: „65479" oder „65479 Raunheim"
    const zip = query.trim().match(/^(\d{5})\b/);
    if (zip) return entries.find((c) => c.plz.includes(zip[1])) ?? null;
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
  // Elemente auf der ganzen Seite (Mini-Rechner im Hero liegt außerhalb von root)
  const $ = (id) => document.getElementById(id);

  // Städteliste nachladen (eigener Chunk, blockiert den Seitenaufbau nicht)
  const { default: { states, cities } } = await import('./cities.json');
  // Relevanz: nah und groß zuerst (Köln vor Kölbingen, Bad Soden vor Bad Hersfeld)
  const entries = cities
    .map(([name, lat, lon, state, pop, plz]) => {
      const km = roadKm(BASE, { lat, lon });
      // kleine Orte ohne Einwohnerzahl wie Dörfer mit ~300 Einwohnern gewichten
      return { name, lat, lon, state, pop, plz: plz ? plz.split(' ') : [], key: norm(name), km, rank: (km + 5) / Math.max(pop, 300) ** 0.3 };
    })
    .sort((a, b) => a.rank - b.rank);
  const findCity = cityFinder(entries);
  const meta = (city) => `${city.km} km`;
  ['from', 'to', 'q-from', 'q-to'].forEach((id) => $(id) && attachCityCombobox($(id), { entries, states, norm, meta }));

  // Wurde der Mini-Rechner oben benutzt? → unten nur Zusammenfassung statt Feldern
  let heroUsed = false;
  let editingBasics = false;
  let syncing = false;
  ['q-from', 'q-to', 'q-sqm', 'q-sqm-range'].forEach((id) => $(id)?.addEventListener('input', () => {
    if (!syncing) heroUsed = true;
  }));

  // Mini-Rechner (data-mirror="<id>") und großer Rechner in beide Richtungen koppeln
  const sync = (a, b) => a.addEventListener('input', () => {
    if (b.value === a.value) return;
    b.value = a.value;
    syncing = true;
    b.dispatchEvent(new Event('input', { bubbles: true }));
    syncing = false;
  });
  document.querySelectorAll('[data-mirror]').forEach((mini) => {
    const main = $(mini.dataset.mirror);
    sync(mini, main);
    sync(main, mini);
  });

  // Vorbelegung aus dem Link, z. B. /?von=Köln#rechner (von den Standortseiten)
  const params = new URLSearchParams(location.search);
  [['from', 'von'], ['to', 'nach']].forEach(([id, key]) => {
    const city = params.get(key) && findCity(params.get(key));
    if (city) {
      $(id).value = city.name;
      $(id).dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

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
      kitchen: d.has('kitchen'),
      kitchenM: Number(d.get('kitchenM')) || 0,
      fill: d.get('fill') || 'normal',
      piano: d.has('piano'),
      washer: d.has('washer'),
      bigWardrobe: d.has('bigWardrobe'),
      cellar: d.has('cellar'),
    };
  };

  // Slider und Zahlenfeld synchron halten, Füllstand des Sliders über --p
  document.querySelectorAll('[data-sync]').forEach((range) => {
    const number = $(range.dataset.sync);
    const fill = () => {
      const p = ((range.value - range.min) / (range.max - range.min)) * 100;
      range.style.setProperty('--p', `${p}%`);
    };
    range.addEventListener('input', () => {
      number.value = range.value;
      fill();
      number.dispatchEvent(new Event('input', { bubbles: true })); // für die Kopplung Mini ↔ groß
    });
    number.addEventListener('input', () => { range.value = number.value; fill(); });
    fill();
  });

  const routeText = (i) => {
    if (i.routeKnown) return `Strecke ca. ${i.km} km · Anfahrt ab ${BASE.name} ca. ${i.approachKm} km`;
    if (!i.ready) return 'Beladeort und Entladeort eingeben – der Preis erscheint sofort.';
    return 'Ort nicht gefunden – bitte Entfernung unten einstellen.';
  };

  // Ein-/Ausklappen mit Animation; eingeklappte Felder sind per Tab nicht erreichbar (inert)
  const setCollapsed = (el, collapsed) => {
    if (!el || el.classList.contains('is-collapsed') === collapsed) return;
    el.classList.add('is-animating');
    el.classList.toggle('is-collapsed', collapsed);
    el.inert = collapsed;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-animating'), 350);
  };
  const updateBasics = (input) => {
    const compact = heroUsed && input.routeKnown && !editingBasics;
    setCollapsed($('basics'), compact);
    setCollapsed($('basics-summary'), !compact);
    if (compact) {
      document.querySelector('[data-summary-route]').textContent = `${input.from} → ${input.to}`;
      document.querySelector('[data-summary-meta]').textContent = `${input.sqm} m² · ca. ${input.km} km Strecke`;
    }
  };
  document.querySelector('[data-edit-basics]')?.addEventListener('click', () => {
    editingBasics = true;
    render();
    setTimeout(() => $('from').focus({ preventScroll: true }), 320);
  });
  $('basics-summary') && ($('basics-summary').inert = true);

  let last;
  const render = () => {
    const input = read();
    last = { input, result: estimate(input) };
    const { result } = last;
    $('route-info').textContent = routeText(input);
    updateBasics(input);
    // Preis im großen Rechner und im Mini-Rechner; ohne Orte ein Hinweis statt „– €"
    document.querySelectorAll('[data-price]').forEach((price) => {
      price.classList.toggle('price-empty', !input.ready);
      if (!input.ready) {
        price.textContent = 'Ihr Preis erscheint hier';
        delete price.dataset.value;
      } else {
        animateNumber(price, result.price);
      }
    });
    $('price-breakdown').replaceChildren(...result.lines.map(([label, v]) => {
      const li = document.createElement('li');
      li.className = 'flex justify-between gap-4';
      li.append(Object.assign(document.createElement('span'), { textContent: label }));
      li.append(Object.assign(document.createElement('span'), { className: 'tabular-nums', textContent: eur.format(v) }));
      return li;
    }));
  };

  // Küchenlänge nur zeigen, wenn „Küche" gewählt ist
  const toggleKitchen = () => $('kitchen-size').classList.toggle('hidden', !form.elements.kitchen.checked);
  form.addEventListener('input', toggleKitchen);
  toggleKitchen();

  form.addEventListener('input', render);
  render();

  // „Diesen Festpreis sichern": erst Preis, dann Kontaktdaten (Schritt 2)
  const lead = $('lead-form');
  document.querySelectorAll('[data-secure]').forEach((btn) => btn.addEventListener('click', () => {
    if (!last.input.ready) {
      // Noch keine Orte: zum passenden Feld (im Hero oder im großen Rechner)
      const inHero = btn.closest('#schnellrechner');
      const field = [inHero ? 'q-from' : 'from', inHero ? 'q-to' : 'to'].map($).find((f) => !f.value.trim()) ?? $(inHero ? 'q-from' : 'from');
      field.focus();
      return;
    }
    lead.hidden = false;
    lead.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    $('lead-name').focus({ preventScroll: true });
  }));
  return () => last;
}
