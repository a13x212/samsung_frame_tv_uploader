"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { DiscoveredTV, UploadJob, MatteTypeId, MatteColorId } from "@/lib/types";
import { MAX_UPLOAD_FILES } from "@/lib/types";
import { uploadPhotos } from "@/lib/api-client";
import { buildMatteId, matteLabel, DEFAULT_MATTE_COLOR } from "@/lib/matte";
import ErrorBanner from "@/components/ErrorBanner";
import FrameTvPreview from "@/components/matte/FrameTvPreview";
import MattePicker from "@/components/matte/MattePicker";
import DropZone from "@/components/upload/DropZone";
import Filmstrip from "@/components/upload/Filmstrip";
import SkippedNotice from "@/components/upload/SkippedNotice";
import UploadJobList, { type JobPreview } from "@/components/upload/UploadJobList";
import {
  ACCEPT_ATTR,
  applyUploadEvent,
  countFinished,
  createMatchState,
  failUnfinished,
  initialJobs,
  partitionFiles,
  type SkippedFiles,
} from "@/components/upload/upload-events";
import { PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/upload/styles";

interface UploadStepProps {
  tv: DiscoveredTV;
  uploadJobs: UploadJob[];
  onUploadJobsUpdate: (jobs: UploadJob[]) => void;
  /** Switch the shell to the "On the TV" (library) view. */
  onViewLibrary?: () => void;
}

interface PendingFile {
  /** Stable client id; also used as the UploadJob.jobId for this file. */
  id: string;
  file: File;
  previewUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
}

// Ids only need to be unique within this page. (crypto.randomUUID needs a
// secure context, and the app is usually opened over plain http on the LAN.)
let idSeq = 0;
const nextId = () => `photo-${Date.now().toString(36)}-${++idSeq}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function UploadStep({
  tv,
  uploadJobs,
  onUploadJobsUpdate,
  onViewLibrary,
}: UploadStepProps) {
  /** Photos in the composer (not yet sent, or sent and failed). */
  const [items, setItems] = useState<PendingFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** The photos in the current / last send; drives the progress and summary views. */
  const [batch, setBatch] = useState<PendingFile[] | null>(null);
  const [skipped, setSkipped] = useState<SkippedFiles | null>(null);
  const [error, setError] = useState<{ error: string; hint: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  /** Every object URL still alive, so unmount can revoke them all. */
  const liveUrls = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const urls = liveUrls.current;
    return () => {
      mounted.current = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const revoke = (pf: PendingFile) => {
    URL.revokeObjectURL(pf.previewUrl);
    liveUrls.current.delete(pf.previewUrl);
  };

  const view: "empty" | "compose" | "uploading" | "finished" = uploading
    ? "uploading"
    : batch && uploadJobs.length > 0
    ? "finished"
    : items.length > 0
    ? "compose"
    : "empty";

  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;
  const activeIndex = active ? items.indexOf(active) : -1;

  // ─── Choosing files ──────────────────────────────────────────────────────

  const openPicker = () => inputRef.current?.click();

  /** Drop the finished batch: revoke previews of photos no longer in the composer. */
  const clearBatch = useCallback(() => {
    if (batch) {
      const kept = new Set(items.map((i) => i.id));
      batch.filter((b) => !kept.has(b.id)).forEach(revoke);
    }
    setBatch(null);
    onUploadJobsUpdate([]);
  }, [batch, items, onUploadJobsUpdate]);

  const addFiles = (files: File[]) => {
    if (uploading || files.length === 0) return;
    const { accepted, skipped: skippedNow } = partitionFiles(files, items.length);
    setSkipped(
      skippedNow.unsupported.length || skippedNow.overLimit.length ? skippedNow : null
    );
    if (accepted.length === 0) return;

    // New photos start with no matte; "Use this matte on all" copies one across.
    const added: PendingFile[] = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      liveUrls.current.add(previewUrl);
      return { id: nextId(), file, previewUrl, matteType: "none", matteColor: DEFAULT_MATTE_COLOR };
    });
    setItems((prev) => [...prev, ...added]);
    setActiveId(added[0].id);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset so choosing the same file again still fires onChange.
    e.target.value = "";
    if (view === "finished") clearBatch();
    addFiles(files);
  };

  // Whole-page drag and drop. A depth counter avoids flicker when the pointer
  // crosses child elements (each fires its own dragenter / dragleave).
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    if (!uploading) setDragActive(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // required for drop to fire, and stops the browser opening the file
    e.dataTransfer.dropEffect = uploading ? "none" : "copy";
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (uploading) return;
    if (view === "finished") clearBatch();
    addFiles(Array.from(e.dataTransfer.files));
  };

  // ─── Editing ─────────────────────────────────────────────────────────────

  const removeActive = () => {
    if (!active) return;
    const idx = items.indexOf(active);
    const neighbour = items[idx + 1] ?? items[idx - 1] ?? null;
    revoke(active);
    setItems((prev) => prev.filter((i) => i.id !== active.id));
    setActiveId(neighbour?.id ?? null);
  };

  const patchActive = (patch: Partial<Pick<PendingFile, "matteType" | "matteColor">>) => {
    if (!active) return;
    setItems((prev) => prev.map((i) => (i.id === active.id ? { ...i, ...patch } : i)));
  };

  const applyToAll = () => {
    if (!active) return;
    const { matteType, matteColor } = active;
    setItems((prev) => prev.map((i) => ({ ...i, matteType, matteColor })));
  };

  const allMatchActive =
    !!active &&
    items.every(
      (i) =>
        buildMatteId(i.matteType, i.matteColor) === buildMatteId(active.matteType, active.matteColor)
    );

  // ─── Sending ─────────────────────────────────────────────────────────────

  const startUpload = async (list: PendingFile[]) => {
    if (list.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    setSkipped(null);
    setBatch(list);

    const push = (next: UploadJob[]) => {
      if (mounted.current) onUploadJobsUpdate(next);
    };

    // The server sends files strictly in request order and gives each one a new
    // jobId; see upload-events.ts for why order-based binding is unambiguous.
    const match = createMatchState(list.map((pf) => pf.id));
    let jobs = initialJobs(list);
    push(jobs);

    let interrupted = false;
    try {
      const gen = uploadPhotos(
        tv.id,
        list.map((pf) => pf.file),
        list.map((pf) => buildMatteId(pf.matteType, pf.matteColor))
      );
      for await (const event of gen) {
        if ("done" in event) break;
        jobs = applyUploadEvent(match, jobs, event);
        push(jobs);
      }
    } catch {
      interrupted = true;
    }

    // Anything the stream never finished (connection dropped, server stopped
    // early) counts as failed so it stays in the composer for a retry.
    const settled = failUnfinished(
      jobs,
      interrupted
        ? "Not sent: the connection to the uploader was lost."
        : "Not sent: the upload stopped before this photo."
    );
    if (settled.some((j, i) => j !== jobs[i])) push(settled);

    if (!mounted.current) return;
    if (interrupted) {
      setError({
        error: "The upload was interrupted",
        hint: "Check that this device is on the same Wi-Fi as the TV, then retry the photos that didn't send.",
      });
    }

    // Keep failed and never-attempted photos (with their mattes); drop the sent
    // ones. Their previews stay alive for the summary until the batch is cleared.
    const sent = new Set(settled.filter((j) => j.phase === "done").map((j) => j.jobId));
    setItems((prev) => prev.filter((i) => !sent.has(i.id)));
    setActiveId(list.find((pf) => !sent.has(pf.id))?.id ?? null);
    setUploading(false);
  };

  const retryFailed = () => {
    const retry = items;
    clearBatch();
    void startUpload(retry);
  };

  const addMoreAfterSend = () => {
    clearBatch();
    openPicker();
  };

  // ─── Derived ─────────────────────────────────────────────────────────────

  const previews = useMemo(() => {
    const m = new Map<string, JobPreview>();
    for (const pf of batch ?? []) m.set(pf.id, pf);
    return m;
  }, [batch]);

  const counts = countFinished(uploadJobs);
  const total = uploadJobs.length;
  const currentNumber = Math.min(counts.finished + 1, total);
  const overallPercent =
    total === 0
      ? 0
      : Math.round(
          uploadJobs.reduce(
            (sum, j) => sum + (j.phase === "done" || j.phase === "error" ? 100 : j.progressPercent),
            0
          ) / total
        );
  const minutes = Math.max(1, Math.ceil(items.length * 0.5));

  // ─── Render ──────────────────────────────────────────────────────────────

  const subtitle =
    view === "compose"
      ? items.length === 1
        ? "1 photo ready. Set its matte, then send it."
        : `${items.length} photos ready. Pick one to set its matte.`
      : view === "uploading"
      ? `Sending to ${tv.name}.`
      : view === "finished"
      ? `Finished sending to ${tv.name}.`
      : `Choose photos to show in Art Mode on ${tv.name}.`;

  return (
    <div
      className="relative flex min-h-[60vh] flex-col gap-5"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* The one file input, shared by the drop zone, the add-more tile and
          "Add more photos". */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        onChange={handleFileInput}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.01em] text-ink">
            Add photos
          </h1>
          <p className="m-0 mt-1 text-muted">{subtitle}</p>
        </div>
        {view === "compose" && (
          <p className="m-0 text-[13px] text-muted">
            JPEG, PNG, HEIC, WebP · up to {MAX_UPLOAD_FILES} · resized to fit the TV
          </p>
        )}
      </div>

      {skipped && <SkippedNotice skipped={skipped} onDismiss={() => setSkipped(null)} />}

      {error && (
        <ErrorBanner error={error.error} hint={error.hint} onDismiss={() => setError(null)} />
      )}

      {view === "empty" && <DropZone onBrowse={openPicker} dragActive={dragActive} tvName={tv.name} />}

      {view === "compose" && active && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-4">
            <FrameTvPreview
              size="lg"
              imageUrl={active.previewUrl}
              matteType={active.matteType}
              matteColor={active.matteColor}
              alt={`Preview of ${active.file.name} on ${tv.name}`}
              caption={`Preview on ${tv.name} · ${matteLabel(active.matteType, active.matteColor)}`}
            />
            <Filmstrip
              items={items.map((i) => ({
                id: i.id,
                name: i.file.name,
                previewUrl: i.previewUrl,
                matteType: i.matteType,
                matteColor: i.matteColor,
              }))}
              activeId={active.id}
              onSelect={setActiveId}
              onAddMore={openPicker}
              canAddMore={items.length < MAX_UPLOAD_FILES}
            />
            {items.length >= MAX_UPLOAD_FILES && (
              <p className="m-0 text-[13px] text-muted">
                That&apos;s the {MAX_UPLOAD_FILES}-photo limit for one send. Send these, then add more.
              </p>
            )}
          </div>

          <aside aria-label="Matte for this photo" className={`flex flex-col gap-5 p-5 sm:p-6 ${PANEL}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 font-display text-lg font-semibold text-ink">
                  Photo {activeIndex + 1} of {items.length}
                </h2>
                <p className="m-0 mt-0.5 truncate text-[13px] text-muted" title={active.file.name}>
                  {active.file.name}
                </p>
              </div>
              <button
                type="button"
                onClick={removeActive}
                className="-mr-2 min-h-[44px] flex-none rounded-lg px-3 font-medium text-danger hover:bg-ground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Remove<span className="sr-only"> {active.file.name}</span>
              </button>
            </div>

            <MattePicker
              matteType={active.matteType}
              matteColor={active.matteColor}
              onTypeChange={(matteType) => patchActive({ matteType })}
              onColorChange={(matteColor) => patchActive({ matteColor })}
            />

            {items.length > 1 && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={applyToAll}
                  disabled={allMatchActive}
                  className={SECONDARY_BUTTON}
                >
                  {allMatchActive
                    ? `All ${items.length} photos use this matte`
                    : `Use this matte on all ${items.length} photos`}
                </button>
                <p className="m-0 text-center text-xs text-muted">
                  Each photo keeps its own matte. New photos start with no matte.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2.5 border-t border-line pt-5">
              <button type="button" onClick={() => void startUpload(items)} className={PRIMARY_BUTTON}>
                Send {plural(items.length, "photo", "photos")} to {tv.name}
              </button>
              <p className="m-0 text-center text-xs text-muted">
                Sent one at a time · about {plural(minutes, "minute", "minutes")}
              </p>
            </div>
          </aside>
        </div>
      )}

      {view === "uploading" && (
        <section aria-labelledby="sending-heading" className={`flex flex-col gap-5 p-5 sm:p-6 ${PANEL}`}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="sending-heading" className="m-0 font-display text-lg font-semibold text-ink" aria-live="polite">
                Sending {currentNumber} of {total}
              </h2>
              <span className="text-[13px] text-muted">
                {counts.finished} finished · one at a time
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Overall progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallPercent}
              className="h-2 overflow-hidden rounded-full bg-ground"
            >
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-300"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <p className="m-0 text-[13px] text-muted">
              Keep this page open until it finishes. You can look at the On the TV tab meanwhile.
            </p>
          </div>
          <UploadJobList jobs={uploadJobs} previews={previews} />
        </section>
      )}

      {view === "finished" && (
        <section aria-labelledby="finished-heading" className={`flex flex-col gap-5 p-5 sm:p-6 ${PANEL}`}>
          <div className="flex flex-col gap-1" role="status">
            <h2 id="finished-heading" className="m-0 font-display text-lg font-semibold text-ink">
              {counts.failed === 0
                ? `${plural(counts.done, "photo", "photos")} sent to ${tv.name}`
                : counts.done === 0
                ? "No photos were sent"
                : `${counts.done} sent, ${counts.failed} not sent`}
            </h2>
            {counts.failed > 0 && (
              <p className="m-0 text-muted">
                {items.length > 0
                  ? `${counts.failed === 1 ? "The photo that didn't send is" : "The photos that didn't send are"} kept with ${counts.failed === 1 ? "its matte" : "their mattes"}, so you can try again.`
                  : "Check that the TV is on and in Art Mode, then try again."}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {onViewLibrary && counts.done > 0 && (
              <button
                type="button"
                onClick={onViewLibrary}
                className={`${PRIMARY_BUTTON} min-h-[44px] sm:w-auto`}
              >
                See photos on the TV
              </button>
            )}
            {counts.failed > 0 && items.length > 0 && (
              <button
                type="button"
                onClick={retryFailed}
                className={
                  counts.done > 0 ? SECONDARY_BUTTON : `${PRIMARY_BUTTON} min-h-[44px] sm:w-auto`
                }
              >
                Retry failed ({items.length})
              </button>
            )}
            <button type="button" onClick={addMoreAfterSend} className={SECONDARY_BUTTON}>
              Add more photos
            </button>
          </div>

          <UploadJobList jobs={uploadJobs} previews={previews} />
        </section>
      )}

      {dragActive && view !== "empty" && view !== "uploading" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-[14px] border-2 border-dashed border-accent bg-accent-tint/70 pt-24"
        >
          <span className="rounded-full bg-surface px-4 py-2 font-semibold text-ink shadow">
            Drop to add {items.length > 0 ? "more " : ""}photos
          </span>
        </div>
      )}
    </div>
  );
}
