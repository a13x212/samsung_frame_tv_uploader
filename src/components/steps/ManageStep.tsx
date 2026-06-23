"use client";

import { useEffect, useState, useCallback } from "react";
import type { DiscoveredTV, ArtPhoto, MatteTypeId, MatteColorId } from "@/lib/types";
import { MATTE_TYPES, MATTE_COLORS } from "@/lib/types";
import { listPhotos, thumbnailUrl, deletePhotos, changeMatte } from "@/lib/api-client";
import ErrorBanner from "@/components/ErrorBanner";

function matteColorStyle(colorId: MatteColorId): string {
  const c = MATTE_COLORS.find((c) => c.id === colorId);
  return c ? `rgb(${c.r},${c.g},${c.b})` : "#000";
}

function buildMatteId(type: MatteTypeId, color: MatteColorId): string {
  return type === "none" ? "none" : `${type}_${color}`;
}

/** Reverse of buildMatteId — "shadowbox_polar" -> { type: "shadowbox", color: "polar" } */
function parseMatteId(matteId?: string): { type: MatteTypeId; color: MatteColorId } {
  if (!matteId || matteId === "none") return { type: "none", color: "polar" };
  const type = MATTE_TYPES.find((t) => matteId === t.id || matteId.startsWith(`${t.id}_`));
  if (!type || type.id === "none") return { type: "none", color: "polar" };
  const colorId = matteId.slice(type.id.length + 1);
  const color = MATTE_COLORS.find((c) => c.id === colorId);
  return { type: type.id, color: color?.id ?? "polar" };
}

interface ManageStepProps {
  tv: DiscoveredTV;
  onBack: () => void;
}

export default function ManageStep({ tv, onBack }: ManageStepProps) {
  const [photos, setPhotos] = useState<ArtPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ error: string; hint: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingMatte, setSavingMatte] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listPhotos(tv.id);
    if (!res.ok) {
      setError({ error: res.error, hint: res.hint });
      setPhotos([]);
    } else {
      setPhotos(res.data.photos);
    }
    setLoading(false);
  }, [tv.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelected = (contentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(contentId)) next.delete(contentId);
      else next.add(contentId);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    const confirmed = window.confirm(
      `Delete ${ids.length} photo${ids.length > 1 ? "s" : ""} from this TV? This can't be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    const res = await deletePhotos(tv.id, ids);
    if (!res.ok) {
      setError({ error: res.error, hint: res.hint });
    } else {
      setPhotos((prev) => prev.filter((p) => !ids.includes(p.content_id)));
      setSelected(new Set());
    }
    setDeleting(false);
  };

  const handleMatteSave = async (contentId: string, type: MatteTypeId, color: MatteColorId) => {
    setSavingMatte(true);
    setError(null);
    const matteId = buildMatteId(type, color);
    const res = await changeMatte(tv.id, contentId, matteId);
    if (!res.ok) {
      setError({ error: res.error, hint: res.hint });
    } else {
      setPhotos((prev) =>
        prev.map((p) => (p.content_id === contentId ? { ...p, matte_id: matteId } : p))
      );
      setEditingId(null);
    }
    setSavingMatte(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 rounded-full bg-green-500" />
          <span className="font-medium text-slate-900">{tv.name}</span>
          <span className="text-xs text-slate-400">Photos on TV</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            onClick={onBack}
            className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            Back to Upload
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner error={error.error} hint={error.hint} onDismiss={() => setError(null)} />
      )}

      {loading && (
        <div className="text-center py-16 text-sm text-slate-400">Loading photos…</div>
      )}

      {!loading && photos.length === 0 && !error && (
        <div className="text-center py-16 text-sm text-slate-400">
          No photos found in Art Mode on this TV.
        </div>
      )}

      {!loading && photos.length > 0 && (
        <>
          {/* Selection bar */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {photos.length} photo{photos.length > 1 ? "s" : ""}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </span>
            {selected.size > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : `Delete ${selected.size}`}
                </button>
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.content_id}
                tvId={tv.id}
                photo={photo}
                isSelected={selected.has(photo.content_id)}
                isEditing={editingId === photo.content_id}
                savingMatte={savingMatte}
                onToggleSelect={() => toggleSelected(photo.content_id)}
                onEdit={() => setEditingId(editingId === photo.content_id ? null : photo.content_id)}
                onMatteSave={(type, color) => handleMatteSave(photo.content_id, type, color)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PhotoCard({
  tvId,
  photo,
  isSelected,
  isEditing,
  savingMatte,
  onToggleSelect,
  onEdit,
  onMatteSave,
}: {
  tvId: string;
  photo: ArtPhoto;
  isSelected: boolean;
  isEditing: boolean;
  savingMatte: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onMatteSave: (type: MatteTypeId, color: MatteColorId) => void;
}) {
  const initial = parseMatteId(photo.matte_id);
  const [matteType, setMatteType] = useState<MatteTypeId>(initial.type);
  const [matteColor, setMatteColor] = useState<MatteColorId>(initial.color);

  return (
    <div className="space-y-1.5">
      <div
        className={`relative aspect-square rounded-xl overflow-hidden bg-slate-100 cursor-pointer transition-all ${
          isSelected ? "ring-2 ring-blue-500 ring-offset-1" : "hover:ring-1 hover:ring-slate-300"
        }`}
        onClick={onToggleSelect}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl(tvId, photo.content_id)}
          alt={photo.content_id}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            isSelected ? "bg-blue-600 border-blue-600" : "bg-black/30 border-white/80"
          }`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute bottom-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center"
          title="Change matte"
        >
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        {matteType !== "none" && (
          <span
            className="absolute bottom-1.5 left-1.5 w-3 h-3 rounded-full border border-white/70"
            style={{ background: matteColorStyle(matteColor) }}
          />
        )}
      </div>

      {isEditing && (
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2">
          <div className="grid grid-cols-4 gap-1">
            {MATTE_TYPES.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMatteType(opt.id)}
                title={opt.label}
                className={`aspect-square rounded-md border text-[8px] font-medium flex items-center justify-center transition-all ${
                  matteType === opt.id
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {opt.label.slice(0, 3)}
              </button>
            ))}
          </div>
          {matteType !== "none" && (
            <div className="flex flex-wrap gap-1">
              {MATTE_COLORS.map((c) => (
                <button
                  key={c.id}
                  title={c.label}
                  onClick={() => setMatteColor(c.id)}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    matteColor === c.id ? "border-blue-500 scale-110" : "border-transparent"
                  }`}
                  style={{ background: `rgb(${c.r},${c.g},${c.b})` }}
                />
              ))}
            </div>
          )}
          <button
            onClick={() => onMatteSave(matteType, matteColor)}
            disabled={savingMatte}
            className="w-full text-[10px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md py-1 transition-colors disabled:opacity-50"
          >
            {savingMatte ? "Saving…" : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
