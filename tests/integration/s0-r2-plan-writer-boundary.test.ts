import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { previewCurrentPlan } from '../../supabase/functions/_shared/adaptive.ts';

const url=process.env.SUPABASE_URL!,key=process.env.SUPABASE_ANON_KEY!,db=process.env.SUPABASE_DB_URL!;
if(url!=='http://127.0.0.1:54321'||new URL(db).hostname!=='127.0.0.1'||new URL(db).port!=='54322')throw Error('EXACT_LOCAL_ENDPOINTS_REQUIRED');
const sql=postgres(db,{max:6,connection:{application_name:'s0_r2_isolated_integration',statement_timeout:20000}});
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const output=process.env.S0_EVIDENCE_DIR;
const persist=(name:string,data:unknown)=>{if(output)fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2));};
const check=async(q:any)=>{const r=await q;if(r.error)throw r.error;return r.data;};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date());
const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7;
const dateAdd=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const week=dateAdd(today,1-weekday),math='20000000-0000-0000-0000-000000000002',stats='20000000-0000-0000-0000-000000000014';
const actors:any[]=[],events:any[]=[];
function record(name:string,data:any){events.push({name,...data});persist('s0-r2-runtime-results.json',events);}
const state=(a:any)=>check(a.api.rpc('weekly_availability_state',{p_exam_profile_id:a.profileId}));
const snap=(a:any)=>check(a.api.rpc('planning_week_snapshot',{p_exam_profile_id:a.profileId,p_week_start:week}));
const windows=(n=60,label='S0 saved')=>[{weekday,start_time:'10:00',end_time:n===120?'12:00':n===30?'10:30':'11:00',label}];
const replace=(a:any,w:any[],revision:string)=>a.api.rpc('replace_weekly_availability',{p_exam_profile_id:a.profileId,p_windows:w,p_expected_revision:revision});
async function actor(label:string,capacity=true,setup=true){
 const api=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),nonce=randomUUID();
 const email=`s0-r2-${label}-${nonce}@example.invalid`,signed=await api.auth.signUp({email,password:`Local-${nonce}!`});
 expect(signed.error).toBeNull();expect(signed.data.session).toBeTruthy();
 const userId=signed.data.user!.id,token=signed.data.session!.access_token;
 const p=await check(api.from('exam_profiles').insert({user_id:userId,exam_edition_id:'11000000-0000-0000-0000-000000000001',preparation_start_date:today,target_exam_date:'2027-12-21',status:'active'}).select('*').single());
 const a={label,userId,profileId:p.id,profile:p,api,token,email};actors.push(a);
 persist('s0-r2-fixture-identities.json',actors.map(({label,userId,profileId,email})=>({label,userId,profileId,email})));
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

const planRows=(a:any)=>check(a.api.from('weekly_plans').select('*').eq('exam_profile_id',a.profileId).order('id'));
const weekSnap=(a:any,w:string)=>check(a.api.rpc('planning_week_snapshot',{p_exam_profile_id:a.profileId,p_week_start:w}));
async function quickProposal(a:any,minutes:number,plannedDate=today){
 const plan=(await planRows(a))[0];
 return await check(service.rpc('create_confirmed_action_proposal',{
  p_user_id:a.userId,p_exam_profile_id:a.profileId,p_weekly_plan_id:plan.id,p_action_kind:'quick_task',p_plan_generation_version:plan.generation_version,
  p_mutation_payload:{candidate:{subjectId:math,plannedDate,estimatedMinutes:minutes,title:'Explicit reviewed quick task'},capacity:{fits:true,remainingMinutes:99999},taskDedupeKey:randomUUID()},p_display_payload:{},p_idempotency_key:randomUUID(),
 }));
}
async function baselinePayload(a:any,n=30){
 const unit=await check(a.api.from('resource_units').insert({resource_id:a.resourceId,name:'Exact isolated baseline unit',unit_type:'reading',sort_order:1,page_start:1,page_end:5,estimated_minutes:30}).select('id').single());
 return {weekStartDate:week,expectedFingerprint:(await snap(a)).fingerprint,sourceKey:'s0-r2-isolated',capacityMinutes:420,planningBudgetMinutes:30,reserveMinutes:390,
  dailyCapacity:Array.from({length:7},(_,i)=>({date:dateAdd(week,i),capacityMinutes:60,reserveMinutes:i===weekday-1?30:60})),
  tasks:[{subjectId:math,resourceId:a.resourceId,resourceUnitIds:[unit.id],title:'Authorized owned baseline',plannedDate:today,estimatedMinutes:n,workMode:'book',dedupeKey:'s0-r2-baseline'}]};
}
const importBaseline=(a:any,p:any)=>service.rpc('service_persist_p48_baseline_plan',{p_user_id:a.userId,p_exam_profile_id:a.profileId,p_payload:p});
function revisionPayload(planId:string,fingerprint:string){return {intent:'apply_revision',expectedFingerprint:fingerprint,weeklyPlanId:planId,revisionType:'automatic_informed',reasonCode:'CAPACITY_CHANGE',afterPlannedMinutes:99999,availableMinutes:99999,planningBudgetMinutes:99999,changedTaskCount:1,explanation:'Explicit authorized revision',dedupeKey:randomUUID(),tasksToBacklog:[],tasksToMove:[],tasksToCancel:[],tasksToCreate:[],backlog:{openTaskCount:1,openCoreCount:0,openImportantCount:1,openOptionalCount:0,estimatedRemainingMinutes:30,remainingCapacityMinutes:90,capacityRatio:0.34,severity:'normal'},risks:[]};}
async function revisionFixture(label:string){
 const a=await actor(label),next=dateAdd(week,7);await check(replace(a,[1,2].map(weekday=>({weekday,start_time:'10:00',end_time:'11:00'})),(await state(a)).revision));
 await check(a.api.rpc('initialize_subject_progress',{p_exam_profile_id:a.profileId,p_subject_id:math}));
 const node='30000000-0000-0000-0000-000000000001';
 const revision=(await sql`insert into public.revision_schedules(user_id,exam_profile_id,curriculum_node_id,status,revision_number,scheduled_for,revision_type,estimated_minutes,source_mastery_level,decision_reason) values(${a.userId}::uuid,${a.profileId}::uuid,${node}::uuid,'due',1,${dateAdd(next,1)}::date,'short_review',30,'weak','isolated R2 fixture') returning id`)[0]!.id;
 const p=payload(a,await weekSnap(a,next),30);p.weekStartDate=next;p.blocks[0]!.plannedDate=next;await check(create(a,p));return {a,next,node,revision,plan:(await planRows(a))[0]};
}

