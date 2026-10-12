// Filters on the Oneshots test log. Hidden without JavaScript, when every run shows.
const group = document.querySelector<HTMLElement>('[data-run-filters]');
if (group) {
  const buttons = group.querySelectorAll<HTMLButtonElement>('[data-rf]');
  const cards = document.querySelectorAll<HTMLElement>('.runs .run');
  group.hidden = false;
  buttons.forEach((btn) =>
    btn.addEventListener('click', () => {
      const f = btn.dataset.rf;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      cards.forEach((el) => {
        el.hidden = !(f === 'all' || el.dataset.kind === f || el.dataset.lab === f || (f === 'runnable' && el.dataset.runnable === 'true'));
      });
      for (const k of ['long', 'single']) {
        const any = [...document.querySelectorAll<HTMLElement>(`#runs-${k} .run`)].some((el) => !el.hidden);
        document.getElementById(`runs-${k}`)?.toggleAttribute('hidden', !any);
        document.getElementById(`h-${k}`)?.toggleAttribute('hidden', !any);
      }
    }),
  );
}

export {};
