"use client";

import type { ApplyProgress } from "./SelectionInspector";
import { plural } from "./plural";

export interface MobileSelectionBarProps {
  count: number;
  progress: ApplyProgress | null;
  busy: boolean;
  onChangeMatte: () => void;
  onDelete: () => void;
}

const FOCUS_ON_DARK =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Phone-only floating bar for the current selection. Sits just above the
 * shell's fixed bottom tab bar (60px + safe-area inset).
 */
export default function MobileSelectionBar({
  count,
  progress,
  busy,
  onChangeMatte,
  onDelete,
}: MobileSelectionBarProps) {
  return (
    <section
      aria-label="Selected photos"
      className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 px-3 pb-2.5 sm:hidden"
    >
      <div className="flex items-center gap-2 rounded-[14px] bg-ink py-2 pl-4 pr-2 text-white shadow-[0_8px_20px_rgba(21,23,26,0.3)]">
        <span className="flex-1 truncate font-semibold" aria-live="polite">
          {progress ? `Applying ${progress.current} of ${progress.total}…` : `${count} selected`}
        </span>
        <button
          type="button"
          onClick={onChangeMatte}
          disabled={busy}
          aria-haspopup="dialog"
          className={`min-h-[44px] shrink-0 rounded-[10px] bg-white px-4 font-semibold text-ink disabled:opacity-60 ${FOCUS_ON_DARK}`}
        >
          Change matte
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${plural(count, "photo")} from TV`}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[#5B6068] disabled:opacity-60 ${FOCUS_ON_DARK}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFB4AB" strokeWidth="2" aria-hidden="true">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>
    </section>
  );
}
