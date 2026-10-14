import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureP48WeekPlanForService } from '../../supabase/functions/_shared/p48-week.ts';
import { calculateEffectiveDayCapacity } from '../../packages/domain/src/adaptive/capacity';
import { planningCapacityForDate } from '../../supabase/functions/_shared/capacity-overrides.ts';
// @ts-expect-error Explicit isolated local-only pilot fixture.
import { createLocalP48PilotFixture } from '../../scripts/lib/local-p48-pilot-fixture.mjs';

const url=process.env.SUPABASE_URL!,key=process.env.SUPABASE_ANON_KEY!,db=process.env.SUPABASE_DB_URL!;
if(url!=='http://127.0.0.1:54321'||new URL(db).hostname!=='127.0.0.1'||new URL(db).port!=='54322')throw Error('EXACT_LOCAL_ENDPOINTS_REQUIRED');
const sql=postgres(db,{max:6,connection:{application_name:'s0_isolated_integration',statement_timeout:20000}});
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const output=process.env.S0_EVIDENCE_DIR;
const persist=(name:string,data:unknown)=>{if(output)fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2));};
const check=async(q:any)=>{const r=await q;if(r.error)throw r.error;return r.data;};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date());
const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7;
const dateAdd=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const week=dateAdd(today,1-weekday),math='20000000-0000-0000-0000-000000000002',stats='20000000-0000-0000-0000-000000000014';
const actors:any[]=[],events:any[]=[];
function record(name:string,data:any){events.push({name,...data});persist('s0-runtime-results.json',events);}
const state=(a:any)=>check(a.api.rpc('weekly_availability_state',{p_exam_profile_id:a.profileId}));
const snap=(a:any)=>check(a.api.rpc('planning_week_snapshot',{p_exam_profile_id:a.profileId,p_week_start:week}));
const windows=(n=60,label='S0 saved')=>[{weekday,start_time:'10:00',end_time:n===120?'12:00':n===30?'10:30':'11:00',label}];
const replace=(a:any,w:any[],revision:string)=>a.api.rpc('replace_weekly_availability',{p_exam_profile_id:a.profileId,p_windows:w,p_expected_revision:revision});
async function actor(label:string,capacity=true,setup=true){
 const api=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),nonce=randomUUID();
 const email=`s0-${label}-${nonce}@example.invalid`,signed=await api.auth.signUp({email,password:`Local-${nonce}!`});
 expect(signed.error).toBeNull();expect(signed.data.session).toBeTruthy();
 const userId=signed.data.user!.id,token=signed.data.session!.access_token;
 const p=await check(api.from('exam_profiles').insert({user_id:userId,exam_edition_id:'11000000-0000-0000-0000-000000000001',preparation_start_date:today,target_exam_date:'2027-12-21',status:'active'}).select('*').single());
 const a={label,userId,profileId:p.id,profile:p,api,token,email};actors.push(a);
 persist('s0-fixture-identities.json',actors.map(({label,userId,profileId,email})=>({label,userId,profileId,email})));
 if(!setup)return a as any;
 await check(api.from('user_subjects').insert([math,stats].map(subject_id=>({user_id:userId,exam_profile_id:p.id,subject_id,status:'active'}))));
 const resource=await check(api.from('resources').insert({user_id:userId,exam_profile_id:p.id,subject_id:math,name:'Owned S0 mathematics',resource_type:'book',resource_role:'primary',difficulty:'normal',status:'active'}).select('*').single());
 Object.assign(a,{resourceId:resource.id});
 await check(api.from('p48_strategy_profiles').insert({user_id:userId,exam_profile_id:p.id,score_type:'KPSSP48',target_exam_date:'2027-12-21',weekly_target_minutes:120,monthly_target_minutes:480,status:'active',source_note:'Dedicated isolated S0 integration'}));
 await check(api.from('p48_resource_targets').insert({user_id:userId,exam_profile_id:p.id,resource_id:resource.id,planned_minutes:1000,sequence_order:1,work_mode:'book'}));
 if(capacity)await check(replace(a,windows(),(await state(a)).revision));
 return a as any;
}
const payload=(a:any,s:any,n=30)=>({intent:'generate_week',weekStartDate:week,expectedFingerprint:s.fingerprint,availableMinutes:999999,blocks:[{plannedDate:today,subjectId:math,resourceId:a.resourceId,estimatedMinutes:n,workMode:'book',title:'Owned S0 work'}]});
const create=(a:any,p:any)=>a.api.rpc('create_p48_week_once',{p_payload:p});
async function tasks(a:any){return await sql`select to_jsonb(t) as row from public.tasks t where user_id=${a.userId}::uuid order by id`;}
async function counts(a:any){return(await sql`select (select count(*)::int from public.weekly_plans where user_id=${a.userId}::uuid) plans,(select count(*)::int from public.tasks where user_id=${a.userId}::uuid) tasks`)[0];}
async function choices(a:any){const s=await snap(a);return {profile:s.input.profile,subjects:s.input.subjects,availability:s.input.availability,resources:s.input.resources,targets:s.input.targets,strategies:s.input.strategies,periods:s.input.periods,exceptions:s.input.exceptions};}
async function http(a:any,route:string,body?:any){const r=await fetch(`${url}/functions/v1/app-api${route}`,{method:body===undefined?'GET':'POST',headers:{apikey:key,authorization:`Bearer ${a.token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const result={status:r.status,body:await r.json()};record('http',{actor:a.label,route,request:body??null,...result});return result;}
async function waitBlocked(pid:number){for(let n=0;n<40;n++){const r=await sql`select pid from pg_stat_activity where ${pid}::int=any(pg_blocking_pids(pid))`;if(r.length)return r;await new Promise(r=>setTimeout(r,50));}throw Error('EXPECTED_REAL_LOCK_WAIT_NOT_OBSERVED');}

describe.sequential('S0 real local cross-channel safety',()=>{
 let availability:any,foreign:any;
 beforeAll(async()=>{availability=await actor('availability');foreign=await actor('foreign');},60000);
 afterAll(async()=>{persist('s0-final-plan-counts.json',await Promise.all(actors.map(async a=>({label:a.label,userId:a.userId,...await counts(a)}))));persist('s0-cleanup.json',await sql`select tgname from pg_trigger where not tgisinternal and tgname like 's0_fixture_%'`);await sql.end();});

 it.each(['delete','insert','update'] as const)('R1 authenticated direct REST %s fails closed',async method=>{
  const before=await state(availability);let r:any;
  if(method==='delete')r=await availability.api.from('weekly_availability').delete().eq('exam_profile_id',availability.profileId);
  if(method==='insert')r=await availability.api.from('weekly_availability').insert({user_id:availability.userId,exam_profile_id:availability.profileId,weekday,start_time:'12:00',end_time:'13:00'});
  if(method==='update')r=await availability.api.from('weekly_availability').update({label:'legacy overwrite'}).eq('exam_profile_id',availability.profileId);
  expect(r.error?.code).toBe('42501');expect(await state(availability)).toEqual(before);record('R1 direct '+method,{before,result:r,after:await state(availability)});
 });
 it('R1 old browser deletion followed by failed insertion retains rows and IDs',async()=>{
  const before=await state(availability);
  const del=await availability.api.from('weekly_availability').delete().eq('exam_profile_id',availability.profileId);
  const ins=await availability.api.from('weekly_availability').insert({user_id:availability.userId,exam_profile_id:availability.profileId,weekday:8,start_time:'11:00',end_time:'10:00'});
  expect(del.error?.code).toBe('42501');expect(ins.error?.code).toBe('42501');expect(await state(availability)).toEqual(before);
 });
 it('R1 direct service-role table write is also denied',async()=>{
  const before=await state(availability),r=await service.from('weekly_availability').delete().eq('exam_profile_id',availability.profileId);
  expect(r.error?.code).toBe('42501');expect(await state(availability)).toEqual(before);
 });
 it('R1 sanctioned service replacement uses the same atomic boundary',async()=>{
  const a=await actor('service-availability'),before=await state(a);
  const result=await service.rpc('service_replace_weekly_availability',{p_user_id:a.userId,p_exam_profile_id:a.profileId,p_windows:windows(30),p_expected_revision:before.revision});
  expect(result.error).toBeNull();expect(result.data.capacity_minutes).toBe(30);
  const foreignBefore=await state(foreign);
  const denied=await service.rpc('service_replace_weekly_availability',{p_user_id:a.userId,p_exam_profile_id:foreign.profileId,p_windows:[],p_expected_revision:foreignBefore.revision});
  expect(denied.error?.message).toContain('EXAM_PROFILE_NOT_FOUND');expect(await state(foreign)).toEqual(foreignBefore);
 });
 it('R1 old and new concurrent writers leave only the sanctioned atomic result',async()=>{
  const before=await state(availability);
  const [old,saved]=await Promise.all([availability.api.from('weekly_availability').delete().eq('exam_profile_id',availability.profileId),replace(availability,windows(30),before.revision)]);
  expect(old.error?.code).toBe('42501');expect(saved.error).toBeNull();expect((await state(availability)).windows).toEqual(saved.data.windows);
 });
 it('R1 identical concurrent and stale retries preserve row identities',async()=>{
  const before=await state(availability),w=windows(60,'retry');
  const result=await Promise.all(Array.from({length:4},()=>replace(availability,w,before.revision)));
  expect(result.every(r=>!r.error)).toBe(true);expect(result.filter(r=>r.data.changed)).toHaveLength(1);
  const saved=await state(availability),again=await replace(availability,w,before.revision);
  expect(again.data.changed).toBe(false);expect(await state(availability)).toEqual(saved);
 });
 it('R1 conflicting revisions yield one winner and one conflict',async()=>{
  const before=await state(availability),result=await Promise.all([replace(availability,windows(30,'A'),before.revision),replace(availability,windows(120,'B'),before.revision)]);
  expect(result.filter(r=>!r.error)).toHaveLength(1);expect(result.find(r=>r.error)!.error.message).toContain('AVAILABILITY_CONFLICT');
  record('R1 conflicts',{before,results:result,after:await state(availability)});
 });
 it('R1 real INSERT fault after DELETE rolls back old exact rows',async()=>{
  const a=await actor('availability-fault'),before=await state(a);
  await sql.unsafe(`create function public.s0_fixture_availability_fault() returns trigger language plpgsql set search_path='' as $$begin if new.user_id='${a.userId}'::uuid and new.label='S0_INJECT' then raise exception 'S0_INSERT_FAULT'; end if; return new; end;$$; create trigger s0_fixture_availability_fault before insert on public.weekly_availability for each row execute function public.s0_fixture_availability_fault();`);
  try{const r=await replace(a,windows(30,'S0_INJECT'),before.revision);expect(r.error?.message).toContain('S0_INSERT_FAULT');expect(await state(a)).toEqual(before);record('R1 rollback',{before,result:r,after:await state(a)});}
  finally{await sql.unsafe('drop trigger s0_fixture_availability_fault on public.weekly_availability; drop function public.s0_fixture_availability_fault();');}
 });
 it('R1 cross-owner and anonymous RPCs fail without mutations',async()=>{
  const before=await state(availability),fBefore=await state(foreign);
  const denied=await foreign.api.rpc('replace_weekly_availability',{p_exam_profile_id:availability.profileId,p_windows:[],p_expected_revision:before.revision});
  expect(denied.error?.message).toContain('EXAM_PROFILE_NOT_FOUND');
  const anon=createClient(url,key,{auth:{persistSession:false}});
  for(const [name,args] of [['replace_weekly_availability',{p_exam_profile_id:availability.profileId,p_windows:[],p_expected_revision:before.revision}],['planning_week_snapshot',{p_exam_profile_id:availability.profileId,p_week_start:week}],['create_p48_week_once',{p_payload:{}}],['service_planning_week_snapshot',{p_user_id:availability.userId,p_exam_profile_id:availability.profileId,p_week_start:week}]] as const)expect((await anon.rpc(name,args)).error?.code).toBe('42501');
  expect(await state(availability)).toEqual(before);expect(await state(foreign)).toEqual(fBefore);
 });
 it('R2 persisted 60 minutes rejects 120 even with a forged budget',async()=>{
  const a=await actor('inflated'),before=await choices(a),p=payload(a,await snap(a),120),r=await create(a,p);
  expect(r.error?.message).toContain('PLAN_CAPACITY_EXCEEDED');expect(await counts(a)).toEqual({plans:0,tasks:0});expect(await choices(a)).toEqual(before);record('R2 inflated budget',{persistedMinutes:60,request:p,result:r});
 });
 it('R2 ignores client availableMinutes and persists the actual budget',async()=>{
  const a=await actor('budget-authority'),r=await check(create(a,payload(a,await snap(a),30)));
  expect(r.availableMinutes).toBe(60);expect(r.plannedMinutes).toBe(30);
 });
 it('R2 daily aggregate cannot borrow another day capacity',async()=>{
  const a=await actor('daily-aggregate'),nextWeek=dateAdd(week,7);
  await check(replace(a,[1,2].map(weekday=>({weekday,start_time:'10:00',end_time:'11:00'})),(await state(a)).revision));
  const s=await check(a.api.rpc('planning_week_snapshot',{p_exam_profile_id:a.profileId,p_week_start:nextWeek}));
  const p=payload(a,s,45);p.weekStartDate=nextWeek;p.blocks[0]!.plannedDate=nextWeek;p.blocks.push({...p.blocks[0]!,title:'Second same-day block'});
  const r=await create(a,p);expect(r.error?.message).toContain('PLAN_CAPACITY_EXCEEDED');expect(await counts(a)).toEqual({plans:0,tasks:0});record('R2 per day aggregate',{dayCapacities:s.dayCapacities,request:p,result:r});
 });
 it('R2 a foreign-owned resource is rejected without touching either owner',async()=>{
  const a=await actor('foreign-resource'),before=await choices(foreign),p=payload(a,await snap(a));p.blocks[0]!.resourceId=foreign.resourceId;
  const r=await create(a,p);expect(r.error?.message).toContain('INVALID_MANUAL_PLAN_RESOURCE');expect(await counts(a)).toEqual({plans:0,tasks:0});expect(await choices(foreign)).toEqual(before);
 });
 it('R2 computed 120 then saved 30 rejects stale input',async()=>{
  const a=await actor('capacity-stale');await check(replace(a,windows(120),(await state(a)).revision));const s=await snap(a);
  await check(replace(a,windows(30),(await state(a)).revision));const r=await create(a,payload(a,s,120));
  expect(r.error?.message).toContain('PLANNING_INPUT_STALE');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('R2 observes a real profile-lock wait and rechecks after concurrent capacity commit',async()=>{
  const a=await actor('capacity-race'),s=await snap(a),revision=(await state(a)).revision;
  let release!:()=>void,ready!:(pid:number)=>void;const unlocked=new Promise<void>(r=>release=r),locked=new Promise<number>(r=>ready=r);
  const holder=sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${a.userId},true)`;await tx`select id from public.exam_profiles where id=${a.profileId}::uuid for update`;ready((await tx`select pg_backend_pid() pid`)[0]!.pid);await unlocked;await tx`select public.replace_weekly_availability(${a.profileId}::uuid,${tx.json(windows(30))},${revision})`;});
  const pid=await locked;const pending=Promise.resolve(create(a,payload(a,s,60)));
  let waits:any;try{waits=await waitBlocked(pid);}finally{release();}await holder;const r=await pending;
  expect(r.error?.message).toContain('PLANNING_INPUT_STALE');expect(await counts(a)).toEqual({plans:0,tasks:0});record('R2 real concurrent capacity',{blockingPid:pid,observedWaits:waits,result:r,after:await state(a)});
 });
 it.each(['paused','deselected','other-subject','no-source','no-target'] as const)('R2 rejects ineligible block: %s',async kind=>{
  const a=await actor(kind),s=await snap(a),p=payload(a,s);
  if(kind==='paused')await check(a.api.from('resources').update({status:'paused'}).eq('id',a.resourceId));
  if(kind==='deselected')await check(a.api.from('user_subjects').update({status:'paused'}).eq('exam_profile_id',a.profileId).eq('subject_id',math));
  if(kind==='other-subject')p.blocks[0]!.subjectId=stats;
  if(kind==='no-source')p.blocks[0]!.resourceId=null;
  if(kind==='no-target')await check(a.api.from('p48_resource_targets').delete().eq('exam_profile_id',a.profileId));
  const r=await create(a,p);expect(r.error?.message).toMatch(/P48_RESOURCES_REQUIRED|INVALID_MANUAL_PLAN_RESOURCE|PLANNING_INPUT_STALE/);expect(await counts(a)).toEqual({plans:0,tasks:0});record('R2 eligibility '+kind,{result:r});
 });
 it('R2 a concurrent resource writer takes the same profile lock before commit',async()=>{
  const a=await actor('resource-race'),s=await snap(a);
  let release!:()=>void,ready!:(pid:number)=>void;const unlocked=new Promise<void>(r=>release=r),locked=new Promise<number>(r=>ready=r);
  const holder=sql.begin(async tx=>{await tx`update public.resources set status='paused' where id=${a.resourceId}::uuid`;ready((await tx`select pg_backend_pid() pid`)[0]!.pid);await unlocked;});
  const pid=await locked,pending=Promise.resolve(create(a,payload(a,s)));
  let waits:any;try{waits=await waitBlocked(pid);}finally{release();}await holder;const r=await pending;
  expect(r.error?.message).toMatch(/PLANNING_INPUT_STALE|P48_RESOURCES_REQUIRED/);expect(await counts(a)).toEqual({plans:0,tasks:0});record('R2 concurrent resource',{blockingPid:pid,observedWaits:waits,result:r});
 });
 it.each(['calendar','exception'] as const)('R2 %s update invalidates earlier snapshot',async kind=>{
  const a=await actor(kind),s=await snap(a);
  if(kind==='calendar')await check(a.api.from('calendar_periods').insert({user_id:a.userId,exam_profile_id:a.profileId,period_type:'custom',name:'S0 change',start_date:today,end_date:today,capacity_multiplier:0.5}));
  else await check(a.api.from('schedule_exceptions').insert({user_id:a.userId,exam_profile_id:a.profileId,exception_date:today,exception_type:'custom',minutes_delta:-30}));
  const r=await create(a,payload(a,s));expect(r.error?.message).toContain('PLANNING_INPUT_STALE');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('R2 zero effective calendar capacity creates nothing',async()=>{
  const a=await actor('zero-effective');await check(a.api.from('calendar_periods').insert({user_id:a.userId,exam_profile_id:a.profileId,period_type:'custom',name:'No study',start_date:week,end_date:dateAdd(week,6),capacity_multiplier:0}));
  const r=await create(a,payload(a,await snap(a)));expect(r.error?.message).toContain('P48_NO_EFFECTIVE_CAPACITY');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('R2 past-day blocks cannot be written',async()=>{
  const a=await actor('past-day'),p=payload(a,await snap(a));p.blocks[0]!.plannedDate=dateAdd(today,-1);
  const r=await create(a,p);expect(r.error?.message).toContain('INVALID_MANUAL_PLAN_DATE');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('R2 ten concurrent creations return one stable plan without cancellation',async()=>{
  const a=await actor('concurrent'),p=payload(a,await snap(a));const result=await Promise.all(Array.from({length:10},()=>create(a,p)));
  expect(result.every(r=>!r.error)).toBe(true);expect(result.filter(r=>r.data.created)).toHaveLength(1);expect(new Set(result.map(r=>r.data.weeklyPlanId)).size).toBe(1);
  const before=await tasks(a);await check(create(a,p));expect(await tasks(a)).toEqual(before);expect(await counts(a)).toEqual({plans:1,tasks:1});record('R2 concurrent creation',{result,tasks:before});
 });
 it('R2 SQL plan INSERT fault leaves no partial plan or tasks',async()=>{
  const a=await actor('plan-fault'),before=await choices(a);
  await sql.unsafe(`create function public.s0_fixture_plan_fault() returns trigger language plpgsql set search_path='' as $$begin if new.user_id='${a.userId}'::uuid then raise exception 'S0_PLAN_FAULT'; end if; return new; end;$$; create trigger s0_fixture_plan_fault before insert on public.weekly_plans for each row execute function public.s0_fixture_plan_fault();`);
  try{const r=await create(a,payload(a,await snap(a)));expect(r.error?.message).toContain('S0_PLAN_FAULT');expect(await counts(a)).toEqual({plans:0,tasks:0});expect(await choices(a)).toEqual(before);}
  finally{await sql.unsafe('drop trigger s0_fixture_plan_fault on public.weekly_plans; drop function public.s0_fixture_plan_fault();');}
 });
 it('R3 new web and service concurrent generation share one authoritative plan',async()=>{
  const a=await actor('web-service'),before=await choices(a);
  const [web,worker]=await Promise.all([http(a,'/p48/week/generate',{intent:'generate_week'}),ensureP48WeekPlanForService(service,a.userId,a.profile,today)]);
  expect(web.status).toBe(201);expect(worker.plan.id).toBe(web.body.plan.id);expect(await counts(a)).toEqual({plans:1,tasks:1});expect(await choices(a)).toEqual(before);
  expect((await tasks(a)).every(t=>t.row.status!=='cancelled')).toBe(true);record('R3 web service race',{web,worker});
 });
 it('R3 two real service calls create once',async()=>{
  const a=await actor('two-service');const result=await Promise.all([ensureP48WeekPlanForService(service,a.userId,a.profile,today),ensureP48WeekPlanForService(service,a.userId,a.profile,today)]);
  expect(result.filter(r=>r.created)).toHaveLength(1);expect(new Set(result.map(r=>r.plan.id)).size).toBe(1);expect(await counts(a)).toEqual({plans:1,tasks:1});
 });
 it('R3 explicit manual first creation racing service cannot cancel a competing creation',async()=>{
  const a=await actor('manual-service-race'),s=await snap(a);
  const [manual,worker]=await Promise.all([a.api.rpc('replace_manual_weekly_plan',{p_payload:{weekStartDate:week,expectedFingerprint:s.fingerprint,blocks:payload(a,s).blocks}}),ensureP48WeekPlanForService(service,a.userId,a.profile,today)]);
  if(manual.error)expect(manual.error.message).toContain('PLANNING_INPUT_STALE');
  const saved=await tasks(a);expect(worker.plan).toBeTruthy();expect(await counts(a)).toEqual({plans:1,tasks:1});expect(saved.every(t=>t.row.status!=='cancelled')).toBe(true);record('R3 manual service race',{manual,worker,tasks:saved});
 });
 it('service identity-binding wrappers are inaccessible to authenticated users',async()=>{
  const a=availability;
  for(const [name,args] of [['service_replace_weekly_availability',{p_user_id:foreign.userId,p_exam_profile_id:foreign.profileId,p_windows:[],p_expected_revision:'fake'}],['service_planning_week_snapshot',{p_user_id:foreign.userId,p_exam_profile_id:foreign.profileId,p_week_start:week}],['service_replace_manual_weekly_plan',{p_user_id:foreign.userId,p_payload:{}}]] as const)expect((await a.api.rpc(name,args)).error?.code).toBe('42501');
 });
 it('R3 service arrives after web: existing tasks stay byte-identical',async()=>{
  const a=await actor('late-service');await check(create(a,payload(a,await snap(a))));const before=await tasks(a);
  const r=await ensureP48WeekPlanForService(service,a.userId,a.profile,today);expect(r.created).toBe(false);expect(await tasks(a)).toEqual(before);
 });
 it('R3 old service signature after absent read cannot replace a new web plan',async()=>{
  const a=await actor('old-late'),absent=await check(a.api.from('weekly_plans').select('id').eq('exam_profile_id',a.profileId));expect(absent).toEqual([]);
  await check(create(a,payload(a,await snap(a))));const before=await tasks(a),legacy=payload(a,{},60);delete legacy.expectedFingerprint;
  const r=await service.rpc('service_replace_manual_weekly_plan',{p_user_id:a.userId,p_payload:legacy});expect(r.error).toBeNull();expect(r.data.created).toBe(false);expect(await tasks(a)).toEqual(before);record('R3 old late service',{earlierRead:absent,result:r,before,after:await tasks(a)});
 });
 it('R3 old service bundle missing fingerprint fails closed for absent week',async()=>{
  const a=await actor('old-absent'),p=payload(a,{});delete p.expectedFingerprint;
  const r=await service.rpc('service_replace_manual_weekly_plan',{p_user_id:a.userId,p_payload:p});expect(r.error?.message).toContain('PLANNING_FRESHNESS_REQUIRED');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it.each(['paused','unselected','missing-target','zero'] as const)('R3 real helper rejects %s without side effects',async kind=>{
  const a=await actor('worker-'+kind,kind!=='zero');
  if(kind==='paused')await check(a.api.from('resources').update({status:'paused'}).eq('id',a.resourceId));
  if(kind==='unselected')await check(a.api.from('user_subjects').update({status:'paused'}).eq('exam_profile_id',a.profileId));
  if(kind==='missing-target')await check(a.api.from('p48_resource_targets').delete().eq('exam_profile_id',a.profileId));
  const before=await choices(a);await expect(ensureP48WeekPlanForService(service,a.userId,a.profile,today)).rejects.toThrow(/P48_.*REQUIRED|P48_CAPACITY_SOURCE_MISSING/);expect(await counts(a)).toEqual({plans:0,tasks:0});expect(await choices(a)).toEqual(before);
  if(kind==='zero'){
   await check(replace(a,windows(),(await state(a)).revision));
   await check(a.api.from('calendar_periods').insert({user_id:a.userId,exam_profile_id:a.profileId,period_type:'custom',name:'Service zero effective calendar',start_date:week,end_date:dateAdd(week,6),capacity_multiplier:0}));
   const configured=await choices(a);await expect(ensureP48WeekPlanForService(service,a.userId,a.profile,today)).rejects.toThrow('P48_CAPACITY_SOURCE_MISSING');
   expect(await counts(a)).toEqual({plans:0,tasks:0});expect(await choices(a)).toEqual(configured);record('R3 zero effective calendar',{choicesPreserved:true,plans:0,tasks:0});
  }
 });
 it.each(['manual','baseline_import','planner_v2'] as const)('R3 existing %s plan and identities are preserved',async kind=>{
  const a=await actor('protected-'+kind);await check(create(a,payload(a,await snap(a))));const task=(await tasks(a))[0]!.row;
  if(kind==='baseline_import')await sql`update public.tasks set source_reason='baseline_import' where id=${task.id}::uuid`;
  if(kind==='planner_v2'){
   const unit=await check(a.api.from('resource_units').insert({resource_id:a.resourceId,name:'Exact owned reading',unit_type:'reading',sort_order:1,page_start:1,page_end:10,estimated_minutes:30}).select('id').single());
   await sql`update public.tasks set source_reason='planner_v2',canonical_workload_identity=${'physical:'+unit.id},canonical_material_view_id=${'physical:'+unit.id},canonical_boundary=${sql.json({kind:'physical_pages',pageStart:1,pageEnd:10,remainingPageStart:1,remainingPageEnd:10})},planner_version='canonical-planner-v2-shadow-v1',planner_proposal_fingerprint='s0-dedicated-fixture' where id=${task.id}::uuid`;
  }
  const before=await tasks(a),existing=await check(a.api.from('weekly_plans').select('*').eq('exam_profile_id',a.profileId));
  await check(create(a,payload(a,{},480)));await ensureP48WeekPlanForService(service,a.userId,a.profile,today);
  expect(await tasks(a)).toEqual(before);expect(await check(a.api.from('weekly_plans').select('*').eq('exam_profile_id',a.profileId))).toEqual(existing);
  if(kind==='planner_v2'){
   const s=await snap(a);await check(a.api.rpc('replace_manual_weekly_plan',{p_payload:{weekStartDate:week,expectedFingerprint:s.fingerprint,blocks:payload(a,s).blocks}}));
   expect((await tasks(a)).find(t=>t.row.id===task.id)!.row).toEqual(before[0]!.row);
  }
 });
 it('configured full local pilot preserves targets and creates a real bounded week',async()=>{
  const a=await actor('full-pilot',false,false);
  await createLocalP48PilotFixture(a.api,{url,userId:a.userId,profileId:a.profileId});
  const before=await choices(a),r=await http(a,'/p48/week/generate',{intent:'generate_week'});expect(r.status).toBe(201);expect(r.body.plan).toBeTruthy();expect(r.body.tasks.every((t:any)=>t.resource_id)).toBe(true);expect(await choices(a)).toEqual(before);
  const saved=await tasks(a);await ensureP48WeekPlanForService(service,a.userId,a.profile,today);expect(await tasks(a)).toEqual(saved);record('configured pilot',{taskCount:saved.length,before,after:await choices(a),plan:r.body.plan});
 });
 it('manual review still permits explicit unstarted manual replacement with real capacity',async()=>{
  const a=await actor('manual-review'),s=await snap(a),r=await check(a.api.rpc('replace_manual_weekly_plan',{p_payload:{weekStartDate:week,expectedFingerprint:s.fingerprint,blocks:payload(a,s).blocks}}));expect(r.insertedTaskCount).toBe(1);
  const first=await tasks(a),fresh=await snap(a);await check(a.api.rpc('replace_manual_weekly_plan',{p_payload:{weekStartDate:week,expectedFingerprint:fresh.fingerprint,availableMinutes:99999,blocks:payload(a,fresh,45).blocks}}));
  const after=await tasks(a);expect(after.find(t=>t.row.id===first[0]!.row.id)!.row.status).toBe('cancelled');expect(after.filter(t=>t.row.status==='ready')).toHaveLength(1);
 });
 it('old API/manual RPC missing freshness fails closed',async()=>{
  const a=await actor('old-manual'),p=payload(a,{});delete p.expectedFingerprint;
  const r=await a.api.rpc('replace_manual_weekly_plan',{p_payload:p});expect(r.error?.message).toContain('PLANNING_FRESHNESS_REQUIRED');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('new API bootstrap stays read-only and Planner gates remain OFF',async()=>{
  const a=await actor('http-gates'),before=await choices(a);const r=await http(a,'/p48/bootstrap',{});expect(r.status).toBe(200);expect(await choices(a)).toEqual(before);expect(await counts(a)).toEqual({plans:0,tasks:0});
  for(const route of ['/planner-v2/confirm','/planner-v2/apply'])expect((await http(a,route,{})).status).toBe(403);
 });

 const parityCases=['base','union','calendar-min','calendar-increase','unavailable-union','extra','negative','unavailable-delta','reserve','override-exception','round-half','credit','actual','past'] as const;
 it.each(parityCases)('SQL/domain effective capacity parity: %s',async kind=>{
  const original=(await snap(availability)).input,input=structuredClone(original);input.availability=windows(120).map(w=>({...w,is_active:true}));input.periods=[];input.exceptions=[];input.overrides=[];input.sessions=[];input.allocations=[];
  const period=(n:number)=>({start_date:today,end_date:today,capacity_multiplier:n});
  const exception=(start:string,end:string)=>({exception_date:today,exception_type:'unavailable',start_time:start,end_time:end});
  if(kind==='union')input.availability.push({...windows()[0],start_time:'10:30',end_time:'11:30',is_active:true});
  if(kind==='calendar-min')input.periods=[period(.75),period(.5)];if(kind==='calendar-increase')input.periods=[period(1.25)];
  if(kind==='unavailable-union')input.exceptions=[exception('10:00','11:00'),exception('10:30','11:30')];
  if(kind==='extra')input.exceptions=[{exception_date:today,exception_type:'extra_available',minutes_delta:30}];
  if(kind==='negative')input.exceptions=[{exception_date:today,exception_type:'custom',minutes_delta:-999}];
  if(kind==='unavailable-delta')input.exceptions=[{...exception('10:00','10:30'),minutes_delta:-10}];
  if(kind==='reserve'||kind==='override-exception')input.overrides=[{capacity_date:today,capacity_minutes:180,reserve_minutes:20}];
  if(kind==='override-exception')input.exceptions=[exception('10:00','11:00')];
  if(kind==='round-half'){input.availability[0].end_time='10:01';input.periods=[period(.5)];}
  if(kind==='credit'||kind==='actual'){input.sessions=[{status:'completed',started_at:today+'T12:00:00+03:00',duration_minutes:40}];input.allocations=[{session_started_at:today+'T12:00:00+03:00',planned_credit_minutes:25}];}
  if(kind==='past')input.today=dateAdd(today,1);
  const mode=kind==='actual'?'manual':'p48',expected:Record<string,number>={};
  for(let i=0;i<7;i++){const date=dateAdd(week,i),context={date,weeklyAvailability:input.availability,calendarPeriods:input.periods.map((p:any)=>({startDate:p.start_date,endDate:p.end_date,capacityMultiplier:p.capacity_multiplier})),scheduleExceptions:input.exceptions.map((e:any)=>({date:e.exception_date,type:e.exception_type,startTime:e.start_time,endTime:e.end_time,minutesDelta:e.minutes_delta}))};
   const base=calculateEffectiveDayCapacity({...context,scheduleExceptions:[]}),effective=calculateEffectiveDayCapacity(context),overrides=new Map(input.overrides.map((r:any)=>[r.capacity_date,r]));
   const spent=date===today?(mode==='manual'&&kind==='actual'?40:kind==='credit'?25:0):0;
   expected[date]=date<input.today?0:Math.max(0,planningCapacityForDate(date,effective,overrides as any,base)-spent);
  }
  const actual=(await sql`select kpss_s0_private.day_capacities(${sql.json(input)},${mode}) result`)[0]!.result;expect(actual).toEqual(expected);record('capacity parity '+kind,{mode,expected,actual});
 });
});
