import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = import.meta.dirname;
// Standortseiten aus umzug/<stadt>/index.html (erzeugt von scripts/build-city-pages.mjs)
const cityPages = existsSync(resolve(dir, 'umzug'))
  ? Object.fromEntries(
      readdirSync(resolve(dir, 'umzug'), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => [`umzug-${e.name}`, resolve(dir, 'umzug', e.name, 'index.html')]),
    )
  : {};

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(dir, 'index.html'),
        impressum: resolve(dir, 'impressum.html'),
        datenschutz: resolve(dir, 'datenschutz.html'),
        agb: resolve(dir, 'agb.html'),
        umzug: resolve(dir, 'umzug/index.html'),
        ...cityPages,
      },
    },
  },
});
