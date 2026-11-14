"use client";

import { useEffect, useState, useCallback, useMemo, useRef, useId } from "react";
import type { DiscoveredTV, ArtPhoto, MatteTypeId, MatteColorId } from "@/lib/types";
import { listPhotos, thumbnailUrl, deletePhotos, changeMatte } from "@/lib/api-client";
import { buildMatteId, parseMatteId } from "@/lib/matte";
import ErrorBanner from "@/components/ErrorBanner";
import ConfirmDialog from "@/components/ConfirmDialog";
import PhotoTile, { PhotoTileSkeleton } from "@/components/library/PhotoTile";
import SelectionInspector, { SelectionHint, Spinner } from "@/components/library/SelectionInspector";
import type { ApplyProgress } from "@/components/library/SelectionInspector";
import MobileSelectionBar from "@/components/library/MobileSelectionBar";
import BottomSheet from "@/components/library/BottomSheet";
import { plural } from "@/components/library/plural";

interface ManageStepProps {
  tv: DiscoveredTV;
  /** Called whenever the number of photos on the TV is known or changes. */
  onPhotoCount?: (n: number) => void;
  /** Switch the shell to the "Add photos" view. */
  onAddPhotos?: () => void;
}

type Filter = "all" | "matte" | "none";
type ApiErr = { error: string; hint: string };

/** Pending (not yet applied) matte, tied to the photo it was initialised from. */
interface PendingMatte {
  forId: string;
  type: MatteTypeId;
  color: MatteColorId;
}

const NETWORK_ERROR: ApiErr = {
  error: "Could not reach the app server",
  hint: "Check that this device is still on the same network, then try again.",
};

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const hasMatte = (p: ArtPhoto) => parseMatteId(p.matte_id).type !== "none";
const normalisedMatteId = (p: ArtPhoto) => {
  const { type, color } = parseMatteId(p.matte_id);
  return buildMatteId(type, color);
};

