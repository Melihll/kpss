import { useState } from "react";
import { AdaptivePlanningPanel } from "../components/AdaptivePlanningPanel";
import { ExecutionPanel } from "../components/ExecutionPanel";
import { Icon } from "../components/Icon";
import { RevisionPanel } from "../components/RevisionPanel";
import { TopicPerformancePanel } from "../components/TopicPerformancePanel";
import { WeeklyReportPanel } from "../components/WeeklyReportPanel";

export function ProgressPage() {
  const [recordsOpen, setRecordsOpen] = useState(false);
  return <section className="progress-page progress-insight-page page-frame">
    <header className="page-header compact-header progress-insight-header"><div><span className="page-eyebrow">İlerleme</span><h1>Çalışma durumun</h1><p>Planın ve gerçek çalışmaların birlikte.</p></div></header>
    <WeeklyReportPanel />
    <TopicPerformancePanel />
    <RevisionPanel />
    <AdaptivePlanningPanel />
    <section className="records-section progress-records-section"><div className="section-bar"><div><span className="page-eyebrow">Kayıtlar</span><h2>Çalışma ve test araçları</h2></div><button className="secondary-action" type="button" aria-expanded={recordsOpen} onClick={() => setRecordsOpen((value) => !value)}><Icon name="timer" />{recordsOpen ? "Kapat" : "Kayıtları Aç"}</button></div>{recordsOpen && <div className="records-reveal"><ExecutionPanel /></div>}</section>
  </section>;
}
