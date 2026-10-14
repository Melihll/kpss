import { useCallback, useEffect, useRef, useState } from "react";
import { AppApiError, callAppApi } from "../lib/app-api";
import { supabase } from "../lib/supabase";
import type { WeeklyStudyView } from "../lib/weekly-study-view";

// No retained data from a different week/account, and no late response can replace a newer read.
export function useWeeklyStudyView(week?: string) {
  const [state, setState] = useState<{ data: WeeklyStudyView | null; loading: boolean; error: string | null; key: string | undefined }>({ data: null, loading: true, error: null, key: week });
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setState({ data: null, loading: true, error: null, key: week });
    try {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) throw new AppApiError("UNAUTHORIZED", "Oturum bulunamadı.");
      const data = await callAppApi<WeeklyStudyView>(`/week/view${week ? `?weekStart=${encodeURIComponent(week)}` : ""}`, { method: "GET", expectedUserId: userId });
      const latest = await supabase.auth.getSession();
      if (request !== sequence.current || latest.data.session?.user.id !== userId) return;
      if (data.contractVersion !== "weekly-study-view-v1" || (week && data.weekStart !== week)) throw new AppApiError("WEEK_VIEW_UNAVAILABLE", "Haftalık veri doğrulanamadı.");
      setState({ data, loading: false, error: null, key: week });
    } catch (error) {
      if (request === sequence.current) setState({ data: null, loading: false, error: error instanceof AppApiError ? error.code : "WEEK_VIEW_FAILED", key: week });
    }
  }, [week]);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    window.addEventListener("focus", refresh);
    const auth = supabase.auth.onAuthStateChange(event => { if (["SIGNED_OUT", "SIGNED_IN", "USER_UPDATED"].includes(event)) { sequence.current++; setState({ data: null, loading: true, error: null, key: week }); window.setTimeout(refresh, 0); } });
    return () => { sequence.current++; auth.data.subscription.unsubscribe(); window.removeEventListener("kpss:execution-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [load, week]);
  return { ...(state.key === week ? state : { data: null, loading: true, error: null }), retry: load };
}
