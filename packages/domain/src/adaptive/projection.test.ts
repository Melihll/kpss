import{describe,expect,it}from"vitest";import{buildSyllabusProjection}from"./projection";import type{ProjectionTopic}from"./types";
const topics:ProjectionTopic[]=[{id:"1",parentId:null,nodeType:"topic",state:"learned"},{id:"2",parentId:null,nodeType:"topic",state:"learning"},{id:"3",parentId:null,nodeType:"topic",state:"not_started"},{id:"sub",parentId:"2",nodeType:"subtopic",state:"learned"}];
describe("Syllabus projection",()=>{
 it("produces projection with sufficient history",()=>expect(buildSyllabusProjection({topics,observedWeeks:2,recentLearnedTopics:2,asOfDate:"2026-08-03",examDate:"2026-12-01"}).projectedCompletionDate).toBe("2026-08-17"));
 it("returns unknown with insufficient history",()=>expect(buildSyllabusProjection({topics,observedWeeks:1,recentLearnedTopics:2,asOfDate:"2026-08-03",examDate:"2026-12-01"}).status).toBe("UNKNOWN"));
 it("marks exam-date overrun risk",()=>expect(buildSyllabusProjection({topics,observedWeeks:2,recentLearnedTopics:1,asOfDate:"2026-08-03",examDate:"2026-08-10"}).status).toBe("RISK"));
 it("marks completion inside buffer attention",()=>expect(buildSyllabusProjection({topics,observedWeeks:2,recentLearnedTopics:2,asOfDate:"2026-08-03",examDate:"2026-09-01"}).status).toBe("ATTENTION"));
 it("marks safe completion on track",()=>expect(buildSyllabusProjection({topics,observedWeeks:2,recentLearnedTopics:2,asOfDate:"2026-08-03",examDate:"2026-12-01"}).status).toBe("ON_TRACK"));
 it("does not double count subtopics",()=>expect(buildSyllabusProjection({topics,observedWeeks:2,recentLearnedTopics:2,asOfDate:"2026-08-03",examDate:null}).total).toBe(3));
});
