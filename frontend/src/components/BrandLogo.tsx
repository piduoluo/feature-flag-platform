import React from 'react';
import brandLogo from '../assets/nav-ui/brand-logo.png';
import './BrandLogo.css';

/**
 * Lossless crop of the supplied brand logo
 * (`669045ea-1202-4121-a472-333abcf11030.png`, copied unchanged).
 *
 * The padded viewport keeps the mark optically centred at the small sizes used
 * in the sidebar and mobile drawer instead of showing the source whitespace.
 */
export const BRAND_LOGO_VIEW_BOX = '266 262 720 720';
const SOURCE_WIDTH = 1254;
const SOURCE_HEIGHT = 1254;

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 40, className }) => (
  <span
    className={`brand-logo${className ? ` ${className}` : ''}`}
    style={{ width: size, height: size }}
    role="img"
    aria-label="FeatureFlag Logo"
    data-asset-id="brand-logo"
  >
    <svg
      viewBox={BRAND_LOGO_VIEW_BOX}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
    >
      <image href={brandLogo} width={SOURCE_WIDTH} height={SOURCE_HEIGHT} />
    </svg>
  </span>
);
