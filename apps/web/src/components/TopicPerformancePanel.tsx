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
  return <section className="mastery-panel">
    <h2>KONU PERFORMANSI</h2>
    {error && <p className="error">{error}</p>}
    <div className="topic-grid">{topics.map((topic) => <article className="topic-card" key={topic.curriculum_node_id}>
      <small>{topic.curriculum_nodes?.subjects?.name ?? "Ders"}</small>
      <h3>{topic.curriculum_nodes?.name ?? "Konu"}</h3>
      <span className={`mastery-badge ${topic.mastery_level}`}>{LEVEL_NAMES[topic.mastery_level] ?? topic.mastery_level}</span>
    </article>)}</div>
  </section>;
}
