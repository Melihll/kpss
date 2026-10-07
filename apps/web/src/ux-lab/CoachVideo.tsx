import { useEffect, useId, useState } from "react";
import { Icon } from "../components/Icon";
import { useCoachWorkspace } from "./coach-workspace-context";
import { clockTime } from "./model";
import { Button, Progress, Skeleton } from "./ui";

export function CoachVideo({ resourceId, compact = false }: { resourceId: string; compact?: boolean }) {
  const { state, send } = useCoachWorkspace();
  const player = state.playlists[resourceId]!;
  const lesson = player.lessons[player.current - 1]!;
  const material = state.lab.materials.find((m) => m.id === resourceId)!;
  const position = player.positions[player.current] ?? 0;
  const completed = player.completed.includes(player.current);
  const locked = state.session?.phase === "finishing" || state.session?.phase === "saved";
  const [loading, setLoading] = useState(true);
  const id = useId();
  useEffect(() => { setLoading(true); const timer = window.setTimeout(() => setLoading(false), 320); return () => window.clearTimeout(timer); }, [resourceId, player.current]);
  return <section className={`b-video ${compact ? "compact" : ""}`} data-playing={player.playing} aria-label="Video çalışma alanı">
    <header className="b-material-heading"><div><span className="b-label">VİDEO · {material.name}</span><h3>{player.current}. {lesson.title}</h3></div>{completed && <span className="b-completed-label"><Icon name="check" size={14} /> Tamamlandı</span>}</header>
    <a className="b-text-button" href="/ux-lab/live-video">Yerel hesabımla gerçek videoyu incele →</a>
    <div className="b-player-frame">
      {loading ? <Skeleton label="Video yükleniyor" /> : <>
        <div className="b-lesson-slide"><span>{material.subject.toLocaleUpperCase("tr-TR")} <i /> DERS {player.current.toString().padStart(2, "0")}</span><h4>{lesson.title}</h4>{resourceId === "account-video" && player.current === 13 ? <div className="b-lesson-equation"><span>Ticari kâr</span><b>+</b><span>Kabul edilmeyen gider</span><b>−</b><span>İstisna ve indirim</span><strong>= Mali kâr</strong></div> : <div className="b-lesson-lines"><span /><span /><span /></div>}<small>KONU ANLATIMI</small></div>
        <div className="b-player-controls"><button type="button" aria-label={player.playing ? "Videoyu duraklat" : state.session?.phase === "paused" ? "Videoya ve çalışmaya devam et" : state.session ? "Videoyu oynat" : "Videoyu oynat ve çalışmayı başlat"} disabled={locked} onClick={() => send({ type: "video-toggle", resourceId })}><Icon name={player.playing ? "stop" : "play"} size={18} /></button><label className="lab-sr-only" htmlFor={id}>Bu videoda ilerleme</label><input id={id} type="range" min={0} max={lesson.seconds} step={1} value={Math.floor(position)} onChange={(e) => send({ type: "video-seek", resourceId, seconds: Number(e.target.value) })} disabled={locked} /><span>{clockTime(position)} <span>/ {clockTime(lesson.seconds)}</span></span></div>
      </>}
    </div>
    <div className="b-video-facts"><span><span className="b-muted">Bu video</span> <strong>{clockTime(position)}</strong> / {clockTime(lesson.seconds)}</span><span><span className="b-muted">Seri</span> <strong>{player.completed.length} / {player.lessons.length}</strong> tamamlandı</span></div>
    <Progress value={player.completed.length} max={player.lessons.length} label={`${material.name} tamamlanan video sayısı`} />
    <div className="b-video-actions"><div><Button tone="quiet" disabled={player.current === 1 || locked} onClick={() => send({ type: "video-select", resourceId, number: player.current - 1 })}><span aria-hidden="true">←</span> Önceki</Button><Button tone="quiet" disabled={player.current === player.lessons.length || locked} onClick={() => send({ type: "video-select", resourceId, number: player.current + 1 })}>Sonraki <span aria-hidden="true">→</span></Button></div>{!completed && <Button tone="quiet" icon="check" disabled={locked} onClick={() => send({ type: "video-complete", resourceId })}>Tamamladım</Button>}</div>
    <details className="b-playlist"><summary>Bölümler <span>{player.current} / {player.lessons.length}</span></summary><ol>{player.lessons.map((item) => <li key={item.number}><button type="button" aria-current={player.current === item.number ? "true" : undefined} disabled={locked} onClick={() => send({ type: "video-select", resourceId, number: item.number })}><span>{item.number.toString().padStart(2, "0")}</span><span>{item.title}</span><small>{clockTime(item.seconds)}</small>{player.completed.includes(item.number) && <Icon name="check" size={14} />}</button></li>)}</ol></details>
  </section>;
}
