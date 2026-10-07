import { createHash, webcrypto } from "node:crypto";

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
export const ACCEPTANCE_EMAIL = "video-acceptance-local@example.test";

export function assertLocalVideoEnvironment({ url, dbUrl }, profileId, email) {
  const api = new URL(url);
  const db = new URL(dbUrl);
  if (!LOOPBACK.has(api.hostname) || api.protocol !== "http:" || api.username || api.password ||
      api.pathname !== "/" || api.search || api.hash || api.port !== "54321" ||
      !LOOPBACK.has(db.hostname) || !["postgres:", "postgresql:"].includes(db.protocol) ||
      db.port !== "54322" || db.pathname !== "/postgres" || db.search || db.hash) {
    throw new Error("Acceptance requires the local Supabase API :54321 and DB :54322. Remote hosts are refused.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId ?? "")) {
    throw new Error("An explicit --profile-id UUID is required.");
  }
  if (email !== ACCEPTANCE_EMAIL) throw new Error("Only the dedicated local acceptance test account is allowed.");
}

export function fixtureId(profileId, label) {
  const hash = createHash("sha256").update(`local-video-acceptance-v1:${profileId}:${label}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function acceptanceDates(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${date}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { today: date, weekStart: start.toISOString().slice(0, 10), weekEnd: end.toISOString().slice(0, 10) };
}

export async function verifyLocalAccessToken(url, token) {
  if (!LOOPBACK.has(new URL(url).hostname)) throw new Error("Remote Auth is refused.");
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url"));
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url"));
  const expectedIssuer = `${url}/auth/v1`;
  if (header.alg !== "ES256" || claims.iss !== expectedIssuer || claims.aud !== "authenticated" ||
      claims.role !== "authenticated" || !claims.sub || !(claims.exp > Date.now() / 1000)) {
    throw new Error("Local ES256 token claims do not match the expected user/issuer/expiry.");
  }
  const response = await fetch(`${expectedIssuer}/.well-known/jwks.json`, { redirect: "error" });
  if (!response.ok) throw new Error("Local JWKS is unavailable.");
  const jwks = await response.json();
  const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "EC" && key.crv === "P-256");
  if (!jwk || jwk.d) throw new Error("Matching public ES256 JWKS key is unavailable.");
  const key = await webcrypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key,
    Buffer.from(signaturePart, "base64url"), Buffer.from(`${headerPart}.${payloadPart}`));
  if (!valid) throw new Error("Local ES256 signature verification failed.");
  return { alg: header.alg, iss: claims.iss, expectedIssuer, aud: claims.aud, sub: claims.sub, role: claims.role, exp: claims.exp, jwksStatus: response.status, signatureVerified: true };
}
