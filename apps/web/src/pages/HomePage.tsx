import { calculateWeeklyAvailableMinutes, countTopicProgress, type ExamProfile, type TopicProgressState, type WeeklyAvailability } from "@kpss-coach/domain";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";
import { PlanningPanel } from "../components/PlanningPanel";
import { ExecutionPanel } from "../components/ExecutionPanel";

interface DashboardData {
  examName: string;
  subjectCount: number;
  weeklyMinutes: number;
  completed: number;
  inProgress: number;
  remaining: number;
  activeResources: number;
  resourceUnits: number;
}

export function HomePage() {
  const { user, signOut } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [hasActiveProfile, setHasActiveProfile] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from("exam_profiles")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        if (profileError) throw profileError;
        if (!active) return;
        if (!profileData) {
          setHasActiveProfile(false);
          return;
        }
        const profile = profileData as ExamProfile;
        setHasActiveProfile(true);
        const [editionResult, subjectsResult, availabilityResult, progressResult, resourcesResult] = await Promise.all([
          supabase.from("exam_editions").select("exam_id").eq("id", profile.exam_edition_id).single(),
          supabase.from("user_subjects").select("id", { count: "exact", head: true }).eq("exam_profile_id", profile.id).eq("status", "active"),
          supabase.from("weekly_availability").select("*").eq("exam_profile_id", profile.id).eq("is_active", true),
          supabase.from("topic_progress").select("state").eq("exam_profile_id", profile.id),
          supabase.from("resources").select("id, status").eq("exam_profile_id", profile.id),
        ]);
        if (editionResult.error) throw editionResult.error;
        if (subjectsResult.error) throw subjectsResult.error;
        if (availabilityResult.error) throw availabilityResult.error;
        if (progressResult.error) throw progressResult.error;
        if (resourcesResult.error) throw resourcesResult.error;
        const { data: examData, error: examError } = await supabase
          .from("exams")
          .select("name")
          .eq("id", editionResult.data.exam_id)
          .single();
        if (examError) throw examError;
        const resourceIds = (resourcesResult.data ?? []).map((resource) => resource.id);
        let resourceUnitCount = 0;
        if (resourceIds.length) {
          const { count, error: unitsError } = await supabase
            .from("resource_units")
            .select("id", { count: "exact", head: true })
            .in("resource_id", resourceIds);
          if (unitsError) throw unitsError;
          resourceUnitCount = count ?? 0;
        }
        const counts = countTopicProgress((progressResult.data ?? []).map((row) => row.state as TopicProgressState));
        if (active) setDashboard({
          examName: examData.name,
          subjectCount: subjectsResult.count ?? 0,
          weeklyMinutes: calculateWeeklyAvailableMinutes((availabilityResult.data ?? []) as WeeklyAvailability[]),
          ...counts,
          activeResources: (resourcesResult.data ?? []).filter((resource) => resource.status === "active").length,
          resourceUnits: resourceUnitCount,
        });
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Dashboard yüklenemedi.");
      }
    })();
    return () => { active = false; };
  }, [user]);

  return (
    <main className="card wide">
      <div className="toolbar"><h1>KPSS Koçu</h1><button type="button" onClick={() => void signOut()}>Çıkış Yap</button></div>
      <p>{user?.email}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {hasActiveProfile === null && <p>Dashboard yükleniyor…</p>}
      {hasActiveProfile === false && <section><h2>Çalışma profilinizi oluşturun</h2><p>Henüz aktif bir KPSS hazırlık profiliniz yok.</p><Link className="button-link" to="/onboarding">Onboarding’i Başlat</Link></section>}
      {hasActiveProfile && dashboard && <>
        <ExecutionPanel />
        <PlanningPanel />
        <div className="toolbar"><h2>Çalışma Profili</h2><Link to="/onboarding">Düzenle</Link></div>
        <dl className="stats"><div><dt>Sınav</dt><dd>{dashboard.examName}</dd></div><div><dt>Seçilen ders</dt><dd>{dashboard.subjectCount}</dd></div><div><dt>Haftalık müsait süre</dt><dd>{Math.floor(dashboard.weeklyMinutes / 60)}h {dashboard.weeklyMinutes % 60}m</dd></div></dl>
        <h2>Müfredat</h2><dl className="stats"><div><dt>Tamamlanan</dt><dd>{dashboard.completed}</dd></div><div><dt>Devam eden</dt><dd>{dashboard.inProgress}</dd></div><div><dt>Eksik</dt><dd>{dashboard.remaining}</dd></div></dl>
        <h2>Kaynaklar</h2><dl className="stats"><div><dt>Aktif kaynak</dt><dd>{dashboard.activeResources}</dd></div><div><dt>Toplam resource unit</dt><dd>{dashboard.resourceUnits}</dd></div></dl>
      </>}
    </main>
  );
}
