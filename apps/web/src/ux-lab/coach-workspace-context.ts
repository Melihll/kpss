import { createContext, useCallback, useContext, useEffect, useReducer } from "react";
import { createCoachWorkspace, workspaceReducer, type CoachWorkspaceState, type WorkspaceAction } from "./coach-workspace-state";
type WithoutNow<T> = T extends { now: number } ? Omit<T, "now"> : never;
export type WorkspaceCommand = WithoutNow<WorkspaceAction>;
export interface WorkspaceController { state: CoachWorkspaceState; send: (action: WorkspaceCommand) => void }
export const CoachWorkspaceContext = createContext<WorkspaceController | null>(null);
export function useCoachWorkspace() {
  const context = useContext(CoachWorkspaceContext);
  if (!context) throw new Error("Coach workspace missing");
  return context;
}
export function useCoachWorkspaceController(active: boolean): WorkspaceController {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, () => createCoachWorkspace(Date.now()));
  const send = useCallback((action: WorkspaceCommand) => dispatch({ ...action, now: Date.now() }), []);
  useEffect(() => { if (!active) send({ type: "pause" }); }, [active, send]);
  useEffect(() => {
    if (!active || state.session?.phase !== "running") return;
    const timer = window.setInterval(() => send({ type: "tick" }), 250);
    return () => window.clearInterval(timer);
  }, [active, state.session?.phase, send]);
  return { state, send };
}
