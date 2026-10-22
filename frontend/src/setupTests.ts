import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// The full suite runs 9 jsdom files in parallel and drives real antd forms.
// antd validation re-renders can land later than the 1s default of waitFor,
// which made CreateFlagDrawer's "blocks empty submit" case flake (~1 in 4
// full runs). Wait longer per assertion; failures still surface, just later.
configure({ asyncUtilTimeout: 5000 });

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

// Align Node undici Request with JSDOM AbortSignal for React Router v7 in jsdom
if (typeof globalThis.Request !== 'undefined') {
  const OriginalRequest = globalThis.Request;
  globalThis.Request = class extends OriginalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init && init.signal) {
        try {
          super(input, init);
          return;
        } catch {
          const { signal: _, ...rest } = init;
          super(input, rest);
          return;
        }
      }
      super(input, init);
    }
  } as typeof Request;
}
