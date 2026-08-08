import{describe,expect,it}from"vitest";import{calculatePlanDeviation,evaluateBacklog}from"./backlog";
const task=(remainingMinutes:number,importance:"core"|"important"|"optional"="important")=>({remainingMinutes,importance,status:"ready" as const});
describe("Backlog and deviation",()=>{
 it("marks low backlog normal",()=>expect(evaluateBacklog([task(60)],100).severity).toBe("normal"));
 it("marks medium backlog attention",()=>expect(evaluateBacklog([task(80)],100).severity).toBe("attention"));
 it("marks overload risk and critical",()=>{expect(evaluateBacklog([task(100)],100).severity).toBe("risk");expect(evaluateBacklog([task(120)],100).severity).toBe("critical");});
 it("triggers ceiling replan",()=>expect(evaluateBacklog([task(100,"core")],100).shouldReplan).toBe(true));
 it("calculates plan deviation with elapsed week damping",()=>{expect(calculatePlanDeviation({plannedMinutes:600,actualMinutes:290,plannedTaskCount:10,completedTaskCount:5,elapsedWeekRatio:.5}).severity).toBe("normal");expect(calculatePlanDeviation({plannedMinutes:600,actualMinutes:100,plannedTaskCount:10,completedTaskCount:1,elapsedWeekRatio:.5}).severity).toBe("risk");});
});
