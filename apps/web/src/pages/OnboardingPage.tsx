import {
  calculateWeeklyAvailableMinutes,
  createBulkResourceUnits,
  type CurriculumNode,
  type ExamProfile,
  type Resource,
  type ResourceDifficulty,
  type ResourceRole,
  type ResourceSection,
  type ResourceType,
  type ResourceUnit,
  type ResourceUnitType,
  type Subject,
  type WeeklyAvailability,
} from "@kpss-coach/domain";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";

interface EditionOption {
  id: string;
  exam_id: string;
  year: number;
  exam_date: string | null;
  exams: { name: string } | null;
}

interface AvailabilityDraft {
  key: string;
  weekday: number;
  start_time: string;
  end_time: string;
  label: string;
}

const STEPS = ["Exam Profile", "Subjects", "Weekly Availability", "Resources", "Summary"];
const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function todayInIstanbul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editions, setEditions] = useState<EditionOption[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [profile, setProfile] = useState<ExamProfile | null>(null);
  const [editionId, setEditionId] = useState("");
  const [preparationStartDate, setPreparationStartDate] = useState(todayInIstanbul());
  const [targetExamDate, setTargetExamDate] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [progressCount, setProgressCount] = useState(0);
  const [windows, setWindows] = useState<AvailabilityDraft[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [sections, setSections] = useState<ResourceSection[]>([]);
  const [units, setUnits] = useState<ResourceUnit[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumNode[]>([]);

  const loadResourceChildren = useCallback(async (resourceId: string) => {
    if (!resourceId) {
      setSections([]);
      setUnits([]);
      return;
    }
    const [sectionResult, unitResult] = await Promise.all([
      supabase.from("resource_sections").select("*").eq("resource_id", resourceId).order("sort_order"),
      supabase.from("resource_units").select("*").eq("resource_id", resourceId).order("sort_order"),
    ]);
    if (sectionResult.error) throw sectionResult.error;
    if (unitResult.error) throw unitResult.error;
    setSections((sectionResult.data ?? []) as ResourceSection[]);
    setUnits((unitResult.data ?? []) as ResourceUnit[]);
  }, []);

  const refreshResources = useCallback(async (profileId: string) => {
    const { data, error: queryError } = await supabase
      .from("resources")
      .select("*")
      .eq("exam_profile_id", profileId)
      .order("created_at");
    if (queryError) throw queryError;
    const next = (data ?? []) as Resource[];
    setResources(next);
    setSelectedResourceId((current) => current || next[0]?.id || "");
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const [editionResult, subjectResult, profileResult, curriculumResult] = await Promise.all([
          supabase
            .from("exam_editions")
            .select("id, exam_id, year, exam_date, exams(name)")
            .in("status", ["upcoming", "active"])
            .order("year", { ascending: false }),
          supabase.from("subjects").select("*").eq("is_active", true).order("sort_order"),
          supabase
            .from("exam_profiles")
            .select("*")
            .eq("user_id", user.id)
            .in("status", ["draft", "active"])
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from("curriculum_nodes").select("*").eq("is_active", true).order("sort_order"),
        ]);
        if (editionResult.error) throw editionResult.error;
        if (subjectResult.error) throw subjectResult.error;
        if (profileResult.error) throw profileResult.error;
        if (curriculumResult.error) throw curriculumResult.error;
        if (!active) return;
        const editionRows = (editionResult.data ?? []) as unknown as EditionOption[];
        const existingProfile = profileResult.data as ExamProfile | null;
        setEditions(editionRows);
        setSubjects((subjectResult.data ?? []) as Subject[]);
        setCurriculum((curriculumResult.data ?? []) as CurriculumNode[]);
        setProfile(existingProfile);
        setEditionId(existingProfile?.exam_edition_id ?? editionRows[0]?.id ?? "");
        setPreparationStartDate(existingProfile?.preparation_start_date ?? todayInIstanbul());
        setTargetExamDate(existingProfile?.target_exam_date ?? "");

        if (existingProfile) {
          const [selectionResult, availabilityResult, progressResult] = await Promise.all([
            supabase.from("user_subjects").select("subject_id").eq("exam_profile_id", existingProfile.id),
            supabase.from("weekly_availability").select("*").eq("exam_profile_id", existingProfile.id).order("weekday"),
            supabase.from("topic_progress").select("id", { count: "exact", head: true }).eq("exam_profile_id", existingProfile.id),
          ]);
          if (selectionResult.error) throw selectionResult.error;
          if (availabilityResult.error) throw availabilityResult.error;
          if (progressResult.error) throw progressResult.error;
          if (!active) return;
          setSelectedSubjectIds((selectionResult.data ?? []).map((row) => row.subject_id));
          setWindows(((availabilityResult.data ?? []) as WeeklyAvailability[]).map((window) => ({
            key: window.id,
            weekday: window.weekday,
            start_time: window.start_time.slice(0, 5),
            end_time: window.end_time.slice(0, 5),
            label: window.label ?? "",
          })));
          setProgressCount(progressResult.count ?? 0);
          await refreshResources(existingProfile.id);
        }
      } catch (caught) {
        if (active) setError(messageOf(caught));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshResources, user]);

  useEffect(() => {
    void loadResourceChildren(selectedResourceId).catch((caught) => setError(messageOf(caught)));
  }, [loadResourceChildren, selectedResourceId]);

  const weeklyMinutes = useMemo(() => {
    try {
      return calculateWeeklyAvailableMinutes(windows);
    } catch {
      return null;
    }
  }, [windows]);

  async function runSave(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveExam(event: FormEvent) {
    event.preventDefault();
    if (!user || !editionId) return;
    await runSave(async () => {
      const payload = {
        user_id: user.id,
        exam_edition_id: editionId,
        preparation_start_date: preparationStartDate,
        target_exam_date: targetExamDate || null,
      };
      const result = profile
        ? await supabase.from("exam_profiles").update(payload).eq("id", profile.id).select("*").single()
        : await supabase.from("exam_profiles").insert({ ...payload, status: "draft" }).select("*").single();
      if (result.error) throw result.error;
      setProfile(result.data as ExamProfile);
      setStep(2);
    });
  }

  async function saveSubjects() {
    if (!user || !profile || selectedSubjectIds.length === 0) {
      setError("En az bir ders seçin.");
      return;
    }
    await runSave(async () => {
      const { data: existing, error: existingError } = await supabase
        .from("user_subjects")
        .select("subject_id")
        .eq("exam_profile_id", profile.id);
      if (existingError) throw existingError;
      const deselected = (existing ?? [])
        .map((row) => row.subject_id)
        .filter((id) => !selectedSubjectIds.includes(id));
      if (deselected.length) {
        const { error: deleteError } = await supabase
          .from("user_subjects")
          .delete()
          .eq("exam_profile_id", profile.id)
          .in("subject_id", deselected);
        if (deleteError) throw deleteError;
        const deselectedNodes = curriculum
          .filter((node) => deselected.includes(node.subject_id))
          .map((node) => node.id);
        if (deselectedNodes.length) {
          const { error: progressDeleteError } = await supabase
            .from("topic_progress")
            .delete()
            .eq("exam_profile_id", profile.id)
            .in("curriculum_node_id", deselectedNodes);
          if (progressDeleteError) throw progressDeleteError;
        }
      }
      const { error: upsertError } = await supabase.from("user_subjects").upsert(
        selectedSubjectIds.map((subjectId) => ({
          user_id: user.id,
          exam_profile_id: profile.id,
          subject_id: subjectId,
          status: "active",
        })),
        { onConflict: "exam_profile_id,subject_id" },
      );
      if (upsertError) throw upsertError;
      for (const subjectId of selectedSubjectIds) {
        const { error: progressError } = await supabase.rpc("initialize_subject_progress", {
          p_exam_profile_id: profile.id,
          p_subject_id: subjectId,
        });
        if (progressError) throw progressError;
      }
      const { count, error: countError } = await supabase
        .from("topic_progress")
        .select("id", { count: "exact", head: true })
        .eq("exam_profile_id", profile.id);
      if (countError) throw countError;
      setProgressCount(count ?? 0);
      setStep(3);
    });
  }

  async function saveAvailability() {
    if (!user || !profile || weeklyMinutes === null) {
      setError("Zaman pencerelerini kontrol edin.");
      return;
    }
    await runSave(async () => {
      const { error: deleteError } = await supabase
        .from("weekly_availability")
        .delete()
        .eq("exam_profile_id", profile.id);
      if (deleteError) throw deleteError;
      if (windows.length) {
        const { error: insertError } = await supabase.from("weekly_availability").insert(
          windows.map((window) => ({
            user_id: user.id,
            exam_profile_id: profile.id,
            weekday: window.weekday,
            start_time: window.start_time,
            end_time: window.end_time,
            label: window.label.trim() || null,
          })),
        );
        if (insertError) throw insertError;
      }
      setStep(4);
    });
  }

  async function addResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !profile) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runSave(async () => {
      const { error: insertError } = await supabase.from("resources").insert({
        user_id: user.id,
        exam_profile_id: profile.id,
        subject_id: String(form.get("subject_id")),
        name: String(form.get("name") ?? "").trim(),
        publisher: String(form.get("publisher") ?? "").trim() || null,
        resource_type: form.get("resource_type") as ResourceType,
        resource_role: form.get("resource_role") as ResourceRole,
        difficulty: form.get("difficulty") as ResourceDifficulty,
        status: "active",
      });
      if (insertError) throw insertError;
      await refreshResources(profile.id);
      formElement.reset();
      setNotice("Kaynak eklendi.");
    });
  }

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedResourceId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runSave(async () => {
      const { error: insertError } = await supabase.from("resource_sections").insert({
        resource_id: selectedResourceId,
        curriculum_node_id: String(form.get("curriculum_node_id") ?? "") || null,
        name: String(form.get("name") ?? "").trim(),
        sort_order: sections.length + 1,
      });
      if (insertError) throw insertError;
      await loadResourceChildren(selectedResourceId);
      formElement.reset();
      setNotice("Bölüm eklendi.");
    });
  }

  async function addSingleUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sectionId = String(form.get("section_id") ?? "");
    await runSave(async () => {
      const { error: insertError } = await supabase.from("resource_units").insert({
        resource_id: selectedResourceId,
        resource_section_id: sectionId,
        unit_type: form.get("unit_type") as ResourceUnitType,
        name: String(form.get("name") ?? "").trim(),
        sort_order: units.filter((unit) => unit.resource_section_id === sectionId).length + 1,
        question_count: form.get("question_count") ? Number(form.get("question_count")) : null,
        estimated_minutes: form.get("estimated_minutes") ? Number(form.get("estimated_minutes")) : null,
      });
      if (insertError) throw insertError;
      await loadResourceChildren(selectedResourceId);
      formElement.reset();
      setNotice("Unit eklendi.");
    });
  }

  async function addBulkUnits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sectionId = String(form.get("section_id") ?? "");
    const prefix = String(form.get("prefix") ?? "");
    const start = Number(form.get("start"));
    const end = Number(form.get("end"));
    const unitType = form.get("unit_type") as ResourceUnitType;
    await runSave(async () => {
      createBulkResourceUnits({
        prefix,
        start,
        end,
        unitType,
        existingNames: units.filter((unit) => unit.resource_section_id === sectionId).map((unit) => unit.name),
      });
      const { data, error: rpcError } = await supabase.rpc("create_bulk_resource_units", {
        p_resource_id: selectedResourceId,
        p_section_id: sectionId,
        p_prefix: prefix,
        p_start: start,
        p_end: end,
        p_unit_type: unitType,
      });
      if (rpcError) throw rpcError;
      await loadResourceChildren(selectedResourceId);
      setNotice(`${data} unit oluşturuldu.`);
      formElement.reset();
    });
  }

  async function activateProfile() {
    if (!profile) return;
    await runSave(async () => {
      const { error: updateError } = await supabase
        .from("exam_profiles")
        .update({ status: "active" })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      navigate("/", { replace: true });
    });
  }

  if (loading) return <main className="card wide"><p>Onboarding yükleniyor…</p></main>;

  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const selectedCurriculum = curriculum.filter((node) => node.subject_id === selectedResource?.subject_id);

  return (
    <main className="card wide">
      <div className="toolbar"><h1>KPSS Koçu Kurulum</h1><Link to="/">Dashboard</Link></div>
      <nav className="steps" aria-label="Onboarding adımları">
        {STEPS.map((label, index) => (
          <button key={label} type="button" className={step === index + 1 ? "active" : ""}
            disabled={index > 0 && !profile} onClick={() => setStep(index + 1)}>{index + 1}. {label}</button>
        ))}
      </nav>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {step === 1 && (
        <section><h2>1. Exam Profile</h2><form onSubmit={saveExam}>
          <label>Sınav dönemi<select value={editionId} onChange={(event) => setEditionId(event.target.value)} required>
            {editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.exams?.name} — {edition.year}</option>)}
          </select></label>
          <label>Hazırlık başlangıç tarihi<input type="date" value={preparationStartDate} onChange={(event) => setPreparationStartDate(event.target.value)} required /></label>
          <label>Hedef sınav tarihi (opsiyonel)<input type="date" min={preparationStartDate} value={targetExamDate} onChange={(event) => setTargetExamDate(event.target.value)} /></label>
          <button disabled={saving}>Kaydet ve Devam Et</button>
        </form></section>
      )}

      {step === 2 && (
        <section><h2>2. Subjects</h2><p>En az bir ders seçin.</p><div className="check-grid">
          {subjects.map((subject) => <label key={subject.id} className="check-row"><input type="checkbox"
            checked={selectedSubjectIds.includes(subject.id)} onChange={(event) => setSelectedSubjectIds((current) =>
              event.target.checked ? [...current, subject.id] : current.filter((id) => id !== subject.id))} />{subject.name}</label>)}
        </div><button disabled={saving} onClick={() => void saveSubjects()}>Kaydet ve Progress Oluştur</button></section>
      )}

      {step === 3 && (
        <section><h2>3. Weekly Availability</h2><p>1 = Monday/Pazartesi, 7 = Sunday/Pazar.</p>
          {windows.map((window) => <div className="inline-grid" key={window.key}>
            <select value={window.weekday} onChange={(event) => setWindows((current) => current.map((item) => item.key === window.key ? { ...item, weekday: Number(event.target.value) } : item))}>
              {WEEKDAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}
            </select>
            <input aria-label="Başlangıç" type="time" value={window.start_time} onChange={(event) => setWindows((current) => current.map((item) => item.key === window.key ? { ...item, start_time: event.target.value } : item))} />
            <input aria-label="Bitiş" type="time" value={window.end_time} onChange={(event) => setWindows((current) => current.map((item) => item.key === window.key ? { ...item, end_time: event.target.value } : item))} />
            <input aria-label="Etiket" placeholder="Etiket" value={window.label} onChange={(event) => setWindows((current) => current.map((item) => item.key === window.key ? { ...item, label: event.target.value } : item))} />
            <button type="button" onClick={() => setWindows((current) => current.filter((item) => item.key !== window.key))}>Sil</button>
          </div>)}
          <div className="actions"><button type="button" onClick={() => setWindows((current) => [...current, { key: crypto.randomUUID(), weekday: 1, start_time: "14:00", end_time: "18:00", label: "" }])}>Pencere Ekle</button>
          <strong>Weekly available: {weeklyMinutes === null ? "Geçersiz" : `${Math.floor(weeklyMinutes / 60)}h ${weeklyMinutes % 60}m`}</strong></div>
          <button disabled={saving || weeklyMinutes === null} onClick={() => void saveAvailability()}>Kaydet ve Devam Et</button>
        </section>
      )}

      {step === 4 && profile && (
        <section><h2>4. Resources</h2>
          <form className="form-grid" onSubmit={addResource}>
            <label>Ders<select name="subject_id" required>{subjects.filter((subject) => selectedSubjectIds.includes(subject.id)).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Ad<input name="name" required /></label><label>Yayıncı<input name="publisher" /></label>
            <label>Tür<select name="resource_type" defaultValue="question_bank"><option value="question_bank">Soru bankası</option><option value="video_course">Video kurs</option><option value="book">Kitap</option><option value="notes">Notlar</option><option value="mock_book">Deneme kitabı</option><option value="other">Diğer</option></select></label>
            <label>Rol<select name="resource_role" defaultValue="primary"><option value="primary">Ana</option><option value="reinforcement">Pekiştirme</option><option value="revision">Tekrar</option><option value="advanced">İleri</option><option value="mock">Deneme</option></select></label>
            <label>Zorluk<select name="difficulty" defaultValue="normal"><option value="unknown">Bilinmiyor</option><option value="easy">Kolay</option><option value="normal">Normal</option><option value="hard">Zor</option></select></label>
            <button disabled={saving}>Kaynak Ekle</button>
          </form>
          <label>Aktif kaynak<select value={selectedResourceId} onChange={(event) => setSelectedResourceId(event.target.value)}><option value="">Kaynak seçin</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
          {selectedResourceId && <div className="resource-tools">
            <form onSubmit={addSection}><h3>Section Ekle</h3><label>Ad<input name="name" required /></label><label>Curriculum eşlemesi<select name="curriculum_node_id"><option value="">Eşleme yok</option>{selectedCurriculum.map((node) => <option value={node.id} key={node.id}>{node.name}</option>)}</select></label><button disabled={saving}>Section Ekle</button></form>
            <form onSubmit={addSingleUnit}><h3>Tek Unit Ekle</h3><label>Section<select name="section_id" required>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><label>Ad<input name="name" required /></label><label>Tip<select name="unit_type"><option value="test">Test</option><option value="video">Video</option><option value="chapter">Bölüm</option><option value="reading">Okuma</option><option value="mock">Deneme</option><option value="other">Diğer</option></select></label><label>Soru sayısı<input name="question_count" type="number" min="0" /></label><label>Tahmini dakika<input name="estimated_minutes" type="number" min="0" /></label><button disabled={saving || !sections.length}>Unit Ekle</button></form>
            <form onSubmit={addBulkUnits}><h3>Toplu Test Oluştur</h3><label>Section<select name="section_id" required>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></label><label>Prefix<input name="prefix" defaultValue="Test" required /></label><label>Başlangıç<input name="start" type="number" min="1" defaultValue="1" required /></label><label>Bitiş<input name="end" type="number" min="1" max="200" defaultValue="12" required /></label><input name="unit_type" type="hidden" value="test" /><button disabled={saving || !sections.length}>Toplu Oluştur</button></form>
          </div>}
          <p>{resources.length} kaynak, {sections.length} section, {units.length} unit.</p>
          <button type="button" onClick={() => setStep(5)}>Summary’ye Geç</button>
        </section>
      )}

      {step === 5 && (
        <section><h2>5. Summary</h2><dl>
          <dt>Exam</dt><dd>{editions.find((edition) => edition.id === editionId)?.exams?.name ?? "—"}</dd>
          <dt>Selected subjects</dt><dd>{selectedSubjectIds.length}</dd>
          <dt>Weekly available</dt><dd>{weeklyMinutes === null ? "—" : `${Math.floor(weeklyMinutes / 60)}h ${weeklyMinutes % 60}m`}</dd>
          <dt>Resource count</dt><dd>{resources.length}</dd>
          <dt>Curriculum progress initialized</dt><dd>{progressCount}</dd>
        </dl><button disabled={saving || !profile} onClick={() => void activateProfile()}>Onboarding’i Tamamla</button></section>
      )}
    </main>
  );
}
