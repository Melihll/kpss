import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const LEVEL_NAMES: Record<string, string> = {
  strong: "GÜÇLÜ", sufficient: "YETERLİ", fragile: "KIRILGAN", weak: "ZAYIF", critical: "KRİTİK", unknown: "HENÜZ DEĞERLENDİRİLMEDİ",
};

interface TopicRow {
  curriculum_node_id: string;
  mastery_level: string;
  state: string;
  curriculum_nodes: { name: string; subjects: { name: string } | null } | null;
}

export function TopicPerformancePanel() {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const profile = await supabase.from("exam_profiles").select("id").eq("status", "active").maybeSingle();
    if (profile.error) { setError(profile.error.message); return; }
    if (!profile.data) return;
    const result = await supabase.from("topic_progress")
      .select("curriculum_node_id,mastery_level,state,curriculum_nodes(name,subjects(name))")
      .eq("exam_profile_id", profile.data.id)
      .order("last_practiced_at", { ascending: false, nullsFirst: false });
    if (result.error) setError(result.error.message);
    else setTopics((result.data ?? []) as unknown as TopicRow[]);
  }, []);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    void load();
    return () => window.removeEventListener("kpss:execution-changed", refresh);
  }, [load]);

  const evaluated = topics.filter((topic) => topic.mastery_level !== "unknown");
  const visibleTopics = (evaluated.length ? evaluated : topics).slice(0, 12);

  return <section className="mastery-panel panel-card">
    <div className="panel-heading"><div><span className="panel-kicker">KONU PERFORMANSI</span><h2>Hangi konular güçlü, hangileri dikkat istiyor?</h2><p>Son çalışma ve test sonuçlarına göre güncellenen mastery görünümü.</p></div><span className="count-bubble">{evaluated.length}/{topics.length}</span></div>
    {error && <p className="error">{error}</p>}
    <div className="topic-grid">{visibleTopics.map((topic) => <article className={`topic-card ${topic.mastery_level}`} key={topic.curriculum_node_id}>
      <div><small>{topic.curriculum_nodes?.subjects?.name ?? "Ders"}</small><h3>{topic.curriculum_nodes?.name ?? "Konu"}</h3></div>
      <span className={`mastery-badge ${topic.mastery_level}`}>{LEVEL_NAMES[topic.mastery_level] ?? topic.mastery_level}</span>
    </article>)}</div>
    {!topics.length && <div className="empty-inline">Henüz konu performansı oluşmadı.</div>}
  </section>;
}
