import {
  buildMinimumDayPlan,buildSyllabusProjection,calculateEffectiveDayCapacity,evaluateBacklog,
  getRevisionUrgency,replanWeeklyPlanV1,addRevisionCalendarDays,calculateWeeklyAvailableMinutes,
} from "./planning.bundle.js";

type Client=any;
export const calendarToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date());
const addDays=(date:string,days:number)=>addRevisionCalendarDays(date,days);
const windows=(rows:any[])=>rows.map(row=>({weekday:row.weekday,start_time:row.start_time,end_time:row.end_time,is_active:row.is_active}));
const periods=(rows:any[])=>rows.map(row=>({startDate:row.start_date,endDate:row.end_date,capacityMultiplier:row.capacity_multiplier==null?null:Number(row.capacity_multiplier)}));
const exceptions=(rows:any[])=>rows.map(row=>({date:row.exception_date,type:row.exception_type,startTime:row.start_time,endTime:row.end_time,minutesDelta:row.minutes_delta}));

export async function loadAdaptiveBase(client:Client,userId:string,profile:any,plan:any){
 const [availability,calendar,exceptionRows,tasks,progress,revisions,reschedules,sessions]=await Promise.all([
  client.from("weekly_availability").select("*").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("is_active",true),
  client.from("calendar_periods").select("*").eq("user_id",userId).eq("exam_profile_id",profile.id),
  client.from("schedule_exceptions").select("*").eq("user_id",userId).eq("exam_profile_id",profile.id).gte("exception_date",plan.week_start_date).lte("exception_date",plan.week_end_date),
  client.from("tasks").select("*,task_progress(completed_minutes)").eq("user_id",userId).eq("weekly_plan_id",plan.id),
  client.from("topic_progress").select("curriculum_node_id,state,mastery_level").eq("user_id",userId).eq("exam_profile_id",profile.id),
  client.from("revision_schedules").select("*,curriculum_nodes(name,subject_id,subjects(name))").eq("user_id",userId).eq("exam_profile_id",profile.id).in("status",["scheduled","due"]),
  client.from("task_reschedule_events").select("task_id").eq("user_id",userId),
  client.from("study_sessions").select("duration_minutes,started_at,ended_at").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","completed").gte("ended_at",`${plan.week_start_date}T00:00:00Z`),
 ]);for(const result of[availability,calendar,exceptionRows,tasks,progress,revisions,reschedules,sessions])if(result.error)throw result.error;
 const dayCapacities:Record<string,number>={};for(let index=0;index<7;index++){const date=addDays(plan.week_start_date,index);dayCapacities[date]=calculateEffectiveDayCapacity({date,weeklyAvailability:windows(availability.data??[]),calendarPeriods:periods(calendar.data??[]),scheduleExceptions:exceptions(exceptionRows.data??[])});}
 const progressMap=new Map((progress.data??[]).map((row:any)=>[row.curriculum_node_id,row]));const postpone=new Map<string,number>();for(const row of reschedules.data??[])postpone.set(row.task_id,(postpone.get(row.task_id)??0)+1);
 const adaptiveTasks=(tasks.data??[]).map((row:any)=>({id:row.id,subjectId:row.subject_id,curriculumNodeId:row.curriculum_node_id,title:row.title,plannedDate:row.planned_date,estimatedMinutes:row.estimated_minutes,completedMinutes:row.task_progress?.[0]?.completed_minutes??0,importance:row.importance,priorityScore:row.priority_score,status:row.status,createdAt:row.created_at,postponementCount:postpone.get(row.id)??0,topicState:progressMap.get(row.curriculum_node_id)?.state??null,masteryLevel:progressMap.get(row.curriculum_node_id)?.mastery_level??null,sourceReason:row.source_reason,revisionScheduleId:row.revision_schedule_id}));
 const linked=new Set((tasks.data??[]).map((row:any)=>row.revision_schedule_id).filter(Boolean));const today=calendarToday();const allAdaptiveRevisions=(revisions.data??[]).map((row:any)=>({id:row.id,subjectId:row.curriculum_nodes.subject_id,curriculumNodeId:row.curriculum_node_id,title:`${row.curriculum_nodes.subjects?.name??"Ders"}: ${row.curriculum_nodes.name} tekrarı`,scheduledFor:row.scheduled_for,estimatedMinutes:row.estimated_minutes,revisionType:row.revision_type,urgency:getRevisionUrgency(row.scheduled_for,today),masteryLevel:row.source_mastery_level}));const adaptiveRevisions=allAdaptiveRevisions.filter((row:any)=>!linked.has(row.id));
 const actualMinutesByDate:Record<string,number>={};for(const row of sessions.data??[]){const stamp=row.started_at??row.ended_at;if(!stamp)continue;const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date(stamp));actualMinutesByDate[date]=(actualMinutesByDate[date]??0)+(row.duration_minutes??0);}
 const plannedConsumedMinutesByDate:Record<string,number>={};for(const row of tasks.data??[]){if(!row.planned_date)continue;const completed=Number(row.task_progress?.[0]?.completed_minutes??0);const consumed=row.status==="completed"?Number(row.estimated_minutes??0):Math.min(Number(row.estimated_minutes??0),completed);plannedConsumedMinutesByDate[row.planned_date]=(plannedConsumedMinutesByDate[row.planned_date]??0)+consumed;}
 return{availability:availability.data??[],calendar:calendar.data??[],exceptions:exceptionRows.data??[],tasks:tasks.data??[],adaptiveTasks,adaptiveRevisions,allAdaptiveRevisions,dayCapacities,actualMinutesByDate,plannedConsumedMinutesByDate,actualMinutes:(sessions.data??[]).reduce((s:number,row:any)=>s+(row.duration_minutes??0),0)};
}

