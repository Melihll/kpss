import { spawnSync, execFileSync } from 'node:child_process';
import { readLocalSupabaseStatus } from './supabase-status.mjs';
const local=readLocalSupabaseStatus();
if(local.url!=='http://127.0.0.1:54321'||new URL(local.dbUrl).hostname!=='127.0.0.1'||new URL(local.dbUrl).port!=='54322')throw Error('EXACT_LOCAL_ENDPOINTS_REQUIRED');
const targets=process.argv.slice(2).length?process.argv.slice(2):['tests/integration/s0-cross-channel-safety.test.ts'];
// A historical canonical regression uses a local-only signed actor to avoid
// the known PostgREST iat clock flake. Keep the existing signing key in memory.
const needsLocalSigning=targets.some(file=>file.endsWith('p48-canonical-infrastructure.test.ts'));
const signing=needsLocalSigning?JSON.parse(execFileSync('docker',['inspect','supabase_auth_kpss-coach'],{encoding:'utf8',windowsHide:true}))[0].Config.Env.find(value=>value.startsWith('GOTRUE_JWT_SECRET=')).slice('GOTRUE_JWT_SECRET='.length):undefined;
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.integration.config.ts',...targets],{
  stdio:'inherit',windowsHide:true,env:{...process.env,SUPABASE_URL:local.url,SUPABASE_DB_URL:local.dbUrl,SUPABASE_ANON_KEY:local.anonKey,SUPABASE_SERVICE_ROLE_KEY:local.serviceRoleKey,...(signing?{SUPABASE_JWT_SECRET:signing}:{})},
});
process.exit(result.status??1);
