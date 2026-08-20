export function moveTaskId(
  taskIds: readonly string[],
  taskId: string,
  targetIndex: number,
): string[] {
  const sourceIndex = taskIds.indexOf(taskId);
  if (sourceIndex < 0 || taskIds.length <= 1) return [...taskIds];

  const boundedTargetIndex = Math.max(0, Math.min(targetIndex, taskIds.length - 1));
  if (sourceIndex === boundedTargetIndex) return [...taskIds];

  const next = [...taskIds];
  const [moved] = next.splice(sourceIndex, 1);
  if (moved === undefined) return [...taskIds];
  next.splice(boundedTargetIndex, 0, moved);
  return next;
}

export function mergeMovableTaskOrder(
  allTaskIds: readonly string[],
  movableTaskIds: readonly string[],
  nextMovableTaskIds: readonly string[],
): string[] {
  if (movableTaskIds.length !== nextMovableTaskIds.length) return [...allTaskIds];

  const movableSet = new Set(movableTaskIds);
  if (
    movableSet.size !== movableTaskIds.length ||
    nextMovableTaskIds.some((id) => !movableSet.has(id)) ||
    new Set(nextMovableTaskIds).size !== nextMovableTaskIds.length
  ) {
    return [...allTaskIds];
  }

  let cursor = 0;
  return allTaskIds.map((taskId) => {
    if (!movableSet.has(taskId)) return taskId;
    const replacement = nextMovableTaskIds[cursor++];
    return replacement ?? taskId;
  });
}