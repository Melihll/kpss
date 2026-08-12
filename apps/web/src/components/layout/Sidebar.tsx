import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "../Icon";

const ITEMS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: "/", label: "Bugün", icon: "home", end: true },
  { to: "/week", label: "Haftam", icon: "calendar" },
  { to: "/roadmap", label: "Yol Haritası", icon: "target" },
  { to: "/resources", label: "Kaynaklar", icon: "book" },
  { to: "/progress", label: "İlerleme", icon: "chart" },
];

export function Sidebar({ displayName, email }: { displayName: string; email?: string }) {
  return <aside className="product-sidebar">
    <NavLink className="sidebar-logo" to="/" aria-label="KPSS Koçu"><span className="brand-mark"><Icon name="target" /></span><span><strong>KPSS Koçu</strong><small>P48</small></span></NavLink>
    <nav aria-label="Ana navigasyon">{ITEMS.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav>
    <div className="sidebar-fill" />
    <NavLink className="sidebar-user" to="/settings"><span className="user-initial">{displayName.slice(0, 1).toLocaleUpperCase("tr-TR")}</span><span><strong>{displayName}</strong><small>{email}</small></span></NavLink>
    <NavLink className="sidebar-settings" to="/settings"><Icon name="settings" /><span>Ayarlar</span></NavLink>
  </aside>;
}
