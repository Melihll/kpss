import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const LEVEL_NAMES: Record<string, string> = {
  strong: "Güçlü", sufficient: "Yeterli", fragile: "Kırılgan", weak: "Zayıf", critical: "Kritik", unknown: "Yeni",
};
const ATTENTION_LEVELS = new Set(["fragile", "weak", "critical"]);

interface TopicRow {
  curriculum_node_id: string;
  mastery_level: string;
  state: string;
  curriculum_nodes: { name: string; subjects: { name: string } | null } | null;
}

export function TopicPerformancePanel() {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const profile = await supabase.from("exam_profiles").select("id").eq("status", "active").maybeSingle();
    if (profile.error) { setError(true); setLoading(false); return; }
    if (!profile.data) { setTopics([]); setLoading(false); return; }
    const result = await supabase.from("topic_progress")
      .select("curriculum_node_id,mastery_level,state,curriculum_nodes(name,subjects(name))")
      .eq("exam_profile_id", profile.data.id)
      .order("last_practiced_at", { ascending: false, nullsFirst: false });
    if (result.error) setError(true);
    else { setTopics((result.data ?? []) as unknown as TopicRow[]); setError(false); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    void load();
    return () => window.removeEventListener("kpss:execution-changed", refresh);
  }, [load]);

  const counts = useMemo(() => ({
    strong: topics.filter((topic) => topic.mastery_level === "strong").length,
    sufficient: topics.filter((topic) => topic.mastery_level === "sufficient").length,
    fragile: topics.filter((topic) => ATTENTION_LEVELS.has(topic.mastery_level)).length,
    new: topics.filter((topic) => topic.mastery_level === "unknown").length,
  }), [topics]);
  const attentionTopics = topics.filter((topic) => ATTENTION_LEVELS.has(topic.mastery_level));
  const disclosedTopics = showAll ? topics : attentionTopics.slice(0, 4);

  return <section className="progress-analysis-section mastery-analysis-section" aria-labelledby="mastery-analysis-title">
    <div className="analysis-section-heading"><div><span>Konu durumu</span><h2 id="mastery-analysis-title">Konu performansın</h2></div></div>
    {loading && <div className="analysis-row-skeleton" aria-label="Konu performansı yükleniyor"><span /><span /><span /></div>}
    {error && <div className="inline-state error" role="alert"><span>Konu performansı yüklenemedi.</span><button type="button" onClick={() => void load()}>Tekrar Dene</button></div>}
    {!loading && !error && <>
      {topics.length ? <div className="mastery-count-row" aria-label="Konu durumu özeti">
        <div className={`strong ${counts.strong === 0 ? "is-zero" : ""}`}><strong>{counts.strong}</strong><span>Güçlü</span></div>
        <div className={counts.sufficient === 0 ? "is-zero" : ""}><strong>{counts.sufficient}</strong><span>Yeterli</span></div>
        <div className={`fragile ${counts.fragile === 0 ? "is-zero" : ""}`}><strong>{counts.fragile}</strong><span>Dikkat istiyor</span></div>
        <div className={counts.new === 0 ? "is-zero" : ""}><strong>{counts.new}</strong><span>Yeni</span></div>
      </div> : <p className="analysis-empty">Henüz konu performansı oluşmadı.</p>}

      {topics.length > 0 && <div className="attention-topics">
        <div className="analysis-subheading"><h3>{showAll ? "Tüm konular" : "Dikkat isteyen"}</h3><span>{showAll ? topics.length : attentionTopics.length}</span></div>
        {disclosedTopics.length ? <div className="attention-topic-list">{disclosedTopics.map((topic) => <article className={`mastery-topic-row ${topic.mastery_level}`} key={topic.curriculum_node_id}>
          <div><small>{topic.curriculum_nodes?.subjects?.name ?? "Ders"}</small><strong>{topic.curriculum_nodes?.name ?? "Konu"}</strong></div>
          <span>{LEVEL_NAMES[topic.mastery_level] ?? "Değerlendiriliyor"}</span>
        </article>)}</div> : <p className="analysis-empty compact">Şu anda dikkat isteyen konu yok.</p>}
        {(topics.length > 4 || showAll) && <button className="analysis-disclosure" type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Dikkat isteyenlere dön" : "Tüm konuları gör"}</button>}
      </div>}
    </>}
  </section>;
}
