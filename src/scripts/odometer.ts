// The odometer roll: a number's digits spin into place once, then the element
// goes back to plain text. Reduced motion skips the roll entirely.
import { reducedMotion } from './motion';

const ROLL_MS = 1300;
const STAGGER_MS = 60;

export function odometer(el: HTMLElement, text: string): void {
  el.textContent = text;
  if (reducedMotion()) return;
  const wrap = document.createElement('span');
  wrap.className = 'odo';
  wrap.setAttribute('aria-hidden', 'true');
  const strips: Array<[HTMLElement, number]> = [];
  [...text].forEach((ch, k) => {
    if (!/\d/.test(ch)) {
      const s = document.createElement('span');
      s.textContent = ch;
      wrap.append(s);
      return;
    }
    const col = document.createElement('span');
    col.className = 'col';
    const strip = document.createElement('span');
    for (let i = 0; i < 20; i++) {
      if (i) strip.append(document.createElement('br'));
      strip.append(String(i % 10));
    }
    strip.style.cssText = `display:block;line-height:1;transition:transform ${ROLL_MS}ms cubic-bezier(.2,.75,.15,1) ${k * STAGGER_MS}ms`;
    col.append(strip);
    wrap.append(col);
    strips.push([strip, Number(ch)]);
  });
  // Screen readers and copy-paste get the number, not the digit strips.
  const label = document.createElement('span');
  label.className = 'sr-only';
  label.textContent = text;
  el.replaceChildren(label, wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => strips.forEach(([s, d]) => (s.style.transform = `translateY(-${10 + d}em)`))));
  setTimeout(() => (el.textContent = text), ROLL_MS + text.length * STAGGER_MS + 100);
}
