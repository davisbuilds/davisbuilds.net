// Reading ruler: fills as the essay body scrolls past, reaching
// 100% when the end of the prose is in view, and reads out words covered.
const ruler = document.getElementById('ruler');
const fill = document.getElementById('ruler-fill');
const pos = document.getElementById('ruler-pos');
const prose = document.getElementById('prose');

if (ruler && fill && pos && prose) {
  const words = Number(ruler.dataset.words) || 0;
  let queued = false;

  const update = () => {
    queued = false;
    const r = prose.getBoundingClientRect();
    const travel = r.height - innerHeight;
    const p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : r.bottom <= innerHeight ? 1 : 0;
    fill.style.width = `${(p * 100).toFixed(1)}%`;
    pos.textContent = `${Math.round(p * words).toLocaleString('en-US')} / ${words.toLocaleString('en-US')} words`;
    ruler.dataset.progress = p.toFixed(3);
  };
  const schedule = () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  };

  ruler.hidden = false;
  update();
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
}

export {};
