import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_ANON_KEY;
if(!url||!key)throw new Error("Supabase env required");
const EDITION="11000000-0000-0000-0000-000000000001",MATH="20000000-0000-0000-0000-000000000002";
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
async function register(api:SupabaseClient){const id=randomUUID();const result=await api.auth.signUp({email:`p7-${id}@example.test`,password:`Safe-${id}`});expect(result.error).toBeNull();return result.data.user!;}

describe("Phase 07 pilot closure persistence and RLS",()=>{
  const a=client(),b=client();let userA:User,profileA:string,taskA:string;
  beforeAll(async()=>{
    userA=await register(a);const userB=await register(b);
    const [pa,pb]=await Promise.all([
      a.from("exam_profiles").insert({user_id:userA.id,exam_edition_id:EDITION,preparation_start_date:"2026-08-01",status:"active"}).select("id").single(),
      b.from("exam_profiles").insert({user_id:userB.id,exam_edition_id:EDITION,preparation_start_date:"2026-08-01",status:"active"}).select("id").single(),
    ]);expect(pa.error).toBeNull();expect(pb.error).toBeNull();profileA=pa.data!.id;
    const plan=await a.from("weekly_plans").insert({user_id:userA.id,exam_profile_id:profileA,week_start_date:"2026-08-03",week_end_date:"2026-08-09",available_minutes:300,planning_budget_minutes:270,planned_minutes:120,status:"active"}).select("id").single();
    const task=await a.from("tasks").insert({user_id:userA.id,exam_profile_id:profileA,weekly_plan_id:plan.data!.id,subject_id:MATH,task_type:"custom",title:"Pilot task",planned_date:"2026-08-03",estimated_minutes:120,importance:"core",priority_score:90,status:"ready",source_reason:"manual",dedupe_key:"p7-pilot"}).select("id").single();taskA=task.data!.id;
  });

  it("stores one deterministic weekly report per user/week",async()=>{
    const row={user_id:userA.id,exam_profile_id:profileA,week_start_date:"2026-08-03",week_end_date:"2026-08-09",planned_minutes:120,actual_minutes:90,planned_task_count:1,completed_task_count:0,question_count:20,completed_topic_count:0,revision_completed_count:0,revision_due_count:0,backlog_severity:"normal",projection_status:"UNKNOWN",plan_status:"attention",explanation:"Pilot raporu."};
    expect((await a.from("weekly_reports").upsert(row,{onConflict:"user_id,week_start_date"})).error).toBeNull();
    expect((await a.from("weekly_reports").upsert({...row,actual_minutes:100},{onConflict:"user_id,week_start_date"})).error).toBeNull();
    const stored=await a.from("weekly_reports").select("actual_minutes",{count:"exact"}).eq("week_start_date","2026-08-03");
    expect(stored.count).toBe(1);expect(stored.data?.[0].actual_minutes).toBe(100);
  });

  it("records only scoped recommendation usage",async()=>{
    const inserted=await a.from("recommendation_events").insert({user_id:userA.id,exam_profile_id:profileA,task_id:taskA,event_type:"next_best_task",channel:"web",reason:"overdue_core"});
    expect(inserted.error).toBeNull();expect((await a.from("recommendation_events").select("id",{count:"exact",head:true})).count).toBe(1);
  });

  it("blocks forged recommendation ownership",async()=>{
    const forged=await b.from("recommendation_events").insert({user_id:userA.id,exam_profile_id:profileA,task_id:taskA,event_type:"next_best_task",channel:"web",reason:"forged"});
    expect(forged.error).not.toBeNull();
  });

  it("isolates reports and events from User B",async()=>{
    expect((await b.from("weekly_reports").select("id")).data).toEqual([]);
    expect((await b.from("recommendation_events").select("id")).data).toEqual([]);
  });

  it("keeps scheduler-owned tables read-only to users",async()=>{
    const action=await a.from("scheduled_actions").insert({user_id:userA.id,exam_profile_id:profileA,action_type:"daily_plan",scheduled_for:new Date().toISOString(),dedupe_key:`forged:${randomUUID()}`});
    const gap=await a.from("data_gap_events").insert({user_id:userA.id,exam_profile_id:profileA,gap_date:"2026-08-02"});
    expect(action.error).not.toBeNull();expect(gap.error).not.toBeNull();
  });
});
