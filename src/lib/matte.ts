// Shared matte helpers used by the Library and Add-photos screens.
// Matte IDs sent to the TV are "none" or "{type}_{color}" (see types.ts).

import { MATTE_TYPES, MATTE_COLORS } from "./types";
import type { MatteTypeId, MatteColorId } from "./types";

/** Colour used when a type has no colour yet / an unknown colour is parsed. */
export const DEFAULT_MATTE_COLOR: MatteColorId = "polar";

/** Ground drawn around the image when the matte type is "none". */
export const NO_MATTE_GROUND = "#0B0B0B";

/**
 * CSS padding per matte type, as a fraction of the preview width
 * (percent padding resolves against width). Values follow the approved
 * mockups so each style reads as visibly different.
 */
export const MATTE_TYPE_PADDING: Record<MatteTypeId, string> = {
  none: "0",
  modernthin: "5%",
  modern: "10%",
  modernwide: "16%",
  flexible: "10% 14%",
  shadowbox: "12%",
  panoramic: "14% 4%",
};

/** CSS colour (rgb()) for a matte colour id; falls back to black. */
export function matteColorCss(colorId: MatteColorId | string): string {
  const c = MATTE_COLORS.find((m) => m.id === colorId);
  return c ? `rgb(${c.r},${c.g},${c.b})` : "#000";
}

/** Background to draw around the image for a type + colour ("none" = black). */
export function matteBackgroundCss(type: MatteTypeId, color: MatteColorId): string {
  return type === "none" ? NO_MATTE_GROUND : matteColorCss(color);
}

/** TV API matte id: "none" or "{type}_{color}". */
export function buildMatteId(type: MatteTypeId, color: MatteColorId): string {
  return type === "none" ? "none" : `${type}_${color}`;
}

/** Reverse of buildMatteId: "shadowbox_polar" -> { type: "shadowbox", color: "polar" }. */
export function parseMatteId(matteId?: string | null): {
  type: MatteTypeId;
  color: MatteColorId;
} {
  if (!matteId || matteId === "none") return { type: "none", color: DEFAULT_MATTE_COLOR };
  const type = MATTE_TYPES.find((t) => matteId === t.id || matteId.startsWith(`${t.id}_`));
  if (!type || type.id === "none") return { type: "none", color: DEFAULT_MATTE_COLOR };
  const colorId = matteId.slice(type.id.length + 1);
  const color = MATTE_COLORS.find((c) => c.id === colorId);
  return { type: type.id, color: color?.id ?? DEFAULT_MATTE_COLOR };
}

export function matteTypeLabel(type: MatteTypeId): string {
  return MATTE_TYPES.find((t) => t.id === type)?.label ?? type;
}

export function matteColorLabel(color: MatteColorId): string {
  return MATTE_COLORS.find((c) => c.id === color)?.label ?? color;
}

/** Human label: "Modern in Sand", or "No matte". */
export function matteLabel(type: MatteTypeId, color: MatteColorId): string {
  if (type === "none") return "No matte";
  return `${matteTypeLabel(type)} in ${matteColorLabel(color)}`;
}