describe.sequential('S0-R2 real local writer boundary',()=>{
 let bounded:any,foreign:any;
 beforeAll(async()=>{bounded=await actor('bounded');foreign=await actor('foreign');await check(create(bounded,payload(bounded,await snap(bounded),30)));},60000);
 afterAll(async()=>{persist('s0-r2-final-plan-counts.json',await Promise.all(actors.map(async a=>({label:a.label,userId:a.userId,...await counts(a)}))));await sql.end();});

 it('counterexample A: V0 60→120 fails closed and persists zero work',async()=>{
  const a=await actor('v0-before-after');const p={examProfileId:a.profileId,weekStartDate:week,weekEndDate:dateAdd(week,6),availableMinutes:120,planningBudgetMinutes:120,plannedMinutes:120,generationVersion:1,tasks:[{subjectId:math,resourceId:a.resourceId,taskType:'custom',title:'Legacy over-capacity attack',plannedDate:today,estimatedMinutes:120,importance:'important',priorityScore:60,sourceReason:'manual',dedupeKey:randomUUID()}]};
  const before=await counts(a),r=await a.api.rpc('persist_weekly_plan',{p_plan:p});expect(r.error?.message).toContain('V0_PLANNING_RETIRED');expect(await counts(a)).toEqual(before);record('counterexample A after',{actor:a.label,persistedCapacity:60,request:p,result:r,after:await counts(a)});
 });
 it('counterexample B: direct REST 60→120 plan INSERT is denied before any row',async()=>{
  const a=await actor('rest-before-after'),r=await a.api.from('weekly_plans').insert({user_id:a.userId,exam_profile_id:a.profileId,week_start_date:week,week_end_date:dateAdd(week,6),available_minutes:120,planning_budget_minutes:120,planned_minutes:120,status:'active',generation_version:1});
  expect(r.error?.code).toBe('42501');expect(await counts(a)).toEqual({plans:0,tasks:0});record('counterexample B after',{actor:a.label,persistedCapacity:60,result:r,after:await counts(a)});
 });
 it('direct tasks INSERT cannot add 120 minutes to an existing valid week',async()=>{
  const plan=(await planRows(bounded))[0],before=await tasks(bounded),r=await bounded.api.from('tasks').insert({user_id:bounded.userId,exam_profile_id:bounded.profileId,weekly_plan_id:plan.id,subject_id:math,resource_id:bounded.resourceId,task_type:'custom',title:'Raw 120 attack',planned_date:today,estimated_minutes:120,importance:'important',priority_score:60,status:'ready',source_reason:'manual',dedupe_key:randomUUID()});
  expect(r.error?.code).toBe('42501');expect(await tasks(bounded)).toEqual(before);
 });
 it.each(['estimated_minutes','planned_date','subject_id','resource_id','source_reason','status'] as const)('raw task UPDATE cannot change authoring field %s',async field=>{
  const before=await tasks(bounded),value=({estimated_minutes:120,planned_date:dateAdd(today,1),subject_id:stats,resource_id:foreign.resourceId,source_reason:'baseline_import',status:'cancelled'} as any)[field];
  const r=await bounded.api.from('tasks').update({[field]:value}).eq('exam_profile_id',bounded.profileId);expect(r.error?.code).toBe('42501');expect(await tasks(bounded)).toEqual(before);
 });
 it.each(['tasks','weekly_plans','task_resource_units'] as const)('raw DELETE %s cannot erase protected work',async table=>{
  const before=await tasks(bounded),plans=await planRows(bounded),r=await bounded.api.from(table).delete().eq('user_id',bounded.userId);expect(r.error?.code).toBe('42501');expect(await tasks(bounded)).toEqual(before);expect(await planRows(bounded)).toEqual(plans);
 });
 it.each(['tasks','weekly_plans'] as const)('service raw %s UPDATE/DELETE also fails closed',async table=>{
  const before=await tasks(bounded),plans=await planRows(bounded);
  for(const op of ['update','delete']){const q=op==='update'?service.from(table).update(table==='tasks'?{estimated_minutes:120}:{available_minutes:99999}):service.from(table).delete();expect((await q.eq('user_id',bounded.userId)).error?.code).toBe('42501');}
  expect(await tasks(bounded)).toEqual(before);expect(await planRows(bounded)).toEqual(plans);
 });
 it('V0 existing week remains a stable no-op; absent build returns HTTP 410',async()=>{
  const before=await tasks(bounded),plan=(await planRows(bounded))[0];const existing=await bounded.api.rpc('persist_weekly_plan',{p_plan:{examProfileId:bounded.profileId,weekStartDate:week,availableMinutes:999999}});expect(existing.error).toBeNull();expect(existing.data.created).toBe(false);expect(existing.data.weekly_plan_id).toBe(plan.id);expect(await tasks(bounded)).toEqual(before);
  const a=await actor('old-build'),httpResult=await http(a,'/weekly-plan/build',{});expect(httpResult.status).toBe(410);expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('anonymous and cross-owner RPCs cannot enter controlled writers',async()=>{
  const anon=createClient(url,key,{auth:{persistSession:false}}),before=await tasks(bounded);
  for(const client of [anon,foreign.api]){expect((await client.rpc('start_task',{p_task_id:before[0]!.row.id})).error).toBeTruthy();expect((await client.rpc('persist_p48_baseline_plan',{p_exam_profile_id:bounded.profileId,p_payload:{}})).error?.code).toBe('42501');}
  expect(await tasks(bounded)).toEqual(before);
 });
 it('ordinary users cannot manufacture baseline authority even for their own profile',async()=>{
  const a=await actor('baseline-denied'),p=await baselinePayload(a);const r=await a.api.rpc('persist_p48_baseline_plan',{p_exam_profile_id:a.profileId,p_payload:p});expect(r.error?.code).toBe('42501');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('authorized baseline imports exact units, retries stably and executes canonical progress',async()=>{
  const a=await actor('baseline-approved'),p=await baselinePayload(a),r=await check(importBaseline(a,p));expect(r.taskCount).toBe(1);const before=await tasks(a),ids=before.map(t=>t.row.id);
  const again=await check(importBaseline(a,{...p,expectedFingerprint:(await snap(a)).fingerprint}));expect(again.insertedTaskCount).toBe(0);expect(await tasks(a)).toEqual(before);
  const completed=await a.api.rpc('complete_task_unit',{p_task_id:ids[0],p_resource_unit_id:p.tasks[0]!.resourceUnitIds[0]});expect(completed.error).toBeNull();expect((await tasks(a))[0]!.row.status).toBe('completed');
  record('baseline approved',{result:r,retry:again,taskIds:ids,completed});
 });
 it('baseline retry cannot attach different material or change task identity',async()=>{
  const a=await actor('baseline-conflict'),p=await baselinePayload(a);await check(importBaseline(a,p));const before=await tasks(a),links=await check(a.api.from('task_resource_units').select('*').eq('user_id',a.userId));
  const changed={...p,expectedFingerprint:(await snap(a)).fingerprint,tasks:p.tasks.map(t=>({...t,title:'Forged identity'}))};expect((await importBaseline(a,changed)).error?.message).toContain('BASELINE_DEDUPE_CONFLICT');expect(await tasks(a)).toEqual(before);expect(await check(a.api.from('task_resource_units').select('*').eq('user_id',a.userId))).toEqual(links);
 });
 it('baseline stale resource and over-capacity input roll back overrides and plan',async()=>{
  const a=await actor('baseline-stale'),p=await baselinePayload(a);await check(a.api.from('resources').update({status:'paused'}).eq('id',a.resourceId));expect((await importBaseline(a,p)).error?.message).toContain('PLANNING_INPUT_STALE');expect(await counts(a)).toEqual({plans:0,tasks:0});
  await check(a.api.from('resources').update({status:'active'}).eq('id',a.resourceId));const bad={...p,expectedFingerprint:(await snap(a)).fingerprint,tasks:p.tasks.map(t=>({...t,estimatedMinutes:120})),planningBudgetMinutes:120,reserveMinutes:300,dailyCapacity:p.dailyCapacity.map(d=>({...d,reserveMinutes:d.date===today?0:50}))};
  const r=await importBaseline(a,bad);expect(r.error).toBeTruthy();expect(await counts(a)).toEqual({plans:0,tasks:0});expect(await check(a.api.from('p48_daily_capacity_overrides').select('id').eq('exam_profile_id',a.profileId))).toEqual([]);record('baseline bad budget',{result:r});
 });
 it('confirmed quick-add preserves explicit review and successful idempotent apply',async()=>{
  const a=await actor('confirmed-valid');await check(create(a,payload(a,await snap(a),30)));const proposal=await quickProposal(a,15);expect((await tasks(a))).toHaveLength(1);
  const applied=await check(a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId}));expect(applied.created).toBe(true);expect(await tasks(a)).toHaveLength(2);const before=await tasks(a);expect((await check(a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId}))).idempotent).toBe(true);expect(await tasks(a)).toEqual(before);record('confirmed approved',{proposal,applied});
 });
 it('confirmed quick-add cannot trust forged remaining capacity',async()=>{
  const a=await actor('confirmed-budget'),next=dateAdd(week,7);await check(replace(a,[1,2].map(weekday=>({weekday,start_time:'10:00',end_time:'11:00'})),(await state(a)).revision));const p=payload(a,await weekSnap(a,next),30);p.weekStartDate=next;p.blocks[0]!.plannedDate=next;await check(create(a,p));const proposal=await quickProposal(a,45,next),before=await tasks(a),plans=await planRows(a);const r=await a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId});expect(r.error?.message).toContain('PLAN_CAPACITY_EXCEEDED');expect(await tasks(a)).toEqual(before);expect(await planRows(a)).toEqual(plans);record('confirmed inflated',{proposal,result:r});
 });
 it.each(['subject','resource','capacity'] as const)('confirmed %s changes make an earlier proposal stale',async kind=>{
  const a=await actor('confirmed-stale-'+kind);await check(create(a,payload(a,await snap(a),30)));const proposal=await quickProposal(a,15),before=await tasks(a);
  if(kind==='subject')await check(a.api.from('user_subjects').update({status:'paused'}).eq('subject_id',math).eq('exam_profile_id',a.profileId));
  if(kind==='resource')await check(a.api.from('resources').update({status:'paused'}).eq('id',a.resourceId));
  if(kind==='capacity')await check(replace(a,windows(30),(await state(a)).revision));
  expect((await a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId})).error?.message).toContain('ACTION_PROPOSAL_STALE');expect(await tasks(a)).toEqual(before);
 });
 it('service cannot directly enter legacy internal confirmed-action apply',async()=>{
  expect((await service.rpc('apply_confirmed_action_proposal_pre_pln002',{p_proposal_id:randomUUID()})).error?.code).toBe('42501');
 });
 it('raw legacy revision without intent/freshness fails before modifying work',async()=>{
  const before=await tasks(bounded),r=await bounded.api.rpc('apply_plan_revision',{p_payload:{weeklyPlanId:(await planRows(bounded))[0].id,dedupeKey:randomUUID(),tasksToCancel:[before[0]!.row.id]}});expect(r.error?.message).toContain('EXPLICIT_INTENT_REQUIRED');expect(await tasks(bounded)).toEqual(before);
 });
 it('explicit revision cannot cancel manual/canonical/baseline/carryover work',async()=>{
  const before=await tasks(bounded),s=await snap(bounded);const r=await bounded.api.rpc('apply_plan_revision',{p_payload:{intent:'apply_revision',expectedFingerprint:s.fingerprint,weeklyPlanId:(await planRows(bounded))[0].id,dedupeKey:randomUUID(),tasksToCancel:[before[0]!.row.id]}});expect(r.error?.message).toContain('TASK_NOT_REPLANNABLE');expect(await tasks(bounded)).toEqual(before);
 });
 it('execution under narrow role cannot resurrect cancelled tasks into commitments',async()=>{
  const a=await actor('cancelled-execution');await check(create(a,payload(a,await snap(a),30)));const old=(await tasks(a))[0]!.row;
  await check(a.api.rpc('replace_manual_weekly_plan',{p_payload:{weekStartDate:week,expectedFingerprint:(await snap(a)).fingerprint,blocks:payload(a,{},15).blocks}}));
  const before=await tasks(a);expect((await a.api.rpc('update_task_progress',{p_task_id:old.id,p_completed_minutes:1})).error?.message).toContain('TASK_NOT_STARTABLE');expect(await tasks(a)).toEqual(before);
 });
 it('narrow execution retains start/pause/resume/finish, allocation and stable retry',async()=>{
  const a=await actor('sessions');await check(create(a,payload(a,await snap(a),30)));const t=(await tasks(a))[0]!.row;
  const session=await check(a.api.rpc('start_study_session',{p_task_id:t.id,p_entry_source:'web'}));await check(a.api.rpc('pause_study_session',{p_session_id:session.id}));await check(a.api.rpc('resume_study_session',{p_session_id:session.id}));const finish=await check(a.api.rpc('finish_study_session',{p_session_id:session.id}));expect(finish.status).toBe('completed');expect(finish.allocation.accounting_intent).toBe('planned');
  const retry=await check(a.api.rpc('finish_study_session',{p_session_id:session.id}));expect(retry.idempotent).toBe(true);expect((await check(a.api.from('study_session_allocations').select('id').eq('session_id',session.id)))).toHaveLength(1);expect((await tasks(a))[0]!.row.estimated_minutes).toBe(30);record('session approved',{session:{id:session.id},finish,retry});
 });
 it('extra actual study remains zero planned credit and never replaces commitments',async()=>{
  const a=await actor('extra-credit');await check(create(a,payload(a,await snap(a),30)));const before=await tasks(a);
  const extra=await check(a.api.rpc('record_retroactive_session',{p_payload:{examProfileId:a.profileId,subjectId:math,resourceId:a.resourceId,durationMinutes:15,accountingIntent:'extra',idempotencyKey:randomUUID()}}));expect(extra.allocation.planned_credit_minutes).toBe(0);expect(extra.allocation.actual_minutes).toBe(15);expect(await tasks(a)).toEqual(before);
 });
 it('confirmed carryover keeps its task identity and remains protected from manual replacement',async()=>{
  const a=await actor('carryover'),next=dateAdd(week,7),dest=dateAdd(next,1);
  await check(replace(a,[1,2].map(weekday=>({weekday,start_time:'10:00',end_time:'11:00'})),(await state(a)).revision));const p=payload(a,await weekSnap(a,next),30);p.weekStartDate=next;p.blocks[0]!.plannedDate=next;await check(create(a,p));
  const t=(await tasks(a))[0]!.row,plan=(await planRows(a))[0];
  const proposal=await check(service.rpc('create_confirmed_action_proposal',{p_user_id:a.userId,p_exam_profile_id:a.profileId,p_weekly_plan_id:plan.id,p_action_kind:'carryover',p_plan_generation_version:plan.generation_version,p_mutation_payload:{taskId:t.id,fromDate:next,toDate:dest,remainingMinutes:30,reason:'user_could_not_finish',initiatedBy:'user'},p_display_payload:{},p_idempotency_key:randomUUID()}));
  const r=await a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId});record('carryover apply',{proposal,result:r});expect(r.error).toBeNull();expect(r.data.preservedTaskId).toBe(t.id);
  const carried=(await tasks(a))[0]!.row,s=await weekSnap(a,next);await check(a.api.rpc('replace_manual_weekly_plan',{p_payload:{weekStartDate:next,expectedFingerprint:s.fingerprint,blocks:[{...p.blocks[0],estimatedMinutes:15}]}}));expect((await tasks(a)).find(t=>t.row.id===carried.id)!.row).toEqual(carried);
 });
 it('confirmed substitution transfers extra allocation without creating uncredited capacity',async()=>{
  const a=await actor('substitution');await check(create(a,payload(a,await snap(a),30)));const t=(await tasks(a))[0]!.row;
  const extra=await check(a.api.rpc('record_retroactive_session',{p_payload:{examProfileId:a.profileId,subjectId:math,resourceId:a.resourceId,durationMinutes:15,accountingIntent:'extra',idempotencyKey:randomUUID()}}));const plan=(await planRows(a))[0];
  const proposal=await check(service.rpc('create_confirmed_action_proposal',{p_user_id:a.userId,p_exam_profile_id:a.profileId,p_weekly_plan_id:plan.id,p_action_kind:'substitution',p_plan_generation_version:plan.generation_version,p_mutation_payload:{sourceTaskId:t.id,replacementSessionId:extra.id,sourceMinutes:15,replacementTitle:'Reviewed substitution',reason:'user_replacement',initiatedBy:'user'},p_display_payload:{},p_idempotency_key:randomUUID()}));
  const result=await a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId});expect(result.error).toBeNull();expect(result.data.sourceMinutesRelieved).toBe(15);expect((await tasks(a)).find(r=>r.row.id===t.id)!.row.estimated_minutes).toBe(15);
  expect((await check(a.api.from('study_session_allocations').select('*').eq('session_id',extra.id).is('superseded_at',null)))[0].planned_credit_minutes).toBe(15);record('substitution apply',{proposal,result});
 });
 it.each(['profile','resource'] as const)('indirect %s DELETE cannot cascade away planned work',async kind=>{
  const before=await tasks(bounded),r=kind==='profile'?await bounded.api.from('exam_profiles').delete().eq('id',bounded.profileId):await bounded.api.from('resources').delete().eq('id',bounded.resourceId);expect(r.error?.message).toContain(kind==='profile'?'PLANNED_PROFILE_IN_USE':'PLANNED_RESOURCE_IN_USE');expect(await tasks(bounded)).toEqual(before);
 });
 it('linked baseline material cannot be deleted, moved or have its exact boundary rewritten',async()=>{
  const a=await actor('material-guard'),p=await baselinePayload(a);await check(importBaseline(a,p));const before=await tasks(a),unit=p.tasks[0]!.resourceUnitIds[0];
  for(const q of [a.api.from('resource_units').delete().eq('id',unit),a.api.from('resource_units').update({page_end:20}).eq('id',unit)])expect((await q).error?.message).toContain('PLANNED_MATERIAL_IN_USE');expect(await tasks(a)).toEqual(before);
 });
 it('unused draft/profile/resource cleanup remains allowed',async()=>{
  const a=await actor('unused-cleanup');expect((await a.api.from('resources').delete().eq('id',a.resourceId)).error).toBeNull();expect((await a.api.from('exam_profiles').delete().eq('id',a.profileId)).error).toBeNull();
 });
 it('approved generated-task revision moves owned work within actual daily capacity',async()=>{
  const a=await actor('revision-valid'),next=dateAdd(week,7);await check(replace(a,[1,2].map(weekday=>({weekday,start_time:'10:00',end_time:'11:00'})),(await state(a)).revision));const p=payload(a,await weekSnap(a,next),30);p.weekStartDate=next;p.blocks[0]!.plannedDate=next;await check(create(a,p));const t=(await tasks(a))[0]!.row;
  // Server-side fixture classification only; an ordinary client cannot promote manual work to generated work.
  await sql`update public.tasks set source_reason='curriculum_progress' where id=${t.id}::uuid`;
  const s=await weekSnap(a,next),plan=(await planRows(a))[0],r=await a.api.rpc('apply_plan_revision',{p_payload:{intent:'apply_revision',expectedFingerprint:s.fingerprint,weeklyPlanId:plan.id,revisionType:'automatic_informed',reasonCode:'MANUAL_REQUEST',afterPlannedMinutes:999999,availableMinutes:999999,planningBudgetMinutes:999999,changedTaskCount:1,explanation:'Explicit reviewed move',dedupeKey:randomUUID(),tasksToMove:[{taskId:t.id,toDate:dateAdd(next,1),reason:'capacity_change'}],backlog:{openTaskCount:1,openCoreCount:0,openImportantCount:1,openOptionalCount:0,estimatedRemainingMinutes:30,remainingCapacityMinutes:90,capacityRatio:0.34,severity:'normal'},risks:[]}});
  expect(r.error).toBeNull();expect((await tasks(a))[0]!.row.planned_date).toBe(dateAdd(next,1));expect((await planRows(a))[0].available_minutes).toBe(120);expect((await planRows(a))[0].planned_minutes).toBe(30);record('revision approved',{result:r});
 });
 it('approved owned due revision creates under-capacity work through the service revision wrapper',async()=>{
  const {a,next,node,revision,plan}=await revisionFixture('revision-create');const p:any=revisionPayload(plan.id,(await weekSnap(a,next)).fingerprint);
  p.tasksToCreate=[{revisionScheduleId:revision,subjectId:math,curriculumNodeId:node,title:'Real due revision',plannedDate:dateAdd(next,1),estimatedMinutes:30,importance:'important',priorityScore:60,dedupeKey:randomUUID()}];
  const r=await service.rpc('telegram_apply_plan_revision',{p_user_id:a.userId,p_payload:p});expect(r.error).toBeNull();expect(await tasks(a)).toHaveLength(2);expect((await planRows(a))[0].planned_minutes).toBe(60);record('revision create approved',{result:r});
 });
 it.each(['move','cancel'] as const)('revision cannot %s generated work with actual progress and zero planned credit',async operation=>{
  const {a,next,plan}=await revisionFixture('actual-only-'+operation),task=(await tasks(a))[0]!.row;
  // Classification is isolated server-side fixture setup; actual progress below
  // is produced through the ordinary authenticated accounting RPC.
  await sql`update public.tasks set source_reason='curriculum_progress' where id=${task.id}::uuid`;
  const session=await check(a.api.rpc('record_retroactive_session',{p_payload:{examProfileId:a.profileId,taskId:task.id,durationMinutes:2,accountingIntent:'extra',idempotencyKey:randomUUID()}}));
  expect(session.allocation.actual_minutes).toBe(2);expect(session.allocation.planned_credit_minutes).toBe(0);
  const progress=await check(a.api.from('task_progress').select('*').eq('task_id',task.id).single());
  expect(progress.completed_minutes).toBe(0);expect(progress.actual_study_minutes).toBe(2);
  const before=await tasks(a);expect(before[0]!.row.status).toBe('ready');
  const p:any=revisionPayload(plan.id,(await weekSnap(a,next)).fingerprint);
  if(operation==='move')p.tasksToMove=[{taskId:task.id,toDate:dateAdd(next,1),reason:'capacity_change'}];else p.tasksToCancel=[task.id];
  const result=await a.api.rpc('apply_plan_revision',{p_payload:p}),after=await tasks(a);
  const evidence={operation,userId:a.userId,profileId:a.profileId,session,result,progress,before,after};
  if(!result.error)persist(`actual-only-${operation}-counterexample.json`,evidence);
  record('actual-only progress protection',evidence);
  expect(result.error?.message).toContain('TASK_NOT_REPLANNABLE');expect(after).toEqual(before);
  expect(await check(a.api.from('task_progress').select('*').eq('task_id',task.id).single())).toEqual(progress);
 });
 it('revision cannot link another owner schedule or apply a changed due-state snapshot',async()=>{
  const f=await revisionFixture('revision-foreign-source'),{a,next,node,plan}=await revisionFixture('revision-owned-source');const before=await tasks(a),p:any=revisionPayload(plan.id,(await weekSnap(a,next)).fingerprint);
  p.tasksToCreate=[{revisionScheduleId:f.revision,subjectId:math,curriculumNodeId:node,title:'Foreign source attempt',plannedDate:dateAdd(next,1),estimatedMinutes:30,importance:'important',priorityScore:60,dedupeKey:randomUUID()}];
  expect((await a.api.rpc('apply_plan_revision',{p_payload:p})).error?.message).toContain('INVALID_REVISION_SOURCE');expect(await tasks(a)).toEqual(before);
  await sql`update public.revision_schedules set status='superseded' where user_id=${a.userId}::uuid`;expect((await a.api.rpc('apply_plan_revision',{p_payload:p})).error?.message).toContain('PLANNING_INPUT_STALE');expect(await tasks(a)).toEqual(before);
 });
 it('confirmed capacity change applies its reviewed generated-task move atomically',async()=>{
  const {a,next,plan}=await revisionFixture('confirmed-capacity'),task=(await tasks(a))[0]!.row;await sql`update public.tasks set source_reason='curriculum_progress' where id=${task.id}::uuid`;
  const p:any=revisionPayload(plan.id,(await weekSnap(a,next)).fingerprint);p.tasksToMove=[{taskId:task.id,toDate:dateAdd(next,1),reason:'capacity_change'}];
  const proposal=await check(service.rpc('create_confirmed_action_proposal',{p_user_id:a.userId,p_exam_profile_id:a.profileId,p_weekly_plan_id:plan.id,p_action_kind:'capacity_change',p_plan_generation_version:plan.generation_version,p_mutation_payload:{scheduleException:{date:next,type:'custom',minutesDelta:-30,dedupeKey:randomUUID()},planRevisionPayload:p},p_display_payload:{},p_idempotency_key:randomUUID()}));
  const r=await a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId});expect(r.error).toBeNull();expect(r.data.actionKind).toBe('capacity_change');expect((await tasks(a))[0]!.row.planned_date).toBe(dateAdd(next,1));expect((await planRows(a))[0].available_minutes).toBe(90);record('confirmed capacity approved',{proposal,result:r});
 });
 it('physical canonical session retains pause/resume/finish, exact material evidence and planned credit',async()=>{
  const a=await actor('physical'),p=await baselinePayload(a);await check(importBaseline(a,p));const t=(await tasks(a))[0]!.row,unit=p.tasks[0]!.resourceUnitIds[0];
  const session=await check(a.api.rpc('start_physical_study_session',{p_task_id:t.id,p_resource_unit_id:unit,p_entry_source:'web'}));
  await check(a.api.rpc('pause_physical_study_session',{p_session_id:session.id}));await check(a.api.rpc('resume_physical_study_session',{p_session_id:session.id}));
  // Physical progress requires actual elapsed active time; retain real timestamps.
  await new Promise(resolve=>setTimeout(resolve,1200));
  const result=await a.api.rpc('finish_physical_study_session',{p_session_id:session.id,p_end_page_boundary:5});expect(result.error).toBeNull();const units=await check(a.api.from('resource_unit_progress').select('*').eq('resource_unit_id',unit));expect(units[0].completed_through_page).toBe(5);expect((await tasks(a))[0]!.row.id).toBe(t.id);record('physical session',{session:{id:session.id},result,units});
 });
 it('strategic proposal records review evidence without mutating protected manual work',async()=>{
  const before=await tasks(bounded),plan=(await planRows(bounded))[0],p:any=revisionPayload(plan.id,(await snap(bounded)).fingerprint);p.revisionType='strategic_proposal';p.tasksToCancel=[before[0]!.row.id];
  const r=await bounded.api.rpc('apply_plan_revision',{p_payload:p});expect(r.error).toBeNull();expect(r.data.proposal).toBe(true);expect(await tasks(bounded)).toEqual(before);
 });
 it('service INSERT and authenticated plan-header UPDATE cannot bypass the boundary',async()=>{
  const plan=(await planRows(bounded))[0],task=(await tasks(bounded))[0]!.row,before=await tasks(bounded);
  for(const [table,row] of [['weekly_plans',plan],['tasks',task]] as const){const copy={...row,id:randomUUID()};expect((await service.from(table).insert(copy)).error?.code).toBe('42501');}
  expect((await bounded.api.from('weekly_plans').update({available_minutes:99999,planning_budget_minutes:99999}).eq('id',plan.id)).error?.code).toBe('42501');expect(await tasks(bounded)).toEqual(before);expect(await planRows(bounded)).toEqual([plan]);
 });
 it.each(['p48','manual'] as const)('%s obeys an independently persisted weekly override ceiling',async kind=>{
  const a=await actor('weekly-override-'+kind),next=dateAdd(week,7);await check(a.api.from('p48_week_capacity_overrides').insert({user_id:a.userId,exam_profile_id:a.profileId,week_start_date:next,capacity_minutes:60,planning_budget_minutes:30,reserve_minutes:30,source_key:'explicit isolated weekly budget'}));
  const p=payload(a,await weekSnap(a,next),45);p.weekStartDate=next;p.blocks[0]!.plannedDate=dateAdd(today,7);
  const call=(p:any)=>kind==='p48'?create(a,p):a.api.rpc('replace_manual_weekly_plan',{p_payload:p});const denied=await call(p);expect(denied.error?.message).toMatch(/PLAN_CAPACITY_EXCEEDED|MANUAL_PLAN_OVER_CAPACITY/);expect(await counts(a)).toEqual({plans:0,tasks:0});
  p.blocks[0]!.estimatedMinutes=20;p.expectedFingerprint=(await weekSnap(a,next)).fingerprint;const valid=await call(p);expect(valid.error).toBeNull();expect((await planRows(a))[0].planning_budget_minutes).toBe(30);expect((await tasks(a))[0]!.row.estimated_minutes).toBe(20);record('weekly override '+kind,{denied,valid});
 });
 it.each(['p48','manual'] as const)('%s cannot create new unfinished work after the saved target exam',async kind=>{
  const a=await actor('exam-boundary-'+kind),next=dateAdd(week,7);await check(a.api.from('exam_profiles').update({target_exam_date:today}).eq('id',a.profileId));const p=payload(a,await weekSnap(a,next),20);p.weekStartDate=next;p.blocks[0]!.plannedDate=dateAdd(today,7);
  const r=kind==='p48'?await create(a,p):await a.api.rpc('replace_manual_weekly_plan',{p_payload:p});expect(r.error?.message).toContain('INVALID_PLAN_DATE');expect(await counts(a)).toEqual({plans:0,tasks:0});
 });
 it('reviewed historical substitution is accounting relief and preserves exact baseline material',async()=>{
  const a=await actor('historical-substitution'),prev=dateAdd(week,-7),initial=await baselinePayload(a),p={...initial,weekStartDate:prev,expectedFingerprint:(await weekSnap(a,prev)).fingerprint,dailyCapacity:initial.dailyCapacity.map(d=>({...d,date:dateAdd(d.date,-7)})),tasks:initial.tasks.map(t=>({...t,plannedDate:dateAdd(t.plannedDate,-7)}))};await check(importBaseline(a,p));const task=(await tasks(a))[0]!.row,links=await check(a.api.from('task_resource_units').select('*').eq('user_id',a.userId));
  const extra=await check(a.api.rpc('record_retroactive_session',{p_payload:{examProfileId:a.profileId,subjectId:math,resourceId:a.resourceId,durationMinutes:15,accountingIntent:'extra',idempotencyKey:randomUUID()}})),plan=(await planRows(a))[0];
  const proposal=await check(service.rpc('create_confirmed_action_proposal',{p_user_id:a.userId,p_exam_profile_id:a.profileId,p_weekly_plan_id:plan.id,p_action_kind:'substitution',p_plan_generation_version:plan.generation_version,p_mutation_payload:{sourceTaskId:task.id,replacementSessionId:extra.id,sourceMinutes:15,replacementTitle:'Historical reviewed relief',reason:'user_replacement',initiatedBy:'user'},p_display_payload:{},p_idempotency_key:randomUUID()}));
  const result=await a.api.rpc('apply_confirmed_action_proposal',{p_proposal_id:proposal.proposalId});expect(result.error).toBeNull();expect((await tasks(a)).find(t=>t.row.id===task.id)!.row.estimated_minutes).toBe(15);expect(await check(a.api.from('task_resource_units').select('*').eq('user_id',a.userId))).toEqual(links);record('historical relief',{proposal,result});
 });
 it('real web session finish and service preview retain the read-only adaptive contract',async()=>{
  const a=await actor('web-session-preview');await check(create(a,payload(a,await snap(a),30)));const task=(await tasks(a))[0]!.row;
  const start=await http(a,'/study-sessions/start',{taskId:task.id,entrySource:'web'});expect(start.status).toBe(201);const id=start.body.id;
  expect((await http(a,`/study-sessions/${id}/pause`,{})).status).toBe(200);expect((await http(a,`/study-sessions/${id}/resume`,{})).status).toBe(200);const result=await http(a,`/study-sessions/${id}/finish`,{});expect(result.status).toBe(200);expect(result.body.planMutationApplied).toBe(false);
  const before=await tasks(a),plan=(await planRows(a))[0],preview=await previewCurrentPlan(service,a.userId,a.profile,plan,'study_deviation');expect(preview.planMutationApplied).toBe(false);expect(await tasks(a)).toEqual(before);record('web session and service preview',{result,preview});
 });
});




