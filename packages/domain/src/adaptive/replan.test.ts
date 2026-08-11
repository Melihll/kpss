import{describe,expect,it}from"vitest";import{replanWeeklyPlanV1}from"./replan";import type{AdaptiveRevision,AdaptiveTask,ReplanContext}from"./types";
const t=(id:string,over:Partial<AdaptiveTask>={}):AdaptiveTask=>({id,subjectId:"s",curriculumNodeId:"n",title:id,plannedDate:"2026-08-03",estimatedMinutes:60,completedMinutes:0,importance:"important",priorityScore:50,status:"ready",createdAt:id,postponementCount:0,...over});
const rev=(id:string,over:Partial<AdaptiveRevision>={}):AdaptiveRevision=>({id,subjectId:"s",curriculumNodeId:"n",title:id,scheduledFor:"2026-08-03",estimatedMinutes:30,revisionType:"topic_test",urgency:"due",masteryLevel:"fragile",...over});
const ctx=(tasks:AdaptiveTask[],revisions:AdaptiveRevision[]=[],over:Partial<ReplanContext>={}):ReplanContext=>({profileId:"p",planId:"w",weekStart:"2026-08-03",weekEnd:"2026-08-09",currentDate:"2026-08-03",planningBudgetMinutes:300,dailyCapacities:{"2026-08-03":120,"2026-08-04":120,"2026-08-05":120},tasks,revisions,trigger:"manual_request",...over});
describe("Priority and Dynamic Replanning V1",()=>{
 it("keeps core before optional",()=>{const r=replanWeeklyPlanV1(ctx([t("o",{importance:"optional"}),t("c",{importance:"core"})],[],{planningBudgetMinutes:60,dailyCapacities:{"2026-08-03":60}}));expect(r.tasksToKeep).toContain("c");expect(r.tasksToCancel).toContain("o");});
 it("prioritizes overdue revision",()=>{const r=replanWeeklyPlanV1(ctx([], [rev("normal"),rev("critical",{urgency:"critical_overdue",masteryLevel:"critical"})],{planningBudgetMinutes:150}));expect(r.tasksToCreate[0]?.revisionScheduleId).toBe("critical");});
 it("prioritizes weak remediation task",()=>{const r=replanWeeklyPlanV1(ctx([t("normal"),t("weak",{topicState:"remediation",masteryLevel:"weak"})],[],{planningBudgetMinutes:60,dailyCapacities:{"2026-08-03":60}}));expect(r.tasksToKeep[0]).toBe("weak");});
 it("does not exceed revision budget",()=>{const r=replanWeeklyPlanV1(ctx([],Array.from({length:5},(_,i)=>rev(String(i),{estimatedMinutes:30})),{planningBudgetMinutes:300}));expect(r.revisionMinutes).toBeLessThanOrEqual(r.revisionBudgetMinutes);});
 it("never moves or cancels completed tasks",()=>{const r=replanWeeklyPlanV1(ctx([t("done",{status:"completed"})]));expect(r.tasksToMove).toEqual([]);expect(r.tasksToCancel).toEqual([]);});
 it("preserves in progress task",()=>expect(replanWeeklyPlanV1(ctx([t("active",{status:"in_progress"})],[],{planningBudgetMinutes:10,dailyCapacities:{"2026-08-03":10}})).tasksToKeep).toContain("active"));
 it("stays within ordinary replan budget",()=>{const r=replanWeeklyPlanV1(ctx([t("one"),t("two")],[],{planningBudgetMinutes:120}));expect(r.afterPlannedMinutes).toBeLessThanOrEqual(120);});

 it("uses actual study time without pulling future work forward after overspending",()=>{
  const r=replanWeeklyPlanV1(ctx([t("done",{plannedDate:"2026-08-03",estimatedMinutes:60,status:"completed"}),t("long",{plannedDate:"2026-08-03",estimatedMinutes:90}),t("later",{plannedDate:"2026-08-04",estimatedMinutes:60})],[],{planningBudgetMinutes:210,dailyCapacities:{"2026-08-03":120,"2026-08-04":120},actualMinutesByDate:{"2026-08-03":90},plannedConsumedMinutesByDate:{"2026-08-03":60},trigger:"study_deviation"}));
  expect(r.tasksToMove).toContainEqual({taskId:"long",fromDate:"2026-08-03",toDate:"2026-08-04",reason:"replanning"});
  expect(r.tasksToMove.some(move=>move.taskId==="later"&&move.toDate==="2026-08-03")).toBe(false);
  expect(r.availableMinutes).toBe(240);
 });
 it("pulls future work forward after a task finishes faster than planned",()=>{
  const r=replanWeeklyPlanV1(ctx([t("done",{plannedDate:"2026-08-03",estimatedMinutes:60,status:"completed"}),t("later",{plannedDate:"2026-08-04",estimatedMinutes:60})],[],{planningBudgetMinutes:120,dailyCapacities:{"2026-08-03":120,"2026-08-04":120},actualMinutesByDate:{"2026-08-03":35},plannedConsumedMinutesByDate:{"2026-08-03":60},trigger:"study_deviation"}));
  expect(r.tasksToMove).toContainEqual({taskId:"later",fromDate:"2026-08-04",toDate:"2026-08-03",reason:"replanning"});
 });
 it("is deterministic",()=>{const input=ctx([t("a"),t("b")],[rev("r")]);expect(replanWeeklyPlanV1(input)).toEqual(replanWeeklyPlanV1(input));});
 it("uses stable revision dedupe keys",()=>{const input=ctx([], [rev("r")]);expect(replanWeeklyPlanV1(input).tasksToCreate[0]?.dedupeKey).toBe(replanWeeklyPlanV1(input).tasksToCreate[0]?.dedupeKey);});
});
