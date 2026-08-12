import { useCallback, useEffect, useRef, useState } from "react";
import { callAppApi } from "../lib/app-api";
import type { RoadmapResponse } from "../lib/roadmap";

export function useRoadmap(options: { ensureWeek?: boolean } = {}) {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const preparing = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let value = await callAppApi<RoadmapResponse>("/p48/roadmap");
      if (!value.configured && !preparing.current) {
        preparing.current = true;
        const response = await callAppApi<{ roadmap: RoadmapResponse }>("/p48/bootstrap", { method: "POST" });
        value = response.roadmap;
      }
      if (options.ensureWeek && value.configured && !value.currentWeek?.plan && !preparing.current) {
        preparing.current = true;
        await callAppApi("/p48/week/generate", { method: "POST" });
        value = await callAppApi<RoadmapResponse>("/p48/roadmap");
      }
      setData(value);
      setError(false);
    } catch (caught) {
      console.error("ROADMAP_LOAD_FAILED", caught);
      setError(true);
    } finally {
      preparing.current = false;
      setLoading(false);
    }
  }, [options.ensureWeek]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, retry: load };
}
