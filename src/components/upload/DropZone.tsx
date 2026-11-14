import { MAX_UPLOAD_FILES } from "@/lib/types";
import { FOCUS_RING } from "./styles";

export interface DropZoneProps {
  /** Opens the (single, shared) file picker. */
  onBrowse: () => void;
  /** True while files are being dragged over the page. */
  dragActive: boolean;
  tvName: string;
}

/**
 * Empty-state drop target. It is a real <button>, so Enter / Space open the
 * picker; drag-and-drop is handled by the page-level drop handler in
 * UploadStep (events bubble up from here).
 */
export default function DropZone({ onBrowse, dragActive, tvName }: DropZoneProps) {
  return (
    <button
      type="button"
      onClick={onBrowse}
      aria-describedby="add-photos-limits"
      className={`group flex min-h-[320px] w-full flex-col items-center justify-center gap-4 rounded-[14px] border-2 border-dashed px-6 py-12 text-center transition-colors sm:min-h-[420px] ${FOCUS_RING} ${
        dragActive
          ? "border-accent bg-accent-tint"
          : "border-line-strong bg-surface hover:border-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          dragActive ? "bg-surface" : "bg-wall"
        }`}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="text-ink">
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <path d="M3 16l5-5 4 4 3-3 6 6" />
        </svg>
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-display text-xl font-semibold text-ink">
          {dragActive ? "Drop to add them" : "Drag photos here"}
        </span>
        <span className="text-muted">
          or <span className="font-semibold text-accent underline underline-offset-2">choose from your device</span>
        </span>
      </span>
      <span id="add-photos-limits" className="text-[13px] text-muted">
        JPEG, PNG, HEIC, WebP · up to {MAX_UPLOAD_FILES} · resized to fit {tvName}
      </span>
    </button>
  );
}
