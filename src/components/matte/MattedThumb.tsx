import type { MatteTypeId, MatteColorId } from "@/lib/types";
import { MATTE_TYPE_PADDING, matteBackgroundCss } from "@/lib/matte";

export interface MattedThumbProps {
  imageUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
  alt: string;
  className?: string;
}

/**
 * 16:9 tile showing a photo inside its matte (colour + padding), the way the
 * TV frames it. "none" draws a black ground. Purely presentational: wrap it in
 * a <button> yourself if it needs to be interactive.
 */
export default function MattedThumb({
  imageUrl,
  matteType,
  matteColor,
  alt,
  className = "",
}: MattedThumbProps) {
  return (
    <div
      className={`box-border flex aspect-video w-full items-center justify-center overflow-hidden rounded-[4px] shadow-[0_1px_3px_rgba(21,23,26,0.18)] ${className}`}
      style={{
        background: matteBackgroundCss(matteType, matteColor),
        padding: MATTE_TYPE_PADDING[matteType] ?? "0",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-full w-full object-contain"
      />
    </div>
  );
}
