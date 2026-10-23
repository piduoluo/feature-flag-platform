import React from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';

interface DetailBackNavProps {
  label: string;
  onClick: () => void;
}

/**
 * Contextual navigation shown at the top-left of detail pages that have a
 * concrete parent. It is intentionally not part of the global app shell: only
 * pages with a meaningful source get a back target.
 */
export const DetailBackNav: React.FC<DetailBackNavProps> = ({ label, onClick }) => (
  <button
    type="button"
    className="detail-back-nav"
    data-testid="detail-back-nav"
    aria-label={`返回${label}`}
    onClick={onClick}
  >
    <ArrowLeftOutlined aria-hidden="true" />
    <span>{label}</span>
  </button>
);
