import { createContext, useContext } from "react";
import type { Concept, LabState, Material, Proposal, Scenario, Screen, Task } from "./model";

export interface LabContextValue {
  state: LabState; concept: Concept; scenario: Scenario;
  navigate: (screen: Screen) => void; start: (task: Task) => void;
  resource: (material: Material) => void; edit: (task: Task | null, day: number) => void;
  capacity: (day: number) => void; review: (proposal: Proposal) => void;
}
export const LabContext = createContext<LabContextValue | null>(null);
export function useLab(): LabContextValue {
  const value = useContext(LabContext);
  if (!value) throw new Error("LabContext missing");
  return value;
}
