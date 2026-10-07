import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "../Icon";
import { trapDialogTab } from "../../lib/dialog-focus";
import "./top-navigation.css";

export interface ApplicationNavItem { to: string; label: string; end?: boolean }
export const PRODUCT_NAVIGATION: ApplicationNavItem[] = [
  { to: "/", label: "Bugün", end: true }, { to: "/week", label: "Haftam" },
  { to: "/roadmap", label: "Yol Haritası" }, { to: "/resources", label: "Kaynaklar" },
  { to: "/progress", label: "İlerleme" },
];

interface Props {
  items?: ApplicationNavItem[];
  home?: string;
  settings?: string;
  displayName: string;
  email?: string;
  focus?: boolean;
  review?: boolean;
  onCoach: () => void;
  onSignOut?: () => Promise<void>;
}

/** Product chrome shared with the Lab; authentication stays with the caller. */
export function TopNavigation({ items = PRODUCT_NAVIGATION, home = "/", settings = "/settings", displayName, email, focus = false, review = false, onCoach, onSignOut }: Props) {
  const location = useLocation();
  const [sheet, setSheet] = useState<"navigation" | "account" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => { setSheet(null); }, [location.pathname, location.search]);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update(); window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!sheet || !element) return;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = previousOverflow; trigger.current?.focus(); };
  }, [sheet]);
  const open = (value: "navigation" | "account", element: HTMLElement) => { trigger.current = element; setError(""); setSheet(value); };
  async function logout() {
    if (!onSignOut || busy) return;
    setBusy(true); setError("");
    try { await onSignOut(); setSheet(null); }
    catch { setError("Çıkış yapılamadı. Tekrar dene."); }
    finally { setBusy(false); }
  }
  return <header className={`application-nav ${scrolled ? "is-scrolled" : ""} ${focus ? "is-focus" : ""}`}>
    <div className="application-nav-inner">
      <Link to={home} className="application-brand" aria-label="KPSS Koçu — Bugün">
        <picture>
          <source media="(max-width: 600px)" srcSet="/brand/kpss-kocu-mark.svg" />
          <img src="/brand/kpss-kocu-logo.svg" width={728} height={304} alt="" aria-hidden="true" />
        </picture>
      </Link>
      {focus ? <span className="application-focus-label"><Icon name="timer" size={17} />Odak Modu</span> : <nav className="application-desktop-links" aria-label="Ana gezinme">{items.map((item) => <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>)}</nav>}
      <div className="application-nav-actions">
        <button type="button" className="application-coach" onClick={onCoach}><Icon name="user" size={17} /><span>Koça Sor</span></button>
        {focus ? <Link to={home} className="application-focus-exit">Bugüne dön <Icon name="arrow" size={16} /></Link> : <>
          <button type="button" className="application-account" aria-label="Hesap menüsü" aria-haspopup="dialog" aria-expanded={sheet === "account"} onClick={(event) => open("account", event.currentTarget)}>{displayName.slice(0, 1).toLocaleUpperCase("tr-TR")}</button>
          <button type="button" className="application-menu-trigger" aria-label="Gezinme menüsü" aria-haspopup="dialog" aria-expanded={sheet === "navigation"} onClick={(event) => open("navigation", event.currentTarget)}><Icon name="menu" /></button>
        </>}
      </div>
    </div>
    {sheet && <dialog ref={dialog} className={`application-menu-sheet ${sheet === "account" ? "is-account" : ""}`} aria-labelledby="application-menu-title" onKeyDown={(event) => trapDialogTab(event, event.currentTarget)} onCancel={(event) => { event.preventDefault(); setSheet(null); }} onClick={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
      <header><div><small>{sheet === "navigation" ? "KPSS KOÇU" : "HESAP"}</small><h2 id="application-menu-title">{sheet === "navigation" ? "Gezinme" : displayName}</h2>{email && sheet === "account" && <p>{email}</p>}</div><button type="button" aria-label="Menüyü kapat" onClick={() => setSheet(null)}><Icon name="close" /></button></header>
      {sheet === "navigation" && <nav aria-label="Mobil ana gezinme">{items.map((item) => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSheet(null)}>{item.label}<Icon name="arrow" size={17} /></NavLink>)}<button type="button" onClick={() => { setSheet(null); onCoach(); }}>Koça Sor<Icon name="user" size={17} /></button></nav>}
      <nav className="application-account-links" aria-label="Hesap işlemleri">{review ? <p className="application-review-note">Örnek profil · Hesap işlemleri gerçek üründe kullanılabilir.</p> : <><Link to={`${settings}#profile`} onClick={() => setSheet(null)}>Profil<Icon name="user" size={17} /></Link><Link to={settings} onClick={() => setSheet(null)}>Ayarlar<Icon name="settings" size={17} /></Link>{onSignOut && <button type="button" disabled={busy} onClick={() => void logout()}>{busy ? "Çıkış yapılıyor…" : "Çıkış"}<Icon name="logout" size={17} /></button>}</>}</nav>
      {error && <p role="alert">{error}</p>}
    </dialog>}
  </header>;
}
