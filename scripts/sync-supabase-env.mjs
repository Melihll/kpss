import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "..");
const { url, anonKey } = readLocalSupabaseStatus();
const target = resolve(repositoryRoot, "apps/web/.env.local");

writeFileSync(
  target,
  `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`,
  { encoding: "utf8", mode: 0o600 },
);

console.log("Wrote local public Supabase settings to apps/web/.env.local");
