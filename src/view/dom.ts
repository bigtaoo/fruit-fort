// Small DOM helpers shared by the HUD and its stat dock.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** One line always: a label too long for its box (some languages) steps its font down until it fits. */
export function fit(e: HTMLElement, min: number): void {
  e.style.fontSize = '';
  const cs = getComputedStyle(e);
  let px = parseFloat(cs.fontSize);
  // Measured in fractional pixels: scrollWidth rounds, and a 0.1px overflow still ellipsizes.
  const text = document.createRange();
  text.selectNodeContents(e);
  const room = () => e.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const over = () => text.getBoundingClientRect().width > room();
  while (over() && px > min) e.style.fontSize = `${--px}px`;
}

/** Restart a one-shot CSS animation class. */
export function replay(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}
