import { applyProposal, createDemoState, finishStudy, proposalError, TODAY, type LabState, type Proposal, type Task } from "./model";

export interface Lesson { number: number; title: string; seconds: number }
export interface Playlist {
  resourceId: string; current: number; lessons: Lesson[]; positions: Record<number, number>;
  completed: number[]; playing: boolean;
}
export interface WorkSession {
  taskId: string; phase: "running" | "paused" | "finishing" | "saved";
  startedAt: number | null; accumulatedMs: number; startBoundary: number;
  resumeVideo?: string;
}
export interface CoachWorkspaceState {
  lab: LabState; selectedTaskId: string; session: WorkSession | null; now: number;
  playlists: Record<string, Playlist>; relatedVideos: Record<string, { resourceId: string; number: number }>;
  drafts: Record<string, string>; notice: string; error: string;
}
export type WorkspaceAction =
  | { type: "tick" | "start" | "pause" | "resume" | "finish" | "save-finish" | "resume-edit" | "reset" | "clear-notice"; now: number }
  | { type: "select"; taskId: string; now: number }
  | { type: "draft"; taskId: string; value: string; now: number }
  | { type: "save-page"; taskId: string; now: number }
  | { type: "video-toggle" | "video-complete"; resourceId: string; now: number }
  | { type: "video-select"; resourceId: string; number: number; now: number }
  | { type: "video-seek"; resourceId: string; seconds: number; now: number }
  | { type: "apply"; proposal: Proposal; now: number }
  | { type: "empty"; now: number };