export async function recalculateCurrentPlan(client:Client,userId:string,profile:any,plan:any,trigger:any,serviceRole=false){
 const base=await loadAdaptiveBase(client,userId,profile,plan);const today=calendarToday();const remainingCapacity=Object.entries(base.dayCapacities).filter(([date])=>date>=today).reduce((s,[,m])=>s+m,0);
 const backlog=evaluateBacklog(base.adaptiveTasks.map((task:any)=>({importance:task.importance,status:task.status,remainingMinutes:Math.max(0,task.estimatedMinutes-task.completedMinutes)})),remainingCapacity);
 const output=replanWeeklyPlanV1({profileId:profile.id,planId:plan.id,weekStart:plan.week_start_date,weekEnd:plan.week_end_date,currentDate:today,planningBudgetMinutes:plan.planning_budget_minutes??Math.floor(Object.values(base.dayCapacities).reduce((a:number,b:any)=>a+b,0)*.85),dailyCapacities:base.dayCapacities,actualMinutesByDate:base.actualMinutesByDate,plannedConsumedMinutesByDate:base.plannedConsumedMinutesByDate,tasks:base.adaptiveTasks,revisions:base.adaptiveRevisions,trigger});
 const revisionDemand=base.adaptiveRevisions.reduce((s:number,row:any)=>s+row.estimatedMinutes,0);const risks:any[]=[];
 if(backlog.severity==="risk"||backlog.severity==="critical")risks.push({riskType:"backlog_overload",severity:backlog.severity,reasonCode:"BACKLOG_CAPACITY_RATIO",metricValue:Number.isFinite(backlog.capacityRatio)?backlog.capacityRatio:999,message:`Açık iş yükü kalan kapasitenin %${Math.round(Math.min(9.99,backlog.capacityRatio)*100)} seviyesinde.`});
 const baselineCapacity=calculateWeeklyAvailableMinutes(windows(base.availability));if(output.availableMinutes<baselineCapacity)risks.push({riskType:"capacity_shortfall",severity:output.availableMinutes<baselineCapacity*.6?"critical":"attention",reasonCode:"EFFECTIVE_CAPACITY_REDUCED",metricValue:output.availableMinutes,message:"Takvim istisnaları haftalık çalışma kapasitesini düşürdü."});
 if(revisionDemand>output.revisionBudgetMinutes)risks.push({riskType:"revision_overload",severity:revisionDemand>output.revisionBudgetMinutes*1.5?"risk":"attention",reasonCode:"REVISION_BUDGET_EXCEEDED",metricValue:revisionDemand,message:"Tekrar talebi haftalık tekrar bütçesini aşıyor."});
 if(output.changedTaskCount===0){const [storedBacklog,storedRisks]=await Promise.all([client.from("backlog_states").select("open_task_count,estimated_remaining_minutes,remaining_capacity_minutes,severity").eq("user_id",userId).eq("weekly_plan_id",plan.id).maybeSingle(),client.from("plan_risks").select("risk_type").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","open")]);if(storedBacklog.error)throw storedBacklog.error;if(storedRisks.error)throw storedRisks.error;const storedTypes=(storedRisks.data??[]).map((row:any)=>row.risk_type).sort().join(","),nextTypes=risks.map(row=>row.riskType).sort().join(",");const snapshotSame=storedBacklog.data&&storedBacklog.data.open_task_count===backlog.openTaskCount&&storedBacklog.data.estimated_remaining_minutes===backlog.estimatedRemainingMinutes&&storedBacklog.data.remaining_capacity_minutes===backlog.remainingCapacityMinutes&&storedBacklog.data.severity===backlog.severity&&storedTypes===nextTypes;if(snapshotSame)return{idempotent:true,noChange:true,decision:output,backlog,risks,dayCapacities:base.dayCapacities};}
 const snapshotKey=`${backlog.openTaskCount}:${backlog.estimatedRemainingMinutes}:${backlog.remainingCapacityMinutes}:${backlog.severity}|${risks.map(row=>row.riskType).sort().join(",")}`;const manualFullCapacityBudget=Number(plan.planning_budget_minutes??0)>=Number(plan.available_minutes??0);const nextPlanningBudget=manualFullCapacityBudget?output.availableMinutes:Math.min(Number(plan.planning_budget_minutes??Math.floor(output.availableMinutes*.85)),Math.floor(output.availableMinutes*.85));const payload={weeklyPlanId:plan.id,...output,dedupeKey:`${output.dedupeKey}|snapshot:${snapshotKey}`,explanation:output.changedTaskCount===0&&risks.length?"Kapasite ve risk durumu güncel koşullara göre yenilendi.":output.explanation,planningBudgetMinutes:nextPlanningBudget,backlog:{...backlog,capacityRatio:Number.isFinite(backlog.capacityRatio)?backlog.capacityRatio:999},risks};
 const applied=serviceRole?await client.rpc("telegram_apply_plan_revision",{p_user_id:userId,p_payload:payload}):await client.rpc("apply_plan_revision",{p_payload:payload});if(applied.error)throw applied.error;return{...applied.data,decision:output,backlog,risks,dayCapacities:base.dayCapacities};
}

export async function minimumDayPlan(client:Client,userId:string,profile:any,plan:any,date:string,availableMinutes?:number){const base=await loadAdaptiveBase(client,userId,profile,plan);const capacity=availableMinutes??base.dayCapacities[date]??0;const candidates=[...base.adaptiveTasks.filter((t:any)=>t.plannedDate<=date&&!['cancelled','completed','missed'].includes(t.status)).map((t:any)=>({id:t.id,kind:"task",minutes:Math.max(0,t.estimatedMinutes-t.completedMinutes),importance:t.importance,status:t.status,topicState:t.topicState,masteryLevel:t.masteryLevel,title:t.title})),...base.adaptiveRevisions.filter((r:any)=>r.scheduledFor<=date).map((r:any)=>({id:r.id,kind:"revision",minutes:r.estimatedMinutes,importance:r.masteryLevel==="critical"||r.masteryLevel==="weak"?"core":"important",revisionUrgency:r.urgency,masteryLevel:r.masteryLevel,title:r.title}))];return{date,availableMinutes:capacity,...buildMinimumDayPlan({availableMinutes:capacity,candidates})};}

export async function syllabusProjection(client:Client,userId:string,profile:any){
 const selections=await client.from("user_subjects").select("subject_id").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","active");if(selections.error)throw selections.error;
 const subjectIds=(selections.data??[]).map((row:any)=>row.subject_id);
 const [nodes,progress,edition]=await Promise.all([
  subjectIds.length?client.from("curriculum_nodes").select("id,subject_id,parent_id,node_type").eq("is_active",true).eq("node_type","topic").is("parent_id",null).in("subject_id",subjectIds):Promise.resolve({data:[],error:null}),
  client.from("topic_progress").select("curriculum_node_id,state,learned_at").eq("user_id",userId).eq("exam_profile_id",profile.id),
  client.from("exam_editions").select("exam_date").eq("id",profile.exam_edition_id).single(),
 ]);for(const r of[nodes,progress,edition])if(r.error)throw r.error;
 const selectedTopicIds=new Set((nodes.data??[]).map((n:any)=>n.id));
 const projectionProgress=(progress.data??[]).filter((r:any)=>selectedTopicIds.has(r.curriculum_node_id));
 const map=new Map(projectionProgress.map((r:any)=>[r.curriculum_node_id,r]));
 const learned=projectionProgress.filter((r:any)=>r.learned_at);
 const dates=learned.map((r:any)=>r.learned_at.slice(0,10)).sort();
 const observedWeeks=dates.length?Math.max(1,Math.ceil((new Date(`${calendarToday()}T12:00:00Z`).getTime()-new Date(`${dates[0]}T12:00:00Z`).getTime())/(7*86400000))):0;
 return buildSyllabusProjection({topics:(nodes.data??[]).map((n:any)=>({id:n.id,parentId:n.parent_id,nodeType:n.node_type,state:map.get(n.id)?.state??"not_started"})),observedWeeks,recentLearnedTopics:learned.length,asOfDate:calendarToday(),examDate:profile.target_exam_date??edition.data.exam_date});
}
