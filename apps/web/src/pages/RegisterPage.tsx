import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { registerSchema } from "../lib/auth-validation";
import { supabase } from "../lib/supabase";
import { Icon } from "../components/Icon";

export function RegisterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse({ displayName, email, password });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin."); return; }
    setSubmitting(true); setError(null);
    const { data, error: authError } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { data: { display_name: parsed.data.displayName } } });
    setSubmitting(false);
    if (authError) { setError(authError.message); return; }
    if (!data.session) { setError("Kayıt oluşturuldu; e-posta doğrulaması gerekiyor."); return; }
    navigate("/", { replace: true });
  }

  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-brand"><span className="brand-mark"><Icon name="target" /></span><strong>KPSS Koçu</strong></div>
      <div className="auth-message"><span className="eyebrow">KENDİ ÇALIŞMA SİSTEMİN</span><h1>Planını gerçek çalışma verin yönetsin.</h1><p>Mükemmel plan aramak yerine; çalış, kaydet, ölç ve bir sonraki adıma geç.</p><div className="auth-orbit"><span /><i /><b /></div></div>
    </section>
    <section className="auth-card">
      <span className="eyebrow">HESABINI OLUŞTUR</span><h2>Çalışma alanını başlat</h2><p>Kurulumdan sonra koçun sana her gün tek bir net sonraki adım gösterecek.</p>
      <form onSubmit={handleSubmit}>
        <label>Görünen ad<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} maxLength={80} placeholder="Adın" /></label>
        <label>E-posta<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="ornek@mail.com" /></label>
        <label>Şifre<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="En az 6 karakter" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary-action auth-submit" type="submit" disabled={submitting}>{submitting ? "Kayıt yapılıyor…" : "Kayıt Ol"}</button>
      </form>
      <p className="auth-switch">Zaten hesabın var mı? <Link to="/login">Giriş yap</Link></p>
    </section>
  </main>;
}
