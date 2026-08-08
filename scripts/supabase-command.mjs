import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(currentDirectory, "..");

export function runLocalSupabase(args, { capture = false } = {}) {
  const binary = resolve(
    repositoryRoot,
    "node_modules/supabase/bin",
    process.platform === "win32" ? "supabase.exe" : "supabase",
  );

  return spawnSync(binary, args, {
    cwd: repositoryRoot,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: {
      ...process.env,
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
  });
}
