import type { MatteTypeId, MatteColorId } from "@/lib/types";
import { matteLabel } from "@/lib/matte";
import MattedThumb from "@/components/matte/MattedThumb";

export interface FilmstripItem {
  id: string;
  name: string;
  previewUrl: string;
  matteType: MatteTypeId;
  matteColor: MatteColorId;
}

export interface FilmstripProps {
  items: FilmstripItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAddMore: () => void;
  canAddMore: boolean;
}

/** Row of matted thumbnails; each is a toggle button for the active photo. */
export default function Filmstrip({ items, activeId, onSelect, onAddMore, canAddMore }: FilmstripProps) {
  return (
    <div
      role="group"
      aria-label="Chosen photos"
      className="-mx-3 flex items-center gap-3 overflow-x-auto p-3"
    >
      {items.map((item, i) => {
        const on = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            aria-label={`Photo ${i + 1}, ${item.name}, ${matteLabel(item.matteType, item.matteColor)}`}
            onClick={() => onSelect(item.id)}
            className={`w-[112px] flex-none rounded-[3px] ring-offset-[3px] ring-offset-ground transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[7px] focus-visible:outline-ink ${
              on ? "ring-2 ring-accent" : "hover:ring-2 hover:ring-line-strong"
            }`}
          >
            <MattedThumb
              imageUrl={item.previewUrl}
              matteType={item.matteType}
              matteColor={item.matteColor}
              alt=""
              className="rounded-[3px]"
            />
          </button>
        );
      })}
      {canAddMore && (
        <button
          type="button"
          aria-label="Add more photos"
          onClick={onAddMore}
          className={`flex aspect-video w-[112px] flex-none items-center justify-center rounded-[3px] border border-dashed border-muted bg-surface text-ink hover:bg-ground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[7px] focus-visible:outline-ink`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}
    </div>
  );
}
