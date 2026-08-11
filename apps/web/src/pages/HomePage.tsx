import { calculateWeeklyAvailableMinutes, countTopicProgress, type ExamProfile, type TopicProgressState, type WeeklyAvailability } from "@kpss-coach/domain";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";
import { P48RoadmapPanel } from "../components/P48RoadmapPanel";
import { ExecutionPanel } from "../components/ExecutionPanel";
import { RevisionPanel } from "../components/RevisionPanel";
import { TopicPerformancePanel } from "../components/TopicPerformancePanel";
import { AdaptivePlanningPanel } from "../components/AdaptivePlanningPanel";
import { WeeklyReportPanel } from "../components/WeeklyReportPanel";
import { Icon, type IconName } from "../components/Icon";

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

const NAV_ITEMS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "#overview", label: "Ana Sayfa", icon: "home" },
  { href: "#plan", label: "Planım", icon: "calendar" },
  { href: "#study", label: "Çalışmalar", icon: "timer" },
  { href: "#revisions", label: "Tekrarlar", icon: "repeat" },
  { href: "#performance", label: "Performans", icon: "chart" },
  { href: "#profile", label: "Kaynaklar & Profil", icon: "book" },
];

function minutesLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
}

export function HomePage() {
  const { user, signOut } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [hasActiveProfile, setHasActiveProfile] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    const refreshProfile = () => setProfileVersion((value) => value + 1);
    window.addEventListener("kpss:profile-changed", refreshProfile);
    return () => window.removeEventListener("kpss:profile-changed", refreshProfile);
  }, []);

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
        const { data: examData, error: examError } = await supabase.from("exams").select("name").eq("id", editionResult.data.exam_id).single();
        if (examError) throw examError;
        const resourceIds = (resourcesResult.data ?? []).map((resource) => resource.id);
        let resourceUnitCount = 0;
        if (resourceIds.length) {
          const { count, error: unitsError } = await supabase.from("resource_units").select("id", { count: "exact", head: true }).in("resource_id", resourceIds);
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
  }, [user, profileVersion]);

  const displayName = useMemo(() => {
    const metadataName = typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
    if (metadataName) return metadataName;
    return user?.email?.split("@")[0] ?? "Öğrenci";
  }, [user]);

  const totalTopics = dashboard ? dashboard.completed + dashboard.inProgress + dashboard.remaining : 0;
  const topicProgress = dashboard && totalTopics > 0 ? Math.round(((dashboard.completed + dashboard.inProgress * 0.5) / totalTopics) * 100) : 0;
  const formattedDate = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long" }).format(new Date());

  if (hasActiveProfile === false) {
    return <main className="empty-onboarding-screen">
      <div className="empty-onboarding-card">
        <div className="brand-mark large"><Icon name="target" /></div>
        <span className="eyebrow">KPSS KOÇU</span>
        <h1>Çalışma alanını hazırlayalım.</h1>
        <p>Derslerini, haftalık zamanını ve kullandığın kaynakları bir kez tanımla. Sonrasında koçun sana her gün en değerli sonraki adımı söylesin.</p>
        <Link className="button-link primary-action" to="/onboarding">Kurulumu Başlat</Link>
      </div>
    </main>;
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark"><Icon name="target" /></span>
          <div><strong>KPSS Koçu</strong><small>Çalışma paneli</small></div>
        </div>
        <nav className="sidebar-nav" aria-label="Dashboard menüsü">
          {NAV_ITEMS.map((item, index) => <a className={index === 0 ? "active" : ""} href={item.href} key={item.href}><Icon name={item.icon} /><span>{item.label}</span></a>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-profile">
          <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{displayName}</strong><small>{user?.email}</small></div>
        </div>
        <button className="sidebar-signout" type="button" onClick={() => void signOut()}><Icon name="logout" />Çıkış Yap</button>
      </aside>

      <div className="app-stage">
        <header className="dashboard-topbar">
          <div>
            <span className="eyebrow">{formattedDate}</span>
            <h1>Merhaba {displayName} <span aria-hidden="true">👋</span></h1>
            <p>Bugünün planını netleştir, tek işe odaklan ve ilerlemeyi sisteme bırak.</p>
          </div>
          <div className="topbar-actions">
            <a className="focus-pill" href="#plan"><Icon name="target" />Şimdi Ne Yapmalıyım?</a>
            <Link className="icon-button" to="/onboarding" aria-label="Çalışma profilini düzenle"><Icon name="settings" /></Link>
            <span className="topbar-avatar" title={user?.email}>{displayName.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>

        <nav className="mobile-dashboard-nav" aria-label="Mobil dashboard menüsü">
          {NAV_ITEMS.map((item) => <a href={item.href} key={item.href}><Icon name={item.icon} />{item.label}</a>)}
        </nav>

        <main className="dashboard-content" id="overview">
          {error && <div className="error banner" role="alert">{error}</div>}
          {hasActiveProfile === null && <div className="dashboard-skeleton"><span /><span /><span /><span /></div>}

          {hasActiveProfile && dashboard && <>
            <section className="overview-grid" aria-label="Çalışma özeti">
              <article className="overview-card purple">
                <div className="overview-icon"><Icon name="timer" /></div>
                <div><small>Haftalık kapasite</small><strong>{minutesLabel(dashboard.weeklyMinutes)}</strong><span>Planlama için kullanılabilir zaman</span></div>
              </article>
              <article className="overview-card blue">
                <div className="overview-icon"><Icon name="book" /></div>
                <div><small>Aktif dersler</small><strong>{dashboard.subjectCount}</strong><span>{dashboard.examName}</span></div>
              </article>
              <article className="overview-card green">
                <div className="overview-icon"><Icon name="chart" /></div>
                <div><small>Müfredat ilerlemesi</small><strong>%{topicProgress}</strong><span>{dashboard.completed} tamamlandı · {dashboard.inProgress} devam</span></div>
              </article>
              <article className="overview-card orange">
                <div className="overview-icon"><Icon name="spark" /></div>
                <div><small>Aktif kaynaklar</small><strong>{dashboard.activeResources}</strong><span>{dashboard.resourceUnits} çalışma birimi</span></div>
              </article>
            </section>

            <div id="plan" className="section-anchor roadmap-anchor"><P48RoadmapPanel /></div>

            <div className="dashboard-grid secondary-dashboard-grid">
              <div className="dashboard-primary-column">
                <div id="study" className="section-anchor"><ExecutionPanel /></div>
                <div id="performance" className="section-anchor"><TopicPerformancePanel /></div>
              </div>

              <aside className="dashboard-side-column">
                <WeeklyReportPanel />
                <div id="revisions" className="section-anchor"><RevisionPanel /></div>
                <AdaptivePlanningPanel />
                <section className="profile-summary-card" id="profile">
                  <div className="panel-heading"><div><span className="panel-kicker">ÇALIŞMA PROFİLİ</span><h2>{dashboard.examName}</h2></div><Link to="/onboarding">Düzenle</Link></div>
                  <div className="profile-metrics">
                    <div><span>Seçilen ders</span><strong>{dashboard.subjectCount}</strong></div>
                    <div><span>Haftalık süre</span><strong>{minutesLabel(dashboard.weeklyMinutes)}</strong></div>
                    <div><span>Eksik konu</span><strong>{dashboard.remaining}</strong></div>
                    <div><span>Kaynak unit</span><strong>{dashboard.resourceUnits}</strong></div>
                  </div>
                  <div className="profile-progress"><span><i style={{ width: `${topicProgress}%` }} /></span><small>Müfredat ilerleme skoru %{topicProgress}</small></div>
                </section>
              </aside>
            </div>
          </>}
        </main>
      </div>
    </div>
  );
}
