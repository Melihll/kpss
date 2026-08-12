import { useEffect, useMemo, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { supabase } from "../../lib/supabase";
import { Icon } from "../Icon";
import { MobileNav } from "./MobileNav";
import { PageTransition } from "./PageTransition";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { user } = useAuth();
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
    const value = typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
    return value || user?.email?.split("@")[0] || "Öğrenci";
  }, [user]);

  if (hasProfile === null) return <main className="shell-skeleton" aria-label="Yükleniyor"><div /><span /><span /><span /></main>;

  if (!hasProfile) return <main className="profile-required"><span className="brand-mark"><Icon name="target" /></span><h1>Çalışma profili gerekli.</h1><p>Derslerini, haftalık zamanını ve kaynaklarını tanımla.</p><Link className="primary-action" to="/onboarding">Kurulumu Başlat</Link></main>;

  return <div className="product-shell">
    <Sidebar displayName={displayName} email={user?.email} />
    <header className="mobile-product-header"><Link to="/"><span className="brand-mark"><Icon name="target" /></span><strong>KPSS Koçu</strong></Link><Link to="/settings" aria-label="Ayarlar"><Icon name="settings" /></Link></header>
    <main className="route-stage"><PageTransition><Outlet /></PageTransition></main>
    <MobileNav />
  </div>;
}
