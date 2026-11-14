import { MAX_UPLOAD_FILES } from "@/lib/types";
import type { SkippedFiles } from "./upload-events";

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Names a few files, then "and N more". */
function listNames(names: string[], max = 3) {
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} and ${names.length - max} more` : shown;
}

export interface SkippedNoticeProps {
  skipped: SkippedFiles;
  onDismiss: () => void;
}

/** Dismissible note explaining which chosen files were not added and why. */
export default function SkippedNotice({ skipped, onDismiss }: SkippedNoticeProps) {
  const { unsupported, overLimit } = skipped;
  if (unsupported.length === 0 && overLimit.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-[10px] border border-line-strong bg-surface py-2 pl-4 pr-1"
    >
      <div className="flex min-w-0 flex-col gap-1 py-1.5 text-sm text-ink">
        {unsupported.length > 0 && (
          <p className="m-0 break-words">
            <span className="font-semibold">
              Skipped {plural(unsupported.length, "file", "files")} that {unsupported.length === 1 ? "isn't a" : "aren't"} supported photo{unsupported.length === 1 ? "" : "s"}:
            </span>{" "}
            <span className="text-muted">{listNames(unsupported)}.</span>{" "}
            <span className="text-muted">Use JPEG, PNG, HEIC or WebP.</span>
          </p>
        )}
        {overLimit.length > 0 && (
          <p className="m-0 break-words">
            <span className="font-semibold">
              Skipped {plural(overLimit.length, "photo", "photos")}: you can send up to {MAX_UPLOAD_FILES} at a time.
            </span>{" "}
            <span className="text-muted">Send these first, then add the rest.</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice about skipped files"
        className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-muted hover:bg-ground hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
