import type { DiscoveredTV } from "@/lib/types";
import Logo from "./Logo";
import TvSwitcher from "./TvSwitcher";
import type { AppView } from "./types";

interface AppHeaderProps {
  tv: DiscoveredTV;
  view: AppView;
  /** Photos on the TV; null while unknown (no number shown). */
  photoCount: number | null;
  onViewChange: (view: AppView) => void;
  onDisconnect: () => void;
}

/**
 * App-mode header. >= 640px: logo, segmented tabs, TV switcher.
 * < 640px: short title + TV switcher (tabs move to the BottomTabBar).
 */
export default function AppHeader({
  tv,
  view,
  photoCount,
  onViewChange,
  onDisconnect,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      {/* Phone */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:hidden">
        <Logo compact />
        <div className="min-w-0">
          <TvSwitcher tv={tv} onDisconnect={onDisconnect} compact />
        </div>
      </div>

      {/* Tablet / desktop */}
      <div className="hidden flex-wrap items-center justify-between gap-x-6 gap-y-3 px-8 py-3.5 sm:flex">
        <Logo />
        <nav aria-label="Sections" className="flex gap-1 rounded-[10px] bg-ground p-1">
          <TabButton active={view === "library"} onClick={() => onViewChange("library")}>
            On the TV
            {photoCount !== null && (
              <span className={`font-medium ${view === "library" ? "text-muted" : ""}`}>
                {photoCount}
              </span>
            )}
          </TabButton>
          <TabButton active={view === "add"} onClick={() => onViewChange("add")}>
            Add photos
          </TabButton>
        </nav>
        <TvSwitcher tv={tv} onDisconnect={onDisconnect} />
      </div>
    </header>
  );
}

function TabButton({
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
      className={`flex min-h-[36px] items-center gap-2 rounded-[7px] px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        active
          ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(21,23,26,0.12)]"
          : "font-medium text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
