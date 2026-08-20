import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { ResourceDetailDrawer, type ResourceDetailTab } from "../components/ResourceDetailDrawer";
import { callAppApi } from "../lib/app-api";
import type { ResourcePageProgress, ResourceProgressResponse } from "../lib/resource-progress-ui";
import { useRoadmap } from "../hooks/useRoadmap";
import { dateLabel, RESOURCE_TYPE_LABELS, type ResourceForecast } from "../lib/roadmap";

type ResourceState = "active" | "priority" | "queued" | "completed" | "waiting";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const STATE_LABELS: Record<ResourceState, string> = { active: "Aktif", priority: "Öncelikli", queued: "Sırada", completed: "Tamamlandı", waiting: "Beklemede" };

function finishDateLabel(value: string) {
  const year = Number(value.slice(0, 4));
  return dateLabel(value, year === new Date().getFullYear() ? {} : { year: "numeric" });
}

function resourceState(resource: ResourceForecast, index: number, currentIndex: number): ResourceState {
  if (resource.completed) return "completed";
  if (resource.progressPercent > 0) return "active";
  if (index === currentIndex) return "priority";
  if (currentIndex >= 0 && index === currentIndex + 1) return "queued";
  return "waiting";
}

export function ResourcesPage() {
  const { data, loading, error, retry } = useRoadmap();
  const subjects = useMemo(() => data?.subjectForecasts ?? [], [data]);
  const [subjectId, setSubjectId] = useState("");
  const [displayedSubjectId, setDisplayedSubjectId] = useState("");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [changingSubject, setChangingSubject] = useState(false);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [pageProgressByResource, setPageProgressByResource] = useState<Record<string, ResourcePageProgress>>({});
  const [detailResource, setDetailResource] = useState<ResourceForecast | null>(null);
  const [detailTab, setDetailTab] = useState<ResourceDetailTab>("page");
  const transitionTimer = useRef<number | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const subjectButtons = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!subjects.length) return;
    if (subjectId && subjects.some((subject) => subject.subjectId === subjectId)) return;
    const initialId = subjects[0]!.subjectId;
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    setSubjectId(initialId);
    setDisplayedSubjectId(initialId);
    setChangingSubject(false);
  }, [subjects, subjectId]);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
  }, []);

  const selectedIndex = Math.max(0, subjects.findIndex((item) => item.subjectId === subjectId));
  useLayoutEffect(() => {
    const button = subjectButtons.current[selectedIndex];
    if (!button) return;
    const measure = () => setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    if (selectorRef.current) observer.observe(selectorRef.current);
    return () => observer.disconnect();
  }, [selectedIndex, subjects]);

  useEffect(() => {
    subjectButtons.current[selectedIndex]?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedIndex]);

  const subject = subjects.find((item) => item.subjectId === displayedSubjectId) ?? subjects[0];
  const currentIndex = subject?.resources.findIndex((resource) => !resource.completed) ?? -1;

  useEffect(() => {
    const resources = subject?.resources ?? [];
    if (!resources.length) return;

    let cancelled = false;
    void Promise.all(resources.map(async (resource) => {
      try {
        const payload = await callAppApi<ResourceProgressResponse>(`/resources/${resource.resourceId}/progress`);
        return payload.progress;
      } catch {
        return null;
      }
    })).then((results) => {
      if (cancelled) return;
      const next: Record<string, ResourcePageProgress> = {};
      for (const progress of results) {
        if (progress) next[progress.resourceId] = progress;
      }
      if (Object.keys(next).length) {
        setPageProgressByResource((current) => ({ ...current, ...next }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [displayedSubjectId, subjects]);

  function selectSubject(nextId: string) {
    if (nextId === subjectId) return;
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    const nextIndex = subjects.findIndex((item) => item.subjectId === nextId);
    setDirection(nextIndex > selectedIndex ? "forward" : "backward");
    setSubjectId(nextId);
    if (reducedMotion()) {
      setDisplayedSubjectId(nextId);
      setChangingSubject(false);
      return;
    }
    setChangingSubject(true);
    transitionTimer.current = window.setTimeout(() => {
      setDisplayedSubjectId(nextId);
      setChangingSubject(false);
    }, 120);
  }

  function handleSubjectKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    let nextIndex = index;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = subjects.length - 1;
    else if (event.key in moves) nextIndex = Math.max(0, Math.min(subjects.length - 1, index + moves[event.key]!));
    else return;
    event.preventDefault();
    selectSubject(subjects[nextIndex]!.subjectId);
    requestAnimationFrame(() => subjectButtons.current[nextIndex]?.focus());
  }

  return <section className="resources-page page-frame">
    <header className="page-header compact-header resources-header"><div><span className="page-eyebrow">Kaynaklar</span><h1>Kaynaklarım</h1><p>KPSS P48 çalışma havuzu</p></div><div className="resource-total"><strong>{data?.resourcesSummary?.count ?? "—"}</strong><span>kaynak</span></div></header>
    {error && <div className="inline-state error" role="alert"><span>Kaynaklar yüklenemedi.</span><button type="button" onClick={() => void retry()}>Tekrar Dene</button></div>}
    {loading ? <div className="resource-page-skeleton page-skeleton"><span /><div /><div /></div> : subjects.length ? <>
      <div className="subject-selector" ref={selectorRef} role="tablist" aria-label="Dersler">
        <span className="subject-selection-indicator" style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }} aria-hidden="true" />
        {subjects.map((item, index) => {
          const active = item.subjectId === subjectId;
          return <button
            type="button"
            role="tab"
            id={`resource-subject-${item.subjectId}`}
            aria-controls="subject-resource-library"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={active ? "active" : ""}
            onClick={() => selectSubject(item.subjectId)}
            onKeyDown={(event) => handleSubjectKeyDown(event, index)}
            ref={(node) => { subjectButtons.current[index] = node; }}
            key={item.subjectId}
          >{item.subjectName}<span>{item.resources.length}</span></button>;
        })}
      </div>

      <section className={`resource-library-content ${changingSubject ? "is-leaving" : "is-entering"} ${direction}`} id="subject-resource-library" role="tabpanel" aria-labelledby={`resource-subject-${displayedSubjectId}`} key={subject?.subjectId}>
        {subject?.newSourceDate && <aside className="new-resource-callout"><span className="resource-callout-icon"><Icon name="spark" /></span><div><span>Yeni kaynak zamanı</span><strong>{subject.subjectName}</strong><p>Mevcut kaynak havuzu tahmini <b>{finishDateLabel(subject.newSourceDate)}</b> tarihinde tamamlanıyor.</p></div></aside>}

        {subject?.resources.length ? <div className="resource-pipeline">{subject.resources.map((resource, index) => {
          const state = resourceState(resource, index, currentIndex);
          const pageProgress = pageProgressByResource[resource.resourceId] ?? null;
          const progress = pageProgress?.progressPercent ?? (resource.completed ? 100 : resource.progressPercent);
          return <article className={`library-resource-row is-${state}`} style={{ "--resource-row-delay": `${index * 32}ms` } as CSSProperties} key={resource.resourceId}>
            <span className="resource-sequence" aria-hidden="true">{state === "completed" ? <Icon name="check" weight="bold" /> : String(index + 1).padStart(2, "0")}</span>
            <div className="resource-primary"><div className="resource-kicker"><span>{STATE_LABELS[state]}</span><i aria-hidden="true">·</i><small>{RESOURCE_TYPE_LABELS[resource.resourceType ?? ""] ?? "Kaynak"}</small></div><strong>{resource.resourceName}</strong><small>{resource.publisher || "Yayıncı bilgisi yok"}</small></div>
            <div className={`library-progress ${progress > 0 ? "has-progress" : "zero-progress"}`} aria-label={pageProgress ? `Sayfa ilerlemesi yüzde ${progress}` : `İlerleme yüzde ${progress}`}>
              {progress > 0 ? <><div><i style={{ width: `${progress}%` }} /></div><strong>%{progress}</strong></> : <span>Henüz başlanmadı</span>}
              {pageProgress && <small>{pageProgress.currentPage} / {pageProgress.totalPages} sayfa</small>}
            </div>
            <div className="library-finish">
              <span>Tahmini bitiş</span>
              <strong>{resource.completed ? "Tamamlandı" : resource.forecastFinishDate ? finishDateLabel(resource.forecastFinishDate) : "Sınava kadar"}</strong>
              <div className="resource-material-actions">
                <button
                  className="resource-page-progress-button"
                  type="button"
                  onClick={() => { setDetailTab("page"); setDetailResource(resource); }}
                >
                  {pageProgress ? "Sayfayı güncelle" : "Sayfa takibi"}
                </button>
                <button
                  className="resource-video-button"
                  type="button"
                  onClick={() => { setDetailTab("video"); setDetailResource(resource); }}
                >
                  Video izle
                </button>
              </div>
            </div>
          </article>;
        })}</div> : <div className="plain-empty">Bu ders için henüz kaynak eklenmedi.</div>}
      </section>
    </> : <div className="plain-empty">Henüz kaynak eklenmedi.</div>}
    <ResourceDetailDrawer
      resource={detailResource}
      pageProgress={detailResource ? pageProgressByResource[detailResource.resourceId] ?? null : null}
      initialTab={detailTab}
      onClose={() => setDetailResource(null)}
      onPageSaved={(progress) => {
        setPageProgressByResource((current) => ({ ...current, [progress.resourceId]: progress }));
      }}
    />
  </section>;
}
