// Cursor zone tracking: the sheet's zone markers light up under the pointer
// and the title block reads out the zone (C4, D6, ...).
const sheet = document.getElementById('sheet');
const xs = [...document.querySelectorAll<HTMLElement>('#zx span')];
const ys = [...document.querySelectorAll<HTMLElement>('#zy span')];
const out = document.getElementById('zone-readout');
let last = '';

sheet?.addEventListener('pointermove', (e) => {
  const r = sheet.getBoundingClientRect();
  const cx = Math.max(0, Math.min(7, Math.floor(((e.clientX - r.left) / r.width) * 8)));
  const cy = Math.max(0, Math.min(5, Math.floor(((e.clientY - r.top) / r.height) * 6)));
  const zone = 'ABCDEF'[cy] + (cx + 1);
  if (zone === last) return;
  last = zone;
  xs.forEach((s, i) => s.classList.toggle('hot', i === cx));
  ys.forEach((s, i) => s.classList.toggle('hot', i === cy));
  if (out) out.textContent = zone;
});

sheet?.addEventListener('pointerleave', () => {
  [...xs, ...ys].forEach((s) => s.classList.remove('hot'));
  if (out) out.textContent = '—';
  last = '';
});

export {};
