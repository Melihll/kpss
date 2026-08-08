import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { registerSchema } from "../lib/auth-validation";
import { supabase } from "../lib/supabase";

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
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { display_name: parsed.data.displayName } },
    });
    setSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    if (!data.session) {
      setError("Kayıt oluşturuldu; e-posta doğrulaması gerekiyor.");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <main className="card">
      <h1>Kayıt Ol</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Görünen ad
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} maxLength={80} />
        </label>
        <label>
          E-posta
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Şifre
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Kayıt yapılıyor…" : "Kayıt Ol"}</button>
      </form>
      <p>Zaten hesabınız var mı? <Link to="/login">Giriş yapın</Link>.</p>
    </main>
  );
}
