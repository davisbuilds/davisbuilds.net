// Autonomy plot tooltip: pointing at a run shows its title, model, wall clock
// and turns beside the point. A mouse hides it on leaving; a tap keeps it
// until the next tap elsewhere, since a finger "leaves" as it lifts. The
// svg's own label lists every run for screen readers.
const tip = document.getElementById('plot-tip');
const wrap = tip?.parentElement;
if (tip && wrap) {
  const [title, detail] = [tip.querySelector('b')!, tip.querySelector('span')!];
  let current: SVGGElement | null = null;

  const show = (g: SVGGElement) => {
    current?.classList.remove('on');
    current = g;
    g.classList.add('on');
    title.textContent = g.dataset.title ?? '';
    detail.textContent = g.dataset.detail ?? '';
    tip.hidden = false;
    // Wrap coordinates: the wrap scrolls sideways on a narrow screen.
    const dot = g.querySelector('.dot')!.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    const cx = dot.left + dot.width / 2 - box.left - wrap.clientLeft + wrap.scrollLeft;
    const top = dot.top - box.top - wrap.clientTop + wrap.scrollTop;
    const lo = wrap.scrollLeft + 4, hi = wrap.scrollLeft + wrap.clientWidth - tip.offsetWidth - 4;
    tip.style.left = `${Math.max(lo, Math.min(hi, cx - tip.offsetWidth / 2))}px`;
    const above = top - tip.offsetHeight - 8;
    tip.style.top = `${above >= wrap.scrollTop ? above : top + dot.height + 8}px`;
  };
  const hide = () => {
    current?.classList.remove('on');
    current = null;
    tip.hidden = true;
  };

  wrap.querySelectorAll<SVGGElement>('#plot .pt').forEach((g) => {
    g.addEventListener('pointerenter', () => show(g));
    g.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hide();
    });
  });
  document.addEventListener('pointerdown', (e) => {
    if (current && !(e.target instanceof Element && e.target.closest('#plot .pt'))) hide();
  });
}

export {};
