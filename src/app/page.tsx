"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveredTV, TvConnection, UploadJob } from "@/lib/types";
import { disconnectTv, getSession } from "@/lib/api-client";
import DiscoverStep from "@/components/steps/DiscoverStep";
import PairStep from "@/components/steps/PairStep";
import UploadStep from "@/components/steps/UploadStep";
import ManageStep from "@/components/steps/ManageStep";
import ConfirmDialog from "@/components/ConfirmDialog";
import ErrorBanner from "@/components/ErrorBanner";
import AppHeader from "@/components/shell/AppHeader";
import SetupHeader from "@/components/shell/SetupHeader";
import BottomTabBar from "@/components/shell/BottomTabBar";
import LoadingScreen from "@/components/shell/LoadingScreen";
import { isKnownTv, rememberTv } from "@/components/shell/known-tvs";
import type { AppView, SetupStep } from "@/components/shell/types";
import { useBlockStrayFileDrops } from "@/hooks/useBlockStrayFileDrops";

type Mode = "loading" | "setup" | "app";

/** Content column shared by both modes (mockups: max 1376px, 32px gutters). */
const CONTENT = "mx-auto w-full max-w-content px-4 py-5 sm:p-8";

export default function Home() {
  const [mode, setMode] = useState<Mode>("loading");
  const [setupStep, setSetupStep] = useState<SetupStep>("discover");
  const [view, setView] = useState<AppView>("library");

  const [tvs, setTvs] = useState<DiscoveredTV[]>([]);
  const [selectedTv, setSelectedTv] = useState<DiscoveredTV | null>(null);
  const [connection, setConnection] = useState<TvConnection | null>(null);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [photoCount, setPhotoCount] = useState<number | null>(null);

  // Library is kept mounted while hidden; remount it after new uploads so it
  // shows them the next time it is opened.
  const [libraryKey, setLibraryKey] = useState(0);
  const libraryStaleRef = useRef(false);
  const doneCountRef = useRef(0);

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [shellError, setShellError] = useState<{ error: string; hint: string } | null>(null);

  // A file dropped outside the Add photos drop area must not open in the tab.
  useBlockStrayFileDrops();

  // Restore session on mount. Until it resolves we show a neutral loading
  // screen, never the Discover screen.
  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) return setMode("setup");
        const { tvs: knownTvs, connections } = res.data;
        setTvs(knownTvs);
        const paired = connections.find((c) => c.status === "paired");
        const tv = paired && knownTvs.find((t) => t.id === paired.tvId);
        if (!paired || !tv) return setMode("setup");
        rememberTv(tv.id);
        setSelectedTv(tv);
        setConnection(paired);
        setView("library");
        setMode("app");
      })
      .catch(() => {
        if (!cancelled) setMode("setup");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectTv = (tv: DiscoveredTV) => {
    setSelectedTv(tv);
    setConnection(null);
    setSetupStep("pair");
  };

  const backToDiscover = () => {
    setSelectedTv(null);
    setConnection(null);
    setSetupStep("discover");
  };

  const handlePaired = () => {
    if (!selectedTv) return;
    const returning = isKnownTv(selectedTv.id);
    rememberTv(selectedTv.id);
    setPhotoCount(null);
    setView(returning ? "library" : "add");
    setMode("app");
  };

  const handleUploadJobsUpdate = useCallback((jobs: UploadJob[]) => {
    setUploadJobs(jobs);
    const done = jobs.filter((j) => j.phase === "done").length;
    if (done > doneCountRef.current) libraryStaleRef.current = true;
    doneCountRef.current = done;
  }, []);

  const changeView = useCallback((next: AppView) => {
    if (next === "library" && libraryStaleRef.current) {
      libraryStaleRef.current = false;
      setLibraryKey((k) => k + 1);
    }
    setView(next);
  }, []);

  const handleDisconnectConfirmed = async () => {
    if (!selectedTv) return;
    setDisconnecting(true);
    try {
      const res = await disconnectTv(selectedTv.id);
      if (!res.ok) {
        setShellError({ error: res.error, hint: res.hint });
        return;
      }
      setConfirmDisconnect(false);
      setUploadJobs([]);
      doneCountRef.current = 0;
      libraryStaleRef.current = false;
      setPhotoCount(null);
      setShellError(null);
      backToDiscover();
      setMode("setup");
    } catch {
      setShellError({
        error: "Couldn't disconnect",
        hint: "Check that this device can reach the app, then try again.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (mode === "loading") return <LoadingScreen />;

  if (mode === "setup") {
    return (
      <div className="min-h-screen">
        <SetupHeader
          step={setupStep}
          tvName={selectedTv?.name}
          onCancel={setupStep === "pair" ? backToDiscover : undefined}
        />
        <main className={CONTENT}>
          {setupStep === "discover" && (
            <DiscoverStep tvs={tvs} onTvsFound={setTvs} onSelectTv={selectTv} />
          )}
          {setupStep === "pair" && selectedTv && (
            <PairStep
              tv={selectedTv}
              connection={connection}
              onConnectionUpdate={setConnection}
              onPaired={handlePaired}
              onCancel={backToDiscover}
            />
          )}
        </main>
      </div>
    );
  }

  // App mode: a TV is paired.
  if (!selectedTv) return <LoadingScreen />;

  return (
    <div className="min-h-screen">
      <AppHeader
        tv={selectedTv}
        view={view}
        photoCount={photoCount}
        onViewChange={changeView}
        onDisconnect={() => {
          setShellError(null);
          setConfirmDisconnect(true);
        }}
      />

      {/* Bottom padding on phones keeps content clear of the fixed tab bar. */}
      <main className={`${CONTENT} pb-[calc(60px+env(safe-area-inset-bottom)+24px)] sm:pb-8`}>
        {shellError && !confirmDisconnect && (
          <div className="mb-5">
            <ErrorBanner
              error={shellError.error}
              hint={shellError.hint}
              onDismiss={() => setShellError(null)}
            />
          </div>
        )}

        {/* Both screens stay mounted so switching tabs keeps their state
            (pending files, an upload in progress, selection). */}
        <div hidden={view !== "library"}>
          <ManageStep
            key={`${selectedTv.id}:${libraryKey}`}
            tv={selectedTv}
            onPhotoCount={setPhotoCount}
            onAddPhotos={() => changeView("add")}
          />
        </div>
        <div hidden={view !== "add"}>
          <UploadStep
            key={selectedTv.id}
            tv={selectedTv}
            uploadJobs={uploadJobs}
            onUploadJobsUpdate={handleUploadJobsUpdate}
            onViewLibrary={() => changeView("library")}
          />
        </div>
      </main>

      <BottomTabBar view={view} photoCount={photoCount} onViewChange={changeView} />

      <ConfirmDialog
        open={confirmDisconnect}
        title={`Disconnect from ${selectedTv.name}?`}
        body={
          <>
            <p className="m-0">
              Photos already on the TV stay there. To reconnect, you will need to press
              Allow on the TV remote again.
            </p>
            {shellError && (
              <p className="m-0 mt-3 font-medium text-danger" role="alert">
                {shellError.error}. {shellError.hint}
              </p>
            )}
          </>
        }
        confirmLabel={disconnecting ? "Disconnecting…" : "Disconnect"}
        destructive
        busy={disconnecting}
        onConfirm={handleDisconnectConfirmed}
        onCancel={() => {
          setConfirmDisconnect(false);
          setShellError(null);
        }}
      />
    </div>
  );
}
