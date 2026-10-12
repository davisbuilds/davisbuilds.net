// Status filters on the Writing register. Without JavaScript the filters stay
// hidden and every row shows.
const group = document.querySelector<HTMLElement>('[data-filters]');
const rows = document.querySelectorAll<HTMLTableRowElement>('#reg-all tr');
const empty = document.getElementById('reg-empty');

if (group && empty) {
  const buttons = group.querySelectorAll<HTMLButtonElement>('[data-filter]');
  group.hidden = false;
  buttons.forEach((btn) =>
    btn.addEventListener('click', () => {
      const f = btn.dataset.filter;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let shown = 0;
      rows.forEach((tr) => {
        const on = f === 'all' || tr.dataset.status === f;
        tr.hidden = !on;
        if (on) shown += 1;
      });
      empty.hidden = shown > 0;
    }),
  );
}

export {};
