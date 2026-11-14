"use client";

import { useEffect } from "react";

const carriesFiles = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

/**
 * Stops the browser opening a file that is dropped outside a real drop target
 * (which would navigate away and lose queued photos).
 *
 * The listeners are on window in the bubble phase, so they run after React's
 * handlers (attached at the document). A drop target that accepted the drag
 * has already called preventDefault(), and is left alone. Anything else that
 * carries files is cancelled with dropEffect "none", so the cursor shows the
 * drop is not accepted and no drop happens. Text and other non-file drags are
 * not touched.
 */
export function useBlockStrayFileDrops() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.defaultPrevented || !carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    const onDrop = (e: DragEvent) => {
      if (e.defaultPrevented || !carriesFiles(e)) return;
      e.preventDefault();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
