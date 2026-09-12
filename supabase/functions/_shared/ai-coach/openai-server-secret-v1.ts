export const OPENAI_SERVER_SECRET_V1_VERSION = "openai-server-secret-v1" as const;
export const OPENAI_SERVER_SECRET_KEY_V1 = "OPENAI_API_KEY" as const;

export interface OpenAiServerCredentialV1 {
  readonly version: typeof OPENAI_SERVER_SECRET_V1_VERSION;
  readonly authority: "server_secret";
  readonly redacted: true;
  readonly authorizationHeader: () => string;
  readonly toJSON: () => Readonly<{
    version: typeof OPENAI_SERVER_SECRET_V1_VERSION;
    authority: "server_secret";
    redacted: true;
  }>;
}

/**
 * Keeps the key inside a closure. The returned capability serializes only a
 * redacted marker and is defined only in the server-side Supabase boundary.
 */
export function loadOpenAiServerCredentialV1(
  serverSecrets: Readonly<Record<string, string | undefined>>,
): OpenAiServerCredentialV1 {
  const secret = serverSecrets[OPENAI_SERVER_SECRET_KEY_V1];
  if (typeof secret !== "string" || !secret.trim()) {
    throw new Error("OPENAI_SERVER_API_KEY_MISSING");
  }
  if (secret !== secret.trim() || /[\r\n]/.test(secret) || secret.length < 20) {
    throw new Error("OPENAI_SERVER_API_KEY_MALFORMED");
  }
  const publicShape = Object.freeze({
    version: OPENAI_SERVER_SECRET_V1_VERSION,
    authority: "server_secret" as const,
    redacted: true as const,
  });
  return Object.freeze({
    ...publicShape,
    authorizationHeader: () => `Bearer ${secret}`,
    toJSON: () => publicShape,
  });
}
