# Phase 06 — Dynamic Replanning V1

## Capacity Engine V1

Effective day/week capacity, haftalık availability pencerelerinden saf TypeScript ile hesaplanır. Çakışan pencereler birleştirilir. Aynı güne denk gelen CalendarPeriod kayıtlarında en kısıtlayıcı multiplier kullanılır. `unavailable` aralıkları availability içinden union olarak çıkarılır; overlap iki kez düşülmez. `extra_available` ve açık delta içeren `custom` istisnaları multiplier sonrasında uygulanır. Sonuç hiçbir zaman negatif değildir. Tarihler Europe/Istanbul takvim günü olarak taşınır.

## ScheduleException

Web ve Telegram yalnızca yapılandırılmış type/saat/dakika girdisi kabul eder; doğal dil parsing yoktur. İstisna kaydedildikten sonra kullanıcı explicit replan tetikler. RLS her istisnayı profil sahibine sınırlar.

## Backlog ve PlanRisk

Backlog oranı kalan görev dakikalarının kalan effective kapasiteye oranıdır. Merkezi V1 eşikleri: `<=.70 normal`, `<=.90 attention`, `<=1.10 risk`, üstü `critical`. Risk/critical backlog replan ceiling sinyalidir.

`capacity_shortfall`, `backlog_overload`, `syllabus_delay` ve `revision_overload` riskleri history tutar. Aynı type için tek open risk vardır; yeni snapshot mevcut riski günceller, koşul kalkınca resolved yapar.

## Priority Engine V1

Merkezi 0–100 sinyalleri schedule urgency 25, weakness 25, revision urgency 20, deviation 15, postponement 10 ve dependency 5 üst sınırlarıyla modellenir. Replan sırası active, partial, overdue/core, critical/weak revision/remediation, core, important ve optional şeklindedir.

## Dynamic Replanning

`replanWeeklyPlanV1(context)` DB erişmeyen deterministik motordur. Completed history’ye dokunmaz; active/partial görevleri korur; future task tarihlerini effective daily capacity’ye göre yeniden yerleştirir; optional işi ilk çıkarılacak aday yapar ve revision budget içine sığan tekrar task’larını üretir.

Level 1 `automatic_minor`, Level 2 `automatic_informed` atomik RPC ile uygulanır. Level 3 `strategic_proposal` yalnızca history/proposal olarak kalır. Task move, cancellation, revision task creation, backlog snapshot, risk update ve PlanRevision aynı transaction içindedir. Stable dedupe key retry’ı idempotent yapar; aynı no-change snapshot yeni history üretmez.

## Revision integration

Due/overdue/upcoming revision talepleri urgency ve mastery sırasına konur. Toplam workload, planning budget’ın varsayılan `%20` revision budget’ını aşamaz. Her revision schedule en fazla bir linked `review_topic` task üretebilir.

## Minimum Plan

`buildMinimumDayPlan` critical overdue revision, partial core, overdue/core, remediation/weak ve due revision sırasını kullanır. Available dakikayı aşmaz; hiçbir anlamlı aday sığmıyorsa `NO_MEANINGFUL_TASK_FITS` döndürür. Arbitrary task parçalama yapılmaz.

## Next Best Task V2

Eski active/partial davranışı korunmuştur. Yeni reason code’lar: `critical_revision`, `weak_topic`, `due_revision`. Effective günlük kapasite fit sinyalidir fakat core/critical iş sürekli gizlenmez.

## Projection ve dashboard

Projection yalnızca top-level topic node’larını sayar; subtopic double-count edilmez. En az iki gözlem haftası ve pozitif öğrenme hızı yoksa tarih üretilmez. Yeterli history varsa recent learned topics/week ile baseline tarih hesaplanır. Exam tarihinden 30 gün önceki buffer ile `ON_TRACK`, exam tarihine kadarsa `ATTENTION`, sonrasındaysa `RISK` döner.

Dashboard “Yetişiyor muyum?”, tamamlanan/devam/eksik sayıları, backlog/risk, minimum plan, özel durum formu, replan butonu ve son değişiklik açıklamasını gösterir.

## Telegram

`/minimum` minimum planı, `/ozel` yapılandırılmış az/ekstra dakika akışını sunar. Özel durum replan’i explicit tetikler. `/simdi` revision urgency ve weak/remediation sinyallerini kullanır. `/bugun`, `/tekrar` ve Phase 04 retry idempotency korunur.

## RLS ve tests

`backlog_states`, `task_reschedule_events`, `plan_revisions`, `plan_risks` user-owned RLS ile korunur. 31 yeni unit testi capacity/backlog/replan/minimum/projection sınırlarını; 17 yeni integration testi atomik persistence, history ve multi-user izolasyonu doğrular. Gerçek Phase 06 HTTP ve Telegram mock zincirleri de bulunur.

## Known limitations ve Phase 07 readiness

Cron, production deployment, AI/ML projection, natural-language parsing, monthly reports ve advanced mock analysis kapsam dışıdır. Projection, risk ve replan eşikleri pilot verisiyle kalibre edilmelidir. Bundle boyutu optimizasyonu bu phase’in amacı değildir.

> Replanning and projection logic are deterministic V1 heuristics intended for pilot calibration.
