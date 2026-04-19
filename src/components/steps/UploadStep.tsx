"use client";

import { useState, useRef, useCallback } from "react";
import type {
  DiscoveredTV,
  TvConnection,
  UploadJob,
  MatteTypeId,
  MatteColorId,
} from "@/lib/types";
import { MATTE_TYPES, MATTE_COLORS } from "@/lib/types";
import { uploadPhotos, disconnectTv } from "@/lib/api-client";
import ErrorBanner from "@/components/ErrorBanner";

// Padding per matte type — fraction of preview width (mirrors Samsung's display).
const MATTE_TYPE_PADDING: Record<string, string> = {
  none:       "0",
  modernthin: "5%",
  modern:     "10%",
  modernwide: "16%",
  flexible:   "10%",
  shadowbox:  "10%",
  panoramic:  "2% 4%",
};

function matteColorStyle(colorId: MatteColorId) {
  const c = MATTE_COLORS.find((c) => c.id === colorId);
  if (!c) return "#000";
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** TV API ID — "none" or "{type}_{color}" */
function buildMatteId(type: MatteTypeId, color: MatteColorId): string {
  return type === "none" ? "none" : `${type}_${color}`;
}

interface UploadStepProps {
  tv: DiscoveredTV;
  connection: TvConnection | null;
  uploadJobs: UploadJob[];
  onUploadJobsUpdate: (jobs: UploadJob[]) => void;
  onDisconnect: () => void;
}

interface PendingFile {
  file: File;
  previewUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/gif",
];

const MAX_FILES = 20;

export default function UploadStep({
  tv,
  connection,
  uploadJobs,
  onUploadJobsUpdate,
  onDisconnect,
}: UploadStepProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  // Index of the file shown in the preview / whose matte is being edited.
  const [activeIdx, setActiveIdx] = useState(0);
  // Global defaults — new files inherit these; changing them also updates the active file.
  const [defaultMatteType, setDefaultMatteType] = useState<MatteTypeId>("none");
  const [defaultMatteColor, setDefaultMatteColor] = useState<MatteColorId>("polar");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<{ error: string; hint: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(
      (f) => ACCEPTED_TYPES.includes(f.type) || f.name.match(/\.(heic|heif)$/i)
    );

    setPendingFiles((prev) => {
      // New files inherit the current defaults so the batch looks consistent,
      // but each file can be individually overridden via the matte picker.
      const combined = [
        ...prev,
        ...valid.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
          matteType: defaultMatteType,
          matteColor: defaultMatteColor,
        })),
      ];
      if (combined.length > MAX_FILES) {
        combined.slice(MAX_FILES).forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, [defaultMatteType, defaultMatteColor]);

  const removeFile = (index: number) => {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setActiveIdx((prev) => Math.max(0, prev > index ? prev - 1 : Math.min(prev, pendingFiles.length - 2)));
  };

  /** Update the matte for the active file and persist as the new default. */
  const setActiveMatteType = (type: MatteTypeId) => {
    setDefaultMatteType(type);
    setPendingFiles((prev) =>
      prev.map((pf, i) => i === activeIdx ? { ...pf, matteType: type } : pf)
    );
  };

  const setActiveMatteColor = (color: MatteColorId) => {
    setDefaultMatteColor(color);
    setPendingFiles((prev) =>
      prev.map((pf, i) => i === activeIdx ? { ...pf, matteColor: color } : pf)
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    // Reset input so the same file can be re-added
    e.target.value = "";
  };

  const startUpload = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    setError(null);

    // Initialise all jobs as queued — use a mutable ref so each SSE event
    // updates the accumulated state rather than re-mapping the original snapshot
    // (stale-closure fix: mapping over `jobs` each time would overwrite previous
    // updates and leave earlier files stuck at "queued").
    let currentJobs: UploadJob[] = pendingFiles.map((pf) => ({
      jobId: `pending-${pf.file.name}`,
      fileName: pf.file.name,
      fileSize: pf.file.size,
      phase: "queued",
      progressPercent: 0,
      contentId: null,
      error: null,
    }));
    onUploadJobsUpdate(currentJobs);

    try {
      const gen = uploadPhotos(
        tv.id,
        pendingFiles.map((pf) => pf.file),
        pendingFiles.map((pf) => buildMatteId(pf.matteType, pf.matteColor))
      );

      for await (const event of gen) {
        if ("done" in event) break;

        currentJobs = currentJobs.map((j) => {
          if (j.fileName === event.fileName || j.jobId === event.jobId) {
            return {
              ...j,
              jobId: event.jobId,
              phase: event.phase,
              progressPercent: event.progressPercent,
              contentId: event.contentId ?? j.contentId,
              error: event.error ?? null,
            };
          }
          return j;
        });
        onUploadJobsUpdate(currentJobs);
      }
    } catch (e) {
      setError({
        error: "Upload failed",
        hint: "Check your Wi-Fi connection and try again.",
      });
    } finally {
      setUploading(false);
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
      setPendingFiles([]);
      setActiveIdx(0);
    }
  };

  const handleDisconnect = async () => {
    await disconnectTv(tv.id);
    onDisconnect();
  };

  const uploadDone = uploadJobs.length > 0 && !uploading;
  const successCount = uploadJobs.filter((j) => j.phase === "done").length;
  const errorCount = uploadJobs.filter((j) => j.phase === "error").length;

  return (
    <div className="space-y-5">
      {/* Connected header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 rounded-full bg-green-500" />
          <span className="font-medium text-slate-900">{tv.name}</span>
          <span className="text-xs text-slate-400">connected</span>
        </div>
        <button
          onClick={handleDisconnect}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Disconnect
        </button>
      </div>

      {/* Drop zone */}
      {!uploading && uploadJobs.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all text-center ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50"
          }`}
        >
          <svg
            className="w-10 h-10 mx-auto mb-3 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="font-medium text-slate-700 mb-1">
            {dragOver ? "Drop photos here" : "Drag photos here or click to browse"}
          </p>
          <p className="text-sm text-slate-400">
            JPEG, PNG, HEIC, WebP · Up to {MAX_FILES} photos · Auto-resized
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* Pending files — matte preview + picker */}
      {pendingFiles.length > 0 && !uploading && (
        <div className="space-y-4">
          {/* Frame TV mockup — shows the active file's preview */}
          {(() => {
            const active = pendingFiles[activeIdx] ?? pendingFiles[0];
            const activeMatteType = active?.matteType ?? "none";
            const activeMatteColor = active?.matteColor ?? "polar";
            return (
              <div className="relative">
                <FrameTvPreview
                  imageUrl={active.previewUrl}
                  matteType={activeMatteType}
                  matteColor={activeMatteColor}
                />
                {pendingFiles.length === 1 && (
                  <button
                    onClick={() => removeFile(0)}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })()}

          {/* Matte picker — edits the active file */}
          {(() => {
            const active = pendingFiles[activeIdx] ?? pendingFiles[0];
            const activeMatteType = active?.matteType ?? "none";
            const activeMatteColor = active?.matteColor ?? "polar";
            return (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
                    Matte Style{pendingFiles.length > 1 && <span className="normal-case font-normal text-slate-400 ml-1">— photo {activeIdx + 1} of {pendingFiles.length}</span>}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MATTE_TYPES.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setActiveMatteType(opt.id)}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                          activeMatteType === opt.id
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="w-full aspect-video rounded bg-black overflow-hidden relative">
                          <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{
                              background: opt.id === "none" ? "#111" : matteColorStyle(activeMatteColor),
                              padding: MATTE_TYPE_PADDING[opt.id] ?? "0",
                            }}
                          >
                            <div className="w-full h-full bg-slate-500 rounded-sm opacity-80" />
                          </div>
                        </div>
                        <span className={`text-[10px] font-medium leading-tight text-center ${activeMatteType === opt.id ? "text-blue-700" : "text-slate-500"}`}>
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {activeMatteType !== "none" && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 block">
                      Matte Color
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {MATTE_COLORS.map((c) => (
                        <button
                          key={c.id}
                          title={c.label}
                          onClick={() => setActiveMatteColor(c.id)}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${
                            activeMatteColor === c.id
                              ? "border-blue-500 scale-110 shadow-md"
                              : "border-transparent hover:border-slate-300"
                          }`}
                          style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">
                      {MATTE_COLORS.find((c) => c.id === activeMatteColor)?.label ?? ""}
                      {" · "}
                      <span className="font-mono">{buildMatteId(activeMatteType, activeMatteColor)}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Thumbnail strip — click to edit that file's matte */}
          {pendingFiles.length > 1 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {pendingFiles.length} photo{pendingFiles.length > 1 ? "s" : ""} selected · tap a photo to edit its matte
                  {pendingFiles.length >= MAX_FILES && (
                    <span className="ml-1.5 text-amber-600 font-medium">(max {MAX_FILES})</span>
                  )}
                </span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pendingFiles.map((pf, i) => {
                  const isActive = i === activeIdx;
                  const matteColor = pf.matteType !== "none"
                    ? MATTE_COLORS.find((c) => c.id === pf.matteColor)
                    : null;
                  return (
                    <div
                      key={i}
                      onClick={() => setActiveIdx(i)}
                      className={`relative flex-shrink-0 group w-16 h-16 rounded-lg overflow-hidden bg-slate-100 cursor-pointer transition-all ${
                        isActive ? "ring-2 ring-blue-500 ring-offset-1" : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pf.previewUrl} alt={pf.file.name} className="w-full h-full object-cover" />
                      {/* Matte color dot */}
                      {matteColor && (
                        <span
                          className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border border-white/60"
                          style={{ background: `rgb(${matteColor.r},${matteColor.g},${matteColor.b})` }}
                        />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
                {pendingFiles.length < MAX_FILES && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 flex items-center justify-center transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileInput}
            className="hidden"
          />

          <button
            onClick={startUpload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Upload {pendingFiles.length} Photo{pendingFiles.length > 1 ? "s" : ""} to TV
            {pendingFiles.length > 1 && (
              <span className="block text-xs text-blue-200 font-normal mt-0.5">
                Uploaded one at a time · ~{Math.ceil(pendingFiles.length * 0.5)} min
              </span>
            )}
          </button>
        </div>
      )}

      {/* Upload progress */}
      {(uploading || uploadDone) && uploadJobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">
              {uploading
                ? `Uploading ${uploadJobs.filter((j) => j.phase === "done").length + 1} of ${uploadJobs.length}…`
                : `Done — ${successCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`}
            </p>
            {uploading && uploadJobs.length > 1 && (
              <span className="text-xs text-slate-400">uploading one at a time</span>
            )}
          </div>

          {uploadJobs.map((job) => (
            <UploadJobRow key={job.jobId} job={job} />
          ))}

          {!uploading && (
            <button
              onClick={() => {
                onUploadJobsUpdate([]);
                setPendingFiles([]);
              }}
              className="w-full border border-slate-300 hover:border-slate-400 text-slate-700 font-medium py-2.5 rounded-xl transition-colors mt-2"
            >
              Upload More Photos
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorBanner
          error={error.error}
          hint={error.hint}
          onDismiss={() => setError(null)}
        />
      )}
    </div>
  );
}

function FrameTvPreview({
  imageUrl,
  matteType,
  matteColor,
}: {
  imageUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
}) {
  const padding = MATTE_TYPE_PADDING[matteType] ?? "0";
  const bg = matteType === "none" ? "#000" : matteColorStyle(matteColor);
  const colorLabel = matteType !== "none"
    ? (MATTE_COLORS.find((c) => c.id === matteColor)?.label ?? matteColor)
    : null;
  const typeLabel = MATTE_TYPES.find((t) => t.id === matteType)?.label ?? matteType;

  return (
    <div className="w-full">
      {/* TV outer bezel */}
      <div className="rounded-lg overflow-hidden shadow-xl" style={{ background: "#1a1a1a", padding: "6px 8px 18px 8px" }}>
        {/* Screen area */}
        <div className="w-full rounded-sm overflow-hidden" style={{ aspectRatio: "16/9", background: "#000" }}>
          {/* Matte + image */}
          <div
            className="w-full h-full flex items-center justify-center transition-all duration-200"
            style={{ background: bg, padding, boxSizing: "border-box" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Preview"
              className="w-full h-full object-contain"
              style={{ display: "block" }}
            />
          </div>
        </div>
        {/* TV stand hint */}
        <div className="flex justify-center mt-1">
          <div className="w-8 h-1 rounded-full bg-slate-700" />
        </div>
      </div>
      <p className="text-center text-xs text-slate-400 mt-2">
        {matteType === "none"
          ? "No matte"
          : `${typeLabel} · ${colorLabel}`}
      </p>
    </div>
  );
}

function UploadJobRow({ job }: { job: UploadJob }) {
  const phaseLabel: Record<string, string> = {
    queued:      "Waiting…",
    processing:  "Preparing…",
    negotiating: "Connecting…",
    transferring:"Sending…",
    done:        "Done",
    error:       "Failed",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-800 truncate max-w-[70%]">
          {job.fileName}
        </span>
        <span
          className={`text-xs font-medium ${
            job.phase === "done"
              ? "text-green-600"
              : job.phase === "error"
              ? "text-red-500"
              : "text-blue-500"
          }`}
        >
          {phaseLabel[job.phase] ?? job.phase}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            job.phase === "done"
              ? "bg-green-500"
              : job.phase === "error"
              ? "bg-red-400"
              : "bg-blue-500"
          }`}
          style={{ width: `${job.progressPercent}%` }}
        />
      </div>

      {job.phase === "error" && job.error && (
        <p className="text-xs text-red-500 mt-1.5">{job.error}</p>
      )}

      {job.phase === "done" && job.contentId && (
        <p className="text-xs text-slate-400 mt-1.5">
          Saved to Art Mode · ID: {job.contentId}
        </p>
      )}
    </div>
  );
}
