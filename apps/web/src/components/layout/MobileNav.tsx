import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "../Icon";

const ITEMS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: "/", label: "Bugün", icon: "home", end: true },
  { to: "/week", label: "Haftam", icon: "calendar" },
  { to: "/roadmap", label: "Yol", icon: "target" },
  { to: "/resources", label: "Kaynak", icon: "book" },
  { to: "/progress", label: "İlerleme", icon: "chart" },
];

export function MobileNav() {
  return <nav className="mobile-product-nav" aria-label="Mobil navigasyon">{ITEMS.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}</nav>;
}
