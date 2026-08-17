export async function prepareDailyPlanNotification<T>(input: {
  ensurePlan: () => Promise<unknown>;
  buildSummary: () => Promise<T>;
}) {
  await input.ensurePlan();
  const summary = await input.buildSummary();
  return {
    summary,
    replan: {
      performed: false as const,
      trigger: null,
      tasksToBacklog: [] as string[],
    },
  };
}
