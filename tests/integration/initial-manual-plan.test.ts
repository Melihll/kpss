import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {afterAll,describe,expect,it} from 'vitest';

const url=process.env.SUPABASE_URL!,key=process.env.SUPABASE_ANON_KEY!,db=process.env.SUPABASE_DB_URL!;
if(url!=='http://127.0.0.1:54321'||new URL(db).hostname!=='127.0.0.1'||new URL(db).port!=='54322')throw Error('EXACT_LOCAL_REQUIRED');
const sql=postgres(db,{max:5,connection:{application_name:'s1b_isolated_acceptance',statement_timeout:20000}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date());
const add=(d:string,n:number)=>{const v=new Date(d+'T12:00:00Z');v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10);};
const week=add(today,1-(new Date(today+'T12:00:00Z').getUTCDay()||7)),next=add(week,7);
const math='20000000-0000-0000-0000-000000000002',turkish='20000000-0000-0000-0000-000000000001';
const check=async(q:any)=>{const r=await q;if(r.error)throw r.error;return r.data;};
const events:any[]=[],actors:any[]=[];
const evidence=(name:string,v:any)=>{if(process.env.S0_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.S0_EVIDENCE_DIR,name),JSON.stringify(v,null,2));};
const record=(name:string,v:any)=>{events.push({name,...v});evidence('first-plan-runtime.json',events);};
async function actor(label:string,options:{capacity?:boolean;source?:boolean;status?:string;legacy?:boolean}={}){
 const api=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),nonce=randomUUID(),email=`s1b-${label}-${nonce}@example.invalid`,password=`Local-${nonce}!`;
 const signed=await check(api.auth.signUp({email,password})),userId=signed.user.id;
 const p=await check(api.from('exam_profiles').insert({user_id:userId,exam_edition_id:'11000000-0000-0000-0000-000000000001',preparation_start_date:today,target_exam_date:'2027-12-21',status:options.status??'draft'}).select('*').single());
 await check(api.from('user_subjects').insert([math,turkish].map(subject_id=>({user_id:userId,exam_profile_id:p.id,subject_id,status:'active'}))));
 let resourceId:string|undefined;
 if(options.source!==false)resourceId=(await check(api.from('resources').insert({user_id:userId,exam_profile_id:p.id,subject_id:math,name:'Explicit isolated first-plan book',resource_type:'book',resource_role:'primary',difficulty:'normal',status:'active'}).select('id').single())).id;
 const a={label,api,userId,profileId:p.id,resourceId,email,password,token:signed.session.access_token};actors.push(a);
 if(options.capacity!==false){
  if(options.legacy){const s=await check(api.rpc('weekly_availability_state',{p_exam_profile_id:p.id}));await check(api.rpc('replace_weekly_availability',{p_exam_profile_id:p.id,p_expected_revision:s.revision,p_windows:Array.from({length:7},(_,i)=>({weekday:i+1,start_time:'10:00',end_time:'11:00',is_active:true}))}));}
  else await capacity(a,60);
 }
 evidence('first-plan-fixtures.json',actors.map(({label,userId,profileId,email,resourceId})=>({label,userId,profileId,email,resourceId})));return a;
}
async function capacity(a:any,n:number){const s=await check(a.api.rpc('study_capacity_state',{p_exam_profile_id:a.profileId}));return check(a.api.rpc('set_study_capacity',{p_exam_profile_id:a.profileId,p_expected_revision:s.revision,p_mode:'daily_minutes',p_days:Array.from({length:7},(_,i)=>({weekday:i+1,minutes:n}))}));}
const block=(a:any,date=next,n=30)=>({plannedDate:date,subjectId:math,resourceId:a.resourceId,workMode:'book',estimatedMinutes:n,detail:'My explicitly selected work'});
const ready=(a:any,w=next)=>check(a.api.rpc('initial_manual_plan_readiness',{p_exam_profile_id:a.profileId,p_week_start:w}));
const preview=(a:any,blocks=[block(a)],w=next)=>check(a.api.rpc('preview_initial_manual_plan',{p_exam_profile_id:a.profileId,p_week_start:w,p_blocks:blocks}));
const intent=(a:any,p:any,w=next,op=randomUUID())=>({intent:'create_initial_manual_plan',contractVersion:'initial-manual-plan-v1',capabilityVersion:1,profileId:a.profileId,operationId:op,weekStartDate:w,expectedConfigurationRevision:p.configurationRevision,reviewedPayloadHash:p.reviewedPayloadHash,blocks:p.blocks});
const commit=(a:any,p:any)=>a.api.rpc('create_initial_manual_plan',{p_payload:p});
const edge=async(a:any,route:string,body?:any)=>{const r=await fetch(url+'/functions/v1/app-api'+route,{method:body?'POST':'GET',headers:{apikey:key,Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
async function product(a:any){const counts:any={};for(const t of ['weekly_plans','tasks','study_sessions','initial_manual_plan_receipts','resource_unit_progress','confirmed_action_proposals','planning_v2_proposals']){const columns=await sql`select column_name from information_schema.columns where table_schema='public' and table_name=${t}`;if(columns.some(c=>c.column_name==='exam_profile_id'))counts[t]=await sql`select to_jsonb(t) v from public.${sql(t)} t where exam_profile_id=${a.profileId}::uuid order by to_jsonb(t)::text`;}counts.profile=await sql`select to_jsonb(p) v from public.exam_profiles p where id=${a.profileId}::uuid`;return counts;}
afterAll(async()=>{evidence('first-plan-runtime.json',events);await sql.end();});
describe.sequential('S1-B actual LOCAL initial manual plan authority',()=>{
 it('readiness accepts two subjects with one source, persisted daily 60, no strategy',async()=>{
  const a=await actor('readiness'),r=await ready(a);expect(r.ready).toBe(true);expect(r.mode).toBe('daily_minutes');expect(r.days[next]).toBe(60);expect(r.resources).toHaveLength(1);expect(r.subjectsWithoutSources).toEqual([{subjectId:turkish,name:'Türkçe'}]);record('B1 ready',{profileId:a.profileId,readiness:r});
 });
 it('distinguishes incomplete profile, missing capacity and missing source',async()=>{
  const a=await actor('missing',{capacity:false,source:false});await check(a.api.from('exam_profiles').update({target_exam_date:null}).eq('id',a.profileId));const r=await ready(a);expect(r.reasons).toEqual(expect.arrayContaining(['PROFILE_INCOMPLETE','MISSING_CAPACITY','MISSING_SUITABLE_RESOURCE']));record('missing inputs',{r});
 });
 it('only the resource-backed selected subject can be planned',async()=>{
  const a=await actor('paired'),p=await preview(a,[{...block(a),subjectId:turkish}]);expect(p.valid).toBe(false);expect(p.errors).toContainEqual({block:0,field:'resourceId',code:'INVALID_RESOURCE'});
 });
 it('preview normalizes only human blocks, returns exact totals and makes zero product writes; cancel is read-only',async()=>{
  const a=await actor('cancel'),before=await product(a),blocks=[{...block(a),detail:'  own detail  '},block(a,add(next,1),15)],p=await preview(a,blocks);expect(p.valid).toBe(true);expect(p.blocks).toEqual([{...blocks[0],detail:'own detail'},blocks[1]]);expect(p.dayTotals).toEqual({[next]:30,[add(next,1)]:15});expect(p.totalMinutes).toBe(45);expect(await product(a)).toEqual(before);record('B2 pure preview cancelled',{profileId:a.profileId,before,preview:p,after:await product(a)});
 });
 it('explicit create atomically activates draft and returns identical receipt/task IDs on same retry',async()=>{
  const a=await actor('retry'),p=await preview(a),payload=intent(a,p),one=await check(commit(a,payload)),two=await check(commit(a,payload));expect(two).toEqual(one);expect(one.taskIds).toHaveLength(1);const stored=await product(a);expect(stored.weekly_plans).toHaveLength(1);expect(stored.tasks).toHaveLength(1);expect(stored.initial_manual_plan_receipts).toHaveLength(1);expect(stored.profile[0].v.status).toBe('active');record('B3 committed retry',{userId:a.userId,profileId:a.profileId,payload,one,two,stored});
 });
 it('same operationId with different payload conflicts before any replacement',async()=>{
  const a=await actor('op-conflict'),payload=intent(a,await preview(a));await check(commit(a,payload));const before=await product(a);expect((await commit(a,{...payload,blocks:[block(a,next,15)]})).error?.message).toContain('IDEMPOTENCY_CONFLICT');expect(await product(a)).toEqual(before);
 });
 it('committed receipt remains identical when the owned profile is later paused',async()=>{
  const a=await actor('paused-retry'),payload=intent(a,await preview(a)),created=await check(commit(a,payload));await check(a.api.from('exam_profiles').update({status:'paused'}).eq('id',a.profileId));const retried=await commit(a,payload);record('retry after profile pause',{created,retried});expect(retried.error).toBeNull();expect(retried.data).toEqual(created);
 });
 it('different operation cannot replace an existing initial plan',async()=>{
  const a=await actor('existing'),payload=intent(a,await preview(a));await check(commit(a,payload));const before=await product(a),r=await ready(a);expect(r.reasons).toContain('PLAN_ALREADY_EXISTS');expect((await commit(a,{...payload,operationId:randomUUID()})).error?.message).toContain('PLAN_ALREADY_EXISTS');expect(await product(a)).toEqual(before);
 });
 it('concurrent identical operation returns identical committed results',async()=>{
  const a=await actor('concurrent-same'),payload=intent(a,await preview(a)),r=await Promise.all([commit(a,payload),commit(a,payload)]);expect(r.every(x=>!x.error)).toBe(true);expect(r[0].data).toEqual(r[1].data);expect((await product(a)).tasks).toHaveLength(1);record('same operation concurrency',{r});
 });
 it('concurrent distinct operations create exactly one plan, other gets existing conflict',async()=>{
  const a=await actor('concurrent-different'),p=await preview(a),r=await Promise.all([commit(a,intent(a,p)),commit(a,intent(a,p))]);expect(r.filter(x=>!x.error)).toHaveLength(1);expect(r.find(x=>x.error)?.error.message).toContain('PLAN_ALREADY_EXISTS');expect((await product(a)).tasks).toHaveLength(1);record('distinct operation concurrency',{r});
 });
 it('60-minute day rejects 120 minutes regardless of supplied budget',async()=>{
  const a=await actor('over'),p=await preview(a,[block(a,next,120)]);expect(p.valid).toBe(false);expect(p.errors).toContainEqual({field:'plannedDate',date:next,code:'OVER_DAY_CAPACITY'});expect((await commit(a,{...intent(a,p),availableMinutes:99999})).error?.message).toContain('INVALID_INITIAL_PLAN_PAYLOAD');expect((await commit(a,intent(a,p))).error?.message).toContain('FIRST_PLAN_NOT_READY');expect((await product(a)).weekly_plans).toHaveLength(0);
 });
 it('relevant capacity change invalidates review and preserves draft profile',async()=>{
  const a=await actor('stale-capacity'),payload=intent(a,await preview(a));await capacity(a,90);expect((await commit(a,payload)).error?.message).toContain('FIRST_PLAN_STALE');expect((await product(a)).profile[0].v.status).toBe('draft');record('capacity stale',{payload,result:(await commit(a,payload)).error});
 });
 it.each(['paused','deleted'])('source %s during review invalidates commit',async status=>{
  const a=await actor('stale-source'),payload=intent(a,await preview(a));if(status==='deleted')await check(a.api.from('resources').delete().eq('id',a.resourceId));else await check(a.api.from('resources').update({status}).eq('id',a.resourceId));expect((await commit(a,payload)).error?.message).toContain('FIRST_PLAN_STALE');expect((await product(a)).tasks).toHaveLength(0);
 });
 it('source writer and commit serialize on profile lock; committed plan uses current source state',async()=>{
  const a=await actor('lock'),payload=intent(a,await preview(a));let release!:()=>void,locked!:()=>void;const got=new Promise<void>(r=>locked=r),gate=new Promise<void>(r=>release=r);
  const writer=sql.begin(async tx=>{await tx`update public.resources set status='paused' where id=${a.resourceId}::uuid`;locked();await gate;});await got;
  const pending=commit(a,payload);release();await writer;expect((await pending).error?.message).toContain('FIRST_PLAN_STALE');expect((await product(a)).tasks).toHaveLength(0);
 });
 it('cross-user, anonymous and unbound service calls denied; raw table and column DML stays closed',async()=>{
  const a=await actor('owner'),b=await actor('foreign'),payload=intent(a,await preview(a));expect((await commit(b,payload)).error?.message).toContain('EXAM_PROFILE_NOT_FOUND');
  const anon=createClient(url,key,{auth:{persistSession:false}}),service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  for(const api of [anon,service])expect((await commit({...a,api},payload)).error).toBeTruthy();
  expect((await b.api.rpc('preview_initial_manual_plan',{p_exam_profile_id:a.profileId,p_week_start:next,p_blocks:[block(a)]})).error).toBeTruthy();
  const privileges=await sql`select r,t,has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') writable from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['weekly_plans','tasks','task_resource_units','initial_manual_plan_receipts']) t`;
  expect(privileges.every(p=>!p.writable)).toBe(true);expect((await a.api.from('initial_manual_plan_receipts').insert({user_id:a.userId,exam_profile_id:a.profileId})).error?.code).toBe('42501');record('ownership and DML',{privileges});
 });
 it('failure after activation/plan/tasks rolls all writes back including receipt',async()=>{
  const a=await actor('fault'),before=await product(a),payload=intent(a,await preview(a)),name='s1b_fault_'+randomUUID().replaceAll('-','');
  try{await sql.unsafe(`create function kpss_s0_private.${name}() returns trigger language plpgsql set search_path='' as $$ begin if new.exam_profile_id='${a.profileId}'::uuid then raise exception 'S1B_ISOLATED_FAILURE'; end if; return new; end $$; create trigger ${name} before insert on public.initial_manual_plan_receipts for each row execute function kpss_s0_private.${name}()`);
   expect((await commit(a,payload)).error?.message).toContain('S1B_ISOLATED_FAILURE');expect(await product(a)).toEqual(before);record('atomic failure',{profileId:a.profileId,before,after:await product(a)});
  }finally{await sql.unsafe(`drop trigger if exists ${name} on public.initial_manual_plan_receipts; drop function if exists kpss_s0_private.${name}()`);}
  expect((await check(commit(a,payload))).taskIds).toHaveLength(1);
 });
 it('real dropped HTTP response recovers via owned operation and same retry without duplicate work',async()=>{
  const a=await actor('timeout'),payload=intent(a,await preview(a));let delivered:any;
  const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(Buffer.from(c));delivered=await edge(a,'/initial-plan/create',JSON.parse(Buffer.concat(chunks).toString()));res.destroy();}catch{res.destroy();}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try{await expect(fetch(`http://127.0.0.1:${(server.address() as any).port}/`,{method:'POST',body:JSON.stringify(payload)})).rejects.toThrow();expect(delivered.status).toBe(201);
   const outcome=await edge(a,`/initial-plan/operation?profileId=${a.profileId}&operationId=${payload.operationId}`),retry=await edge(a,'/initial-plan/create',payload);expect(outcome.body.outcome).toBe('committed');expect(retry.body).toEqual(delivered.body);expect(outcome.body.result).toEqual(delivered.body);expect((await product(a)).tasks).toHaveLength(1);record('lost response recovered',{delivered,outcome,retry});
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
 });
 it('current-week Edge UI projection returns actual IDs and only today tasks',async()=>{
  const a=await actor('current'),p=await preview(a,[block(a,today)],week),create=await edge(a,'/initial-plan/create',intent(a,p,week));expect(create.status).toBe(201);const view=await edge(a,'/initial-plan/today');expect(view.status).toBe(200);expect(view.body.plan.id).toBe(create.body.weeklyPlanId);expect(view.body.summary.dailyPlan.tasks[0].id).toBe(create.body.taskIds[0]);expect(view.body.tasks[0].resources.name).toBe('Explicit isolated first-plan book');record('current actual IDs',{profileId:a.profileId,create,view});
 });
 it('explicit next week remains upcoming and cannot start through UI endpoint today',async()=>{
  const a=await actor('upcoming'),created=await check(commit(a,intent(a,await preview(a)))),view=await edge(a,'/initial-plan/today');expect(view.body.upcomingStartDate).toBe(next);expect(view.body.summary.dailyPlan.tasks).toEqual([]);const start=await edge(a,'/study-sessions/start',{taskId:created.taskIds[0]});expect(start.status).toBe(409);expect(start.body.error.code).toBe('TASK_NOT_ELIGIBLE_TODAY');expect((await product(a)).study_sessions).toHaveLength(0);record('next week truthful',{profileId:a.profileId,created,view,start});
 });
 it('legacy time windows remain separate and support explicit basic initial plan',async()=>{
  const a=await actor('legacy',{legacy:true}),r=await ready(a),p=await preview(a);expect(r.mode).toBe('time_windows');expect(r.days[next]).toBe(60);expect(p.valid).toBe(true);await check(commit(a,intent(a,p)));expect((await check(a.api.rpc('study_capacity_state',{p_exam_profile_id:a.profileId}))).windows).toHaveLength(7);record('legacy supported',{r,p});
 });
 it('daily timed unavailable fails closed, no clock windows invented',async()=>{
  const a=await actor('timed');await check(a.api.from('schedule_exceptions').insert({user_id:a.userId,exam_profile_id:a.profileId,exception_date:next,exception_type:'unavailable',start_time:'10:00',end_time:'10:30'}));const r=await ready(a);expect(r.reasons).toContain('CAPACITY_TIMED_EXCEPTION_UNSUPPORTED');expect((await preview(a)).valid).toBe(false);expect((await check(a.api.rpc('study_capacity_state',{p_exam_profile_id:a.profileId}))).windows).toEqual([]);
 });
 it('zero capacity and elapsed current-week days are distinct from usable next week',async()=>{
  const a=await actor('week-readiness');await capacity(a,0);expect((await ready(a)).reasons).toContain('MISSING_CAPACITY');
  const state=await check(a.api.rpc('study_capacity_state',{p_exam_profile_id:a.profileId}));const currentDay=new Date(today+'T12:00:00Z').getUTCDay()||7;
  const values=Array.from({length:7},(_,i)=>({weekday:i+1,minutes:i+1<currentDay?60:0}));
  await check(a.api.rpc('set_study_capacity',{p_exam_profile_id:a.profileId,p_mode:'daily_minutes',p_days:values,p_expected_revision:state.revision}));
  const r=await ready(a,week);if(currentDay>1){expect(r.reasons).toContain('NO_REMAINING_CAPACITY');expect((await ready(a,next)).ready).toBe(true);}else expect(r.reasons).toContain('MISSING_CAPACITY');record('week readiness',{current:r,next:await ready(a,next)});
 });
 it('weekly persisted ceiling rejects blocks that individually fit daily budgets',async()=>{
  const a=await actor('weekly-ceiling');await sql`insert into public.p48_week_capacity_overrides(user_id,exam_profile_id,week_start_date,capacity_minutes,reserve_minutes,planning_budget_minutes,source_key) values(${a.userId}::uuid,${a.profileId}::uuid,${next}::date,420,375,45,'isolated_s1b_week')`;
  const p=await preview(a,[block(a,next,30),block(a,add(next,1),30)]);expect(p.days[next]).toBe(60);expect(p.weeklyBudgetMinutes).toBe(45);expect(p.errors).toContainEqual({field:'blocks',code:'OVER_WEEK_CAPACITY'});expect(p.valid).toBe(false);record('week ceiling',{p});
 });
 it('manual actual minutes reduce initial budget without converting extra study into planned credit',async()=>{
  const a=await actor('manual-actual',{status:'active'});const actual=await check(a.api.rpc('record_retroactive_session',{p_payload:{examProfileId:a.profileId,subjectId:math,resourceId:a.resourceId,durationMinutes:15,accountingIntent:'extra',idempotencyKey:randomUUID()}}));expect(actual.allocation.planned_credit_minutes).toBe(0);
  const r=await ready(a,week);expect(r.days[today]).toBe(45);expect((await preview(a,[block(a,today,46)],week)).valid).toBe(false);const p=await preview(a,[block(a,today,30)],week);expect(p.valid).toBe(true);await check(commit(a,intent(a,p,week)));record('actual versus credit',{actual,r});
 });
 it('unknown operation outcome is read-only and never treated as definitive failure',async()=>{
  const a=await actor('unknown-outcome'),before=await product(a),r=await check(a.api.rpc('initial_manual_plan_operation',{p_exam_profile_id:a.profileId,p_operation_id:randomUUID()}));expect(r.outcome).toBe('unknown');expect(r.result).toBeNull();expect(await product(a)).toEqual(before);
 });
 it('explicit periods, minute exceptions, daily reserve and weekly ceiling remain authoritative',async()=>{
  const a=await actor('effective');await check(a.api.from('calendar_periods').insert({user_id:a.userId,exam_profile_id:a.profileId,name:'Isolated reduced week',period_type:'custom',start_date:next,end_date:add(next,6),capacity_multiplier:0.5}));
  await check(a.api.from('schedule_exceptions').insert({user_id:a.userId,exam_profile_id:a.profileId,exception_date:next,exception_type:'custom',minutes_delta:-5}));
  await sql`insert into public.p48_daily_capacity_overrides(user_id,exam_profile_id,capacity_date,capacity_minutes,reserve_minutes,source_key) values(${a.userId}::uuid,${a.profileId}::uuid,${next}::date,60,20,'isolated_s1b')`;
  const r=await ready(a);expect(r.days[next]).toBe(35);expect((await preview(a,[block(a,next,36)])).valid).toBe(false);expect((await preview(a,[block(a,next,35)])).valid).toBe(true);record('effective budget',{r});
 });
 it('only current and next Monday allowed; past/preparation/exam boundaries reject field date',async()=>{
  const a=await actor('dates');expect((await ready(a,add(next,7))).reasons).toContain('UNSUPPORTED_WEEK');expect((await preview(a,[block(a,add(today,-1))],week)).valid).toBe(false);
  await check(a.api.from('exam_profiles').update({target_exam_date:next}).eq('id',a.profileId));const p=await preview(a,[block(a,add(next,1))]);expect(p.valid).toBe(false);expect(p.errors).toContainEqual({block:0,field:'plannedDate',code:'INVALID_DATE'});expect((await ready(a)).days[add(next,1)]).toBe(0);
 });
 it.each([0,-1,1.5,481,'30',null])('strict integer minutes reject %s',async n=>{const a=await actor('minutes'),p=await preview(a,[{...block(a),estimatedMinutes:n as any}]);expect(p.valid).toBe(false);expect(p.errors).toContainEqual({block:0,field:'estimatedMinutes',code:'INVALID_MINUTES'});});
 it('rejects incompatible work modes and forged canonical/Planner fields',async()=>{
  const a=await actor('strict'),b:any=block(a);expect((await preview(a,[{...b,workMode:'video'}])).errors).toContainEqual({block:0,field:'workMode',code:'INVALID_WORK_MODE'});
  expect((await preview(a,[{...b,canonicalBoundary:{startPage:1}}])).errors).toContainEqual({block:0,field:'block',code:'UNSUPPORTED_FIELD'});
  const payload=intent(a,await preview(a));expect((await commit(a,{...payload,plannerProposalId:randomUUID()})).error?.message).toContain('INVALID_INITIAL_PLAN_PAYLOAD');
 });
 it('null and non-string work modes are explicit field errors, never inferred',async()=>{
  const a=await actor('null-mode');for(const workMode of [null,1,{},[]]){const p=await preview(a,[{...block(a),workMode:workMode as any}]);record('strict work mode',{workMode,preview:p});expect(p.valid).toBe(false);expect(p.errors).toContainEqual({block:0,field:'workMode',code:'INVALID_WORK_MODE'});}
 });
 it('existing protected work reduces displayed day/weekly budget and blocks initial creation',async()=>{
  const a=await actor('protected'),payload=intent(a,await preview(a));
  await sql`insert into public.tasks(user_id,exam_profile_id,subject_id,resource_id,task_type,work_mode,title,planned_date,estimated_minutes,importance,priority_score,status,source_reason,dedupe_key) values(${a.userId}::uuid,${a.profileId}::uuid,${math}::uuid,${a.resourceId}::uuid,'custom','book','Isolated existing commitment',${next}::date,30,'important',60,'ready','manual',${randomUUID()})`;
  const r=await ready(a);record('protected budget',{r});expect(r.reasons).toContain('PROTECTED_COMMITMENT_EXISTS');expect(r.days[next]).toBe(30);expect(r.weeklyBudgetMinutes).toBe(390);const before=await product(a);expect((await commit(a,payload)).error?.message).toContain('PROTECTED_COMMITMENT_EXISTS');expect(await product(a)).toEqual(before);
 });
 it('review hash mismatch and unavailable contract fail closed',async()=>{
  const a=await actor('contract'),payload=intent(a,await preview(a));expect((await commit(a,{...payload,blocks:[block(a,next,15)]})).error?.message).toContain('REVIEW_PAYLOAD_MISMATCH');expect((await commit(a,{...payload,capabilityVersion:2})).error?.message).toContain('INITIAL_PLAN_UNAVAILABLE');expect((await product(a)).weekly_plans).toHaveLength(0);
 });
 it('actual authenticated Edge readiness/preview works for drafts; anonymous request denied',async()=>{
  const a=await actor('edge-draft'),before=await product(a),r=await edge(a,`/initial-plan/readiness?profileId=${a.profileId}&weekStartDate=${next}`),p=await edge(a,'/initial-plan/preview',{profileId:a.profileId,weekStartDate:next,blocks:[block(a)]});expect(r.status).toBe(200);expect(p.body.valid).toBe(true);expect(await product(a)).toEqual(before);
  expect((await fetch(url+`/functions/v1/app-api/initial-plan/readiness?profileId=${a.profileId}&weekStartDate=${next}`,{headers:{apikey:key}})).status).toBe(401);record('Edge draft pure',{r,p});
 });
 it('Planner V2 Confirm/Apply remain unavailable for new manual actor',async()=>{
  const a=await actor('gates',{status:'active'});for(const route of ['/planner-v2/confirm','/planner-v2/apply']){const r=await edge(a,route,{});expect(r.status).toBe(403);expect(r.body.error.code).toBe(route.endsWith('/confirm')?'PLANNER_V2_CONFIRM_DISABLED':'PLANNER_V2_APPLY_DISABLED');record('gates remain closed',{route,r});}
 });
 it('persisted task has no fabricated material identity or exact unit links',async()=>{
  const a=await actor('material'),created=await check(commit(a,intent(a,await preview(a)))),task=(await product(a)).tasks[0].v;
  for(const k of ['curriculum_node_id','resource_section_id','canonical_workload_identity','canonical_material_view_id','canonical_boundary','planner_version','planner_proposal_fingerprint'])expect(task[k]).toBeNull();expect((await sql`select * from public.task_resource_units where task_id=${created.taskIds[0]}::uuid`)).toHaveLength(0);expect(task.work_mode).toBe('book');record('generic material honest',{created,task});
 });
});
