// Command palette: ⌘K / Ctrl+K or "/" opens it; arrows move; enter opens.
type Item = { label: string; kind: string; href: string };

const scrim = document.getElementById('palette') as HTMLElement | null;
const q = document.getElementById('pal-q') as HTMLInputElement | null;
const list = document.getElementById('pal-list');
let items: Item[] = [];
try {
  items = JSON.parse(document.getElementById('palette-items')?.textContent ?? '[]');
} catch {}

let sel = 0;
let shown: Item[] = items;
let opener: Element | null = null;

function render() {
  if (!q || !list) return;
  const t = q.value.trim().toLowerCase();
  shown = items.filter((i) => i.label.toLowerCase().includes(t) || i.kind.includes(t));
  sel = Math.min(sel, Math.max(0, shown.length - 1));
  list.replaceChildren(
    ...(shown.length
      ? shown.map((it, k) => {
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', String(k === sel));
          li.dataset.k = String(k);
          const a = document.createElement('span');
          a.textContent = it.label;
          const b = document.createElement('span');
          b.textContent = it.kind;
          li.append(a, b);
          return li;
        })
      : [Object.assign(document.createElement('li'), { textContent: 'No matches' })]),
  );
}

function open() {
  if (!scrim || !q) return;
  opener = document.activeElement;
  scrim.hidden = false;
  q.value = '';
  sel = 0;
  render();
  q.focus();
}

function close() {
  if (!scrim) return;
  scrim.hidden = true;
  if (opener instanceof HTMLElement) opener.focus();
}

function go(it?: Item) {
  if (!it) return;
  close();
  if (it.href.startsWith('/')) location.href = it.href;
  else window.open(it.href, '_blank', 'noopener');
}

document.querySelectorAll('[data-open-palette]').forEach((b) => b.addEventListener('click', open));

addEventListener('keydown', (e) => {
  const typing = /input|textarea/i.test((document.activeElement as HTMLElement | null)?.tagName ?? '');
  const isOpen = scrim && !scrim.hidden;
  if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !isOpen && !typing)) {
    e.preventDefault();
    isOpen ? close() : open();
    return;
  }
  if (!isOpen) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
  else if (e.key === 'Enter') { e.preventDefault(); go(shown[sel]); }
});

q?.addEventListener('input', () => { sel = 0; render(); });
list?.addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
  if (li) go(shown[Number(li.dataset.k)]);
});
scrim?.addEventListener('click', (e) => { if (e.target === scrim) close(); });

export {};
