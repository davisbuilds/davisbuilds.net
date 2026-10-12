// Swaps a demo's poster for its sandboxed frame when the visitor presses Run.
// On a narrow screen the inline stage is too small to use, so Run follows its
// link to the full-screen page instead.
const narrow = matchMedia('(max-width: 860px)');
document.querySelectorAll<HTMLElement>('.stage[data-demo-src]').forEach((stage) => {
  const link = stage.querySelector<HTMLAnchorElement>('[data-run-demo]');
  link?.addEventListener('click', (e) => {
    if (narrow.matches) return;
    e.preventDefault();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', stage.dataset.sandbox ?? 'allow-scripts');
    frame.title = stage.dataset.demoTitle ?? 'Demo';
    frame.className = 'stage-frame';
    frame.src = stage.dataset.demoSrc!;
    stage.replaceChildren(frame);
    frame.focus();
  });
});

export {};
