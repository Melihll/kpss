import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { loginSchema } from "../lib/auth-validation";
import { supabase } from "../lib/supabase";
import { Icon } from "../components/Icon";

export function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin."); return; }
    setSubmitting(true); setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setSubmitting(false);
    if (authError) { setError(authError.message); return; }
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    navigate(from ?? "/", { replace: true });
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand-inline"><span className="brand-mark"><Icon name="target" /></span><strong>KPSS Koçu</strong></div>
      <h1>Tekrar hoş geldin.</h1>
      <form onSubmit={handleSubmit}>
        <label>E-posta<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="ornek@mail.com" /></label>
        <label>Şifre<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="••••••••" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary-action auth-submit" type="submit" disabled={submitting}>{submitting ? "Giriş yapılıyor…" : "Giriş Yap"}</button>
      </form>
      <p className="auth-switch">Hesabın yok mu? <Link to="/register">Kayıt ol</Link></p>
    </section>
  </main>;
}
