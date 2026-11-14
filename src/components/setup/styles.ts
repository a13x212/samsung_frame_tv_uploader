/** Shared class strings for the first-run (Find TV / Allow on TV) screens. */

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const BUTTON_BASE = `inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] px-[22px] font-semibold transition-colors disabled:cursor-not-allowed ${FOCUS_RING}`;

/** Ink-black primary action. */
export const PRIMARY_BUTTON = `${BUTTON_BASE} border-0 bg-ink text-white hover:bg-[#2C2F34] disabled:bg-[#3A3D42]`;

/** Outlined secondary action. */
export const SECONDARY_BUTTON = `${BUTTON_BASE} border border-line-strong bg-surface text-ink hover:border-muted disabled:text-muted`;
