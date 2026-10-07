import { createRoot } from "react-dom/client";
import { localVideoReviewAllowed } from "./lib/local-video-review";
import "./styles.css";
import "./workspace.css";
import "./dev-video-review.css";

document.title = "KPSS Koçu · Yerel video incelemesi";
document.documentElement.lang = "tr";
const root = createRoot(document.getElementById("root")!);
if (localVideoReviewAllowed(import.meta.env.DEV, window.location.origin, import.meta.env.VITE_SUPABASE_URL)) {
  void import("./dev-video-review").then(({ DevVideoReviewEntry }) => root.render(<DevVideoReviewEntry />));
} else {
  root.render(<main className="dev-video-review"><h1>Yerel video incelemesi</h1><p>Bu ekran yalnızca yerel site ve yerel veri bağlantısıyla açılabilir.</p><a href="/ux-lab/today?concept=coach">UX Lab’e dön</a></main>);
}
