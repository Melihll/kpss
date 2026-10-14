import { useCallback, useEffect, useState } from "react";
import { callAppApi } from "../lib/app-api";
import type { RoadmapResponse } from "../lib/roadmap";

// Reads and retries never initialize a strategy or generate a plan.
export function useRoadmap(options: { enabled?: boolean } = {}) {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (options.enabled === false) return;
    setLoading(true);
    try {
      const value = await callAppApi<RoadmapResponse>("/p48/roadmap");
      setData(value);
      setError(false);
    } catch (caught) {
      console.error("ROADMAP_LOAD_FAILED", caught);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [options.enabled]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    return () => window.removeEventListener("kpss:execution-changed", refresh);
  }, [load]);

  return { data, loading, error, retry: load };
}
