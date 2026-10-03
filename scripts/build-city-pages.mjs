// Erzeugt Standortseiten /umzug/<stadt>/ für die lokale Suche („Umzug Köln", „Umzugsfirma Mainz" …)
// und die sitemap.xml. Jede Seite enthält eigene Daten (Entfernung, Beispielpreise aus dem
// Preisrechner, Orte in der Umgebung), damit es keine austauschbaren Kopien sind.
// Läuft automatisch vor `npm run dev` / `npm run build`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { estimate, roadKm } from '../src/calculator.js';
import { BASE, COMPANY } from '../src/config.js';

const SITE = 'https://www.einfach-umzuege.de';
const root = new URL('../', import.meta.url);
const { states, cities: raw } = JSON.parse(readFileSync(new URL('src/cities.json', root), 'utf8'));
const places = raw.map(([name, lat, lon, state, pop]) => ({ name, lat, lon, state: states[state], pop }));

// [Name in der Datenbank, Anzeigename, Kurzname für Title/H1, Slug]
const CITIES = [
  ['Frankfurt am Main', 'Frankfurt am Main', 'Frankfurt', 'frankfurt'],
  ['Wiesbaden', 'Wiesbaden', 'Wiesbaden', 'wiesbaden'],
  ['Mainz', 'Mainz', 'Mainz', 'mainz'],
  ['Darmstadt', 'Darmstadt', 'Darmstadt', 'darmstadt'],
  ['Offenbach', 'Offenbach am Main', 'Offenbach', 'offenbach'],
  ['Rüsselsheim', 'Rüsselsheim am Main', 'Rüsselsheim', 'ruesselsheim'],
  ['Raunheim', 'Raunheim', 'Raunheim', 'raunheim'],
  ['Hanau am Main', 'Hanau', 'Hanau', 'hanau'],
  ['Bad Homburg vor der Höhe', 'Bad Homburg vor der Höhe', 'Bad Homburg', 'bad-homburg'],
  ['Limburg an der Lahn', 'Limburg an der Lahn', 'Limburg', 'limburg'],
  ['Gießen', 'Gießen', 'Gießen', 'giessen'],
  ['Marburg an der Lahn', 'Marburg', 'Marburg', 'marburg'],
  ['Fulda', 'Fulda', 'Fulda', 'fulda'],
  ['Kassel', 'Kassel', 'Kassel', 'kassel'],
  ['Aschaffenburg', 'Aschaffenburg', 'Aschaffenburg', 'aschaffenburg'],
  ['Würzburg', 'Würzburg', 'Würzburg', 'wuerzburg'],
  ['Mannheim', 'Mannheim', 'Mannheim', 'mannheim'],
  ['Ludwigshafen am Rhein', 'Ludwigshafen am Rhein', 'Ludwigshafen', 'ludwigshafen'],
  ['Heidelberg', 'Heidelberg', 'Heidelberg', 'heidelberg'],
  ['Karlsruhe', 'Karlsruhe', 'Karlsruhe', 'karlsruhe'],
  ['Stuttgart', 'Stuttgart', 'Stuttgart', 'stuttgart'],
  ['Kaiserslautern', 'Kaiserslautern', 'Kaiserslautern', 'kaiserslautern'],
  ['Saarbrücken', 'Saarbrücken', 'Saarbrücken', 'saarbruecken'],
  ['Koblenz', 'Koblenz', 'Koblenz', 'koblenz'],
  ['Bonn', 'Bonn', 'Bonn', 'bonn'],
  ['Köln', 'Köln', 'Köln', 'koeln'],
].map(([db, name, short, slug]) => {
  const p = places.filter((c) => c.name === db).sort((a, b) => b.pop - a.pop)[0];
  if (!p) throw new Error(`Stadt nicht gefunden: ${db}`);
  return { ...p, db, name, short, slug, url: `/umzug/${slug}/` };
});

const eur = (n) => `${n.toLocaleString('de-DE')} €`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const driveMin = (km) => round5((km / (km < 40 ? 45 : 75)) * 60);
const driveText = (min) => (min < 90 ? `${min} Minuten` : `${String(Math.round(min / 30) / 2).replace('.', ',')} Stunden`);

const price = (opts) => estimate({
  km: 8, approachKm: 0, sqm: 60, floorFrom: 0, floorTo: 0,
  liftFrom: false, liftTo: false, packing: false, assembly: false, parking: false, disposal: false, ...opts,
}).price;

