"use client";

import { useState, useCallback } from "react";
import type { UploadJob, MatteId } from "@/lib/types";
import { uploadPhotos } from "@/lib/api-client";

export function useUpload(tvId: string | null) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFiles = useCallback(
    async (files: File[], matteIds: MatteId[] = []) => {
      if (!tvId || files.length === 0) return;

      setIsUploading(true);
      setUploadError(null);

      // Initialise jobs
      const initialJobs: UploadJob[] = files.map((f) => ({
        jobId: `pending-${f.name}-${Date.now()}`,
        fileName: f.name,
        fileSize: f.size,
        phase: "queued",
        progressPercent: 0,
        contentId: null,
        error: null,
      }));
      setJobs(initialJobs);

      try {
        const gen = uploadPhotos(tvId, files, matteIds);

        for await (const event of gen) {
          if ("done" in event) break;

          setJobs((prev) =>
            prev.map((j) => {
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
            })
          );
        }
      } catch {
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
