// Theme control in the title block: system → light → dark.
// The choice is a per-visitor convenience; storage failures fall back to system.
const ORDER = ['system', 'light', 'dark'] as const;
type Theme = (typeof ORDER)[number];

const btn = document.getElementById('theme-btn');
let current: Theme = 'system';
try {
  const saved = localStorage.getItem('dg-theme');
  if (saved === 'light' || saved === 'dark') current = saved;
} catch {}

function apply(t: Theme) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  if (btn) btn.textContent = t[0].toUpperCase() + t.slice(1);
  try {
    if (t === 'system') localStorage.removeItem('dg-theme');
    else localStorage.setItem('dg-theme', t);
  } catch {}
}

apply(current);
btn?.addEventListener('click', () => {
  current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  apply(current);
});

export {};
