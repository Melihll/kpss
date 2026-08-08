import { spawnSync } from "node:child_process";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";
import { resolve } from "node:path";
import { repositoryRoot } from "./supabase-command.mjs";

const { url, anonKey } = readLocalSupabaseStatus();
const vitest = resolve(repositoryRoot, "node_modules/vitest/vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitest, "run", "--config", "vitest.integration.config.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: anonKey,
    },
  },
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
