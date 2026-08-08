import type { TopicProgressState } from "./types";

export interface TopicProgressCounts {
  completed: number;
  inProgress: number;
  remaining: number;
}

export function countTopicProgress(states: readonly TopicProgressState[]): TopicProgressCounts {
  return states.reduce<TopicProgressCounts>(
    (counts, state) => {
      if (state === "learned" || state === "maintenance") counts.completed += 1;
      else if (state === "not_started") counts.remaining += 1;
      else counts.inProgress += 1;
      return counts;
    },
    { completed: 0, inProgress: 0, remaining: 0 },
  );
}
