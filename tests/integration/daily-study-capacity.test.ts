import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {afterAll,describe,expect,it} from 'vitest';
import {loadCanonicalCapacityReadOnly} from '../../supabase/functions/_shared/canonical-capacity-readonly.ts';

const url=process.env.SUPABASE_URL!,key=process.env.SUPABASE_ANON_KEY!,db=process.env.SUPABASE_DB_URL!;
if(url!=='http://127.0.0.1:54321'||new URL(db).hostname!=='127.0.0.1'||new URL(db).port!=='54322')throw Error('EXACT_LOCAL_REQUIRED');
const sql=postgres(db,{max:5,connection:{application_name:'s1_daily_isolated',statement_timeout:20000}});
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const add=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date()),weekday=new Date(today+'T12:00:00Z').getUTCDay()||7,week=add(today,1-weekday),next=add(week,7);
const math='20000000-0000-0000-0000-000000000002';
const days=(values=[120,180,60,120,180,0,0])=>values.map((minutes,i)=>({weekday:i+1,minutes}));
const check=async(q:any)=>{const r=await q;if(r.error)throw r.error;return r.data;};
const events:any[]=[],actors:any[]=[];
const evidence=(name:string,value:any)=>{if(process.env.S0_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.S0_EVIDENCE_DIR,name),JSON.stringify(value,null,2));};
const record=(name:string,value:any)=>{events.push({name,...value});evidence('daily-capacity-runtime.json',events);};
async function actor(label:string,status='active'){
 const api=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),nonce=randomUUID(),email=`s1-${label}-${nonce}@example.invalid`,password=`Local-${nonce}!`;
 const signed=await check(api.auth.signUp({email,password}));expect(signed.session).toBeTruthy();
 const userId=signed.user.id,p=await check(api.from('exam_profiles').insert({user_id:userId,exam_edition_id:'11000000-0000-0000-0000-000000000001',preparation_start_date:today,target_exam_date:'2027-12-21',status}).select('*').single());
 const a={label,api,userId,profileId:p.id,email,password,token:signed.session.access_token};actors.push(a);
 evidence('daily-capacity-fixtures.json',actors.map(({label,userId,profileId,email})=>({label,userId,profileId,email})));return a;
}
const state=(a:any)=>check(a.api.rpc('study_capacity_state',{p_exam_profile_id:a.profileId}));
const save=(a:any,d:any,r:string,mode='daily_minutes')=>a.api.rpc('set_study_capacity',{p_exam_profile_id:a.profileId,p_mode:mode,p_days:d,p_expected_revision:r});
const readiness=(a:any,w=next,proposal?:any)=>check(a.api.rpc('study_capacity_readiness',{p_exam_profile_id:a.profileId,p_week_start:w,...(proposal?{p_proposed_mode:'daily_minutes',p_proposed_days:proposal}:{})}));
const snapshot=(a:any,w=next)=>check(a.api.rpc('planning_week_snapshot',{p_exam_profile_id:a.profileId,p_week_start:w}));
async function windows(a:any){const s=await check(a.api.rpc('weekly_availability_state',{p_exam_profile_id:a.profileId}));return check(a.api.rpc('replace_weekly_availability',{p_exam_profile_id:a.profileId,p_expected_revision:s.revision,p_windows:Array.from({length:7},(_,i)=>({weekday:i+1,start_time:'10:00',end_time:'15:00',label:'Explicit isolated legacy capacity'}))}));}
async function configured(a:any){
 await check(a.api.from('user_subjects').insert({user_id:a.userId,exam_profile_id:a.profileId,subject_id:math,status:'active'}));
 const resource=await check(a.api.from('resources').insert({user_id:a.userId,exam_profile_id:a.profileId,subject_id:math,name:'Isolated capacity book',resource_type:'book',resource_role:'primary',difficulty:'normal',status:'active'}).select('id').single());
 a.resourceId=resource.id;
 await check(a.api.from('p48_strategy_profiles').insert({user_id:a.userId,exam_profile_id:a.profileId,score_type:'KPSSP48',target_exam_date:'2027-12-21',weekly_target_minutes:660,monthly_target_minutes:2640,status:'active',source_note:'Explicit isolated S1 test only'}));
 await check(a.api.from('p48_resource_targets').insert({user_id:a.userId,exam_profile_id:a.profileId,resource_id:a.resourceId,planned_minutes:1000,sequence_order:1,work_mode:'book'}));
}
const generate=async(a:any,n:number,w=next)=>a.api.rpc('create_p48_week_once',{p_payload:{intent:'generate_week',weekStartDate:w,expectedFingerprint:(await snapshot(a,w)).fingerprint,availableMinutes:99999,blocks:[{plannedDate:w,subjectId:math,resourceId:a.resourceId,estimatedMinutes:n,workMode:'book',title:'Explicit isolated study'}]}});
const edge=async(a:any,route:string,body?:any)=>{const r=await fetch(url+'/functions/v1/app-api'+route,{method:body?'POST':'GET',headers:{apikey:key,Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};

afterAll(async()=>{evidence('daily-capacity-runtime.json',events);await sql.end();});
describe.sequential('S1-A actual LOCAL daily capacity',()=>{
 it('persists seven integer budgets and 660 minutes on a new owned draft, without clock windows',async()=>{
  const a=await actor('draft','draft'),before=await state(a),saved=await check(save(a,days(),before.revision)),after=await state(a),ready=await readiness(a);
  expect(saved.changed).toBe(true);expect(after.days).toEqual(days());expect(after.mode).toBe('daily_minutes');expect(after.windows).toEqual([]);expect(ready.weeklyGrossMinutes).toBe(660);expect(ready.remainingMinutes).toBe(660);
  record('660 persisted',{actor:a.label,userId:a.userId,profileId:a.profileId,before,saved,after,ready});
 });
 it('refresh client and real logout/login retain exact values',async()=>{
  const a=await actor('relogin');await check(save(a,days(),(await state(a)).revision));await a.api.auth.signOut();
  const fresh=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});await check(fresh.auth.signInWithPassword({email:a.email,password:a.password}));
  expect((await state({...a,api:fresh})).days).toEqual(days());record('relogin exact',{profileId:a.profileId,days:(await state({...a,api:fresh})).days});
 });
 it('identical stale retry preserves revision and creates one history row',async()=>{
  const a=await actor('idempotent'),before=await state(a),one=await check(save(a,days(),before.revision)),two=await check(save(a,days(),before.revision));
  expect(two.changed).toBe(false);expect(two.revision).toBe(one.revision);expect((await sql`select count(*)::int n from public.study_capacity_history where exam_profile_id=${a.profileId}::uuid`)[0].n).toBe(1);record('idempotent',{one,two});
 });
 it('real LOCAL socket loss after committed RPC is safely recovered by read and identical retry',async()=>{
  const a=await actor('lost-response'),before=await state(a);let delivered:any=null;
  const proxy=createServer(async(req,res)=>{
   try {
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const r=await fetch(url+'/rest/v1/rpc/set_study_capacity',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:Buffer.concat(chunks)});
    delivered={status:r.status,data:await r.json()};res.destroy();
   } catch {res.destroy();}
  });
  await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  try {
   const port=(proxy.address() as {port:number}).port;
   await expect(fetch(`http://127.0.0.1:${port}/`,{method:'POST',body:JSON.stringify({p_exam_profile_id:a.profileId,p_mode:'daily_minutes',p_days:days(),p_expected_revision:before.revision})})).rejects.toThrow();
   expect(delivered.status).toBe(200);expect((await state(a)).days).toEqual(days());const retry=await check(save(a,days(),before.revision));expect(retry.changed).toBe(false);
   expect((await sql`select count(*)::int n from public.study_capacity_history where exam_profile_id=${a.profileId}::uuid`)[0].n).toBe(1);record('actual dropped HTTP response',{delivered,after:await state(a),retry});
  } finally {await new Promise<void>((resolve,reject)=>proxy.close(error=>error?reject(error):resolve()));}
 });
 it('two different concurrent writes serialize and expose a clear revision conflict',async()=>{
  const a=await actor('concurrent'),revision=(await state(a)).revision;
  const results=await Promise.all([save(a,days(),revision),save(a,days([30,30,30,30,30,0,0]),revision)]);
  expect(results.filter(r=>!r.error)).toHaveLength(1);expect(results.find(r=>r.error)?.error.message).toContain('CAPACITY_CONFLICT');record('concurrency',{profileId:a.profileId,results,after:await state(a)});
 });
 it('failure after preference write rolls preference and history back on an isolated profile',async()=>{
  const a=await actor('fault');await check(save(a,days(),(await state(a)).revision));const before=await state(a),name='s1_fault_'+randomUUID().replaceAll('-','');
  try {
   await sql.unsafe(`create function kpss_s0_private.${name}() returns trigger language plpgsql set search_path='' as $$ begin if new.exam_profile_id='${a.profileId}'::uuid then raise exception 'S1_ISOLATED_FAILURE'; end if; return new; end $$; create trigger ${name} before insert on public.study_capacity_history for each row execute function kpss_s0_private.${name}()`);
   const failed=await save(a,days([60,60,60,60,60,0,0]),before.revision);expect(failed.error?.message).toContain('S1_ISOLATED_FAILURE');expect(await state(a)).toEqual(before);record('atomic rollback',{profileId:a.profileId,before,error:failed.error,after:await state(a)});
  } finally {await sql.unsafe(`drop trigger if exists ${name} on public.study_capacity_history; drop function if exists kpss_s0_private.${name}()`);}
 });
 it.each([-1,1441,1.5,'60',null])('rejects invalid minutes %s and preserves saved state',async invalid=>{
  const a=await actor('invalid'),before=await state(a),bad:any=days();bad[0].minutes=invalid;
  expect((await save(a,bad,before.revision)).error?.message).toContain('INVALID_DAILY_CAPACITY');expect(await state(a)).toEqual(before);
 });
 it('rejects duplicate weekdays, missing days, extra fields and oversized weekly capacity',async()=>{
  const a=await actor('shape'),before=await state(a);
  for(const bad of [days().slice(1),days().map(d=>({...d,weekday:1})),days().map(d=>({...d,start_time:'18:00'})),days(Array(7).fill(2000))])expect((await save(a,bad,before.revision)).error?.message).toContain('INVALID_DAILY_CAPACITY');
  expect(await state(a)).toEqual(before);
 });
 it('cross-user, anonymous, service without actor and raw DML are denied',async()=>{
  const a=await actor('owner'),b=await actor('foreign'),before=await state(a),anon=createClient(url,key,{auth:{persistSession:false}});
  expect((await save({...a,api:b.api},days(),before.revision)).error).toBeTruthy();
  expect((await save({...a,api:anon},days(),before.revision)).error).toBeTruthy();
  expect((await save({...a,api:service},days(),before.revision)).error?.message).toContain('UNAUTHORIZED');
  for(const api of [a.api,service]){
   const r=await api.from('study_capacity_preferences').insert({exam_profile_id:a.profileId,user_id:a.userId,mode:'daily_minutes',days:days(),revision:1});expect(r.error?.code).toBe('42501');
  }
  expect((await state(a)).mode).toBe('time_windows');record('ownership denied',{owner:a.profileId,foreign:b.userId});
 });
 it('retained legacy windows are untouched and never added to daily minutes; old client fails closed',async()=>{
  const a=await actor('no-double');const old=await windows(a),before=await state(a);await check(save(a,days(),before.revision));
  const after=await state(a),s=await snapshot(a),r=await readiness(a);
  expect(after.windows).toEqual(before.windows);expect(s.dayCapacities[next]).toBe(120);expect(s.dayCapacities[add(next,5)]).toBe(0);expect(r.weeklyGrossMinutes).toBe(660);
  const legacy=await a.api.rpc('replace_weekly_availability',{p_exam_profile_id:a.profileId,p_expected_revision:old.revision,p_windows:[]});expect(legacy.error?.message).toContain('CAPACITY_MODE_CHANGE_REQUIRED');
  record('no double count',{before,after,snapshot:s,ready:r,legacyError:legacy.error});
 });
 it('R1 window writer and daily mode writer share the same profile lock and reject a cross-source race',async()=>{
  const a=await actor('r1-race');await windows(a);const before=await state(a);
  const results=await Promise.all([save(a,days(),before.revision),a.api.rpc('replace_weekly_availability',{p_exam_profile_id:a.profileId,p_expected_revision:before.windowsRevision,p_windows:[{weekday:1,start_time:'10:00',end_time:'11:00',label:'Explicit competing writer'}]})]);
  expect(results.filter(r=>!r.error)).toHaveLength(1);const error=results.find(r=>r.error)?.error.message;
  expect(error==='CAPACITY_CONFLICT'||error==='CAPACITY_MODE_CHANGE_REQUIRED').toBe(true);
  const after=await state(a);if(after.mode==='daily_minutes')expect(after.windows).toEqual(before.windows);else expect(after.windows).toHaveLength(1);record('R1 daily cross-source race',{results,after});
 });
 it('explicit switch back restores retained legacy authority and keeps daily history',async()=>{
  const a=await actor('switch');await windows(a);await check(save(a,days(),(await state(a)).revision));const daily=await state(a);
  await check(save(a,null,daily.revision,'time_windows'));const back=await state(a),s=await snapshot(a);
  expect(back.windows).toEqual(daily.windows);expect(back.days).toEqual(daily.days);expect(s.dayCapacities[next]).toBe(300);expect(s.input.capacitySource).toBeUndefined();
  expect((await sql`select count(*)::int n from public.study_capacity_history where exam_profile_id=${a.profileId}::uuid`)[0].n).toBe(2);record('explicit switch',{daily,back});
 });
 it('zero capacity is saved honestly and is never plan ready',async()=>{
  const a=await actor('zero');await check(save(a,days(Array(7).fill(0)),(await state(a)).revision));const r=await readiness(a);expect(r.status).toBe('NO_CAPACITY_ENTERED');expect(r.planReady).toBe(false);expect(r.remainingMinutes).toBe(0);record('zero',{ready:r});
 });
 it('current and next weeks use remaining dates, not gross recurring totals',async()=>{
  const a=await actor('selected-week');await check(save(a,days(),(await state(a)).revision));const current=await readiness(a,week),future=await readiness(a);
  expect(current.weeklyGrossMinutes).toBe(660);expect(current.remainingMinutes).toBe(days().filter(d=>d.weekday>=weekday).reduce((n,d)=>n+d.minutes,0));expect(future.remainingMinutes).toBe(660);record('current next',{today,current,future});
 });
 it('daily bounds allow 1440 and total 10080; preparation and explicit target dates clip usable days',async()=>{
  const a=await actor('date-bounds');await check(save(a,days(Array(7).fill(1440)),(await state(a)).revision));
  expect((await readiness(a)).weeklyGrossMinutes).toBe(10080);
  await check(a.api.from('exam_profiles').update({preparation_start_date:add(next,2),target_exam_date:add(next,4)}).eq('id',a.profileId));
  const r=await readiness(a);expect(r.remainingMinutes).toBe(4320);expect(r.dayCapacities[next]).toBe(0);expect(r.dayCapacities[add(next,5)]).toBe(0);record('date bounds',{ready:r});
 });
 it('a null profile target uses the active strategy target, exactly as R2 does',async()=>{
  const a=await actor('strategy-date');await configured(a);await check(save(a,days(),(await state(a)).revision));
  await check(a.api.from('exam_profiles').update({target_exam_date:null}).eq('id',a.profileId));await check(a.api.from('p48_strategy_profiles').update({target_exam_date:add(next,1)}).eq('exam_profile_id',a.profileId));
  const r=await readiness(a);expect(r.remainingMinutes).toBe(300);expect(r.dayCapacities[add(next,2)]).toBe(0);expect(r.capacityReady).toBe(true);record('strategy date fallback',{ready:r});
 });
 it('academic periods, minute exceptions and persisted daily override/reserve retain established arithmetic',async()=>{
  const a=await actor('calendar');await check(save(a,days(),(await state(a)).revision));
  await check(a.api.from('calendar_periods').insert({user_id:a.userId,exam_profile_id:a.profileId,period_type:'custom',name:'Academic gap',start_date:next,end_date:next,capacity_multiplier:.5}));
  await check(a.api.from('schedule_exceptions').insert({user_id:a.userId,exam_profile_id:a.profileId,exception_date:next,exception_type:'custom',minutes_delta:-30}));
  await sql`insert into public.p48_daily_capacity_overrides(user_id,exam_profile_id,capacity_date,capacity_minutes,reserve_minutes,source_key) values(${a.userId}::uuid,${a.profileId}::uuid,${next}::date,100,20,'Isolated S1 override')`;
  const r=await readiness(a);expect(r.dayCapacities[next]).toBe(50);expect(r.remainingMinutes).toBe(590);record('calendar override',{ready:r,formula:'100-20 + ((120*0.5-30)-(120*0.5)) = 50'});
 });
 it('timed unavailable explicitly blocks a daily consumer without invented clock overlap',async()=>{
  const a=await actor('timed');await check(save(a,days(),(await state(a)).revision));
  await check(a.api.from('schedule_exceptions').insert({user_id:a.userId,exam_profile_id:a.profileId,exception_date:next,exception_type:'unavailable',start_time:'10:00',end_time:'11:00',minutes_delta:0}));
  const r=await readiness(a);expect(r.status).toBe('CAPACITY_TIMED_EXCEPTION_UNSUPPORTED');expect(r.remainingMinutes).toBeNull();expect(r.planReady).toBe(false);record('timed unsupported',{ready:r});
 });
 it('weekly ceiling remains authoritative and R2 rejects client-inflated minutes',async()=>{
  const a=await actor('r2');await configured(a);await check(save(a,days(),(await state(a)).revision));
  await sql`insert into public.p48_week_capacity_overrides(user_id,exam_profile_id,week_start_date,capacity_minutes,reserve_minutes,planning_budget_minutes,source_key) values(${a.userId}::uuid,${a.profileId}::uuid,${next}::date,660,600,60,'Isolated S1 ceiling')`;
  const denied=await generate(a,90);expect(denied.error?.message).toContain('PLAN_CAPACITY_EXCEEDED');expect((await sql`select count(*)::int n from public.tasks where exam_profile_id=${a.profileId}::uuid`)[0].n).toBe(0);
  await check(generate(a,30));const r=await readiness(a);expect(r.weeklyBudgetMinutes).toBe(60);expect(r.committedMinutes).toBe(30);expect(r.remainingMinutes).toBe(30);record('R2 daily boundary',{error:denied.error,ready:r});
 });
 it('new capacity revisions invalidate existing planner snapshots',async()=>{
  const a=await actor('stale');await configured(a);await check(save(a,days(),(await state(a)).revision));const before=await snapshot(a);await check(save(a,days([180,180,60,120,180,0,0]),(await state(a)).revision));
  const r=await a.api.rpc('create_p48_week_once',{p_payload:{intent:'generate_week',weekStartDate:next,expectedFingerprint:before.fingerprint,blocks:[{plannedDate:next,subjectId:math,resourceId:a.resourceId,estimatedMinutes:30,workMode:'book',title:'Stale'}]}});expect(r.error?.message).toContain('PLANNING_INPUT_STALE');record('freshness',{error:r.error});
 });
 it('capacity reduction cannot invalidate existing future work or mutate plans/sessions',async()=>{
  const a=await actor('protected');await configured(a);await check(save(a,days(),(await state(a)).revision));await check(generate(a,90));
  const before=await sql`select to_jsonb(t) row from public.tasks t where exam_profile_id=${a.profileId}::uuid order by id`,pref=await state(a),proposal=days([60,180,60,120,180,0,0]),preview=await readiness(a,next,proposal);
  expect(preview.protectedWorkExceedsCapacity).toBe(true);const r=await save(a,proposal,pref.revision);expect(r.error?.message).toContain('CAPACITY_PROTECTED_WORK_EXCEEDED');expect(await state(a)).toEqual(pref);expect(await sql`select to_jsonb(t) row from public.tasks t where exam_profile_id=${a.profileId}::uuid order by id`).toEqual(before);record('protected reduction',{preview,error:r.error});
 });
 it('configured legacy pilot keeps its exact plan/tasks and capacity fingerprint source',async()=>{
  const a=await actor('legacy-pilot');await configured(a);await windows(a);await check(generate(a,90));
  const before=await snapshot(a),plans=await sql`select to_jsonb(t) row from public.weekly_plans t where exam_profile_id=${a.profileId}::uuid`,tasks=await sql`select to_jsonb(t) row from public.tasks t where exam_profile_id=${a.profileId}::uuid`;
  const b=await actor('other-daily');await check(save(b,days(),(await state(b)).revision));
  expect((await snapshot(a)).fingerprint).toBe(before.fingerprint);expect((await state(a)).mode).toBe('time_windows');expect(await sql`select to_jsonb(t) row from public.weekly_plans t where exam_profile_id=${a.profileId}::uuid`).toEqual(plans);expect(await sql`select to_jsonb(t) row from public.tasks t where exam_profile_id=${a.profileId}::uuid`).toEqual(tasks);record('legacy pilot',{profileId:a.profileId,fingerprint:before.fingerprint,plans,tasks});
 });
 it('successful capacity update and rejected reduction preserve exact plans, tasks and canonical session evidence',async()=>{
  const a=await actor('actual-session');await configured(a);await check(save(a,days(),(await state(a)).revision));await check(generate(a,90));
  const actual=await check(a.api.rpc('record_retroactive_session',{p_payload:{examProfileId:a.profileId,subjectId:math,resourceId:a.resourceId,durationMinutes:15,accountingIntent:'extra',idempotencyKey:randomUUID()}}));expect(actual.allocation.planned_credit_minutes).toBe(0);
  const rows=async()=>({plans:await sql`select to_jsonb(t) row from public.weekly_plans t where exam_profile_id=${a.profileId}::uuid order by id`,tasks:await sql`select to_jsonb(t) row from public.tasks t where exam_profile_id=${a.profileId}::uuid order by id`,sessions:await sql`select to_jsonb(t) row from public.study_sessions t where exam_profile_id=${a.profileId}::uuid order by id`,allocations:await sql`select to_jsonb(t) row from public.study_session_allocations t where exam_profile_id=${a.profileId}::uuid order by id`});
  const before=await rows();await check(save(a,days([180,180,60,120,180,0,0]),(await state(a)).revision));expect(await rows()).toEqual(before);
  const failed=await save(a,days([60,180,60,120,180,0,0]),(await state(a)).revision);expect(failed.error?.message).toContain('CAPACITY_PROTECTED_WORK_EXCEEDED');expect(await rows()).toEqual(before);record('actual evidence preserved',{before,after:await rows(),error:failed.error});
 });
 it('real authenticated Edge returns daily readiness and explicit legacy planner capability errors',async()=>{
  const a=await actor('edge');await check(save(a,days(),(await state(a)).revision));
  const r=await edge(a,`/capacity/readiness?weekStart=${next}`);expect(r.status).toBe(200);expect(r.body.weeklyGrossMinutes).toBe(660);
  const options=await edge(a,'/weekly-plan/options');expect(options.status).toBe(409);expect(options.body.error.code).toBe('CAPACITY_MODEL_UNSUPPORTED');
  await expect(loadCanonicalCapacityReadOnly({client:a.api,userId:a.userId,examProfileId:a.profileId,horizonStart:next,horizonEnd:add(next,6)})).rejects.toThrow('CAPACITY_MODEL_UNSUPPORTED');record('Edge capability',{readiness:r,options});
 });
});