// Wohnungsgrößen für die Preistabelle (Erdgeschoss, ohne Zusatzleistungen → „ab"-Preise)
const SIZES = [['1-Zimmer-Wohnung', 35], ['2-Zimmer-Wohnung', 60], ['3-Zimmer-Wohnung', 85], ['4-Zimmer-Wohnung / Haus', 115]];

function data(city) {
  const approachKm = roadKm(BASE, city);
  const local = SIZES.map(([label, sqm]) => ({ label, sqm, price: price({ sqm, approachKm }) }));
  const nearby = places
    // eigene Orte, keine Stadtteile: mehr als 5 km vom Zentrum, kein „Neustadt/Süd"
    .filter((p) => p.name !== city.db && !p.name.includes('/') && roadKm(city, p) > 5 && roadKm(city, p) <= 22)
    .sort((a, b) => b.pop - a.pop)
    .slice(0, 10)
    .map((p) => p.name);
  // Fernumzüge: zu drei großen Zielen (nicht die Stadt selbst)
  const routes = ['Frankfurt am Main', 'Köln', 'Stuttgart', 'Mannheim', 'Wiesbaden']
    .filter((n) => n !== city.db)
    .slice(0, 3)
    .map((n) => {
      const to = CITIES.find((c) => c.db === n);
      const km = roadKm(city, to);
      return { to, km, price: price({ sqm: 60, km, approachKm }) };
    });
  const others = CITIES.filter((c) => c !== city).sort((a, b) => roadKm(city, a) - roadKm(city, b)).slice(0, 8);
  return { approachKm, minutes: driveMin(approachKm), local, nearby, routes, others };
}

