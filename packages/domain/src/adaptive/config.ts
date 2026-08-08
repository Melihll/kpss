export const BACKLOG_THRESHOLDS={normal:0.70,attention:0.90,risk:1.10} as const;
export const DEVIATION_THRESHOLDS={normal:0.05,attention:0.10} as const;
export const FIRST_PASS_BUFFER_DAYS=30;
export const MIN_PROJECTION_WEEKS=2;
export const PRIORITY_V1={scheduleUrgency:25,weakness:25,revisionUrgency:20,planDeviation:15,postponement:10,dependency:5} as const;
export const REPLAN_LEVEL_1_CHANGE_LIMIT=2;
export const REPLAN_LEVEL_2_CHANGE_LIMIT=6;
