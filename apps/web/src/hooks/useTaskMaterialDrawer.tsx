import { useRef, useState } from "react";
import { ResourceDetailDrawer, type ResourceDetailTab } from "../components/ResourceDetailDrawer";
import { callAppApi } from "../lib/app-api";
import type { RoadmapTask } from "../lib/roadmap";
import type { ResourcePageProgress, ResourceProgressResponse } from "../lib/resource-progress-ui";
import { defaultTaskMaterialTab, taskMaterialResource } from "../lib/today-material-actions";

export function useTaskMaterialDrawer(onProgressChanged?: () => void) {
  const [request, setRequest] = useState<{
    task: RoadmapTask;
    resource: NonNullable<ReturnType<typeof taskMaterialResource>>;
    tab: ResourceDetailTab;
  } | null>(null);
  const [pageProgress, setPageProgress] = useState<ResourcePageProgress | null>(null);
  const dirty = useRef(false);

  const openTaskMaterial = (task: RoadmapTask, requestedTab?: ResourceDetailTab) => {
    const resource = taskMaterialResource(task);
    if (!resource) return;
    dirty.current = false;
    setPageProgress(null);
    setRequest({
      task,
      resource,
      tab: requestedTab ?? defaultTaskMaterialTab(task),
    });

    void callAppApi<ResourceProgressResponse>(
      `/resources/${resource.resourceId}/progress`,
    )
      .then((payload) => setPageProgress(payload.progress))
      .catch(() => setPageProgress(null));
  };

  const closeTaskMaterial = () => {
    setRequest(null);
    setPageProgress(null);
    if (dirty.current) onProgressChanged?.();
    dirty.current = false;
  };

  const materialDrawer = <ResourceDetailDrawer
    resource={request?.resource ?? null}
    materialScope={request?.task.material_scope ?? null}
    pageProgress={pageProgress}
    initialTab={request?.tab ?? "page"}
    onClose={closeTaskMaterial}
    onPageSaved={(progress) => {
      dirty.current = true;
      setPageProgress(progress);
    }}
    onMaterialProgressChanged={() => {
      dirty.current = true;
    }}
  />;

  return { openTaskMaterial, materialDrawer } as const;
}
