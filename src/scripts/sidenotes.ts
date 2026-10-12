// Margin-note linking: hovering a marker lights its note;
// following one lights the note and brings it into view.
import { reducedMotion } from './motion';

document.querySelectorAll<HTMLAnchorElement>('a.ref[data-note]').forEach((ref) => {
  const note = document.getElementById(ref.dataset.note ?? '');
  if (!note) return;
  let timer: number | undefined;
  ref.addEventListener('mouseenter', () => note.classList.add('lit'));
  ref.addEventListener('mouseleave', () => note.classList.remove('lit'));
  ref.addEventListener('click', (e) => {
    e.preventDefault();
    note.classList.add('lit');
    note.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    clearTimeout(timer);
    timer = window.setTimeout(() => note.classList.remove('lit'), 1600);
  });
});

export {};
