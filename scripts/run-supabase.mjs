import { runLocalSupabase } from "./supabase-command.mjs";

const result = runLocalSupabase(process.argv.slice(2));

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
