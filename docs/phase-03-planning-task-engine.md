# Phase 03 — Planning and Task Engine

## Amaç

Aktif sınav profili, haftalık kapasite, curriculum progress ve resource unit verilerinden deterministik haftalık plan üretmek; görevleri güvenli biçimde başlatmak, kısmen ilerletmek, tamamlamak ve sıradaki en uygun görevi önermek.

## Schema

- `weekly_plans`: Monday–Sunday plan dönemi, kapasite/budget/planned sayaçları ve generation version
- `tasks`: plan veya manuel görev, priority/importance, dedupe ve optional carryover bağlantısı
- `task_resource_units`: task ile bir veya daha fazla çalışılabilir unit arasındaki durumlu bağlantı
- `task_progress`: StudySession gelene kadar development-friendly tamamlanan dakika

Composite owner foreign key'leri task, plan, profile ve resource bağlantılarının aynı kullanıcıya ait olmasını destekler. Bir profile/week için tek active plan partial unique index ile korunur.

## Planning Engine V0

`packages/domain/src/planning` içindeki `buildWeeklyPlanV0` pure TypeScript fonksiyonudur ve DB sorgusu yapmaz. Haftalık overlap-safe kapasiteyi hesaplar, %85 budget ayırır, carryover candidate'ları öne alır, her aktif dersin sıradaki top-level topic'ini seçer ve mapped resource unit'lerini ekler.

> Planning Engine V0 is deterministic and intentionally simple. Performance, mastery, revision and dynamic replanning are not yet part of planning decisions.

## Heuristic config

- `DEFAULT_WEEKLY_UTILIZATION = 0.85`
- `DEFAULT_LEARN_TOPIC_MINUTES = 60`
- `MAX_RESOURCE_UNITS_PER_TASK = 2`
- Unit varsayımları: test/reading/other 30, video/chapter 45, mock 60 dakika

Bu süreler V0 heuristic değerleridir; gerçek StudySession süresi değildir.

## Priority V0

Base 40 üzerine carryover +30, remediation +20, practicing +10, learning +5 ve primary resource +5 eklenir. Sonuç 0–100 aralığına clamp edilir. Carryover ve remediation `core`; normal learn/solve işleri `important` kabul edilir.

## Fair allocation

Carryover görevlerden sonra subject candidate listeleri round-robin dolaşılır. Bir görev global planning budget'a veya herhangi bir günlük kapasiteye sığmıyorsa skip edilir; sonraki küçük candidate denenir.

## Weekly plan generation

Edge Function DB verilerini caller JWT/RLS ile context'e dönüştürür, pure motoru çağırır ve sonucu `persist_weekly_plan(jsonb)` RPC'siyle tek transaction içinde WeeklyPlan + Tasks + TaskResourceUnits + TaskProgress olarak yazar. Aynı hafta aktif plan varsa mevcut plan döner.

Domain motoru Edge runtime'a `pnpm edge:bundle` ile generated ESM artifact olarak taşınır; business source of truth `packages/domain` altında kalır.

## Task lifecycle

- `ready → in_progress`
- Dakika veya unit ilerlemesi → `partially_completed`
- Tüm unit'ler ya da yeterli dakika → `completed`
- Unit içeren task explicit complete edilirse pending unit varken `TASK_HAS_PENDING_UNITS`

Learn topic start, yalnızca `not_started → learning`; completion yalnızca `not_started/learning → practicing` yapar. Daha ileri state'ler geriye düşürülmez.

## Partial completion

İlk linked unit tamamlanınca task partial, tüm linked unit'ler tamamlanınca completed olur. ResourceUnitProgress aynı transaction içinde idempotent tamamlanır ve tekrar çağrısı attempt count'u artırmaz. Unit olmayan task completed minutes ile partial/completed olabilir.

## Next Best Task

`getNextBestTask` sırasıyla in-progress, partial, overdue/today core, overdue/today important ve diğer weekly task'ları değerlendirir. Aynı tier içinde kalan pencereye sığma, priority, remaining minutes, creation time ve id deterministik tie-break sağlar.

## API actions

`supabase/functions/app-api` caller JWT'yi doğrular ve şu route'ları sağlar:

- `POST /weekly-plan/build`
- `GET /weekly-plan/current`
- `GET /tasks`
- `GET /tasks/next`
- `POST /tasks/:id/start`
- `POST /tasks/:id/progress`
- `POST /tasks/:id/complete-unit`
- `POST /tasks/:id/complete`

## RLS/security

Frontend ve Edge Function service-role kullanmaz. Weekly plan/task/progress doğrudan `auth.uid()` ile; linked units hem task hem resource ownership zinciriyle korunur. Mutation RPC'leri `SECURITY INVOKER` olarak caller RLS context'inde çalışır.

## Tests

- Planning budget, hard limits, curriculum order, completed-unit skip, max-two units, primary resource ve fairness unit testleri
- Recommendation tier/fit/tie-break testleri
- Partial status ve topic transition unit testleri
- İki normal kullanıcıyla plan/task/mutation RLS integration testleri
- Normal signup JWT'siyle gerçek local Edge HTTP build/current/next/start smoke testi

## Known limitations

- StudySession, live timer, TestResult, mastery, revision ve dynamic replanning yoktur.
- CalendarPeriod/ScheduleException henüz plan budget'ını değiştirmez.
- Force regenerate yoktur; mevcut active weekly plan idempotent biçimde döner.
- Default süreler heuristic'tir.

## Phase 04 readiness

Weekly plan, task/unit bağları, dakika ve unit bazlı partial progress, topic lifecycle ve authenticated recommendation API'si StudySession entegrasyonu için hazırdır.
