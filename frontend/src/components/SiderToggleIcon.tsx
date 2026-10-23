import React from 'react';
import siderToggleComposite from '../assets/nav-ui/sider-toggle-composite.png';
import './SiderToggleIcon.css';

/**
 * Lossless crop of the supplied sidebar collapse/expand sheet
 * (`6f2926f6-1432-4414-bc7a-7bb26b080ec8.png`, copied unchanged).
 *
 * The grey frame comes from the original PNG. A small mask hides its baked-in
 * arrow, which is redrawn as a vector so the hover colour can switch to the
 * theme orange without changing the source image.
 */
export type SiderDirection = 'collapse' | 'expand';

const SOURCE_WIDTH = 1536;
const SOURCE_HEIGHT = 1024;

const GEOMETRY = {
  collapse: {
    viewBox: '588 140 360 360',
    mask: { x: 838, y: 268, width: 66, height: 104 },
    arrowPath: 'M 889 281.5 L 852 319.5 L 889 357.5',
  },
  expand: {
    viewBox: '588 506 360 360',
    mask: { x: 636, y: 632, width: 66, height: 104 },
    arrowPath: 'M 651 647.5 L 688 684.5 L 651 721.5',
  },
} as const;

interface SiderToggleIconProps {
  direction: SiderDirection;
  size?: number;
}

export const SiderToggleIcon: React.FC<SiderToggleIconProps> = ({ direction, size = 26 }) => {
  const geometry = GEOMETRY[direction];

  return (
    <span
      className="sider-toggle-icon"
      style={{ width: size, height: size }}
      data-sider-dir={direction}
      aria-hidden="true"
    >
      <svg
        viewBox={geometry.viewBox}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
      >
        <image href={siderToggleComposite} width={SOURCE_WIDTH} height={SOURCE_HEIGHT} />
        <rect
          x={geometry.mask.x}
          y={geometry.mask.y}
          width={geometry.mask.width}
          height={geometry.mask.height}
          fill="#FEFEFE"
        />
        <path
          className="sider-toggle-arrow"
          d={geometry.arrowPath}
          fill="none"
          strokeWidth={15}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};
