import type { DiscoveredTV } from "@/lib/types";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/setup/styles";

interface TvCardProps {
  tv: DiscoveredTV;
  onSelect: (tv: DiscoveredTV) => void;
}

const FOUND_VIA: Record<DiscoveredTV["discoveredVia"], string> = {
  ssdp: "Found automatically",
  scan: "Found by network scan",
  manual: "Added by IP address",
};

/** One discovered TV with its details and a Connect action. */
export default function TvCard({ tv, onSelect }: TvCardProps) {
  const detailsId = `tv-${tv.id}-details`;
  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
        tv.frameSupported ? "border-line" : "border-line-strong"
      }`}
    >
      <div className="flex min-w-0 items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-wall text-ink"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="5" width="18" height="14" rx="1" />
            <rect x="7.5" y="9" width="9" height="6" />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="m-0 break-words font-sans text-[15px] font-semibold text-ink">{tv.name}</h3>
            {tv.frameSupported ? (
              <span className="rounded-md bg-accent-tint px-1.5 py-0.5 text-xs font-medium text-accent">
                Frame TV
              </span>
            ) : (
              <span className="rounded-md border border-danger-line px-1.5 py-0.5 text-xs font-medium text-danger">
                Not a Frame TV
              </span>
            )}
          </div>
          <p id={detailsId} className="m-0 mt-1 text-[13px] text-muted">
            <span className="[font-variant-numeric:tabular-nums]">{tv.ip}</span>
            {tv.modelYear > 0 && <> · {tv.modelYear} model</>}
            {" · "}
            {FOUND_VIA[tv.discoveredVia]}
          </p>
          {!tv.frameSupported && (
            <p className="m-0 mt-1 text-[13px] text-ink">
              This TV doesn&apos;t report Art Mode, so photos may not show as art.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSelect(tv)}
        aria-describedby={detailsId}
        className={`${tv.frameSupported ? PRIMARY_BUTTON : SECONDARY_BUTTON} w-full flex-shrink-0 sm:w-auto`}
      >
        Connect<span className="sr-only"> to {tv.name}</span>
      </button>
    </div>
  );
}
