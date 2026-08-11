import type { MasteryLevel, TaskImportance, TaskStatus, TopicProgressState } from "../types";
import type { AvailabilityWindow } from "../capacity";
import type { RevisionUrgency, RevisionType } from "../mastery";

export interface CapacityPeriod{startDate:string;endDate:string;capacityMultiplier:number|null}
export interface CapacityException{date:string;type:"unavailable"|"extra_available"|"custom";startTime:string|null;endTime:string|null;minutesDelta:number|null}
export interface EffectiveCapacityContext{date:string;weeklyAvailability:readonly AvailabilityWindow[];calendarPeriods:readonly CapacityPeriod[];scheduleExceptions:readonly CapacityException[]}
export type BacklogSeverity="normal"|"attention"|"risk"|"critical";
export interface BacklogEvaluation{openTaskCount:number;openCoreCount:number;openImportantCount:number;openOptionalCount:number;estimatedRemainingMinutes:number;remainingCapacityMinutes:number;capacityRatio:number;severity:BacklogSeverity;shouldReplan:boolean}
export interface BacklogTask{importance:TaskImportance;remainingMinutes:number;status:TaskStatus}
export type DeviationSeverity="normal"|"attention"|"risk";
export interface PlanDeviation{deviationRatio:number;estimatedDelayMinutes:number;severity:DeviationSeverity}
export interface AdaptiveTask{id:string;subjectId:string;curriculumNodeId:string|null;title:string;plannedDate:string|null;estimatedMinutes:number;completedMinutes:number;importance:TaskImportance;priorityScore:number;status:TaskStatus;createdAt:string;postponementCount:number;topicState?:TopicProgressState|null;masteryLevel?:MasteryLevel|null;sourceReason?:string}
export interface AdaptiveRevision{id:string;subjectId:string;curriculumNodeId:string;title:string;scheduledFor:string;estimatedMinutes:number;revisionType:RevisionType;urgency:RevisionUrgency;masteryLevel:Exclude<MasteryLevel,"unknown">}
export interface TaskMove{taskId:string;fromDate:string|null;toDate:string;reason:"capacity_change"|"replanning"|"carryover"}
export interface RevisionTaskDraft{revisionScheduleId:string;subjectId:string;curriculumNodeId:string;title:string;plannedDate:string;estimatedMinutes:number;importance:"core"|"important";priorityScore:number;dedupeKey:string}
export interface ReplanContext{profileId:string;planId:string;weekStart:string;weekEnd:string;currentDate:string;planningBudgetMinutes:number;dailyCapacities:Readonly<Record<string,number>>;actualMinutesByDate?:Readonly<Record<string,number>>;plannedConsumedMinutesByDate?:Readonly<Record<string,number>>;tasks:readonly AdaptiveTask[];revisions:readonly AdaptiveRevision[];trigger:"capacity_change"|"backlog_risk"|"new_mastery"|"revision_due"|"manual_request"|"study_deviation"}
export interface ReplanResult{tasksToKeep:string[];tasksToMove:TaskMove[];tasksToCancel:string[];tasksToCreate:RevisionTaskDraft[];availableMinutes:number;afterPlannedMinutes:number;revisionMinutes:number;revisionBudgetMinutes:number;changedTaskCount:number;revisionType:"automatic_minor"|"automatic_informed"|"strategic_proposal";reasonCode:string;explanation:string;dedupeKey:string}
export interface MinimumPlanCandidate{id:string;kind:"task"|"revision";minutes:number;importance:TaskImportance;status?:TaskStatus;revisionUrgency?:RevisionUrgency;topicState?:TopicProgressState|null;masteryLevel?:MasteryLevel|null;title:string}
export interface ProjectionTopic{id:string;parentId:string|null;nodeType:"topic"|"subtopic";state:TopicProgressState}
