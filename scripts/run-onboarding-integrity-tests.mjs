import { spawnSync } from 'node:child_process';
import { readLocalSupabaseStatus } from './supabase-status.mjs';
const local = readLocalSupabaseStatus();
if (local.url !== 'http://127.0.0.1:54321' || new URL(local.dbUrl).hostname !== '127.0.0.1' || new URL(local.dbUrl).port !== '54322') throw Error('EXACT_LOCAL_ENDPOINTS_REQUIRED');
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts', 'tests/integration/onboarding-integrity.test.ts'], { stdio: 'inherit', windowsHide: true, env: { ...process.env, SUPABASE_URL: local.url, SUPABASE_DB_URL: local.dbUrl, SUPABASE_ANON_KEY: local.anonKey } });
process.exit(result.status ?? 1);
