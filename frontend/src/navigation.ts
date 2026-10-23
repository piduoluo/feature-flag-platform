/**
 * Navigation state shared by the pages that link to each other.
 *
 * Detail pages record where they were opened from so their top-left back
 * control can return to the real source. The evaluation console additionally
 * records whether it was opened by a Flag detail page, because returning must
 * then revisit that existing history entry instead of pushing a second detail
 * entry with an overwritten source.
 */

export interface NavSourceState {
  /** Full in-app path (pathname + search) of the source page. */
  from?: string;
  /** Human-readable name of the source page. */
  fromLabel?: string;
}

export interface EvaluationEntryState {
  /** Present only when `/evaluations` was opened from a Flag detail page. */
  fromFlagDetail?: {
    /** Canonical detail path, e.g. `/flags/42`. */
    path: string;
  };
}

export const isInAppPath = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

export const readNavSource = (state: unknown): NavSourceState => {
  if (!state || typeof state !== 'object') return {};
  const candidate = state as NavSourceState;
  return {
    from: isInAppPath(candidate.from) ? candidate.from : undefined,
    fromLabel:
      typeof candidate.fromLabel === 'string' && candidate.fromLabel.trim()
        ? candidate.fromLabel
        : undefined,
  };
};
