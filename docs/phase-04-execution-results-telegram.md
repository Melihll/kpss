# Phase 04 — Execution, Results ve Telegram

## Amaç

Phase 04, Phase 03 planlarını gerçek çalışma ve ölçüm verisine bağlar. Pilot döngü `PLAN → TASK → STUDY → TIME → RESULT → REVIEW` biçimindedir; planlama motoru bu phase'de dinamik olarak yeniden çalıştırılmaz.

## StudySession modeli

`study_sessions`, canlı veya sonradan girilen çalışmayı kullanıcı, aktif sınav profili ve opsiyonel task/subject/topic/resource bağlamıyla saklar. Bir kullanıcı için `status = 'active'` koşullu partial unique index ile aynı anda yalnızca bir aktif session olabilir. `active`, `completed` ve `cancelled` durumları DB constraint'leriyle tutarlı tutulur.

## Live session

Task üzerinden start, task'ı `in_progress` yapar ve referanslarını session'a kopyalar. Başka aktif session varsa `ACTIVE_SESSION_EXISTS` döner. Finish süresi client'tan alınmaz; database `now()` değeriyle hesaplanır, dakika aşağı yuvarlanır ve istemsiz sıfır dakikalık kayıtları önlemek için minimum 1 dakika kabul edilir. Cancel edilen session süre üretmez ve task uygunsa `ready` durumuna döner.

## Retroactive session

Web `POST /study-sessions/retroactive` ve Telegram `/calisma_ekle` pozitif dakika ile tamamlanmış session üretir. `started_at`, `ended_at - duration` olarak hesaplanır. Task zorunlu değildir; web'de konu opsiyoneldir. Telegram hızlı girişinde V1 için ders ve süre yeterlidir, konu boş bırakılabilir.

## Actual time accounting

Tamamlanan session süresi `task_progress.actual_study_minutes` alanına eklenir; Phase 03 partial-progress anlamındaki `completed_minutes` değiştirilmez. Konu bağlıysa `topic_progress.total_study_minutes` artar. Bugün ve bu hafta metrikleri yalnızca `completed` session'ları toplar; retroactive/manual kayıtlar dahil, cancelled kayıtlar hariçtir. Finish'in tekrar çağrılması mevcut completed session'ı döndürür ve ikinci kez muhasebeleştirme yapmaz.

## TestResult modeli

`test_results` D/Y/B, toplam, opsiyonel süre, 0–1 arası generated accuracy, review durumu ve task/resource-unit/topic bağlarını saklar. Sayılar negatif olamaz, toplam pozitif olmalı ve `D + Y + B = total` constraint'i geçmelidir. İlk valid result ilgili test unit'ini tamamlar; task kalan unit'e göre partial veya completed olur.

## Correction logic

`update_test_result` aynı transaction içinde eski topic contribution'ını çıkarıp yeni contribution'ı ekler ve sonucu günceller. Böylece sayaçlar eski yanlış girişe bağlı kalmaz. Validation başarısızsa transaction bütünüyle geri alınır.

## Wrong review

Yanlış veya boş varsa ilk durum `pending`, kusursuz sonuçta `reviewed` olur. `POST /test-results/:id/review` ve Telegram “İnceledim” eylemi idempotent biçimde `reviewed` yazar. “Sonra” yeni görev üretmez; sonuç `pending` kalır.

> Test results are stored and topic counters are updated, but mastery classification and revision scheduling are intentionally deferred to Phase 05.

## Telegram linking

Web, 15 dakika geçerli rastgele bir one-time token oluşturur. Database yalnızca SHA-256 hash saklar. `/start TOKEN`, hash'i transaction içinde kilitleyip doğrular, identity oluşturur ve token'ı kullanılmış işaretler. `provider + external_user_id` ve `user_id + provider` unique constraint'leri bir Telegram hesabının iki KPSS hesabına bağlanmasını önler.

## Telegram webhook

`telegram-webhook` `/start`, `/bugun`, `/simdi`, task start/session finish callback'leri, deterministik D/Y/B formu, wrong review ve `/calisma_ekle` akışını destekler. Sonuç formu doğru, yanlış ve boş sayılarını sırayla alıp kaydetmeden önce önizleme verir. Geçici `telegram_conversation_states` yalnızca form state'i tutar ve 10 dakikada sona erer. Core business data JSON state'e gömülmez; onayda normalize tablolara yazılır.

Telegram transport küçük `sendMessage`, `editMessage` ve `answerCallbackQuery` adapter'larından oluşur. Local testte mock transport kullanılır. Token yoksa dış ağa istek yapılmaz ve transport `TELEGRAM_NOT_CONFIGURED` olarak güvenli biçimde kalır.

## Security model