export default function ManageStep({ tv, onPhotoCount, onAddPhotos }: ManageStepProps) {
  const [photos, setPhotos] = useState<ArtPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiErr | null>(null);
  // True once the photo list has been fetched successfully at least once.
  const [loaded, setLoaded] = useState(false);

  const [filter, setFilter] = useState<Filter>("all");
  // Ordered: the first id is the photo shown in the inspector preview.
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingMatte | null>(null);

  const [progress, setProgress] = useState<ApplyProgress | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<ApiErr | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const asideTitleId = useId();
  const sheetTitleId = useId();

  const onPhotoCountRef = useRef(onPhotoCount);
  onPhotoCountRef.current = onPhotoCount;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listPhotos(tv.id);
      if (!res.ok) {
        setLoadError({ error: res.error, hint: res.hint });
      } else {
        const list = res.data.photos;
        setPhotos(list);
        const ids = new Set(list.map((p) => p.content_id));
        setSelected((prev) => prev.filter((id) => ids.has(id)));
        setLoaded(true);
      }
    } catch {
      setLoadError(NETWORK_ERROR);
    }
    setLoading(false);
  }, [tv.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loaded) onPhotoCountRef.current?.(photos.length);
  }, [loaded, photos.length]);

  // The sheet only makes sense while something is selected.
  useEffect(() => {
    if (selected.length === 0) setSheetOpen(false);
  }, [selected.length]);

  // The sheet is phone-only; close it if the viewport grows past `sm`.
  useEffect(() => {
    if (!sheetOpen) return;
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = () => {
      if (mq.matches) setSheetOpen(false);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [sheetOpen]);

  const byId = useMemo(() => new Map(photos.map((p) => [p.content_id, p])), [photos]);
  const positionById = useMemo(
    () => new Map(photos.map((p, i) => [p.content_id, i + 1])),
    [photos]
  );
  const withMatteCount = useMemo(() => photos.filter(hasMatte).length, [photos]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? photos
        : photos.filter((p) => (filter === "matte" ? hasMatte(p) : !hasMatte(p))),
    [photos, filter]
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Pending matte: whatever the user picked for the current first photo, or
  // else that photo's current matte. Nothing is written to `photos` until the
  // TV confirms, so cancelling never leaves a stale matte on a tile.
  const firstPhoto = selected.length > 0 ? byId.get(selected[0]) : undefined;
  const current = firstPhoto ? parseMatteId(firstPhoto.matte_id) : null;
  const pendingType = pending && pending.forId === firstPhoto?.content_id ? pending.type : current?.type ?? "none";
  const pendingColor = pending && pending.forId === firstPhoto?.content_id ? pending.color : current?.color ?? "polar";
  const pendingId = buildMatteId(pendingType, pendingColor);
  const alreadyApplied =
    selected.length > 0 &&
    selected.every((id) => {
      const p = byId.get(id);
      return p ? normalisedMatteId(p) === pendingId : true;
    });

  const applying = progress !== null;
  const busy = applying || deleting;

  const toggleSelected = useCallback((contentId: string) => {
    setNotice(null);
    setSelected((prev) =>
      prev.includes(contentId) ? prev.filter((id) => id !== contentId) : [...prev, contentId]
    );
  }, []);

  const clearSelection = () => {
    setSelected([]);
    setPending(null);
    setActionError(null);
  };

  const setPendingType = (type: MatteTypeId) => {
    if (firstPhoto) setPending({ forId: firstPhoto.content_id, type, color: pendingColor });
  };
  const setPendingColor = (color: MatteColorId) => {
    if (firstPhoto) setPending({ forId: firstPhoto.content_id, type: pendingType, color });
  };

  // changeMatte is per photo: apply one at a time, update each tile as the TV
  // confirms it, and keep only the failures selected so they can be retried.
  const handleApply = async () => {
    if (busy || selected.length === 0) return;
    const ids = [...selected];
    const matteId = pendingId;
    const type = pendingType;
    const color = pendingColor;
    const failed: string[] = [];
    let lastErr: ApiErr | null = null;

    setActionError(null);
    setNotice(null);
    for (let i = 0; i < ids.length; i++) {
      setProgress({ current: i + 1, total: ids.length });
      const id = ids[i];
      try {
        const res = await changeMatte(tv.id, id, matteId);
        if (res.ok) {
          setPhotos((prev) => prev.map((p) => (p.content_id === id ? { ...p, matte_id: matteId } : p)));
        } else {
          failed.push(id);
          lastErr = { error: res.error, hint: res.hint };
        }
      } catch {
        failed.push(id);
        lastErr = NETWORK_ERROR;
      }
    }
    setProgress(null);

    if (failed.length > 0) {
      setSelected(failed);
      // Keep the chosen matte for the retry even though the first photo changed.
      setPending({ forId: failed[0], type, color });
      const which = failed.length === ids.length ? "None of the" : `${failed.length} of ${ids.length}`;
      setActionError({
        error: `${which} ${ids.length === 1 ? "photo" : "photos"} could not be changed. ${
          failed.length === 1 ? "It is" : "They are"
        } still selected so you can try again.`,
        hint: lastErr ? [lastErr.error, lastErr.hint].filter(Boolean).join(" ") : "",
      });
    } else {
      setSelected([]);
      setPending(null);
      setNotice(`Matte applied to ${plural(ids.length, "photo")}.`);
    }
  };

  const handleDelete = async () => {
    if (selected.length === 0) return;
    const ids = [...selected];
    setDeleting(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await deletePhotos(tv.id, ids);
      if (!res.ok) {
        setActionError({ error: res.error, hint: res.hint });
      } else {
        const gone = new Set(ids);
        setPhotos((prev) => prev.filter((p) => !gone.has(p.content_id)));
        setSelected([]);
        setPending(null);
        setNotice(`Deleted ${plural(ids.length, "photo")} from the TV.`);
      }
    } catch {
      setActionError(NETWORK_ERROR);
    }
    setDeleting(false);
    setConfirmDelete(false);
  };

  const openDelete = () => {
    setActionError(null);
    setConfirmDelete(true);
  };

  const inspectorProps = firstPhoto
    ? {
        count: selected.length,
        previewUrl: thumbnailUrl(tv.id, firstPhoto.content_id),
        matteType: pendingType,
        matteColor: pendingColor,
        onTypeChange: setPendingType,
        onColorChange: setPendingColor,
        alreadyApplied,
        progress,
        deleting,
        error: actionError,
        onDismissError: () => setActionError(null),
        onApply: handleApply,
        onDelete: openDelete,
        onClear: clearSelection,
      }
    : null;

  const showSkeleton = loading && !loaded;
  const showInitialError = !loading && !loaded && loadError !== null;
  const isEmpty = loaded && photos.length === 0;
  const hasSelection = selected.length > 0;
  const total = photos.length;

  return (
    <div className={`flex flex-wrap items-start gap-8 ${hasSelection ? "pb-20 sm:pb-0" : ""}`}>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4 sm:gap-5">
        {/* Heading, filters, refresh */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="m-0 font-display text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-[28px]">
              On the TV
            </h1>
            <p className="m-0 mt-0.5 text-muted sm:mt-1">
              {loaded ? (
                <>
                  {plural(total, "photo")} in Art Mode
                  <span className="hidden sm:inline">, shown the way the TV frames them</span>
                </>
              ) : loading ? (
                "Loading photos from the TV…"
              ) : (
                "Photos in Art Mode, shown the way the TV frames them"
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {loaded && total > 0 && (
              <div role="group" aria-label="Filter photos" className="flex flex-wrap gap-2">
                <FilterChip label="All" count={total} active={filter === "all"} onClick={() => setFilter("all")} />
                <FilterChip
                  label="With matte"
                  count={withMatteCount}
                  active={filter === "matte"}
                  onClick={() => setFilter("matte")}
                />
                <FilterChip
                  label="No matte"
                  count={total - withMatteCount}
                  active={filter === "none"}
                  onClick={() => setFilter("none")}
                />
              </div>
            )}
            <button
              type="button"
              onClick={load}
              disabled={loading || busy}
              aria-label={loading ? "Refreshing from TV" : "Refresh from TV"}
              title="Refresh from TV"
              className={`flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:border-muted disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:w-9 ${FOCUS}`}
            >
              {loading ? (
                <Spinner />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                  <path d="M20 4v7h-7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <p role="status" className={notice ? "m-0 text-sm font-medium text-success" : "sr-only"}>
          {notice ?? ""}
        </p>

        {loadError && (
          <div className="flex flex-col gap-3">
            <ErrorBanner
              error={loadError.error}
              hint={loadError.hint}
              onDismiss={loaded ? () => setLoadError(null) : undefined}
            />
            {showInitialError && (
              <div>
                <button
                  type="button"
                  onClick={load}
                  className={`min-h-[44px] rounded-[10px] bg-ink px-5 font-semibold text-white hover:bg-black ${FOCUS}`}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Phone: action errors normally show inside the sheet; when it is
            closed (e.g. delete from the selection bar) show them here. */}
        {actionError && !sheetOpen && (
          <div className="sm:hidden">
            <ErrorBanner
              error={actionError.error}
              hint={actionError.hint}
              onDismiss={() => setActionError(null)}
            />
          </div>
        )}

        {showSkeleton && (
          <div aria-busy="true" aria-label="Loading photos" className={GRID}>
            {Array.from({ length: 8 }, (_, i) => (
              <PhotoTileSkeleton key={i} />
            ))}
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-muted" aria-hidden="true">
              <rect x="3" y="5" width="18" height="13" rx="1" />
              <path d="M9 21h6" />
            </svg>
            <h2 className="m-0 font-display text-lg font-semibold text-ink">No photos on this TV yet</h2>
            <p className="m-0 max-w-sm text-sm text-muted">
              Photos you add show up here in Art Mode, framed the way the TV will show them.
            </p>
            {onAddPhotos && (
              <button
                type="button"
                onClick={onAddPhotos}
                className={`mt-1 min-h-[44px] rounded-[10px] bg-ink px-5 font-semibold text-white hover:bg-black ${FOCUS}`}
              >
                Add photos
              </button>
            )}
          </div>
        )}

        {loaded && total > 0 && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-6 py-12 text-center">
            <p className="m-0 text-sm text-muted">
              {filter === "matte" ? "None of the photos on this TV have a matte." : "Every photo on this TV has a matte."}
            </p>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`min-h-[44px] rounded-[10px] border border-line-strong bg-surface px-5 font-semibold text-ink hover:border-muted ${FOCUS}`}
            >
              Show all photos
            </button>
          </div>
        )}

        {loaded && visible.length > 0 && (
          <div className={GRID}>
            {visible.map((photo) => (
              <PhotoTile
                key={photo.content_id}
                tvId={tv.id}
                photo={photo}
                position={positionById.get(photo.content_id) ?? 0}
                selected={selectedSet.has(photo.content_id)}
                disabled={busy}
                onToggle={toggleSelected}
              />
            ))}
          </div>
        )}
      </div>

      {/* Inspector: side column on wide screens, stacks below when narrow.
          Phones use the selection bar + bottom sheet instead. */}
      {loaded && total > 0 && (
        <aside
          aria-label="Selection"
          className="hidden max-w-[400px] flex-[1_1_340px] flex-col rounded-[14px] border border-line bg-surface p-6 sm:flex lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
        >
          {inspectorProps ? (
            <SelectionInspector titleId={asideTitleId} {...inspectorProps} />
          ) : (
            <SelectionHint />
          )}
        </aside>
      )}

      {/* Rendered before the sheet so, when both close in the same commit
          (successful delete from the sheet), the dialog restores body
          overflow first and the sheet's restore wins. */}
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${plural(selected.length, "photo")} from this TV?`}
        body="They are removed from Art Mode on the TV. This can't be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {hasSelection && !sheetOpen && (
        <MobileSelectionBar
          count={selected.length}
          progress={progress}
          busy={busy}
          onChangeMatte={() => setSheetOpen(true)}
          onDelete={openDelete}
        />
      )}

      <BottomSheet
        open={sheetOpen && inspectorProps !== null}
        labelledBy={sheetTitleId}
        onClose={() => setSheetOpen(false)}
        busy={busy}
        suspended={confirmDelete}
      >
        {inspectorProps && (
          <SelectionInspector
            titleId={sheetTitleId}
            {...inspectorProps}
            headerExtra={
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                disabled={busy}
                aria-label="Close"
                className={`flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-ground disabled:opacity-50 ${FOCUS}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            }
          />
        )}
      </BottomSheet>
    </div>
  );
}

const GRID =
  "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-x-5 sm:gap-y-6";

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-[44px] rounded-full border px-4 font-medium sm:min-h-[36px] sm:px-3.5 ${FOCUS} ${
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:border-muted"
      }`}
    >
      {label} <span className={active ? "" : "text-muted"}>{count}</span>
    </button>
  );
}
