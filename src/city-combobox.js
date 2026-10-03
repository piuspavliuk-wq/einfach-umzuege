// Eigene Auswahlliste für Städte (ersetzt das native <datalist>).
// Klick ohne Eingabe → Bundesländer → Orte des Bundeslands; Tippen → Suche.
// ARIA-Combobox: Pfeiltasten, Enter, Escape, Maus/Touch.

const MAX_RESULTS = 8;
const collator = new Intl.Collator('de');

export function attachCityCombobox(input, { entries, states, norm, meta }) {
  const listId = `${input.id}-listbox`;
  const list = document.createElement('ul');
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.className = 'city-list';
  list.hidden = true;
  input.parentElement.classList.add('relative');
  input.classList.add('city-input');
  input.after(list);
  // Klick auf Scrollbar/Kopfzeile soll das Feld nicht verlassen
  list.addEventListener('mousedown', (e) => e.preventDefault());

  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-expanded', 'false');

  // Orte je Bundesland, alphabetisch
  const byState = states.map((_, i) => entries.filter((c) => c.state === i).sort((a, b) => collator.compare(a.name, b.name)));

  let items = []; // { label, meta, run, city?, kind }
  let active = -1;

  const open = (isOpen) => {
    list.hidden = !isOpen;
    input.setAttribute('aria-expanded', String(isOpen));
    if (!isOpen) { active = -1; input.removeAttribute('aria-activedescendant'); }
  };

  const setActive = (i) => {
    active = i;
    list.querySelectorAll('[role=option]').forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.i) === i)));
    const li = list.querySelector(`[data-i="${i}"]`);
    if (li) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
  };

  const choose = (city) => {
    input.value = city.name;
    open(false);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Eingegebenen Teil im Namen fett hervorheben (ohne innerHTML)
  const highlight = (name, q) => {
    const i = q ? norm(name).indexOf(q) : -1;
    if (i < 0) return [name];
    const b = document.createElement('strong');
    b.textContent = name.slice(i, i + q.length);
    return [name.slice(0, i), b, name.slice(i + q.length)];
  };

  const el = (tag, className, ...children) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.append(...children);
    return e;
  };

  /** Liste zeichnen: header = optionale Kopfzeile, rows = auswählbare Einträge */
  const paint = (rows, { header, empty, q = '', activeIndex = 0 } = {}) => {
    items = rows;
    const nodes = rows.map((item, i) => {
      const li = el('li', `city-option city-option--${item.kind}`,
        el('span', 'truncate', ...highlight(item.label, q)),
        el('span', 'city-meta', item.meta ?? ''));
      li.id = `${listId}-${i}`;
      li.dataset.i = i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.addEventListener('mousedown', (e) => { e.preventDefault(); item.run(); });
      return li;
    });
    if (header) nodes.unshift(el('li', 'city-header', header));
    if (!rows.length && empty) nodes.push(el('li', 'city-empty', empty));
    list.replaceChildren(...nodes);
    list.scrollTop = 0;
    open(true);
    if (rows.length) setActive(Math.min(activeIndex, rows.length - 1));
  };

  const showStates = (activeIndex = 0) => paint(states.map((name, i) => ({
    kind: 'state',
    label: name,
    meta: `${byState[i].length} Orte`,
    run: () => showState(i),
  })), { header: 'Bundesland wählen', activeIndex });

  const showState = (i, selected) => {
    const back = { kind: 'back', label: '← Alle Bundesländer', run: () => showStates(i) };
    const cities = byState[i].map((city) => ({ kind: 'city', label: city.name, meta: meta(city), city, run: () => choose(city) }));
    const idx = selected ? cities.findIndex((r) => r.city === selected) + 1 : 1;
    paint([back, ...cities], { header: states[i], activeIndex: idx });
  };

  const showSearch = () => {
    const q = norm(input.value);
    if (q.length < 2) { showStates(); return; }
    // Erst Treffer am Wortanfang, dann irgendwo im Namen (Einträge sind nach Relevanz sortiert)
    const starts = entries.filter((c) => c.key.startsWith(q));
    const contains = entries.filter((c) => !c.key.startsWith(q) && c.key.includes(q));
    const rows = [...starts, ...contains].slice(0, MAX_RESULTS).map((city) => ({
      kind: 'city', label: city.name, meta: `${states[city.state]} · ${meta(city)}`, city, run: () => choose(city),
    }));
    paint(rows, { q, empty: 'Nicht in unserem 200-km-Gebiet gefunden – Entfernung unten manuell einstellen' });
  };

  // Beim Öffnen: ausgewählten Ort im Bundesland zeigen, sonst Bundesländer
  const openFromCurrent = () => {
    const current = entries.find((c) => c.key === norm(input.value));
    if (current) showState(current.state, current);
    else if (input.value.trim()) showSearch();
    else showStates();
  };

  input.addEventListener('input', (e) => { if (e.isTrusted) showSearch(); });
  input.addEventListener('focus', openFromCurrent);
  input.addEventListener('click', () => { if (list.hidden) openFromCurrent(); });
  input.addEventListener('blur', () => open(false));
  input.addEventListener('keydown', (e) => {
    if (list.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); openFromCurrent(); }
      return;
    }
    if (!items.length) { if (e.key === 'Escape') open(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); items[active].run(); }
    else if (e.key === 'Escape') open(false);
  });
}
