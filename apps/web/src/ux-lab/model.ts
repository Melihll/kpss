export type Concept = "focus" | "coach" | "product";
export type Screen = "today" | "week" | "coach" | "roadmap" | "resources" | "progress";
export type Scenario = "ready" | "loading" | "empty" | "error" | "blocked";
export type Subject = "Muhasebe" | "Matematik" | "Hukuk" | "İktisat" | "Maliye";
export interface Material {
  id: string; subject: Subject; name: string; kind: "book" | "video";
  activity: "Konu çalışması" | "Soru çözümü" | "Video ders" | "Deneme";
  total: number; progress: number; status: "active" | "queued" | "waiting";
  estimate: string; note: string;
}
export interface Task {
  id: string; day: number; subject: Subject; title: string; minutes: number;
  resourceId: string; start: number; end: number; done: boolean; studiedSeconds: number;
}
export interface LabState {
  tasks: Task[]; materials: Material[]; capacities: number[]; version: number;
}
export interface PlanChange {
  before: Task | null; after: Task | null;
}
export interface Proposal {
  version: number; title: string; reason: string; changes: PlanChange[];
  capacity?: { day: number; before: number; after: number };
}
export const TODAY = 3;
export const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
export const SHORT_DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const DATES = ["28 Eyl", "29 Eyl", "30 Eyl", "1 Eki", "2 Eki", "3 Eki", "4 Eki"];
export const SUBJECTS: Subject[] = ["Muhasebe", "Matematik", "Hukuk", "İktisat", "Maliye"];
export const SUBJECT_COLORS: Record<Subject, string> = {
  Muhasebe: "#38685b", Matematik: "#725493", Hukuk: "#a36a38", İktisat: "#486f97", Maliye: "#9c5566",
};
export const CONCEPTS: Record<Concept, { label: string; heading: string; description: string }> = {
  focus: { label: "A · Focus", heading: "Tek bir sonraki adım.", description: "Tek sütun, güçlü çalışma alanı, ihtiyaç oldukça açılan ayrıntılar." },
  coach: { label: "B · Coach", heading: "Aktif çalışma alanı · V2", description: "Video, kitap ve süre aynı yerde. Doğrudan sayfa kaydı, kesintisiz odak görünümü ve ihtiyaç halinde Koç." },
  product: { label: "C · Product", heading: "Bütünü gör, adımını seç.", description: "Çalışma, haftalık ritim ve kaynak ilerlemesini birleştiren genel görünüm." },
};
const materials: Material[] = [
  { id: "reditus", subject: "Muhasebe", name: "Reditus Muhasebe", kind: "book", activity: "Konu çalışması", total: 480, progress: 126, status: "active", estimate: "Kasım ortası", note: "Konu anlatımı · Aktifler ve bilanço" },
  { id: "math", subject: "Matematik", name: "Matematik Soru Bankası", kind: "book", activity: "Soru çözümü", total: 320, progress: 84, status: "active", estimate: "Aralık başı", note: "Soru çözümü · Temel kavramlar" },
  { id: "law", subject: "Hukuk", name: "Anayasa Hukuku", kind: "book", activity: "Konu çalışması", total: 280, progress: 62, status: "active", estimate: "Kasım sonu", note: "Konu anlatımı · Temel haklar" },
  { id: "economy", subject: "İktisat", name: "İktisat Konu Anlatımı", kind: "video", activity: "Video ders", total: 91, progress: 12, status: "active", estimate: "Ocak ortası", note: "YouTube ders serisi · Arz ve talep" },
  { id: "finance", subject: "Maliye", name: "Maliye Ders Notları", kind: "book", activity: "Konu çalışması", total: 240, progress: 0, status: "queued", estimate: "Aralık sonu", note: "Konu anlatımı · Kamu maliyesine giriş" },
  { id: "revision", subject: "Muhasebe", name: "Muhasebe Denemeleri", kind: "book", activity: "Deneme", total: 180, progress: 0, status: "waiting", estimate: "Konu anlatımından sonra", note: "Tekrar ve karma denemeler" },
];
function task(id: string, day: number, resource: number, title: string, minutes: number, start: number, end: number, done = false): Task {
  const material = materials[resource]!;
  return { id, day, subject: material.subject, resourceId: material.id, title, minutes, start, end, done, studiedSeconds: done ? minutes * 60 : 0 };
}
export function createDemoState(): LabState {
  return {
    version: 0, capacities: [240, 240, 240, 240, 240, 300, 180],
    materials: materials.map((m) => ({ ...m })),
    tasks: [
      task("mon-1", 0, 0, "Muhasebenin temel kavramları", 60, 101, 114, true),
      task("mon-2", 0, 1, "Sayılar ve işlem becerisi", 45, 70, 76, true),
      task("tue-1", 1, 2, "Anayasanın temel ilkeleri", 60, 51, 62, true),
      task("tue-2", 1, 0, "Bilanço ilkeleri", 60, 115, 126, true),
      task("wed-1", 2, 1, "Temel kavramlar tekrarı", 45, 77, 84, true),
      task("today-done", TODAY, 2, "Temel haklar · kısa tekrar", 30, 53, 62, true),
      task("today-main", TODAY, 0, "Aktif hesapları tanıyalım", 60, 127, 142),
      task("today-math", TODAY, 1, "Problemlere bir adım daha", 45, 85, 96),
      task("today-video", TODAY, 3, "Arz, talep ve piyasa dengesi", 50, 13, 13),
      task("fri-math", 4, 1, "Sayı problemleri", 45, 97, 108),
      task("fri-law", 4, 2, "Yasama ve yürütme", 60, 63, 80),
      task("sat-econ", 5, 3, "Talep esnekliği", 60, 14, 14),
      task("sat-account", 5, 0, "Dönen varlıklar", 60, 143, 160),
      task("sun-finance", 6, 4, "Kamu maliyesine giriş", 45, 1, 14),
    ],
  };
}
export function duration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} dk`;
  const rest = rounded % 60;
  return `${Math.floor(rounded / 60)} sa${rest ? ` ${rest} dk` : ""}`;
}
export function clockTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
export function taskScope(task: Task, material: Material): string {
  return material.kind === "video" ? `Video ${task.start}${task.end !== task.start ? `–${task.end}` : ""}` : `Sayfa ${task.start}–${task.end}`;
}
export function studiedMinutes(tasks: Task[]): number {
  return tasks.reduce((total, t) => total + t.studiedSeconds / 60, 0);
}
export function coachProposal(state: LabState): Proposal {
  const math = state.tasks.find((t) => t.id === "fri-math" && !t.done);
  const law = state.tasks.find((t) => t.id === "fri-law" && !t.done);
  const changes: PlanChange[] = [];
  if (math && math.day === 4) changes.push({ before: math, after: { ...math, day: 5 } });
  if (law && law.minutes === 60) changes.push({ before: law, after: { ...law, minutes: 45 } });
  return { version: state.version, title: "Cuma gününe biraz alan açalım.", reason: "Matematiği cumartesiye taşıyıp hukuk çalışmasını 15 dakika kısaltarak cuma gününü rahatlatabilirsin. Bugünkü çalışmaların aynı kalır.", changes };
}
export function proposalError(state: LabState, proposal: Proposal): string | null {
  if (proposal.version !== state.version) return "Bu sırada planın değişti. Güncel plan üzerinden değişiklikleri yeniden incele.";
  if (!proposal.changes.length && !proposal.capacity) return "Planın zaten bu düzende. Yeni bir değişikliğe gerek yok.";
  for (const { before, after } of proposal.changes) {
    if (before?.done) return "Tamamladığın çalışmalar değiştirilemez.";
    if (before && before.studiedSeconds > 0 && (!after || after.day !== before.day || after.start !== before.start || after.end !== before.end)) return "Çalışma kaydı olan görevin günü ve aralığı korunur. Süresini düzenleyebilir veya yeni bir çalışma ekleyebilirsin.";
    if (after && (!Number.isInteger(after.minutes) || after.minutes < 5 || after.minutes > 480 || after.day < TODAY || after.day > 6)) return "Çalışma için geçerli bir gün ve 5–480 dakika arasında süre seç.";
    if (after && (!Number.isInteger(after.start) || !Number.isInteger(after.end) || after.start < 1 || after.end < after.start || after.end > (state.materials.find((m) => m.id === after.resourceId)?.total ?? 0))) return "Kaynağın içinde geçerli bir çalışma aralığı seç.";
  }
  if (proposal.capacity && (!Number.isInteger(proposal.capacity.after) || proposal.capacity.after < 0 || proposal.capacity.after > 720)) return "Günlük süreyi 0–720 dakika arasında seç.";
  const candidate = projectProposal(state, proposal);
  for (let day = TODAY; day < 7; day++) {
    const total = candidate.tasks.filter((t) => t.day === day).reduce((sum, t) => sum + t.minutes, 0);
    if (total > candidate.capacities[day]!) return `${DAYS[day]} için ${duration(total)} çalışma var; ayırdığın süre ${duration(candidate.capacities[day]!)}. Önce bir çalışmayı taşı veya süreyi artır.`;
  }
  return null;
}
function projectProposal(state: LabState, proposal: Proposal): LabState {
  let tasks = [...state.tasks];
  for (const change of proposal.changes) {
    if (change.before) tasks = tasks.filter((t) => t.id !== change.before!.id);
    if (change.after) tasks.push(change.after);
  }
  const capacities = [...state.capacities];
  if (proposal.capacity) capacities[proposal.capacity.day] = proposal.capacity.after;
  return { ...state, tasks, capacities, version: state.version + 1 };
}
export function applyProposal(state: LabState, proposal: Proposal): LabState {
  return proposalError(state, proposal) ? state : projectProposal(state, proposal);
}
export function finishStudy(state: LabState, id: string, boundary: number, seconds: number): LabState {
  const task = state.tasks.find((t) => t.id === id);
  const material = state.materials.find((m) => m.id === task?.resourceId);
  if (!task || task.done || !material || !Number.isInteger(boundary) || boundary < Math.max(task.start - 1, Math.min(material.progress, task.end)) || boundary > task.end || !Number.isFinite(seconds) || seconds < 0) return state;
  return {
    ...state, version: state.version + 1,
    tasks: state.tasks.map((t) => t.id === id ? { ...t, done: boundary === t.end, studiedSeconds: t.studiedSeconds + Math.floor(seconds) } : t),
    materials: state.materials.map((m) => m.id === material.id ? { ...m, progress: Math.max(m.progress, boundary), status: "active" } : m),
  };
}
