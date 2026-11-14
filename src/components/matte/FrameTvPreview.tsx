import type { MatteTypeId, MatteColorId } from "@/lib/types";
import { MATTE_TYPE_PADDING, matteBackgroundCss } from "@/lib/matte";

export interface FrameTvPreviewProps {
  imageUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
  /** Shown centred under the TV, e.g. "Preview · Modern in Sand". */
  caption?: string;
  className?: string;
  /** Alt text for the photo. Defaults to a generic description. */
  alt?: string;
  /**
   * "md" (default) suits a ~400px side panel; "lg" is the large stage on the
   * Add-photos screen (more wall around the TV, thicker bezel, max 720px TV).
   */
  size?: "md" | "lg";
}

/**
 * A Frame TV (dark bezel) hanging on a wall-grey panel, showing the photo
 * inside its matte. Purely presentational.
 */
export default function FrameTvPreview({
  imageUrl,
  matteType,
  matteColor,
  caption,
  className = "",
  alt = "Preview of the photo on the TV",
  size = "md",
}: FrameTvPreviewProps) {
  const lg = size === "lg";
  const hasMatte = matteType !== "none";

  return (
    <figure
      className={`m-0 flex flex-col items-center bg-wall ${
        lg
          ? "gap-[18px] rounded-[14px] px-4 pb-7 pt-8 sm:px-8 sm:pt-12"
          : "gap-3.5 rounded-[10px] px-6 pb-[22px] pt-7"
      } ${className}`}
    >
      <div
        className={`w-full bg-bezel ${
          lg
            ? "max-w-[720px] rounded px-2 pb-5 pt-2 shadow-[0_22px_44px_rgba(21,23,26,0.3)]"
            : "rounded-[3px] px-[5px] pb-3 pt-[5px] shadow-[0_10px_24px_rgba(21,23,26,0.28)]"
        }`}
      >
        <div
          className="box-border flex aspect-video w-full items-center justify-center overflow-hidden transition-[padding,background-color] duration-200"
          style={{
            background: matteBackgroundCss(matteType, matteColor),
            padding: MATTE_TYPE_PADDING[matteType] ?? "0",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={alt}
            className="block h-full w-full object-contain"
            // drop-shadow follows the visible image, not the letterboxed box
            style={hasMatte ? { filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" } : undefined}
          />
        </div>
      </div>
      {caption && (
        <figcaption className={`m-0 text-center text-muted ${lg ? "text-[13px]" : "text-xs"}`}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
