"use client";

import type { ReactNode } from "react";
import type { MatteTypeId, MatteColorId } from "@/lib/types";
import { matteLabel } from "@/lib/matte";
import FrameTvPreview from "@/components/matte/FrameTvPreview";
import MattePicker from "@/components/matte/MattePicker";
import ErrorBanner from "@/components/ErrorBanner";
import { plural } from "./plural";

export interface ApplyProgress {
  /** 1-based index of the photo currently being changed. */
  current: number;
  total: number;
}

export interface SelectionInspectorProps {
  /** id for the "<n> photos selected" heading (labels the phone sheet). */
  titleId: string;
  count: number;
  /** Thumbnail of the first selected photo, shown in the TV preview. */
  previewUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
  onTypeChange: (type: MatteTypeId) => void;
  onColorChange: (color: MatteColorId) => void;
  /** True when every selected photo already uses the pending matte. */
  alreadyApplied: boolean;
  progress: ApplyProgress | null;
  deleting: boolean;
  error: { error: string; hint: string } | null;
  onDismissError: () => void;
  onApply: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** Extra control rendered next to Clear (e.g. the sheet's close button). */
  headerExtra?: ReactNode;
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Inspector for the current selection: TV preview with the pending matte,
 * matte picker, batch apply and delete. Used in the desktop side column and
 * in the phone bottom sheet.
 */
export default function SelectionInspector({
  titleId,
  count,
  previewUrl,
  matteType,
  matteColor,
  onTypeChange,
  onColorChange,
  alreadyApplied,
  progress,
  deleting,
  error,
  onDismissError,
  onApply,
  onDelete,
  onClear,
  headerExtra,
}: SelectionInspectorProps) {
  const busy = progress !== null || deleting;
  const photos = plural(count, "photo");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="m-0 font-display text-lg font-semibold text-ink">
          {photos} selected
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className={`min-h-[44px] rounded-md px-2.5 font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[36px] ${FOCUS}`}
          >
            Clear
          </button>
          {headerExtra}
        </div>
      </div>

      <FrameTvPreview
        imageUrl={previewUrl}
        matteType={matteType}
        matteColor={matteColor}
        caption={`Preview · ${matteLabel(matteType, matteColor)}`}
        alt={count > 1 ? "First selected photo on the TV" : "Selected photo on the TV"}
      />

      <MattePicker
        matteType={matteType}
        matteColor={matteColor}
        onTypeChange={onTypeChange}
        onColorChange={onColorChange}
        disabled={busy}
      />

      {error && <ErrorBanner error={error.error} hint={error.hint} onDismiss={onDismissError} />}

      <div className="flex flex-col gap-2 pt-1">
        <p className="m-0 min-h-[1.25rem] text-[13px] text-muted" aria-live="polite">
          {progress
            ? `Applying ${progress.current} of ${progress.total}…`
            : alreadyApplied
              ? `${count === 1 ? "This photo already uses" : "All selected photos already use"} this matte.`
              : ""}
        </p>
        <button
          type="button"
          onClick={onApply}
          disabled={busy || alreadyApplied}
          className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] bg-ink px-4 text-[15px] font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
        >
          {progress && <Spinner />}
          {progress ? "Applying…" : `Apply matte to ${photos}`}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className={`min-h-[44px] rounded-[10px] border border-danger-line bg-surface px-4 font-semibold text-danger hover:border-danger disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
        >
          {deleting ? "Deleting…" : `Delete ${photos} from TV`}
        </button>
      </div>
    </div>
  );
}

/** Shown in the side column when nothing is selected. */
export function SelectionHint() {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="m-0 font-display text-lg font-semibold text-ink">Nothing selected</h2>
      <p className="m-0 text-sm text-muted">
        Select one or more photos to preview them on the TV, change their matte or remove them.
      </p>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={`${className} motion-safe:animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
