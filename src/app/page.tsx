"use client";

import { useState, useEffect } from "react";
import type { DiscoveredTV, TvConnection, UploadJob } from "@/lib/types";
import { getSession } from "@/lib/api-client";
import DiscoverStep from "@/components/steps/DiscoverStep";
import PairStep from "@/components/steps/PairStep";
import UploadStep from "@/components/steps/UploadStep";

export type AppStep = "discover" | "pair" | "upload";

export interface AppState {
  step: AppStep;
  tvs: DiscoveredTV[];
  selectedTv: DiscoveredTV | null;
  connection: TvConnection | null;
  uploadJobs: UploadJob[];
}

export default function Home() {
  const [state, setState] = useState<AppState>({
    step: "discover",
    tvs: [],
    selectedTv: null,
    connection: null,
    uploadJobs: [],
  });

  const setStep = (step: AppStep) =>
    setState((s) => ({ ...s, step }));

  const setTvs = (tvs: DiscoveredTV[]) =>
    setState((s) => ({ ...s, tvs }));

  const selectTv = (tv: DiscoveredTV) =>
    setState((s) => ({ ...s, selectedTv: tv, step: "pair" }));

  const setConnection = (connection: TvConnection | null) =>
    setState((s) => ({ ...s, connection }));

  const setUploadJobs = (jobs: UploadJob[]) =>
    setState((s) => ({ ...s, uploadJobs: jobs }));

  const goToDiscover = () =>
    setState((s) => ({
      ...s,
      step: "discover",
      selectedTv: null,
      connection: null,
      uploadJobs: [],
    }));

  // Restore session on mount — skip discover/pair if a TV is already paired
  useEffect(() => {
    getSession().then((res) => {
      if (!res.ok) return;
      const { tvs, connections } = res.data;
      const pairedConn = connections.find((c) => c.status === "paired");
      if (!pairedConn) return;
      const tv = tvs.find((t) => t.id === pairedConn.tvId);
      if (!tv) return;
      setState((s) => ({
        ...s,
        tvs,
        selectedTv: tv,
        connection: pairedConn,
        step: "upload",
      }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-start py-12 px-4">
      {/* Header */}
      <header className="w-full max-w-2xl mb-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3.75 3h16.5M4.5 3v18M19.5 3v18"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 leading-tight">
              Frame TV Uploader
            </h1>
            <p className="text-sm text-slate-500">
              Upload photos to your Samsung Frame TV
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={state.step} />
      </header>

      {/* Step content */}
      <div className="w-full max-w-2xl">
        {state.step === "discover" && (
          <DiscoverStep
            tvs={state.tvs}
            onTvsFound={setTvs}
            onSelectTv={selectTv}
          />
        )}
        {state.step === "pair" && state.selectedTv && (
          <PairStep
            tv={state.selectedTv}
            connection={state.connection}
            onConnectionUpdate={setConnection}
            onPaired={() => setStep("upload")}
            onCancel={goToDiscover}
          />
        )}
        {state.step === "upload" && state.selectedTv && (
          <UploadStep
            tv={state.selectedTv}
            connection={state.connection}
            uploadJobs={state.uploadJobs}
            onUploadJobsUpdate={setUploadJobs}
            onDisconnect={goToDiscover}
          />
        )}
      </div>
    </main>
  );
}

function StepIndicator({ currentStep }: { currentStep: AppStep }) {
  const steps: { id: AppStep; label: string }[] = [
    { id: "discover", label: "Find TV" },
    { id: "pair", label: "Connect" },
    { id: "upload", label: "Upload" },
  ];

  const currentIdx = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-2 mt-4">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 ${
              idx < currentIdx
                ? "text-blue-600"
                : idx === currentIdx
                ? "text-blue-700 font-medium"
                : "text-slate-400"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold ${
                idx < currentIdx
                  ? "bg-blue-600 text-white"
                  : idx === currentIdx
                  ? "bg-blue-700 text-white"
                  : "bg-slate-200 text-slate-400"
              }`}
            >
              {idx < currentIdx ? "✓" : idx + 1}
            </span>
            <span className="text-sm">{step.label}</span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`h-px w-8 ${
                idx < currentIdx ? "bg-blue-400" : "bg-slate-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
