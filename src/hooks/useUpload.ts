"use client";

import { useState, useCallback } from "react";
import type { UploadJob, MatteId } from "@/lib/types";
import { uploadPhotos } from "@/lib/api-client";
import {
  applyUploadEvent,
  createMatchState,
  failUnfinished,
} from "@/components/upload/upload-events";

// Not used by the app shell (UploadStep drives uploads itself); kept for reuse.
// Events are matched to files by order, never by file name: see upload-events.ts.

export function useUpload(tvId: string | null) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFiles = useCallback(
    async (files: File[], matteIds: MatteId[] = []) => {
      if (!tvId || files.length === 0) return;

      setIsUploading(true);
      setUploadError(null);

      // Initialise jobs. jobId is a stable per-file client id, so two files with
      // the same name never collide.
      const stamp = Date.now().toString(36);
      let current: UploadJob[] = files.map((f, i) => ({
        jobId: `file-${stamp}-${i}`,
        fileName: f.name,
        fileSize: f.size,
        phase: "queued",
        progressPercent: 0,
        contentId: null,
        error: null,
      }));
      setJobs(current);
      const match = createMatchState(current.map((j) => j.jobId));

      try {
        const gen = uploadPhotos(tvId, files, matteIds);

        for await (const event of gen) {
          if ("done" in event) break;
          current = applyUploadEvent(match, current, event);
          setJobs(current);
        }
        setJobs(failUnfinished(current, "Not sent: the upload stopped before this photo."));
      } catch {
        setJobs(failUnfinished(current, "Not sent: the connection was lost."));
        setUploadError("Upload failed. Check your Wi-Fi and try again.");
      } finally {
        setIsUploading(false);
      }
    },
    [tvId]
  );

  const resetJobs = useCallback(() => {
    setJobs([]);
    setUploadError(null);
  }, []);

  return { jobs, isUploading, uploadError, uploadFiles, resetJobs };
}
