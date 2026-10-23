export function initTooltip() {
  if (typeof document === 'undefined') return () => {};

  let tip = document.getElementById('tooltip');
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
    tip?.classList.remove('show');
  };

  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);

  return () => {
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
  };
}
