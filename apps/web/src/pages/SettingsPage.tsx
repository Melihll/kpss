import { calculateWeeklyAvailableMinutes, type WeeklyAvailability } from "@kpss-coach/domain";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";
import { useRoadmap } from "../hooks/useRoadmap";
import { callAppApi } from "../lib/app-api";
import { compactMinutesLabel, dateLabel } from "../lib/roadmap";
import { supabase } from "../lib/supabase";

interface TelegramStatus {
  linked: boolean;
  identity: { external_user_id: string; external_chat_id: string | null; username: string | null; linked_at: string } | null;
}

interface TelegramLink {
  url: string;
  configured: boolean;
}

function periodDateRange(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const sameMonth = startDate.getUTCFullYear() === endDate.getUTCFullYear() && startDate.getUTCMonth() === endDate.getUTCMonth();
  return sameMonth
    ? `${startDate.getUTCDate()}–${dateLabel(end, { year: "numeric" })}`
    : `${dateLabel(start, { year: "numeric" })} – ${dateLabel(end, { year: "numeric" })}`;
}

export function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const { data: roadmap, loading: roadmapLoading, error: roadmapError, retry: retryRoadmap } = useRoadmap();
  const [weeklyMinutes, setWeeklyMinutes] = useState<number | null>(null);
  const [telegram, setTelegram] = useState<TelegramStatus | null>(null);
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [profileResult, telegramResult] = await Promise.all([
        supabase.from("exam_profiles").select("id").eq("status", "active").maybeSingle(),
        callAppApi<TelegramStatus>("/messaging/telegram/status"),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (profileResult.data) {
        const availabilityResult = await supabase.from("weekly_availability").select("*").eq("exam_profile_id", profileResult.data.id).eq("is_active", true);
        if (availabilityResult.error) throw availabilityResult.error;
        setWeeklyMinutes(calculateWeeklyAvailableMinutes((availabilityResult.data ?? []) as WeeklyAvailability[]));
      } else {
        setWeeklyMinutes(null);
      }
      setTelegram(telegramResult);
      setError(false);
    } catch (caught) {
      console.error("SETTINGS_LOAD_FAILED", caught);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  async function connectTelegram() {
    setTelegramBusy(true);
    setTelegramMessage(null);
    try {
      const result = await callAppApi<TelegramLink>("/messaging/telegram/link-token", { method: "POST" });
      if (!result.configured) throw new Error("Telegram bot is not configured.");
      setTelegramLink(result.url);
      setTelegramMessage("Bağlantı hazır.");
    } catch (caught) {
      console.error("TELEGRAM_LINK_FAILED", caught);
      setTelegramMessage("Bağlantı hazırlanamadı.");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function logout() {
    setLogoutBusy(true);
    setLogoutError(false);
    try {
      await signOut();
    } catch (caught) {
      console.error("SIGN_OUT_FAILED", caught);
      setLogoutError(true);
      setLogoutBusy(false);
    }
  }

  const displayName = profile?.display_name?.trim()
    || (typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "")
    || user?.email?.split("@")[0]
    || "Belirtilmedi";
  const periods = roadmap?.periods ?? [];
  const pageLoading = loading || roadmapLoading;
  const pageError = error || roadmapError;

  return <section className="settings-page settings-profile-page page-frame">
    <header className="page-header compact-header settings-profile-header"><div><span className="page-eyebrow">Ayarlar</span><h1>Çalışma profili</h1></div></header>

    {pageError && <div className="inline-state error settings-load-error" role="alert"><span>Ayarlar yüklenemedi.</span><button type="button" onClick={() => { void loadSettings(); void retryRoadmap(); }}>Tekrar Dene</button></div>}
    {pageLoading ? <div className="settings-page-skeleton" aria-label="Ayarlar yükleniyor">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div> : <div className="settings-list settings-profile-list">
      <section className="settings-section settings-profile-section">
        <div className="settings-section-heading"><h2>Profil</h2></div>
        <div className="settings-section-value"><strong>{displayName}</strong>{user?.email ? <a className="settings-email" href={`mailto:${user.email}`}>{user.email}</a> : <small>Belirtilmedi</small>}</div>
        <Link className="settings-edit-link" to="/onboarding" aria-label="Profili düzenle">Düzenle <Icon name="arrow" /></Link>
      </section>

      <section className="settings-section settings-target-section">
        <div className="settings-section-heading"><h2>Hedef sınav</h2></div>
        <div className="settings-section-value"><strong>{roadmap?.strategy?.scoreType ?? "Belirtilmedi"}</strong><small>{roadmap?.strategy?.targetExamDate ? dateLabel(roadmap.strategy.targetExamDate, { year: "numeric" }) : "Belirtilmedi"}</small></div>
        <Link className="settings-edit-link" to="/onboarding" aria-label="Hedef sınavı düzenle">Düzenle <Icon name="arrow" /></Link>
      </section>

      <section className="settings-section settings-capacity-section">
        <div className="settings-section-heading"><h2>Haftalık kapasite</h2></div>
        <div className="settings-section-value"><strong>{weeklyMinutes === null ? "Belirtilmedi" : compactMinutesLabel(weeklyMinutes)}</strong><small>Normal çalışma haftası</small></div>
        <Link className="settings-edit-link" to="/onboarding" aria-label="Haftalık kapasiteyi düzenle">Düzenle <Icon name="arrow" /></Link>
      </section>

      <section className="settings-section settings-periods-section">
        <div className="settings-section-heading"><h2>Akademik boşluklar</h2><small>{periods.length ? `${periods.length} dönem` : ""}</small></div>
        <div className="academic-gap-list">{periods.length ? periods.map((period) => <article key={`${period.name}-${period.startDate}`}><strong>{period.name}</strong><span>{periodDateRange(period.startDate, period.endDate)}</span></article>) : <p>Akademik boşluk eklenmemiş.</p>}</div>
        <Link className="settings-edit-link" to="/onboarding" aria-label="Akademik boşlukları düzenle">Düzenle <Icon name="arrow" /></Link>
      </section>

      <section className="settings-section settings-telegram-section">
        <div className="settings-section-heading"><h2>Telegram</h2></div>
        <div className="settings-section-value telegram-settings-value">
          <strong>{telegram?.linked ? <><i className="telegram-connected-dot" aria-hidden="true" />Bağlı</> : "Çalışma kayıtları"}</strong>
          <small>{telegram?.linked ? (telegram.identity?.username ? `@${telegram.identity.username.replace(/^@/, "")}` : "Telegram hesabı bağlı") : "Web ve Telegram aynı profili kullanır."}</small>
          {telegramMessage && <span className={telegramMessage.includes("hazır.") ? "settings-success-message" : "settings-error-message"} role={telegramMessage.includes("hazır.") ? "status" : "alert"}>{telegramMessage}</span>}
        </div>
        <div className="settings-actions telegram-settings-actions">
          {!telegram?.linked && <button className="settings-utility-button" type="button" disabled={telegramBusy} onClick={() => void connectTelegram()}>{telegramBusy ? "Bağlantı hazırlanıyor…" : "Bağlantı Oluştur"}</button>}
          {telegramLink && <a className="settings-primary-link" href={telegramLink} target="_blank" rel="noreferrer">Telegram’ı Aç</a>}
        </div>
      </section>

      <section className="settings-section settings-session-section">
        <div className="settings-section-heading"><h2>Oturum</h2></div>
        <div className="settings-section-value"><strong>Çıkış yap</strong>{logoutError && <small className="settings-error-message" role="alert">Çıkış yapılamadı.</small>}</div>
        <button className="settings-logout-button" type="button" disabled={logoutBusy} onClick={() => void logout()}><Icon name="logout" />{logoutBusy ? "Çıkış yapılıyor…" : "Çıkış Yap"}</button>
      </section>
    </div>}
  </section>;
}
