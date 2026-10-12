import { easternParts, statusForHour } from '../lib/status-rules';

const el = document.getElementById('op-status');

function render() {
  if (!el) return;
  try {
    const { hour, time } = easternParts(new Date());
    el.textContent = `${statusForHour(hour)} · ${time}`;
  } catch {
    el.textContent = '—';
  }
}

render();
setInterval(render, 30_000);
