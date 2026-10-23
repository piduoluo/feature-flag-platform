function getTooltip(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('tooltip');
}

/** Hide the shared tooltip immediately. Safe to call when none is mounted. */
export function hideTooltip(): void {
  getTooltip()?.classList.remove('show');
}

export function initTooltip() {
  if (typeof document === 'undefined') return () => {};

  let tip = getTooltip();
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tooltip';
    tip.className = 'tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }

  const handleMouseOver = (e: MouseEvent) => {
    const target = (e.target as HTMLElement)?.closest?.('[data-tip]') as HTMLElement | null;
    if (!target) return;
    const text = target.getAttribute('data-tip');
    if (!text || !tip) return;

    tip.textContent = text;
    tip.classList.add('show');

    const rect = target.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(window.innerWidth - tw - 8, left));
    let top = rect.top - th - 8;
    if (top < 8) top = rect.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  const handleMouseOut = (e: MouseEvent) => {
    const target = (e.target as HTMLElement)?.closest?.('[data-tip]');
    if (!target) return;
    // Moving into the anchor's own children (e.g. its <svg>) is not a dismissal.
    const next = e.relatedTarget as Node | null;
    if (next && target.contains(next)) return;
    hideTooltip();
  };

  // A tooltip must never outlive its anchor. The sidebar collapse/expand
  // toggles replace each other in place: React unmounts the hovered button,
  // and removing a node under the cursor fires no mouseout, so the tip used to
  // stay on screen with the previous action's text. Dismiss on any activation
  // or scroll instead of waiting for a mouseout that will never come.
  const handleDismiss = () => hideTooltip();
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hideTooltip();
  };

  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('click', handleDismiss, true);
  document.addEventListener('scroll', handleDismiss, true);
  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('click', handleDismiss, true);
    document.removeEventListener('scroll', handleDismiss, true);
    document.removeEventListener('keydown', handleKeyDown);
  };
}
