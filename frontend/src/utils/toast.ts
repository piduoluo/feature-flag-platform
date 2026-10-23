export type ToastType = 'success' | 'error' | 'info';

export function toast(message: string, type: ToastType = 'success') {
  if (typeof document === 'undefined') return;
  let root = document.getElementById('toastRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toastRoot';
    root.className = 'toast-stack';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }

  while (root.children.length >= 3) {
    if (root.firstElementChild) {
      root.removeChild(root.firstElementChild);
    }
  }

  const el = document.createElement('div');
  el.className = `toast ${type}`;

  const iconSvg =
    type === 'error'
      ? '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>'
      : type === 'info'
      ? '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
      : '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';

  const span = document.createElement('span');
  span.textContent = message;

  el.innerHTML = iconSvg;
  el.appendChild(span);
  root.appendChild(el);

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 200);
  }, 2600);
}
