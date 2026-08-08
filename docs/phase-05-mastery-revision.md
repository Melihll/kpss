# Phase 05 — Mastery Engine V1 + Revision Engine V1

## Amaç

Test sonuçlarından konu seviyesini deterministik biçimde değerlendirmek, değerlendirme geçmişini saklamak ve kullanıcıya ait tekrarları planlanabilir veri olarak üretmek.

## Mastery Engine V1

`packages/domain/src/mastery` altındaki saf TypeScript motoru aynı girdiye her zaman aynı çıktıyı verir. Son üç geçerli test sonucu `completed_at DESC` sırasıyla dikkate alınır. Doğruluk `correct / total_questions` olarak hesaplanır; boşlar toplamın içindedir.

## Thresholds ve evidence

- En az 20 soru gerekir.
- `%85+`: strong
- `%75–84`: sufficient
- `%65–74`: fragile
- `%55–64`: weak
- `%55 altı`: critical

Yetersiz evidence mevcut seviyeyi korur; ilk değerlendirmede `unknown` kalır. Kaynak zorluğu V1'de ayarlama sinyali değildir.

## Hysteresis

`unknown` seviyesinin ilk sınıflandırması dışında bir assessment en fazla bir seviye hareket eder. Böylece tek bir iyi veya kötü veri penceresi `critical ↔ strong` sıçraması yaratmaz.

## Topic state integration

- strong/sufficient → `learned` (mevcut maintenance korunur)
- fragile → `practicing`
- weak/critical → `remediation`
- tamamlanan learned revision → `maintenance`

## Revision Engine V1

Merkezi V1 aralıkları strong 7, sufficient 5, fragile 3, weak 2 ve critical 1 takvim günüdür. Tarihler Europe/Istanbul takvim günü üzerinden `date` olarak hesaplanır.

Tip ve süre varsayımları: short review 15 dk, wrong review 20 dk, topic test 30 dk, intensive review 45 dk. Pending yanlış incelemesi varsa `wrong_review` önceliklidir. Aynı kullanıcı/profil/topic için tek aktif scheduled/due revision tutulur; yeni assessment aktif satırı günceller, tamamlanmış revision sonrasında revision number artırılır. Urgency saklanmaz; tarih ile `upcoming`, `due`, `overdue`, `critical_overdue` olarak türetilir.

Haftalık revision budget utility'si planning budget'ın varsayılan `%20` değerini hesaplar. Phase 05 weekly plan'i yeniden üretmez; dynamic integration Phase 06 kapsamındadır.

## Persistence, RLS ve correction

`topic_assessments` karar geçmişini, `revision_schedules` tekrar yaşam döngüsünü saklar. Her iki tablo user-owned RLS ile yalnızca sahibine görünür. Mutasyonlar sahiplik zincirini doğrulayan kontrollü RPC'lerden yapılır. Kaynak result id + result updated-at benzersizliği retry'ları idempotent yapar.

TestResult create ve correction sonrasında uygulama orkestrasyonu son üç sonucu yeniden değerlendirir. Result önce kalıcılaştırılır; mastery geçici olarak hata verirse result kaybolmaz ve `masteryPending` bildirilir. Correction yeni result sürümü için assessment üretir ve aktif revision'ı çoğaltmadan günceller.

## Web ve Telegram

Dashboard yüzdelik “mastery score” göstermeden konu seviyelerini Türkçe etiketlerle sunar. Tekrar paneli bugün/gecikmiş/yaklaşan sayılarını, tip/süreyi ve tamamla aksiyonunu gösterir.

Telegram `/tekrar` yalnızca due/overdue tekrarları listeler. Inline “Tekrarı Tamamla” callback'i ortak completion mutation'ını kullanır; external event idempotency duplicate callback işlenmesini engeller.

## API

- `GET /topics/:id/performance`
- `GET /revisions`
- `GET /revisions/due`
- `POST /revisions/:id/complete`
- TestResult create/correction içinde otomatik mastery orchestration

## Tests

Unit testler minimum evidence, tüm threshold sınırları, hysteresis, recent-result önceliği, determinism, revision interval/type/dedupe/completion/budget ve urgency sınırlarını kapsar. Integration ve gerçek authenticated HTTP testleri correction consistency, state geçişleri, revision lifecycle ve iki kullanıcılı RLS izolasyonunu doğrular. Telegram mock testi `/tekrar`, completion ve duplicate callback'i kapsar.

## Known limitations ve Phase 06 readiness

Dynamic replanning, revision batching, backlog/risk/reporting, cron ve AI Phase 05 kapsamında değildir. Revision'lar henüz Next Best Task veya WeeklyPlan bütçesine otomatik olarak karışmaz.

> Mastery and revision heuristics are V1 calibration rules, not permanent scientific constants. They are designed to be replaced or tuned using pilot data.

Phase 06, pilot verisine göre threshold/interval kalibrasyonu ve planlama entegrasyonunu bu deterministik kayıtlar üzerinden yapabilir.
