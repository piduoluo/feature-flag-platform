import React from 'react';
import { auditActionMeta } from './AuditDiffView';

/**
 * Icon + label used by the global operation history's "操作" column.
 *
 * The reference design uses a thin, line-based icon family (file-plus, pencil,
 * list-plus and circle-dot). Keeping them as inline SVG avoids pulling in a
 * second icon library just for four glyphs, while still matching the visual
 * weight of the surrounding text.
 */
const iconProps: React.SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  FLAG_CREATED: (
    <svg {...iconProps} className="audit-action-icon">
      <path d="M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M14 19h6" />
      <path d="M17 16v6" />
    </svg>
  ),
  FLAG_UPDATED: (
    <svg {...iconProps} className="audit-action-icon">
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  ),
  FLAG_TOGGLED: (
    <svg {...iconProps} className="audit-action-icon">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  RULES_SYNCED: (
    <svg {...iconProps} className="audit-action-icon">
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M16 19H3" />
      <path d="M18 9v6" />
      <path d="M21 12h-6" />
    </svg>
  ),
  RULES_SEED_SYNCED: (
    <svg {...iconProps} className="audit-action-icon">
      <path d="M16 5H3" />
      <path d="M11 12H3" />
      <path d="M16 19H3" />
      <path d="M18 9v6" />
      <path d="M21 12h-6" />
    </svg>
  ),
};

const FALLBACK_ICON = (
  <svg {...iconProps} className="audit-action-icon">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v5l3 2" />
  </svg>
);

export const AuditActionLabel: React.FC<{ actionType: string; className?: string }> = ({
  actionType,
  className,
}) => (
  <span
    className={`audit-action-label${className ? ` ${className}` : ''}`}
    data-action={actionType}
  >
    {ACTION_ICONS[actionType] ?? FALLBACK_ICON}
    <span className="audit-action-text">{auditActionMeta(actionType).label}</span>
  </span>
);
