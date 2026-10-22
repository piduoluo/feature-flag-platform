import '@testing-library/jest-dom/vitest';

// Mock window.matchMedia for Ant Design components in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver for Ant Design components
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill window.getComputedStyle for jsdom rc-util scrollbar measurement
const originalGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = function (elt: Element, _pseudoElt?: string | null) {
  try {
    return originalGetComputedStyle.call(window, elt);
  } catch {
    return {
      getPropertyValue: () => '',
      width: '0px',
      height: '0px',
      overflow: 'visible',
      overflowX: 'visible',
      overflowY: 'visible',
    } as unknown as CSSStyleDeclaration;
  }
};
