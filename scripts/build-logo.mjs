// Erzeugt das Logo als SVG-Dateien in brand/ (Schrift in Pfade umgewandelt,
// damit das Logo überall gleich aussieht – auch ohne installierte Montserrat).
// Ausführen: npm run logo
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import opentype from 'opentype.js';

const require = createRequire(import.meta.url);
const NAVY = '#0F172A';
const ORANGE = '#F97316';
const font = opentype.parse(
  readFileSync(require.resolve('@fontsource/montserrat/files/montserrat-latin-800-normal.woff')).buffer,
);

/**
 * Bildmarke: orangefarbenes Quadrat mit weißem Linien-Transporter,
 * dessen Laderaum die Silhouette eines Hauses hat („Ihr Zuhause in Bewegung").
 * Raster 0 0 32 32 (wie das ursprüngliche Favicon).
 */
const ICON_PATHS = `
    <path d="M14 18V8L8 3 2 8V17a1 1 0 0 0 1 1h2"/>
    <path d="M15 18H9"/>
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.6l-3.7-5A1 1 0 0 0 17.5 8H14"/>
    <circle cx="17" cy="18" r="2"/>
    <circle cx="7" cy="18" r="2"/>`;

function mark({ bg = ORANGE, fg = '#FFFFFF' } = {}) {
  return `
  <rect width="32" height="32" rx="7" fill="${bg}"/>
  <g fill="none" stroke="${fg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(4 4.5)">${ICON_PATHS}
  </g>`;
}
const MARK_W = 32;
const MARK_H = 32;

/** Schriftzug „Einfach Umzüge" als Pfade; gibt {svg, width, height} zurück */
function wordmark(size, { navy = NAVY, orange = ORANGE } = {}) {
  const a = 'Einfach';
  const b = 'Umzüge';
  const gap = size * 0.28;
  const wa = font.getAdvanceWidth(a, size);
  const wb = font.getAdvanceWidth(b, size);
  const ascent = (font.ascender / font.unitsPerEm) * size * 0.72; // Versalhöhe ≈ 0.7 em
  const pa = font.getPath(a, 0, ascent, size).toPathData(2);
  const pb = font.getPath(b, wa + gap, ascent, size).toPathData(2);
  return {
    svg: `<path d="${pa}" fill="${navy}"/><path d="${pb}" fill="${orange}"/>`,
    width: wa + gap + wb,
    height: size * 0.98, // inkl. Unterlänge von „g"
  };
}

const svgDoc = (w, h, body, title = 'Einfach Umzüge') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${title}">\n<title>${title}</title>${body}\n</svg>\n`;

mkdirSync(new URL('../brand/', import.meta.url), { recursive: true });
const out = (name, svg) => writeFileSync(new URL(`../brand/${name}`, import.meta.url), svg);

// 1) Gestapelt: Bildmarke über Schriftzug
{
  const pad = 32;
  const wm = wordmark(44);
  const markScale = 4;
  const w = Math.max(MARK_W * markScale, wm.width) + pad * 2;
  const ty = pad + MARK_H * markScale + 28;
  const h = ty + wm.height + pad;
  out('logo.svg', svgDoc(w, h, `
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  <g transform="translate(${((w - MARK_W * markScale) / 2).toFixed(1)} ${pad}) scale(${markScale})">${mark()}</g>
  <g transform="translate(${((w - wm.width) / 2).toFixed(1)} ${ty.toFixed(1)})">${wm.svg}</g>`));
}

// 2) Horizontal: Bildmarke links, Schriftzug rechts (Website-Header, Briefkopf)
const horizontal = (colors, bg) => {
  const s = 1.5;
  const wm = wordmark(32, colors);
  const markH = MARK_H * s;
  const h = Math.max(markH, wm.height);
  const gap = 14;
  const w = MARK_W * s + gap + wm.width;
  return svgDoc(w, h, `${bg ? `\n  <rect width="100%" height="100%" fill="${bg}"/>` : ''}
  <g transform="translate(0 ${((h - markH) / 2).toFixed(1)}) scale(${s})">${mark()}</g>
  <g transform="translate(${(MARK_W * s + gap).toFixed(1)} ${((h - wm.height) / 2 + 2).toFixed(1)})">${wm.svg}</g>`);
};
out('logo-horizontal.svg', horizontal({}, null));
// Für dunkle Hintergründe: „Einfach" in Weiß
out('logo-horizontal-white.svg', horizontal({ navy: '#FFFFFF' }, NAVY));

// 3) Nur Bildmarke (Profilbild, App-Icon) und Favicon
out('icon.svg', svgDoc(32, 32, mark()));
out('favicon.svg', svgDoc(32, 32, mark()));

console.log('Logos geschrieben: brand/logo.svg, logo-horizontal.svg, logo-horizontal-white.svg, icon.svg, favicon.svg');
