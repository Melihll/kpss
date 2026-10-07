import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { PageTransition } from "./PageTransition";
import { TopNavigation } from "./TopNavigation";
import { CoachDrawer, type CoachDrawerEntryContext } from "../CoachDrawer";
import { StudyTodayPanel } from "../StudyTodayPanel";

export function AppShell() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const studyRoute = location.pathname === "/" || location.pathname === "/session";
  const focus = location.pathname === "/session";
  const [coachContext, setCoachContext] = useState<CoachDrawerEntryContext | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase.from("exam_profiles").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error("PROFILE_LOAD_FAILED", error);
        setHasProfile(Boolean(data));
      });
    return () => { active = false; };
  }, [user]);

  const displayName = useMemo(() => {
    const value = profile?.display_name?.trim() || (typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "");
    return value || user?.email?.split("@")[0] || "Öğrenci";
  }, [user, profile]);

  if (hasProfile === null) return <main className="shell-skeleton" aria-label="Yükleniyor"><div /><span /><span /><span /></main>;

  if (!hasProfile) return <main className="profile-required"><img className="profile-required-brand" src="/brand/kpss-kocu-mark.svg" width={289} height={304} alt="KPSS Koçu" /><h1>Çalışma profili gerekli.</h1><p>Derslerini, haftalık zamanını ve kaynaklarını tanımla.</p><Link className="primary-action" to="/onboarding">Kurulumu Başlat</Link></main>;

  return <div className="product-shell">
    <a className="product-skip" href="#product-main">İçeriğe geç</a>
    <TopNavigation displayName={displayName} email={user?.email} focus={focus} onCoach={() => setCoachContext("general")} onSignOut={signOut} />
    <main id="product-main" tabIndex={-1} className={`route-stage ${focus ? "is-focus-route" : ""}`}>
      <StudyTodayPanel focus={focus} visible={studyRoute} onCoach={setCoachContext} />
      {!studyRoute && <PageTransition><Outlet /></PageTransition>}
    </main>
    <CoachDrawer open={coachContext !== null} entryContext={coachContext ?? "general"} onClose={() => setCoachContext(null)} />
  </div>;
}
