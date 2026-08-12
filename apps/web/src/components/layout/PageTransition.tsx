import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <div className="route-transition" key={location.pathname}>{children}</div>;
}
