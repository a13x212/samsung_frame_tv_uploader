"use client";

import { useState, useCallback } from "react";
import type { DiscoveredTV } from "@/lib/types";
import { discoverTvs } from "@/lib/api-client";

export function useTvDiscovery() {
  const [tvs, setTvs] = useState<DiscoveredTV[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<{ error: string; hint: string } | null>(null);

  const scanTvs = useCallback(async () => {
    setIsScanning(true);
    setError(null);

    const result = await discoverTvs();
    setIsScanning(false);

    if (!result.ok) {
      setError({ error: result.error, hint: result.hint });
      return;
    }

    setTvs(result.data.tvs);

    if (result.data.tvs.length === 0) {
      setError({
        error: "No Frame TVs found",
        hint: "Make sure your TV is on and connected to the same Wi-Fi network.",
      });
    }
  }, []);

  return { tvs, setTvs, isScanning, error, setError, scanTvs };
}
