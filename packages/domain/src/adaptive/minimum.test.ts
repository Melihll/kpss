import{describe,expect,it}from"vitest";import{buildMinimumDayPlan}from"./minimum";import type{MinimumPlanCandidate}from"./types";
const c=(id:string,minutes:number,over:Partial<MinimumPlanCandidate>={}):MinimumPlanCandidate=>({id,minutes,title:id,kind:"task",importance:"important",status:"ready",...over});
describe("Minimum Plan",()=>{
 it("builds a meaningful 35 minute plan",()=>expect(buildMinimumDayPlan({availableMinutes:35,candidates:[c("review",15,{kind:"revision",revisionUrgency:"due"}),c("core",20,{importance:"core"})]}).totalMinutes).toBe(35));
 it("prioritizes critical revision",()=>expect(buildMinimumDayPlan({availableMinutes:20,candidates:[c("task",20,{importance:"core"}),c("critical",15,{kind:"revision",revisionUrgency:"critical_overdue"})]}).tasks[0]?.id).toBe("critical"));
 it("prioritizes partial core",()=>expect(buildMinimumDayPlan({availableMinutes:20,candidates:[c("normal",20,{importance:"core"}),c("partial",20,{importance:"core",status:"partially_completed"})]}).tasks[0]?.id).toBe("partial"));
 it("never exceeds available minutes",()=>expect(buildMinimumDayPlan({availableMinutes:30,candidates:[c("a",20),c("b",20)]}).totalMinutes).toBeLessThanOrEqual(30));
 it("returns an empty reason when nothing fits",()=>expect(buildMinimumDayPlan({availableMinutes:10,candidates:[c("a",15)]})).toMatchObject({tasks:[],reason:"NO_MEANINGFUL_TASK_FITS"}));
});
