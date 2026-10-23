import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTooltip } from './tooltip';

const tooltip = () => document.getElementById('tooltip') as HTMLElement;

const makeAnchor = (tipText: string) => {
  const btn = document.createElement('button');
  btn.setAttribute('data-tip', tipText);
  const icon = document.createElement('svg');
  btn.appendChild(icon);
  document.body.appendChild(btn);
  return { btn, icon };
};

describe('shared tooltip', () => {
  let cleanup: () => void;

  beforeEach(() => {
    document.body.innerHTML = '';
    cleanup = initTooltip();
  });

  afterEach(() => cleanup());

  it('shows the anchor text on hover and dismisses on click', () => {
    const { btn } = makeAnchor('折叠侧边栏');

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(tooltip()).toHaveClass('show');
    expect(tooltip()).toHaveTextContent('折叠侧边栏');

    // The toggle button unmounts on click, so no mouseout is ever delivered.
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tooltip()).not.toHaveClass('show');
  });

  it('keeps the tip when the pointer moves into the anchor child', () => {
    const { btn, icon } = makeAnchor('展开侧边栏');

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    icon.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    icon.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: btn }));

    expect(tooltip()).toHaveClass('show');
    expect(tooltip()).toHaveTextContent('展开侧边栏');
  });

  it('dismisses on scroll and on Escape', () => {
    const { btn } = makeAnchor('折叠侧边栏');

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new Event('scroll'));
    expect(tooltip()).not.toHaveClass('show');

    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tooltip()).not.toHaveClass('show');
  });
});