// Header, Footer, Icons und Mobil-Leiste aus index.html übernehmen (Anker auf Startseite umbiegen)
const home = readFileSync(new URL('index.html', root), 'utf8');
const grab = (re) => {
  const m = home.match(re);
  if (!m) throw new Error(`Block nicht gefunden: ${re}`);
  // nur echte Links (<a>), nicht Icon-Verweise wie <use href="#i-phone">
  return m[0].replace(/(<a\b[^>]*?)href="#/g, '$1href="/#');
};
const SPRITE = grab(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="hidden"[\s\S]*?<\/svg>/);
const HEADER = grab(/<header[\s\S]*?<\/header>/);
const FOOTER = grab(/<footer[\s\S]*?<\/footer>/);
const MOBILE = grab(/<div class="fixed inset-x-0 bottom-0[\s\S]*?<\/div>/);

function page(city) {
  const d = data(city);
  const isBase = city.db === BASE.name;
  const from = d.local[1].price;
  const title = `Umzug ${city.short} zum Festpreis – Umzugsfirma ${city.short} | Einfach Umzüge`;
  const description = `Umzugsfirma für ${city.name}: Umzug zum Festpreis ab ${eur(d.local[0].price)}, voll versichert, auch samstags. Preis in 60 Sekunden online berechnen!`;
  const calcUrl = `/?von=${encodeURIComponent(city.db)}#rechner`;

  const intro = isBase
    ? `Raunheim ist unser Firmensitz – hier sind wir zu Hause. Für Umzüge in Raunheim und den Nachbarorten fällt keine Anfahrt an, und wir sind oft schon am selben Tag einsatzbereit.`
    : `Von unserem Standort in Raunheim sind wir in rund ${driveText(d.minutes)} in ${esc(city.name)} (ca. ${d.approachKm} km). ${d.approachKm <= 25 ? 'Die Anfahrt ist im Preis enthalten.' : 'Die Anfahrt ist im Festpreis bereits eingerechnet – ohne versteckte Kosten.'}`;

  const faq = [
    [`Was kostet ein Umzug in ${city.short}?`,
      `Ein Umzug innerhalb von ${city.name} kostet bei uns ab ${eur(d.local[0].price)} für eine 1-Zimmer-Wohnung und ab ${eur(from)} für eine 2-Zimmer-Wohnung (Erdgeschoss, ohne Zusatzleistungen, inkl. Anfahrt ab Raunheim). Etage, Aufzug und Zusatzleistungen berechnen Sie im Online-Rechner – Ihr verbindlicher Festpreis folgt nach kurzer Besichtigung.`],
    [`Wie schnell können Sie in ${city.short} sein?`,
      isBase ? `Sehr schnell – Raunheim ist unser Standort. Kurzfristige Termine sind oft möglich, auch samstags.`
        : `Von Raunheim aus erreichen wir ${city.name} in rund ${driveText(d.minutes)}. Wir arbeiten von Montag bis Samstag und vergeben kurzfristige Termine.`],
    [`Brauche ich in ${city.short} eine Halteverbotszone?`,
      `Wenn vor dem Haus wenig Platz ist, ist eine Halteverbotszone sinnvoll. Sie wird bei der zuständigen Behörde der Stadt ${city.name} beantragt – in der Regel rund zwei Wochen vor dem Umzug. Auf Wunsch übernehmen wir Antrag und Beschilderung für Sie.`],
    [`Übernimmt das Jobcenter in ${city.short} die Umzugskosten?`,
      `Ist der Umzug notwendig und stimmt das zuständige Jobcenter vorher zu, werden die Kosten in der Regel übernommen (§ 22 Abs. 6 SGB II). Wir erstellen Ihnen die dafür nötigen Kostenvoranschläge kostenlos und rechnen auf Wunsch direkt mit dem Jobcenter ab.`],
  ];

  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Umzug',
      name: `Umzug ${city.name}`, url: SITE + city.url,
      provider: { '@id': `${SITE}/#company` },
      areaServed: { '@type': 'City', name: city.name, containedInPlace: { '@type': 'State', name: city.state } },
      offers: { '@type': 'Offer', priceCurrency: 'EUR', price: d.local[0].price, description: 'Umzug 1-Zimmer-Wohnung, Erdgeschoss, ab-Preis' },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Einfach Umzüge', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Einsatzorte', item: `${SITE}/umzug/` },
        { '@type': 'ListItem', position: 3, name: `Umzug ${city.short}`, item: SITE + city.url },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];

  const body = `
  <main id="main">
    <nav aria-label="Brotkrumen" class="container-x pt-8 text-sm text-navy-700">
      <a href="/" class="hover:text-navy">Startseite</a> <span aria-hidden="true">/</span>
      <a href="/umzug/" class="hover:text-navy">Einsatzorte</a> <span aria-hidden="true">/</span>
      <span class="text-navy">${esc(city.short)}</span>
    </nav>

    <section class="border-b border-line" aria-labelledby="hero-title">
      <div class="container-x pt-8 pb-14 sm:pb-20">
        <p class="text-sm text-navy-700">Umzugsfirma ${esc(city.name)} · ${esc(city.state)}</p>
        <h1 id="hero-title" class="mt-4 max-w-3xl text-[clamp(2rem,7vw,3.75rem)] leading-[1.08] font-bold tracking-tight">Umzug ${esc(city.short)} zum Festpreis</h1>
        <p class="mt-6 max-w-2xl text-lg leading-relaxed text-navy-700">${intro} Ihr Familienbetrieb für Privatumzüge, Seniorenumzüge und Jobcenter-Umzüge in ${esc(city.name)} – voll versichert, Montag bis Samstag.</p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="${calcUrl}" class="btn-primary">Preis für ${esc(city.short)} berechnen</a>
          <a data-whatsapp href="https://wa.me/${COMPANY.whatsapp}" target="_blank" rel="noopener" class="btn-outline"><svg class="size-5 text-[#25D366]"><use href="#i-whatsapp"/></svg> WhatsApp</a>
        </div>
      </div>
    </section>

    <section class="py-16 sm:py-20" aria-labelledby="preise-title">
      <div class="container-x grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
          <h2 id="preise-title" class="h2">Was kostet ein Umzug in ${esc(city.short)}?</h2>
          <p class="mt-4 leading-relaxed text-navy-700">Beispielpreise für einen Umzug innerhalb von ${esc(city.name)} – Erdgeschoss, ohne Zusatzleistungen, ${isBase ? 'ohne Anfahrtskosten' : 'Anfahrt ab Raunheim inklusive'}. Etage, Aufzug, Verpackung oder Möbelmontage berechnen Sie im Rechner.</p>
          <a href="${calcUrl}" class="mt-6 inline-block font-semibold text-accent hover:text-accent-dark">Genauen Preis berechnen →</a>
        </div>
        <table class="w-full text-left">
          <thead><tr class="border-b border-navy text-sm text-navy-700"><th class="py-3 font-normal">Wohnung</th><th class="py-3 font-normal">Fläche</th><th class="py-3 text-right font-normal">Preis ab</th></tr></thead>
          <tbody class="divide-y divide-line">
            ${d.local.map((r) => `<tr><td class="py-4 font-semibold">${r.label}</td><td class="py-4 text-navy-700">${r.sqm} m²</td><td class="py-4 text-right text-lg font-bold tabular-nums">${eur(r.price)}</td></tr>`).join('\n            ')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="border-t border-line py-16 sm:py-20" aria-labelledby="fern-title">
      <div class="container-x">
        <h2 id="fern-title" class="h2">Umzüge von ${esc(city.short)} in die Region</h2>
        <p class="mt-4 max-w-2xl leading-relaxed text-navy-700">Auch für Umzüge aus ${esc(city.name)} heraus sind wir die richtige Umzugsfirma – im ganzen Umkreis von 200&nbsp;km um Raunheim. Beispiel: 2-Zimmer-Wohnung (60&nbsp;m², Erdgeschoss):</p>
        <ul class="mt-8 grid gap-4 sm:grid-cols-3">
          ${d.routes.map((r) => `<li class="border-t-2 border-navy pt-4"><a href="${r.to.url}" class="font-semibold hover:text-accent">${esc(city.short)} → ${esc(r.to.short)}</a><p class="mt-1 text-sm text-navy-700">ca. ${r.km} km</p><p class="mt-2 text-2xl font-bold tabular-nums">ab ${eur(r.price)}</p></li>`).join('\n          ')}
        </ul>
      </div>
    </section>

    <section class="border-t border-line py-16 sm:py-20" aria-labelledby="leistungen-title">
      <div class="container-x grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="leistungen-title" class="h2">Unsere Leistungen in ${esc(city.short)}</h2>
          <dl class="mt-8 space-y-5">
            <div class="border-t border-line pt-4"><dt class="font-semibold">Privatumzug ${esc(city.short)}</dt><dd class="mt-1 text-navy-700">Vom WG-Zimmer bis zum Einfamilienhaus – wir tragen, transportieren und stellen auf.</dd></div>
            <div class="border-t border-line pt-4"><dt class="font-semibold">Seniorenumzug ${esc(city.short)}</dt><dd class="mt-1 text-navy-700">Geduldig und einfühlsam, inklusive Sortieren, Packen und Einrichten.</dd></div>
            <div class="border-t border-line pt-4"><dt class="font-semibold">Jobcenter-Umzug ${esc(city.short)}</dt><dd class="mt-1 text-navy-700">Kostenvoranschläge kostenlos, Abrechnung auf Wunsch direkt mit dem Jobcenter.</dd></div>
            <div class="border-t border-line pt-4"><dt class="font-semibold">Möbelmontage &amp; Verpackung</dt><dd class="mt-1 text-navy-700">Ab- und Aufbau von Möbeln und Küchen, sicheres Verpackungsmaterial.</dd></div>
          </dl>
        </div>
        <div>
          <h2 class="h2">Auch in der Umgebung von ${esc(city.short)}</h2>
          <p class="mt-4 leading-relaxed text-navy-700">Wir ziehen Sie nicht nur in ${esc(city.name)} um, sondern auch in den Orten ringsum:</p>
          <p class="mt-4 leading-relaxed">${d.nearby.map(esc).join(' · ')}</p>
        </div>
      </div>
    </section>

    <section class="border-t border-line bg-mist py-16 sm:py-20" aria-labelledby="faq-title">
      <div class="container-x grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <h2 id="faq-title" class="h2">Fragen zum Umzug in ${esc(city.short)}</h2>
        <div class="divide-y divide-line border-y border-line">
          ${faq.map(([q, a], i) => `<details class="group" name="faq"${i === 0 ? ' open' : ''}>
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold [&::-webkit-details-marker]:hidden"><h3>${esc(q)}</h3><span class="text-xl font-light transition group-open:rotate-45">+</span></summary>
            <p class="pb-6 leading-relaxed text-navy-700">${esc(a)}</p>
          </details>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="border-t border-line py-16 sm:py-20" aria-labelledby="cta-title">
      <div class="container-x">
        <h2 id="cta-title" class="text-sm text-navy-700">Ihre Umzugsfirma für ${esc(city.name)}</h2>
        <a data-phone href="tel:${COMPANY.phone.replace(/\s/g, '')}" class="mt-4 block text-4xl font-bold tracking-tight hover:text-accent sm:text-6xl"><span data-phone="text">${esc(COMPANY.phone)}</span></a>
        <p class="mt-4 text-navy-700">Mo–Sa, 7–20 Uhr.</p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="${calcUrl}" class="btn-primary">Preis berechnen</a>
          <a data-whatsapp href="https://wa.me/${COMPANY.whatsapp}" target="_blank" rel="noopener" class="btn-outline"><svg class="size-5 text-[#25D366]"><use href="#i-whatsapp"/></svg> WhatsApp</a>
        </div>
        <h2 class="mt-16 text-sm text-navy-700">Weitere Einsatzorte in der Nähe</h2>
        <ul class="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          ${d.others.map((o) => `<li><a href="${o.url}" class="hover:text-accent">Umzug ${esc(o.short)}</a></li>`).join('\n          ')}
          <li><a href="/umzug/" class="font-semibold hover:text-accent">Alle Orte →</a></li>
        </ul>
      </div>
    </section>
  </main>`;

  return shell({ title, description, path: city.url, ld, body });
}

function shell({ title, description, path, ld, body }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow" />
  <meta name="theme-color" content="#0F172A" />
  <link rel="canonical" href="${SITE}${path}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="de_DE" />
  <meta property="og:site_name" content="Einfach Umzüge" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${SITE}${path}" />
  <meta property="og:image" content="${SITE}/og-image.png" />
  ${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n  ')}
  <link rel="stylesheet" href="/src/style.css" />
  <script type="module" src="/src/main.js"></script>
</head>
<body>
  <!-- Automatisch erzeugt von scripts/build-city-pages.mjs – nicht von Hand bearbeiten -->
  ${SPRITE}
  <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2">Zum Inhalt springen</a>
  ${HEADER}
  ${body}
  ${FOOTER}
  ${MOBILE}
</body>
</html>
`;
}

