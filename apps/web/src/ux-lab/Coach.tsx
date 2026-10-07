import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { useLab } from "./context";
import { coachProposal, duration, studiedMinutes } from "./model";
import { Badge, Button, PageHeading } from "./ui";

type Reply = { question: string; answer: string; kind: "answer" | "suggestion" | "plan" };
export function Coach() {
  const { state, concept, review, navigate } = useLab();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [history, setHistory] = useState<Reply[]>([]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      const lower = pending.toLocaleLowerCase("tr-TR");
      const kind: Reply["kind"] = /vakt|zaman|cuma|taşı|değiş|güncelle|onay|dakika/.test(lower) ? "plan" : /neden|sıra|önce/.test(lower) ? "suggestion" : "answer";
      const answer = kind === "plan" ? "Cuma gününe alan açabiliriz. Matematiği cumartesiye taşıyıp hukuk çalışmasını kısaltmayı öneriyorum. Önce değişiklikleri birlikte inceleyelim." : kind === "suggestion" ? "Muhasebede kaldığın bölümden devam etmek iyi bir başlangıç. Yeni bir konuya geçmeden aktif hesapları tamamlayıp ardından matematik sorularıyla çalışma türünü değiştirebilirsin." : /nasıl|gidiyor|durum|hafta|ilerle/.test(lower) ? `Bu hafta ${duration(studiedMinutes(state.tasks))} çalıştın. Muhasebe ve matematikte düzenli ilerliyorsun. İktisat ve maliyeye de zaman ayırmanı öneririm; bu hafta henüz çalışma kaydın yok.` : "Sana bugünkü çalışma sırası, haftalık ilerlemen veya cuma gününü hafifletme konusunda yardımcı olabilirim. Hangisinden başlayalım?";
      setHistory((previous) => [...previous, { question: pending, answer, kind }].slice(-3));
      setPending("");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [pending, state.tasks]);
  function ask(value: string) { if (pending || !value.trim()) return; setPending(value.trim()); setMessage(""); }
  function submit(event: FormEvent) { event.preventDefault(); ask(message); }
  return <>
    <PageHeading eyebrow="AI KOÇ" title={concept === "coach" ? "Birlikte düşünelim." : "Yanında bir çalışma koçu."} description="Ne yaptığını anlamak, sıradaki adımı seçmek ve planına alan açmak için." />
    <div className="lab-coach-layout"><section className="lab-coach-main"><div className="lab-coach-intro"><span className="lab-coach-symbol"><Icon name="spark" size={25} /></span><div><span className="lab-eyebrow">BUGÜNÜN KISA DEĞERLENDİRMESİ</span><h2>İstikrarın iyi. Biraz denge ekleyelim.</h2><p>Muhasebe ve matematiğe düzenli zaman ayırdın. Haftanın kalanında iktisada küçük bir alan açmak iyi gelecek.</p></div></div>
      <div className="lab-coach-suggestions"><button onClick={() => ask("Bu hafta nasıl gidiyorum?")} disabled={Boolean(pending)}>Bu hafta nasıl gidiyorum? <Icon name="arrow" size={16} /></button><button onClick={() => ask("Yarın daha az vaktim var.")} disabled={Boolean(pending)}>Yarın daha az vaktim var <Icon name="arrow" size={16} /></button><button onClick={() => ask("Neden önce muhasebe?")} disabled={Boolean(pending)}>Neden önce muhasebe? <Icon name="arrow" size={16} /></button></div>
      <div className="lab-coach-history" aria-live="polite" aria-busy={Boolean(pending)}>{history.map((exchange, index) => <article className="lab-exchange" key={`${index}-${exchange.question}`}><p className="lab-user-question">{exchange.question}</p><div className="lab-coach-answer"><span className="lab-eyebrow">{exchange.kind === "plan" ? "PLAN ÖNERİSİ" : exchange.kind === "suggestion" ? "KOÇUNDAN BİR ÖNERİ" : "KOÇUN"}</span><p>{exchange.answer}</p>{exchange.kind === "plan" && <Button tone="secondary" onClick={() => review(coachProposal(state))}>Değişiklikleri incele <Icon name="arrow" size={16} /></Button>}{exchange.kind === "suggestion" && <button className="lab-text-link" onClick={() => navigate("today")}>Bugünkü çalışmama git <Icon name="arrow" size={16} /></button>}</div></article>)}{pending && <div className="lab-coach-thinking" role="status"><span /> Çalışmalarına bakıyorum…</div>}</div>
      <form className="lab-coach-composer" onSubmit={submit}><label htmlFor="lab-coach-message" className="lab-sr-only">Koçuna yaz</label><textarea id="lab-coach-message" rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Aklında ne var? Örneğin, yarın daha az vaktim var…" /><Button type="submit" disabled={!message.trim() || Boolean(pending)} icon="arrow">Gönder</Button></form><p className="lab-muted lab-small">Planın, değişiklikleri inceleyip onayladıktan sonra güncellenir.</p>
    </section><aside className="lab-coach-aside"><span className="lab-eyebrow">KONUŞMAMIZIN BAĞLAMI</span><h3>Bu hafta</h3><strong className="lab-big-number">{duration(studiedMinutes(state.tasks))}</strong><p className="lab-muted">kaydedilmiş çalışma</p><hr /><Badge tone="warning">İktisada yer aç</Badge><p>İktisat için planladığın iki çalışma, haftana denge katabilir.</p><button className="lab-text-link" onClick={() => navigate("week")}>Haftamı aç <Icon name="arrow" size={16} /></button><hr /><details><summary>Koç nasıl yardımcı olur?</summary><p>Çalışmalarını anlamana ve seçenekleri değerlendirmene yardımcı olur. Planını değiştirecek her öneriyi önce sen incelersin.</p></details></aside></div>
  </>;
}
