import type { AppView } from "./types";

interface BottomTabBarProps {
  view: AppView;
  photoCount: number | null;
  onViewChange: (view: AppView) => void;
}

/** Height of the bar excluding the safe-area inset. Content pads by this. */
export const BOTTOM_TAB_BAR_HEIGHT = 60;

/**
 * Fixed bottom navigation for phones (< 640px). Screens that add their own
 * bottom-anchored toolbars should sit above it: use
 * `bottom-[calc(60px+env(safe-area-inset-bottom))]` on phones.
 */
export default function BottomTabBar({ view, photoCount, onViewChange }: BottomTabBarProps) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <BarButton active={view === "library"} onClick={() => onViewChange("library")}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="13" rx="1" />
          <path d="M9 21h6" />
        </svg>
        <span>
          On the TV
          {photoCount !== null && <span className="sr-only">, {photoCount} photos</span>}
        </span>
      </BarButton>
      <BarButton active={view === "add"} onClick={() => onViewChange("add")}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Add photos</span>
      </BarButton>
    </nav>
  );
}

function BarButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
        active ? "font-semibold text-ink" : "font-medium text-muted"
      }`}
    >
      {children}
    </button>
  );
}
