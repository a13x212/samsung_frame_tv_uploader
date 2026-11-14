import type { UploadJob, MatteTypeId, MatteColorId } from "@/lib/types";
import MattedThumb from "@/components/matte/MattedThumb";

export interface JobPreview {
  previewUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
}

const PHASE_LABEL: Record<UploadJob["phase"], string> = {
  queued: "Waiting",
  processing: "Preparing",
  negotiating: "Connecting",
  transferring: "Sending",
  done: "On the TV",
  error: "Not sent",
};

export interface UploadJobListProps {
  jobs: UploadJob[];
  /** Thumbnail data keyed by job id (the client id of the pending file). */
  previews: Map<string, JobPreview>;
}

/** Per-photo rows: thumbnail, file name, phase and a progress bar. */
export default function UploadJobList({ jobs, previews }: UploadJobListProps) {
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
      {jobs.map((job) => (
        <JobRow key={job.jobId} job={job} preview={previews.get(job.jobId)} />
      ))}
    </ul>
  );
}

function JobRow({ job, preview }: { job: UploadJob; preview?: JobPreview }) {
  const failed = job.phase === "error";
  const done = job.phase === "done";
  const label = PHASE_LABEL[job.phase] ?? job.phase;

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 sm:gap-4">
      <div className="w-16 flex-none sm:w-20">
        {preview ? (
          <MattedThumb
            imageUrl={preview.previewUrl}
            matteType={preview.matteType}
            matteColor={preview.matteColor}
            alt=""
          />
        ) : (
          <div aria-hidden="true" className="aspect-video w-full rounded-[4px] bg-wall" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-ink" title={job.fileName}>
            {job.fileName}
          </span>
          <span
            className={`flex-none text-[13px] font-medium ${
              failed ? "text-danger" : done ? "text-success" : "text-muted"
            }`}
          >
            {label}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${job.fileName}: ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={done ? 100 : job.progressPercent}
          className="h-1.5 overflow-hidden rounded-full bg-ground"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              failed ? "bg-danger" : done ? "bg-success" : "bg-ink"
            }`}
            style={{ width: `${failed ? 100 : done ? 100 : job.progressPercent}%` }}
          />
        </div>
        {failed && job.error && (
          <p className="m-0 break-words text-[13px] text-danger">{job.error}</p>
        )}
      </div>
    </li>
  );
}