function makePlaylist(resourceId: string, total: number, titles: Record<number, string>): Playlist {
  return { resourceId, current: 13, positions: { 13: 1394 }, completed: Array.from({ length: 12 }, (_, i) => i + 1), playing: false,
    lessons: Array.from({ length: total }, (_, i) => ({ number: i + 1, title: titles[i + 1] ?? `Konu anlatımı · Ders ${i + 1}`, seconds: i === 12 ? 2930 : 2400 + (i % 5) * 180 })) };
}
export function createCoachWorkspace(now = 0): CoachWorkspaceState {
  const lab = createDemoState();
  lab.tasks = lab.tasks.map((task) => task.id === "today-main" ? { ...task, title: "Ticari Kâr / Mali Kâr", minutes: 45, start: 142, end: 158 } : task.id === "today-math" ? { ...task, title: "Problemler", minutes: 60 } : task.id === "sat-account" ? { ...task, start: 159, end: 176 } : task);
  lab.materials = lab.materials.map((m) => m.id === "reditus" ? { ...m, progress: 141, total: 420, note: "Konu anlatımı · Ticari kâr ve mali kâr" } : m);
  lab.materials.push({ id: "account-video", subject: "Muhasebe", name: "Muhasebe Video Dersleri", kind: "video", activity: "Video ders", total: 41, progress: 12, status: "active", estimate: "Kasım sonu", note: "Reditus ile birlikte" });
  return { lab, selectedTaskId: "today-main", session: null, now, drafts: {}, notice: "", error: "",
    relatedVideos: { "today-main": { resourceId: "account-video", number: 13 }, "sat-account": { resourceId: "account-video", number: 14 } },
    playlists: {
      "account-video": makePlaylist("account-video", 41, { 11: "Gelir ve gider hesapları", 12: "Dönem sonu işlemleri", 13: "Ticari Kâr / Mali Kâr", 14: "Vergi karşılığı ve kayıtlar", 15: "Mali tablolar · Bilanço" }),
      economy: makePlaylist("economy", 91, { 11: "Piyasa türleri", 12: "Talebi etkileyen faktörler", 13: "Arz, talep ve piyasa dengesi", 14: "Talep esnekliği", 15: "Tüketici dengesi" }),
    } };
}
export function currentTask(state: CoachWorkspaceState): Task | undefined {
  if (state.session) return state.lab.tasks.find((task) => task.id === state.session!.taskId);
  return state.lab.tasks.find((task) => task.id === state.selectedTaskId && task.day === TODAY && !task.done) ?? state.lab.tasks.find((task) => task.day === TODAY && !task.done);
}
export function taskVideoId(state: CoachWorkspaceState, task: Task): string | undefined {
  return state.playlists[task.resourceId] ? task.resourceId : state.relatedVideos[task.id]?.resourceId;
}
export function elapsedSeconds(state: CoachWorkspaceState): number {
  const session = state.session;
  return session ? Math.floor((session.accumulatedMs + (session.startedAt === null ? 0 : Math.max(0, state.now - session.startedAt))) / 1000) : 0;
}
export function pageBoundary(state: CoachWorkspaceState, task: Task): number {
  const progress = state.lab.materials.find((m) => m.id === task.resourceId)?.progress ?? 0;
  return Math.max(task.start - 1, Math.min(progress, task.end));
}
export function pageError(state: CoachWorkspaceState, task: Task, raw: string): string | null {
  const number = Number(raw);
  return !raw.trim() || !Number.isInteger(number) || number < pageBoundary(state, task) || number > task.end
    ? `${pageBoundary(state, task)}–${task.end} arasında bir sayfa gir.` : null;
}
function stopPlayers(state: CoachWorkspaceState): Record<string, Playlist> {
  return Object.fromEntries(Object.entries(state.playlists).map(([id, player]) => [id, { ...player, playing: false }]));
}
function completeVideo(state: CoachWorkspaceState, id: string): CoachWorkspaceState {
  const player = state.playlists[id];
  if (!player || player.completed.includes(player.current)) return state;
  const completed = [...player.completed, player.current].sort((a, b) => a - b);
  let contiguous = 0;
  while (completed.includes(contiguous + 1)) contiguous++;
  return { ...state, playlists: { ...state.playlists, [id]: { ...player, completed, playing: false, positions: { ...player.positions, [player.current]: player.lessons[player.current - 1]!.seconds } } }, lab: { ...state.lab, version: state.lab.version + 1, materials: state.lab.materials.map((m) => m.id === id ? { ...m, progress: Math.max(m.progress, contiguous) } : m) }, notice: `Video ${player.current} tamamlandı.` };
}
function tick(state: CoachWorkspaceState, now: number): CoachWorkspaceState {
  const delta = Math.max(0, now - state.now) / 1000;
  let next = { ...state, now };
  if (state.session?.phase === "running") {
    for (const [id, player] of Object.entries(state.playlists)) {
      if (!player.playing) continue;
      const lesson = player.lessons[player.current - 1]!;
      const position = Math.min(lesson.seconds, (player.positions[player.current] ?? 0) + delta);
      next = { ...next, playlists: { ...next.playlists, [id]: { ...player, positions: { ...player.positions, [player.current]: position }, playing: position < lesson.seconds } } };
      if (position >= lesson.seconds && delta > 0) next = completeVideo(next, id);
    }
  }
  return next;
}
function pause(state: CoachWorkspaceState, phase: WorkSession["phase"] = "paused"): CoachWorkspaceState {
  if (!state.session || state.session.phase === "saved") return state;
  const resumeVideo = state.session.phase === "running" ? Object.keys(state.playlists).find((id) => state.playlists[id]?.playing) : state.session.resumeVideo;
  return { ...state, playlists: stopPlayers(state), session: { ...state.session, phase, resumeVideo, accumulatedMs: state.session.accumulatedMs + (state.session.startedAt === null ? 0 : Math.max(0, state.now - state.session.startedAt)), startedAt: null } };
}
function start(state: CoachWorkspaceState): CoachWorkspaceState {
  const task = currentTask(state);
  if (!task || task.done) return state;
  if (state.session && state.session.phase !== "saved") return state;
  const videoId = taskVideoId(state, task);
  const player = videoId ? state.playlists[videoId] : undefined;
  return { ...state, playlists: videoId && player ? { ...stopPlayers(state), [videoId]: { ...player, playing: (player.positions[player.current] ?? 0) < player.lessons[player.current - 1]!.seconds } } : state.playlists, session: { taskId: task.id, phase: "running", startedAt: state.now, accumulatedMs: 0, startBoundary: pageBoundary(state, task) }, notice: "", error: "" };
}
export function workspaceProposalError(state: CoachWorkspaceState, proposal: Proposal): string | null {
  if (state.session && state.session.phase !== "saved" && proposal.changes.some((change) => change.before?.id === state.session!.taskId)) return "Bu çalışma sürüyor. Gününü veya içeriğini değiştirmeden önce çalışmayı bitir.";
  return proposalError(state.lab, proposal);
}
export function workspaceReducer(previous: CoachWorkspaceState, action: WorkspaceAction): CoachWorkspaceState {
  let state = tick(previous, action.now);
  const task = currentTask(state);
  switch (action.type) {
    case "tick": return state;
    case "reset": return createCoachWorkspace(action.now);
    case "clear-notice": return { ...state, notice: "" };
    case "empty": return { ...createCoachWorkspace(action.now), lab: { ...createCoachWorkspace().lab, tasks: [] }, selectedTaskId: "" };
    case "select": {
      const selected = state.lab.tasks.find((t) => t.id === action.taskId && !t.done && t.day === TODAY);
      if (!selected) return state;
      if (state.session && state.session.phase !== "saved" && state.session.taskId !== selected.id) return { ...state, notice: "Önce açık çalışmanı bitir." };
      if (state.session && state.session.phase !== "saved") return state;
      const videoId = taskVideoId(state, selected);
      const player = videoId ? state.playlists[videoId] : undefined;
      const number = state.relatedVideos[selected.id]?.number ?? selected.start;
      const playlists = stopPlayers(state);
      if (videoId && player && selected.id !== state.selectedTaskId) playlists[videoId] = { ...player, current: number, playing: false };
      return { ...state, selectedTaskId: selected.id, session: null, playlists, notice: "", error: "" };
    }
    case "start": return start(state);
    case "pause": return pause(state);
    case "resume":
    case "resume-edit": {
      if (!state.session || state.session.phase === "saved") return state;
      const resumeId = state.session.resumeVideo;
      const player = resumeId ? state.playlists[resumeId] : undefined;
      return { ...state, playlists: resumeId && player ? { ...state.playlists, [resumeId]: { ...player, playing: (player.positions[player.current] ?? 0) < player.lessons[player.current - 1]!.seconds } } : state.playlists, session: { ...state.session, phase: "running", startedAt: state.session.startedAt ?? action.now }, error: "" };
    }
    case "finish": return pause(state, "finishing");
    case "draft": return { ...state, drafts: { ...state.drafts, [action.taskId]: action.value }, error: "" };
    case "save-page": {
      const target = state.lab.tasks.find((t) => t.id === action.taskId);
      if (!target || target.done || state.lab.materials.find((m) => m.id === target.resourceId)?.kind !== "book") return state;
      const raw = state.drafts[target.id] ?? String(pageBoundary(state, target));
      const error = pageError(state, target, raw);
      if (error) return { ...state, error };
      return { ...state, lab: { ...state.lab, version: state.lab.version + 1, materials: state.lab.materials.map((m) => m.id === target.resourceId ? { ...m, progress: Math.max(m.progress, Number(raw)), status: "active" } : m) }, error: "", notice: `Sayfa ${raw} kaydedildi.` };
    }
    case "video-toggle": {
      if (!task || taskVideoId(state, task) !== action.resourceId) return state;
      const player = state.playlists[action.resourceId];
      if (!player || state.session?.phase === "finishing" || state.session?.phase === "saved") return state;
      if (!state.session) state = start(state);
      else if (state.session.phase === "paused") state = { ...state, session: { ...state.session, phase: "running", startedAt: action.now } };
      const ended = (player.positions[player.current] ?? 0) >= player.lessons[player.current - 1]!.seconds;
      return { ...state, playlists: { ...stopPlayers(state), [action.resourceId]: { ...player, playing: !player.playing, positions: ended ? { ...player.positions, [player.current]: 0 } : player.positions } } };
    }
    case "video-select": {
      const player = state.playlists[action.resourceId];
      if (!player || !Number.isInteger(action.number) || action.number < 1 || action.number > player.lessons.length) return state;
      return { ...state, playlists: { ...state.playlists, [action.resourceId]: { ...player, current: action.number, playing: false } } };
    }
    case "video-seek": {
      const player = state.playlists[action.resourceId];
      if (!player || !Number.isFinite(action.seconds)) return state;
      const position = Math.max(0, Math.min(action.seconds, player.lessons[player.current - 1]!.seconds));
      return { ...state, playlists: { ...state.playlists, [action.resourceId]: { ...player, playing: player.playing && position < player.lessons[player.current - 1]!.seconds, positions: { ...player.positions, [player.current]: position } } } };
    }
    case "video-complete": {
      if (state.session?.phase === "finishing" || state.session?.phase === "saved") return state;
      return completeVideo(state, action.resourceId);
    }
    case "save-finish": {
      if (!task || state.session?.phase !== "finishing") return state;
      const material = state.lab.materials.find((m) => m.id === task.resourceId)!;
      let boundary = pageBoundary(state, task);
      if (material.kind === "book") {
        const raw = state.drafts[task.id] ?? String(boundary);
        const error = pageError(state, task, raw);
        if (error) return { ...state, error };
        boundary = Number(raw);
      } else {
        const completed = state.playlists[material.id]?.completed ?? [];
        boundary = task.start - 1;
        while (boundary < task.end && completed.includes(boundary + 1)) boundary++;
      }
      const lab = finishStudy(state.lab, task.id, boundary, elapsedSeconds(state));
      if (lab === state.lab) return { ...state, error: "İlerleme kaydedilemedi. Son sayfanı kontrol et." };
      return { ...state, lab, session: { ...state.session, phase: "saved" }, error: "", notice: "Çalışma kaydedildi." };
    }
    case "apply": {
      const error = workspaceProposalError(state, action.proposal);
      if (error) return { ...state, error };
      return { ...state, lab: applyProposal(state.lab, action.proposal), notice: "Plan güncellendi.", error: "" };
    }
  }
}