`study_sessions`, `test_results`, `messaging_identities`, `messaging_link_tokens` ve conversation state user-owned RLS ile korunur. Normal `app-api`, kullanıcı JWT'si ve RLS üzerinden çalışmaya devam eder.

Telegram request'i kullanıcı JWT'si taşımaz. Webhook önce `X-Telegram-Bot-Api-Secret-Token` değerini doğrular, sonra external Telegram identity'yi internal `user_id` ile çözer. Service-role yalnızca Edge Function secret'ıdır; frontend veya repo'ya gönderilmez. Mutation'lar, resolved user id alan ve yalnızca `service_role` için execute izni bulunan dar RPC wrapper'larından geçer. RPC içindeki asıl fonksiyonlar sahiplik filtrelerini uygular.

## Idempotency

Session finish completed kaydı tekrar muhasebeleştirmez. Test result için user-scoped partial unique `idempotency_key` vardır ve atomik RPC aynı key'de mevcut sonucu döndürür. Telegram `provider + update_id` değerini `processed_external_events` içinde unique saklar; aynı update callback'i ikinci session/result mutation'ı üretmez. Link token one-time'dır.

## Web UX

Dashboard aktif session'ı database'den geri yükler; bitir/iptal eylemlerini, bugün/hafta gerçek sürelerini, plansız çalışma formunu, D/Y/B sonuç formunu, recent results accuracy/review durumunu ve Telegram bağlantı linkini gösterir. Accuracy kullanıcıya “Başarı” olarak gösterilir, mastery olarak sunulmaz.

## Tests

- Pure domain: duration, minimum süre, invalid tarih, active conflict, D/Y/B validation, accuracy, review ve delta/accounting.
- Integration: session/RLS/idempotency, retroactive/cancel, result correction, unit/task/topic entegrasyonu ve messaging constraint'leri.
- HTTP Edge: normal JWT ile plan/task API regresyonu.
- Telegram HTTP: link, `/bugun`, `/simdi`, start/retry/finish, D/Y/B/review ve manual retroactive çalışma; gerçek Telegram API kullanılmadan mock transport.

## Recovery Hardening

- **API domain error mapping:** Phase 04 session, result, task ve resource-unit domain hataları yapılandırılmış API code değerlerine ve 400/401/403/404/409 HTTP durumlarına çevrilir; beklenen business hataları `INTERNAL_ERROR` olarak dönmez.
- **PATCH CORS:** `app-api` preflight yanıtı `GET`, `POST`, `PATCH` ve `OPTIONS` method'larını açıkça destekler.
- **TestResult correction:** Recent Results kartındaki minimal `Düzelt` formu mevcut D/Y/B/süre değerlerini yükler, `PATCH /test-results/:id` çağırır ve güncel accuracy, sayaç ve review durumunu yeniden yükler.
- **Task-unit integrity:** Web unit seçimi seçili task'ın bekleyen `task_resource_units` kayıtlarıyla sınırlıdır. Database RPC, başka task'a bağlı unit ile sonuç oluşturmayı `RESOURCE_UNIT_NOT_LINKED_TO_TASK` hatasıyla reddeder.
- **Europe/Istanbul boundaries:** Bugün ve bu hafta execution özetleri aynı `Europe/Istanbul` timezone helper'ından türetilen `[start, end)` UTC aralıklarını kullanır. Hafta pazartesi 00:00'da başlar ve sonraki pazartesi 00:00'da biter.
- **Telegram retry semantics:** External event lifecycle `processing`, `completed` ve `failed` durumlarını; attempt count, stale-lock reclaim, business checkpoint ve error bilgisini saklar. Mutation sonrası delivery hatasında retry saklanan sonucu teslim eder ve business mutation'ı tekrar çalıştırmaz.
- **Phase 04 HTTP coverage:** Authenticated local Edge HTTP smoke; session start/active/finish, actual minutes, retroactive kayıt, result create/correction/review, 409 active conflict, 400 invalid result/task-unit mismatch, unauthorized erişim ve PATCH preflight davranışlarını gerçek `app-api` üzerinden doğrular.

## Known limitations

- Telegram hızlı çalışma girişi V1'de ders + süre kullanır; konu seçimi opsiyonel olduğundan hızlı akışta atlanır.
- Learn-topic session finish task'ı otomatik completed yapmaz; mevcut explicit task completion davranışı korunur.
- Telegram edit adapter'ı hazırdır, V1 cevapları ağırlıkla yeni mesaj gönderir.
- Mastery, revision scheduling, dynamic replanning, notification ve AI parsing yoktur.

## Phase 05 readiness

Execution verisi normalize, atomik ve kullanıcı izolasyonlu biçimde oluşur. Phase 05 bu sonuç ve pending-review sinyallerini okuyabilir; bu phase hiçbir mastery veya revision kararı üretmez.
