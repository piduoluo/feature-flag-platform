import React from 'react';
import tabsComposite from '../assets/nav-ui/tabs-composite.png';
import './NavTabIcon.css';

/**
 * Lossless window into the supplied two-state navigation icon sheet
 * (`ChatGPT 图像 2026年10月24日 01_29_47.png`, copied unchanged).
 *
 * `flags` always renders the top-row pill and animates a grey/orange knob with
 * the white mask + circle overlay from the source asset. The other two tabs
 * switch between their unselected and selected crops in the same sheet.
 */
export type NavTabKey = 'flags' | 'evaluations' | 'audit-logs';

const SOURCE_WIDTH = 1536;
const SOURCE_HEIGHT = 1024;

const VIEW_BOX: Record<NavTabKey, { unselected: string; selected: string }> = {
  flags: { unselected: '214 213 240 240', selected: '214 213 240 240' },
  evaluations: { unselected: '641 213 240 240', selected: '641 558 240 240' },
  'audit-logs': { unselected: '1086 211 240 240', selected: '1086 557 240 240' },
};

interface NavTabIconProps {
  tab: NavTabKey;
  selected: boolean;
  size?: number;
}

export const NavTabIcon: React.FC<NavTabIconProps> = ({ tab, selected, size = 28 }) => {
  const state = selected ? 'selected' : 'unselected';

  return (
    <span
      className={`nav-tab-icon nav-tab-icon--${tab}`}
      style={{ width: size, height: size }}
      data-tab-id={tab}
      data-tab-state={state}
      aria-hidden="true"
    >
      <svg
        viewBox={VIEW_BOX[tab][state]}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
      >
        <image href={tabsComposite} width={SOURCE_WIDTH} height={SOURCE_HEIGHT} />
        {tab === 'flags' && (
          <>
            <rect x="246" y="294" width="176" height="77" rx="38.5" fill="#FEFEFE" />
            <circle className="nav-tab-icon-knob" cx="285.5" cy="332.5" r="32" />
          </>
        )}
      </svg>
    </span>
  );
};
