"use client";

import { memo } from "react";
import type { ArtPhoto } from "@/lib/types";
import { thumbnailUrl } from "@/lib/api-client";
import { matteLabel, parseMatteId } from "@/lib/matte";
import MattedThumb from "@/components/matte/MattedThumb";

export interface PhotoTileProps {
  tvId: string;
  photo: ArtPhoto;
  /** 1-based position in the full library, used in the accessible name. */
  position: number;
  selected: boolean;
  disabled?: boolean;
  onToggle: (contentId: string) => void;
}

/**
 * One photo in the library grid: the photo inside its real matte (16:9, the
 * way the TV frames it) as a toggle button, with the matte name underneath.
 */
function PhotoTile({ tvId, photo, position, selected, disabled = false, onToggle }: PhotoTileProps) {
  const { type, color } = parseMatteId(photo.matte_id);
  const label = matteLabel(type, color);

  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Photo ${position}, ${label}`}
        disabled={disabled}
        onClick={() => onToggle(photo.content_id)}
        className={`relative block w-full rounded-[4px] p-0 outline outline-2 outline-offset-2 transition-[outline-color] focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-[6px] focus-visible:ring-offset-ground disabled:cursor-not-allowed sm:outline-offset-[3px] ${
          selected ? "outline-accent" : "outline-transparent hover:outline-line-strong"
        }`}
      >
        <MattedThumb
          imageUrl={thumbnailUrl(tvId, photo.content_id)}
          matteType={type}
          matteColor={color}
          alt=""
        />
        {selected && (
          <span
            aria-hidden="true"
            className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-accent sm:left-2 sm:top-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </span>
        )}
      </button>
      <p className="m-0 truncate text-xs text-muted">{label}</p>
    </div>
  );
}

export default memo(PhotoTile);

/** Placeholder tile shown while the library loads. */
export function PhotoTileSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
      <div className="aspect-video w-full rounded-[4px] bg-line motion-safe:animate-pulse" />
      <div className="h-3 w-2/3 rounded bg-line motion-safe:animate-pulse" />
    </div>
  );
}