function overview() {
  const byState = [...new Set(CITIES.map((c) => c.state))];
  const body = `
  <main id="main" class="container-x py-16 sm:py-24">
    <nav aria-label="Brotkrumen" class="text-sm text-navy-700"><a href="/" class="hover:text-navy">Startseite</a> / <span class="text-navy">Einsatzorte</span></nav>
    <h1 class="mt-6 text-[clamp(2rem,6vw,3.5rem)] leading-[1.1] font-bold tracking-tight">Umzugsfirma im Rhein-Main-Gebiet &amp; 200&nbsp;km Umkreis</h1>
    <p class="mt-6 max-w-2xl text-lg leading-relaxed text-navy-700">Von Raunheim aus ziehen wir Sie in ganz Hessen, Rheinland-Pfalz und dem Saarland sowie in großen Teilen von Nordrhein-Westfalen, Baden-Württemberg und Bayern um – zum Festpreis, Montag bis Samstag.</p>
    <div class="mt-14 grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
      ${byState.map((s) => `<section><h2 class="border-b border-navy pb-3 text-lg font-bold">${esc(s)}</h2><ul class="mt-2 divide-y divide-line">${CITIES.filter((c) => c.state === s)
        .map((c) => `<li><a href="${c.url}" class="flex justify-between py-3 hover:text-accent"><span>Umzug ${esc(c.short)}</span><span class="text-sm text-navy-700 tabular-nums">${roadKm(BASE, c)} km</span></a></li>`).join('')}</ul></section>`).join('\n      ')}
    </div>
    <p class="mt-14 text-navy-700">Ihr Ort ist nicht dabei? Kein Problem – im <a href="/#rechner" class="font-semibold text-accent">Preisrechner</a> finden Sie alle Orte im Umkreis von 200&nbsp;km.</p>
  </main>`;
  return shell({
    title: 'Einsatzorte – Umzugsfirma Rhein-Main & 200 km Umkreis | Einfach Umzüge',
    description: 'Umzüge zum Festpreis in Frankfurt, Wiesbaden, Mainz, Darmstadt, Köln, Stuttgart und 200 km Umkreis um Raunheim. Alle Einsatzorte im Überblick.',
    path: '/umzug/',
    ld: [{
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Einfach Umzüge', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Einsatzorte', item: `${SITE}/umzug/` },
      ],
    }],
    body,
  });
}

// Schreiben
const outDir = new URL('umzug/', root);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('index.html', outDir), overview());
for (const c of CITIES) {
  mkdirSync(new URL(`${c.slug}/`, outDir), { recursive: true });
  writeFileSync(new URL(`${c.slug}/index.html`, outDir), page(c));
}

const today = new Date().toISOString().slice(0, 10);
const urls = ['/', '/umzug/', ...CITIES.map((c) => c.url)];
writeFileSync(new URL('public/sitemap.xml', root), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);

// Für vite.config.js und die Startseite
writeFileSync(new URL('umzug/pages.json', root), JSON.stringify(CITIES.map(({ slug, short, url, state }) => ({ slug, short, url, state }))));
console.log(`${CITIES.length} Standortseiten + Übersicht + sitemap.xml (${urls.length} URLs)`);
