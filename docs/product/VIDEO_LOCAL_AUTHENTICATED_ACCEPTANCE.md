# Real video local authenticated acceptance

> **2026-10-07 — RELEASE BLOCKER CLOSURE: LOCAL GREEN / NOT DEPLOYED**
>
> - Original 45 tracked + 183 untracked paths individually classified and preserved; intentional accepted source/tests/docs/evidence enter one authorized local release commit. LOCAL/generated inputs are ignored. The exact RC is the commit containing this record; parent `ea17ee281cb192304abfb518ff4f50b1ab3ecfdd`. Final exact-HEAD/postcommit validation and clean 1/0 upstream state are required before GO; see ignored `.release/final-freeze.json` and the final report.
> - Full regression **1535 tests / 204 files PASS**, domain/web typecheck, 19-file scoped lint, production-input build/endpoint scan, six authoritative safety scripts and diff check PASS. Production process inputs override the unchanged LOCAL env file; no new production secret.
> - Existing video PUT now has one active + one latest pending checkpoint, 15-second error backoff, critical lifecycle flush and stale/owner protection. Real slow/fail concurrency max 1; no storm. Finish pauses the mounted partial-task player; async ready seek restoration cannot autoplay.
> - Full authenticated real-root acceptance on Oct 6: physical page/atomic finish, Week add/edit/exact move/review/confirm, Resources/Progress/Roadmap/Coach/account/logout/relogin and 390 px mobile PASS. Existing Planner preview/confirm/apply gates remain OFF; safe blocked explanation PASS. Original historical task/session/progress preserved; separate scoped LOCAL fixtures, no DB reset/schema/second tracking.
> - Source diff confirms future surfaces **app-api → web**, other Edge/database migration/new production secrets **NONE**; app-api backward compatibility PASS from source/tests. Exact rollback remains web `395a536d` / Pages `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`, app-api `735de8d` / code v75 / config v78. No live production drift query, deploy, SQL, data/secret mutation or Git push.
> - [Current evidence and limits](release-blocker-evidence/README.md), [source/rollback report](CONCEPT_B_RELEASE_FREEZE.md). Historical NO-GO/GREEN records below are retained. **Production NOT DEPLOYED; stop after clean local RC and postcommit checks.**


> **2026-10-06 release freeze audit: NO-GO / NOT DEPLOYED.** The successful LOCAL runtime acceptance below remains GREEN for its measured flow. Fresh regression again passed 1509 tests / 200 files. Source audit additionally found that a failed/slow video progress save can leave the checkpoint threshold true and enqueue a PUT on each one-second tick; failure/backpressure freeze therefore FAILS until corrected and tested. Dirty RC, local endpoint in the build and remaining full frontend smoke are separate release blockers. [CONCEPT_B_RELEASE_FREEZE.md](CONCEPT_B_RELEASE_FREEZE.md) contains exact evidence and scope. No new playback/fixture/progress/session mutation or production operation was performed in this audit; historical acceptance was not overwritten.

## Güncel recovery sonucu — 2026-10-05

**LOCAL ACCEPTANCE GREEN — NOT DEPLOYED.** Gerçek product root, gerçek local Supabase Auth ve mevcut canonical/resource/video/progress/session modeliyle test edildi. Aşağıdaki eski BLOCKED raporları tarihsel kayıttır; güncel sonuç bu bölümdür. Bu kabul video zincirine aittir, tüm frontend migration checklist'inin veya production release'in kabulü değildir.

### Sonuç matrisi

| Kontrol | Sonuç | Gözlenen kanıt |
| --- | --- | --- |
| Local Edge auth | **PASS** | Gerçek kullanıcı bearer'ıyla `/study-sessions/active` ve diğer beş application GET'i 200. Eksik/malformed bearer 401. |
| ES256 verification | **PASS** | Local public JWKS ile WebCrypto ECDSA/P-256 imza doğrulaması; issuer/audience/role/expiry kontrolü. JWT verification açık. |
| Real video fixture | **PASS** | Gerçek public YouTube videosu mevcut katalog tablolarında; tekrar çalıştırmada 0 insert, 18 reuse, 0 update. |
| Canonical task chain | **PASS** | Aynı owned user/profile, güncel hafta/task, canonical adapter ID, resource, playlist ve validated mapping. |
| Playback | **PASS** | Native YouTube play/pause, ilerleyen süre ve state; 1:02 ve 6:05 konumları, 22:23 native duration. |
| Progress persistence | **PASS** | Mevcut `youtube_video_progress` içinde tek user/catalog kaydı; son position/watched 365 sn. |
| Refresh/resume | **PASS** | Route dönüşü ve refresh'te kayıt korunuyor; paused refresh 277 sn'de sabit, session resume aynı videoyu sürdürüyor. |
| Today → Focus | **PASS** | `/` → `/session` aynı iframe, task, video, progress ve session UUID'si. |
| Session lifecycle | **PASS** | Start → iki session break → resume → finish. Native YouTube pause session'ı bitirmiyor veya molaya almıyor. |
| Finish | **PASS** | Bir `completed` session, iki kapanmış break, bir progress kaydı; task `partially_completed`, video tamamlanmamış. |
| Missing-mapping protection | **PASS** | Fixture resource→playlist bağlantısı geçici kaldırılınca 0 iframe ve güvenli unavailable; geri yükleme aynı video/progress'i getiriyor. |
| Console/network | **PASS, ölçülen kapsamda** | Son browser window'da uncaught error/auth loop yok. Local application URL'leri, altı endpoint ve 10 fresh-login turunda 60/60 istek 200; progress saniyelik yazılmıyor. |
| Regression | **PASS** | **1.509/1.509 test, 200 dosya**; web/domain typecheck, web build, mevcut scoped lint ve güvenlik kontrolleri. |
| Production state | **NOT DEPLOYED** | Production bağlantısı/deploy/SQL/mutation/migration yok. |

### A. Auth ve local runtime teşhisi

Zincir: local Auth password sign-in → gerçek ES256 access token → local JWKS signature verification → JWT doğrulaması açık local Edge → app-api handler → mevcut PostgREST/RLS.

| Alan | Son ölçüm |
| --- | --- |
| Frontend / Auth API / DB | `http://127.0.0.1:5174/` / `http://127.0.0.1:54321` / loopback `54322`, database `postgres` |
| `iss` / expected issuer | Her ikisi `http://127.0.0.1:54321/auth/v1`; localhost/127 mismatch veya remote issuer yok |
| `alg` / `aud` / `role` | `ES256` / `authenticated` / `authenticated` |
| `sub` | `f5887c7b-012d-48ad-8d17-71101b82ab37` — yalnızca dedicated LOCAL test user |
| Son `exp` | `1791219737`, `2026-10-05T17:02:17Z`; ölçüm anında geçerli |
| JWKS | `/auth/v1/.well-known/jwks.json` HTTP 200; matching public EC P-256 key ile imza PASS; private key/token export edilmedi |
| Function config | `supabase/config.toml`: project `kpss-coach`, `[functions.app-api] verify_jwt = true`; diğer mevcut function auth kuralları değiştirilmedi |
| CLI | Repository **2.39.2 → 2.113.0**, lockfile pin; npm entrypoint `node_modules/supabase/dist/supabase.js` |
| Edge | **1.69.1 → 1.74.3**, Deno **2.1.4** |
| Auth / Postgres | Mevcut GoTrue **2.195.0**, Postgres image **17.6.1.155**; DB restart/reset/upgrade yapılmadı |
| PostgREST | **14.15 → 14.18**, yalnızca local REST container değişti; auth/env değerleri aynı |

İlk hata valid ES256 token'ın eski platform verifier'ında simetrik `Uint8Array` secret ile doğrulanmasıydı. Auth `getUser` ve bağımsız JWKS signature PASS olduğu halde eski Edge handler'a ulaşmadan 401 üretiyordu. Eski Functions serve durdurulup uyumlu 2.113.0 CLI/1.74.3 runtime ile yeniden açıldı. Yeni platform bootstrap ES256 için local JWKS kullanıyor; HS256 desteği de korunuyor. [Supabase function auth dokümanı](https://supabase.com/docs/guides/functions/auth-headers) asimetrik JWT doğrulamasını açıklıyor. `--no-verify-jwt`, fake/helper JWT veya `verify_jwt=false` kullanılmadı.

Anon/publishable key API routing için kullanılan local public project key'dir; authenticated user bearer'ının yerine geçmez. Gerçek user token Auth tarafından üretilir ve `sub`/role ile RLS kimliğini taşır. Service/secret key mevcut server-side client kullanımında kalır; frontend'e/rapora aktarılmadı, kullanıcı token'ı olarak kullanılmadı. Legacy JWT secret ile ES256 public JWKS aynı anahtar türü değildir; eski verifier hatasının nedeni buydu. Anahtarlar döndürülmedi ve production secret okunmadı.

Son kontrolde ikinci, ayrı bir stale-service sorunu bulundu: eski PostgREST 14.15 bazı geçerli yeni JWT'leri `JWT issued at future` diye reddediyordu; app-api bu upstream hatayı 500 `INTERNAL_ERROR` olarak döndürüyordu. Windows/Auth/DB saatleri aynı saniyedeydi. Resmi [PostgREST 14.18 changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md) ve [upstream fix #5208](https://github.com/PostgREST/postgrest/pull/5208) bu sporadik cached-clock hatasının düzeltmesini içeriyor. Yalnızca local REST resmi 14.18 image'ıyla, aynı env/JWKS, user, network alias, labels ve restart policy ile yenilendi. Port veya mount eklenmedi. Eski REST `supabase_rest_kpss-coach_before_video_acceptance_v1415` adıyla durdurulmuş halde korunuyor; ilk clone kontrolündeki env sıralama farkı nedeniyle otomatik geri dönüş yapıldı, değerlerin eşitliği doğrulanınca geçiş tamamlandı. DB/Auth container'ları değiştirilmedi.

Ignored local version cache `supabase/.temp/rest-version` artık `v14.18`; eski değer `rest-version.video-acceptance-backup` içinde. Bu dosya repository/production config değişikliği değildir. Sonrasında **10 gerçek yeni sign-in → anında 60 korumalı GET, 60 PASS**: login delay, retry, JWT claim düzenlemesi veya clock-skew gevşetmesi yok. Aralıklı eski hatalar son evidence içinde `resolvedPostgrest1415Failures` olarak korunuyor.

Config'teki `db.major_version=15` ile mevcut local DB image 17 farkı eski stack/cache durumudur; video kabulünü düzeltmek için DB major değişikliği veya reset zorlanmadı. DB volume silinmedi, migration/production SQL çalıştırılmadı.

### B. Gerçek deterministic fixture

`scripts/setup-local-video-acceptance-fixture.mjs` sadece explicit profile UUID ve dedicated `video-acceptance-local@example.test` hesabını kabul eder. API `http` loopback `54321`, DB PostgreSQL loopback `54322/postgres` olmak zorunda; remote/fake loopback/URL credential/query/başka DB reddedilir. Apply öncesi normal Auth login/signup, ES256/JWKS signature ve protected smoke gerekir. İlk yeni kullanıcıda `NO_ACTIVE_EXAM_PROFILE` domain cevabı kabul edilir; 401 veya diğer hata fixture transaction'ını engeller. Auth user/profiles normal local Auth ve existing trigger üzerinden oluşturuldu; application fixture'da 18 satır eklendi.

Video Google for Developers'ın public IFrame API örneği `M7lc1UVf-VE`, **YouTube Developers Live: Embedded Web Player Customization**. Public metadata/oEmbed kontrolü ve native browser playback yapıldı. ID/source URL yalnızca LOCAL katalog fixture verisidir; frontend'e veya task identity'ye hardcode edilmedi. Mevcut playlist tablosundaki parent bir **local single-video collection** (`local-acceptance-single-video:M7lc1UVf-VE`); gerçek remote YouTube playlist import/sync yapıldığı iddia edilmiyor. Provider API key veya ikinci katalog kullanılmadı.

| Identity | Persisted değer |
| --- | --- |
| Profile | `a9cb4d62-5d48-4bdd-a17d-ae8c6f240f31` |
| Week / plan | `2026-10-05`–`2026-10-11` / `96842059-4d24-4a38-ac9d-6cbe77155d3e` |
| Task | `2f1784eb-cbb5-469d-a055-9669f335a341`, `2026-10-05`, 23 dakika |
| Resource | `848517eb-a9ed-4d8e-ad1a-ba5020f25d4d` |
| Playlist internal UUID | `b0fdaae0-cc0f-4236-adef-f4171cae40b2` |
| Catalog video UUID | `9eb7bfba-1a41-4fb5-a098-1a29474c72fa` |
| Validated mapping | `b6375449-4d7a-4886-a964-73a7a5adf229` |
| Canonical workload identity | `youtube:9eb7bfba-1a41-4fb5-a098-1a29474c72fa` |
| Canonical material view | `youtube:9eb7bfba-1a41-4fb5-a098-1a29474c72fa:mapping:b6375449-4d7a-4886-a964-73a7a5adf229` |
| Boundary | Existing `full_video`, catalog UUID, duration 1344 sn |

Canonical ID existing `adaptYoutubeMaterialRow` adapter'ından üretilir; string sentinel uydurulmaz. Existing strategy/availability/resource target/weekly plan ile current-date Today yolu deterministiktir. Fixture kapasitesi test erişilebilirliği içindir, gerçek öğrenci çalışma önerisi değildir. Aynı profile/day IDs deterministiktir; collision ownership/linkage kontrolleri vardır. Replay **0 insert / 18 reuse / 0 update**; task status, progress ve sessions overwrite edilmez. Current-week planned total existing task toplamından hesaplanır.

Physical + video aynı task'a eklenmedi: existing canonical boundary `full_video` veya physical scope olan bir union'dır. Bu kabulde yeni mixed boundary/tracking/schema zorlanmadı; physical page runtime acceptance verilmedi.

### C. Gerçek product root yolculuğu

LoginPage → `/` Today → exact canonical video → **Çalışmaya Başla** → native YouTube play/pause → **Odak görünümü** `/session` → **Mola ver** → Today/Haftam dönüşü ve browser refresh → **Çalışmaya devam et** → **Çalışmayı Bitir** test edildi. UX Lab simülasyonu veya DEV live-video preview bu PASS'ın kaynağı değildir.

`/weekly-plan/current` hydrated `material_scope.full_video` catalog UUID/resource/duration'ı verir. Today önerisi task UUID ile bu contract'a join edilir. `/resources/:resourceId/youtube-videos` owned catalog üyeliğini, `/youtube-videos/:catalogUuid/progress` exact metadata ve progress'i verir. Resolver + GET/PUT identity validation sonrası resmi SDK'ya yalnızca doğrulanmış native video ID geçer. Raw URL task identity veya arbitrary iframe URL yok.

Play sırasında native zaman 1:02 → 6:05 ilerledi; native duration 22:23, katalog metadata duration 22:24 (1 sn fark). Native YouTube pause sırasında study session active kaldı. Today→Focus aynı `widget2` iframe ve session `bfe51721-880a-434f-9bca-1c6c01bb8055` ile sürdü.

Progress 30 saniyelik yedi read-only örnekte 94 → 110 → 126 sn; DB update timestamp aralıkları yaklaşık 15.9/16 sn, table update sayacı 8 → 10. Bir saniyelik SDK poll DB write değildir. Pause/visibility/cleanup save'leri ek event checkpoint'leridir. Doğru user/profile/catalog için tek progress satırı korunur.

İlk session molası 158 sn'de, ikinci mola 277 sn'de kaydedildi. İkinci paused refresh sonrası iki DB okumasında (10 sn arayla) 277 sn ve aynı açık break sabit kaldı. **Çalışmaya devam et** aynı session/video'yu native yeniden play tıklaması gerektirmeden sürdürdü. Oturum timer'ı molaları dışarıda bırakır; video watched seconds ile session dakika muhasebesi eşitlenmez. Yeni browser'da sağlayıcının ilk user gesture/autoplay kısıtı ayrıca geçerli olabilir.

Bu test sırasında iki gerçek frontend lifecycle kusuru giderildi: paused session ilk yüklenirken SDK hazır olmadan resume intent'in silinmesi; React cleanup/HMR sırasında henüz hazır olmayan player'da `getCurrentTime` çağrısı. `playerRef` artık yalnızca `onReady` sonrasında atanır; tick/save/cleanup readiness ile korunur. Asenkron seek sonrası paused session'a gelen PLAYING event'i de tekrar pause edilir. Resume helper'ın restored-pause/manual-video-pause davranışları test edildi. Eski SDK hatası tarihsel console evidence'ta durur; fix sonrası refresh/route/resume ve son console window temizdir.

Finish sonrası DB: **1 completed session**, **15 dakika**, **2 kapanmış break**, **1 progress** (`last_position_seconds=365`, `watched_seconds=365`, `completed_at=null`). Task `partially_completed`, remaining 8 dakika; video %27. Session finish videoyu veya 23 dakikalık task'ı otomatik complete yapmaz. Task boundary'deki `watchedSeconds=0` planning snapshot'ıdır; live truth existing progress satırıdır, boundary overwrite edilmez.

Missing mapping testi yalnızca owned fixture `topic_resource_links` satırındaki playlist UUID'sini geçici `null` yaptı. Gerçek root reload: catalog listesi boş, **0 iframe**, “Göreve bağlı video doğrulanamadı…” ve retry. Başka video/fallback açılmadı. Aynı playlist UUID geri yüklendi; root reload'da aynı title/catalog/progress 6:05 geri geldi. Task/video/mapping/progress/session silinmedi.

### D. Kapsam, kontroller ve tekrar çalıştırma

Console/network PASS son düzeltilmiş runtime kabul penceresine aittir. Vite/Supabase application config loopback; helper redirect/remote host reddeder. Auth/session/plan/execution/roadmap/resource/progress istekleri local endpointlerde doğrulandı; intentional public YouTube player/metadata ve resmi vendor docs/image download ayrı provider trafiğidir. CUA tam HAR export sağlamadığından tüm browser üçüncü parti alt istekleri için eksiksiz HAR iddiası yok. Önceki deliberately missing/malformed-token 401'ler negatif auth smoke'udur; application auth loop değildir.

Salt okunur son DB transaction task/resource/link/playlist/catalog/validated mapping/canonical adapter/progress/session/break zincirini aynı user/profile için doğruladı. Önceki W6 local hesaptan dedicated hesaba geçişte mevcut product'ın `p48/bootstrap` davranışı eski test profile için local setup yazdı; historical fixture resetlenmedi. Dedicated acceptance profile baştan configured olduğundan bu testte bootstrap gerektirmedi. Production verisi/hesabı kopyalanmadı.

Validation: full non-integration suite **1.509 test / 200 dosya**, domain/web TypeScript, web Vite build (328 modül), **19 dosyalık mevcut UX Lab scoped lint**, Node script syntax, Git whitespace, AI Coach + Coach preview + Planning V2 shadow + Canonical Planner read-only safety PASS. Repository-wide ESLint tanımlı değildir; scoped lint bu kapsamda raporlanır. Windows restricted token pnpm junction çözümlemesinde false missing-export üretti; aynı kontroller normal kullanıcı erişimiyle geçti, tip/config kaçışları eklenmedi. Production distribution'da fixture native ID, credential marker, Lab/DEV review girişleri yok.

Dry-run (write yok):

```powershell
node scripts/setup-local-video-acceptance-fixture.mjs --profile-id a9cb4d62-5d48-4bdd-a17d-ae8c6f240f31
```

Apply için dedicated LOCAL fixture parolasını yalnızca `KPSS_VIDEO_ACCEPTANCE_PASSWORD` environment variable'ında sağlayıp aynı komuta `--apply` ekle. Parola/JWT/private key raporda veya evidence'ta bulunmaz. Hesap yoksa normal local Auth sign-up kullanılır; mevcut hesabın parolası değiştirilmez. Helper replay progress/session/task durumunu korur. Fixture tarihini Europe/Istanbul current date/week'ten üretir; başka günde yeni deterministic günlük task oluşturur.

Frontend: `apps/web` içinde `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort`. Yerel Edge: repository'nin `node scripts/run-supabase.mjs functions serve --env-file <yalnızca-local-geçici-env>` workflow'u; test env dosyası sadece comment içerir, local CLI ayarları enjekte eder. Serve için production env yükleme veya JWT bypass flag'i kullanma. Dev servisleri açıkken [gerçek ürün root](http://127.0.0.1:5174/) dedicated local oturumla incelenebilir. Yeni temiz checkout'ta uyumlu local Edge/PostgREST sürümlerini ve fixture'ı ayrıca hazırla; bu rapor production runtime yükseltmesi yetkisi değildir.

Kanıtlar: [final API + read-only DB chain](ux-lab-evidence/frontend-migration/video-recovery-final-evidence.json), [fixture replay](ux-lab-evidence/frontend-migration/video-recovery-fixture-replay.json), [checkpoint cadence](ux-lab-evidence/frontend-migration/video-recovery-checkpoint-cadence.json), [paused refresh stability](ux-lab-evidence/frontend-migration/video-recovery-refresh-stable-db.json), [finish DB](ux-lab-evidence/frontend-migration/video-recovery-finished-db.json), [missing mapping DB/restore](ux-lab-evidence/frontend-migration/video-recovery-missing-mapping-db.json), [missing mapping UI](ux-lab-evidence/frontend-migration/video-recovery-missing-mapping-ui.json), [PostgREST replacement](ux-lab-evidence/frontend-migration/video-recovery-postgrest-runtime.json), [60 fresh-token requests](ux-lab-evidence/frontend-migration/video-recovery-postgrest-auth-cycles.json), [final console](ux-lab-evidence/frontend-migration/video-recovery-final-console.json), [regression](ux-lab-evidence/frontend-migration/video-recovery-regression-results.json). Ekranlar: `video-recovery-youtube-paused.png`, `video-recovery-focus-playing.png`, `video-recovery-refresh-paused.png`, `video-recovery-missing-mapping.png`, `video-recovery-finished-today.png`.

**Production: NOT DEPLOYED.** Yeni schema, migration, ikinci video tracking sistemi, production SQL/mutation, remote push/merge yok. Backend endpoint contract'ları ve canonical/resource truth bu recovery'de değiştirilmedi. Playlist selection/remote sync, segment coverage ve physical page journey bu video kabulünün dışındadır.

## Tarihsel tekrar denemesi — 2026-10-05, recovery öncesi

**AUTHENTICATION PASS / ACCEPTANCE BLOCKED / NOT DEPLOYED.** Aşağıdaki sonuçlar bu tekrar denemesine aittir; dosyanın sonundaki önceki servis-kapalı raporu tarihsel kayıt olarak korunmuştur. Çalıştırılmayan adımlar `NOT RUN`; runtime sonucu yerine unit testlerden PASS türetilmedi.

### Local environment

**BLOCKED — authenticated application API hazır değil.** Docker artık `C:\Users\drlme\AppData\Local\Programs\DockerDesktop` kullanıcı kurulumundan çalışıyor. Frontend `127.0.0.1:5174`, Supabase/Auth `127.0.0.1:54321`, DB `127.0.0.1:54322` açık. Auth health HTTP 200; repository `kpss-coach` local status ve `.env.local` yalnızca `127.0.0.1` gösteriyor. `lib/supabase.ts` ve `lib/app-api.ts` aynı local endpointi kullanıyor.

İlk app-api isteği 503 dönüyordu. Repository'nin `scripts/run-supabase.mjs functions serve app-api --env-file <temporary-local-env>` workflow'uyla local Functions runtime başlatıldı. Geçici env dosyası yalnızca açıklama satırı içeriyor; ayarlar local CLI tarafından enjekte ediliyor. Production env/provider secret yüklenmedi. Runtime `supabase-edge-runtime-1.69.1 / Deno v2.1.4`. JWT config'i `true` kaldı; `--no-verify-jwt` veya sahte/helper JWT kullanılmadı.

Anonim istek artık beklenen 401 dönüyor. Gerçek ES256 Auth token'ıyla Today istekleri de 401 `Invalid JWT` dönüyor. Platform logunun kök hatası: `Key for the ES256 algorithm must be of type CryptoKey. Received an instance of Uint8Array`. Hata app-api handler'ından önce, platform JWT doğrulamasında oluşuyor. Kullanıcıya bu raw hata gösterilmiyor.

### Authentication

**PASS.** Gerçek product root `http://127.0.0.1:5174/` üzerinden mevcut W6 owner fixture hesabıyla LoginPage sign-in yapıldı; browser protected Today root'una geçti ve mevcut active profile okundu. Fixture credential sözleşmesi `tests/integration/planner-v2-proposal-lifecycle.test.ts` `register` helper'ından alındı. Yeni kullanıcı veya parola yaratılmadı/değiştirilmedi. Local SDK sign-in teşhisi de aynı user identity ve ES256 token algoritmasını doğruladı. Parola/token bu raporda yok.

### Canonical video resolution

**NOT RUN / FIXTURE BLOCKED.** Authenticated Today verisi yüklenemedi. Salt okunur local DB denetimi:

- 130 Auth user, 129 exam profile, 71 resource, 22 weekly plan, 148 task mevcut.
- 8 aktif catalog video kaydında **0 native YouTube playback ID** var. Değerler integration testlerinin `w6-<uuid>`, `full-<uuid>`, `segment-<uuid>` sentetik kimlikleri.
- 4 full-video task'ın 2'si cancelled, 2'si ready. Ready task'lar 2026-09-14–2026-09-20 haftasına ait. Local DB tarihi 2026-10-05; **bu haftada 0 canonical video task** var.
- İki ready task'ın resource/video sahipliği doğru ve validated video-topic mapping mevcut. Ancak resource→playlist `topic_resource_links` bağlantısı yok; `canonical_material_view_id` gerçek persisted mapping UUID'siyle eşleşmiyor (`mapping:map-1` integration sentinel).

Katalog kimliği/URL'si, task tarihi, link, mapping veya canonical boundary değiştirilmedi. Hardcoded gerçek video eklenmedi.

### Correct-video protection

**NOT RUN.** Geçerli authenticated task-video journey başlamadı. Browser'da iframe sayısı 0; başka video veya fallback üretilmedi. Bu gözlem ayrı missing-mapping runtime PASS'ı değildir.

### Playback

**NOT RUN.** Play/pause/seek ve player state, API ve gerçek fixture engelleri nedeniyle test edilemedi. Autoplay kısıtı hakkında bug sonucu üretilmedi.

### Progress persistence

**NOT RUN.** Video progress PUT/checkpoint yapılmadı; write cadence veya pause/end save ölçülmedi.

### Refresh/resume

**NOT RUN.** Gerçek progress persist edilmeden resume/tolerance kabulü verilmedi.

### Today → Focus continuity

**NOT RUN.** API/fixture engeli çözülmeden video/Focus journey başlatılmadı. Lab simulation ve DEV live-video preview gerçek product acceptance yerine kullanılmadı.

### Session integration

**NOT RUN.** Study session başlatılmadı; timer/player context ve session pause/resume ölçülmedi.

### Finish

**NOT RUN.** Session finish, completion veya duplicate progress testi yapılmadı.

### Playlist navigation

**NOT SUPPORTED — exact canonical task player içinde next/previous.** Mevcut player exact task'ı kendi videosuyla sınırlar. Resource browser navigation'ı mevcut, ancak runtime testi yapılmadı. Yeni feature eklenmedi.

### Page + video coexistence

**NOT RUN.** Mixed-material authenticated journey başlamadı; runtime fixture availability için `NOT AVAILABLE` varsayımı yapılmadı.

### Error states

**PARTIAL OBSERVATION / video cases NOT RUN.** Gerçek Today'de `Veriler yüklenemedi.` ve `Tekrar Dene` görünüyor. UUID, canonical ID, API reason code veya stack trace normal sayfaya basılmadı. Missing mapping, invalid playback identity, unavailable video ve player error ayrı ayrı runtime kabulü almadı.

### Console/network

**FAIL — local application API reads.** Gerçek local Auth oturumuyla `/weekly-plan/current`, `/study-sessions/active`, `/execution/summary`, `/p48/roadmap` GET'lerinin tamamı 401 `Invalid JWT` döndü. Browser console `TODAY_LOAD_FAILED` ve `ROADMAP_LOAD_FAILED` kaydetti; ilk DEV mount sırasında hata kayıtları tekrarlandı. UI retry döngüsü başlatılmadı. Video write frequency ölçülemedi. Production Supabase/application API kullanılmadı; fallback video request oluşturulmadı.

### DB verification

**PASS — local read-only fixture/identity preflight; requested playback/session persistence NOT RUN.** Sorgular yalnızca `127.0.0.1:54322` üzerinde `BEGIN READ ONLY` transaction'larıyla çalıştırıldı. Task→resource→video→playlist→mapping sahipliği ve link eksikleri doğrulandı.

| Domain kayıtları | Önce | Sonra |
| --- | ---: | ---: |
| tasks | 148 | 148 |
| weekly_plans | 22 | 22 |
| youtube_video_progress | 3 | 3 |
| study_sessions | 48 | 48 |

Normal gerçek sign-in'in Auth session/last-sign-in kayıtları bu domain sayımlarından ayrıdır. Application data veya SQL mutasyonu yapılmadı.

### Bugs fixed

- 503 durumundaki local Functions runtime mevcut workflow ile başlatıldı; uygulama kaynak kodu değişmedi.
- ES256 platform verifier sorunu düzeltilmedi; JWT koruması kapatılmadı.
- Sentetik/past-week fixture'lar gerçek video kabulü için yeniden yazılmadı.

### Remaining blockers

1. Gerçek ES256 Auth token'ını kabul eden local Edge runtime gerekiyor; authenticated application reads şu an 401.
2. Native YouTube ID taşıyan mevcut local catalog kaydı gerekiyor; valid count 0.
3. Güncel haftaya ait gerçek full-video task, aynı owned resource→playlist link'i ve persisted canonical mapping view identity gerekiyor.

Bu engeller varken gerçek authenticated playback + persistence doğrulanamaz; **GREEN verilmedi**. Yeni feature/schema/migration, DB reset, hardcoded video veya fixture provisioning yapılmadı. Local runtime çalışır bırakıldı.

### Regression status

Önceki source doğrulaması: **199 dosya / 1494 test PASS; typecheck PASS; build PASS**. Kanıt: `ux-lab-evidence/frontend-migration/video-integration-regression-results.json`. Bu acceptance turunda uygulama kodu değişmedi ve regression yeniden çalıştırılmadı. Unit/build sonuçları runtime acceptance yerine kullanılmadı.

### Production state

**NOT DEPLOYED.** Production Supabase/API/DB, credential, SQL ve remote fallback kullanılmadı. Deploy, migration, schema veya application data mutation yapılmadı. Normal gerçek local Auth sign-in dışında veri yazılmadı.

Kanıt: `ux-lab-evidence/frontend-migration/video-authenticated-acceptance-evidence.json` ve gerçek product root ekranı `video-authenticated-today-blocked.png`.

---

## Önceki servis-kapalı deneme — tarihsel kayıt

Tarih: 2026-10-05. Sonuç: **BLOCKED — acceptance GREEN değil.**

Kullanıcının “Local environment hazır değilse BLOCKED olarak dur” talimatı uygulanmıştır. Ortam kontrolü sırasında yerel Supabase/Auth ve veritabanına ulaşılamadı. Bağımlı runtime adımlarına geçilmedi. Çalıştırılmayan adımlar `NOT RUN` olarak gösterildi; bunlar ürün hatası olarak `FAIL` veya doğrulanmış sonuç olarak `PASS` sayılmadı.

### Local environment

**BLOCKED**

| Kontrol | Gözlenen sonuç |
| --- | --- |
| Frontend `127.0.0.1:5174` | TCP bağlantısı açık |
| Supabase/Auth `127.0.0.1:54321` | TCP bağlantısı kapalı |
| Local DB `127.0.0.1:54322` | TCP bağlantısı kapalı |
| Docker CLI | `Get-Command docker` sonuç vermedi |
| Standart Docker CLI kurulumu | `C:\Program Files\Docker\Docker\resources\bin\docker.exe` yok |
| Standart Docker Desktop kurulumu | `C:\Program Files\Docker\Docker\Docker Desktop.exe` yok |
| Docker işlemleri | `Docker Desktop`, `com.docker.backend`, `dockerd` bulunamadı |
| Supabase komutu | Global komut mevcut; repository ayrıca kendi local CLI wrapper'ını kullanıyor |

`apps/web/.env.local` içindeki `VITE_SUPABASE_URL` yalnızca `http://127.0.0.1:54321` adresini gösteriyor. Anahtar/credential değerleri rapora veya tool çıktısına alınmadı. `apps/web/src/lib/supabase.ts` bu adresle client oluşturuyor; `lib/app-api.ts` API adresini aynı değişkenden `/functions/v1/app-api` ekiyle kuruyor. `supabase/config.toml` local API/DB portlarını 54321/54322 ve Auth API hostunu `http://127.0.0.1` olarak tanımlıyor. Ayrı remote API fallback kullanılmadı.

Mevcut workflow (`scripts/run-supabase.mjs`, `supabase-command.mjs`, `supabase-status.mjs`) okundu. Docker kullanılabilir olmadığı ve local servis portları kapalı olduğu için `supabase:start` çalıştırılmadı. Database reset, kurulum, fixture provisioning ve migration çalıştırılmadı.

### Authentication

**NOT RUN — local environment BLOCKED.** Gerçek local kullanıcıyla giriş yapılmadı. Sahte session/token, production credential veya integration-test JWT helper'ı gerçek browser auth yerine kullanılmadı.

### Canonical video resolution

**NOT RUN — local environment BLOCKED.** Local Today verisi ve mevcut canonical task/material/resource/video/playlist kayıtları yüklenemedi. Test için video URL veya video ID üretilmedi.

### Correct-video protection

**NOT RUN — local environment BLOCKED.** Runtime missing-mapping fixture'ı incelenemedi. Önceki resolver unit testleri gerçek authenticated runtime kabulünün yerine sayılmadı.

### Playback

**NOT RUN — local environment BLOCKED.** Gerçek product root içinde play/pause/seek ve YouTube player state test edilmedi. Browser autoplay kısıtları hakkında bug sonucu üretilmedi.

### Progress persistence

**NOT RUN — local environment BLOCKED.** Mevcut progress endpointine PUT yapılmadı; checkpoint persistence ve write frequency ölçülmedi.

### Refresh/resume

**NOT RUN — local environment BLOCKED.** Persist edilmiş gerçek local video progress ile route dönüşü/refresh sonrası resume doğrulanmadı.

### Today → Focus continuity

**NOT RUN — local environment BLOCKED.** Aynı task/video/resource/progress ve player continuity runtime'da doğrulanmadı. UX Lab simulation veya DEV live-video inceleme ekranı bu product acceptance yerine kullanılmadı.

### Session integration

**NOT RUN — local environment BLOCKED.** Study session başlatılmadı; session timer, player ve pause/resume lifecycle ölçülmedi.

### Finish

**NOT RUN — local environment BLOCKED.** Session finish, video progress korunması ve duplicate completion kontrol edilmedi.

### Playlist navigation

**NOT SUPPORTED — exact canonical task player içinde next/previous.** Mevcut implementation görevi kendi exact videosuna sınırlar; kaynak browser'ında liste/next/previous vardır. Kaynak browser navigation'ı bu turda runtime test edilmedi. Yeni navigation feature eklenmedi.

Kaynak: `apps/web/src/components/VideoPlayerDrawer.tsx` içindeki `locked` sınırı ve `selectedVideo && !locked` series controls.

### Page + video coexistence

**NOT RUN — local environment BLOCKED.** Gerçek mixed fixture bulunup bulunmadığı local DB'den doğrulanamadı; `NOT AVAILABLE` varsayımı yapılmadı.

### Error states

**NOT RUN — local environment BLOCKED.** Missing mapping, invalid identity, unavailable video ve network/player error gerçek product journey içinde çalıştırılmadı. Önceki source/unit korumaları runtime PASS sayılmadı.

### Console/network

**NOT RUN — product journey başlamadı.** Bu turda yalnızca local TCP/config preflight yapıldı. Authenticated browser journey için uncaught exception, repeated failures, fallback video request veya excessive progress write ölçülmedi. Production API/Supabase kullanılmadı.

### DB verification

**NOT RUN — local DB `127.0.0.1:54322` kapalı.** Progress row, user/profile ownership, session linkage veya completion için SQL sorgusu çalıştırılmadı. Production DB'ye bağlanılmadı.

### Bugs fixed

Yok. Runtime acceptance engellendiği için yeni bug sonucu veya feature değişikliği yapılmadı. Önceki audit/wiring kaynak kodu korundu.

### Remaining blockers

- Kullanılabilir Docker engine / Docker CLI bu ortam kontrolünde bulunamadı.
- Local Supabase/Auth/DB servisleri çalışmıyor.
- Mevcut local user ve canonical fixtures servisler kapalı olduğu için doğrulanamadı.

Devam için çalışan yerel Docker/Supabase ortamı ve mevcut local kullanıcı/fixtures gerekir. Sonraki kabul turu gerçek application root'tan (`http://127.0.0.1:5174/`) başlamalı; Lab simulation üzerinden GREEN verilmemeli. Yeni schema, test videosu veya fixture üretimi bu turun kapsamına eklenmedi.

### Regression status

Son tamamlanan wiring doğrulaması: **199 dosya / 1494 test PASS; typecheck PASS; build PASS.** Kanıt: `ux-lab-evidence/frontend-migration/video-integration-regression-results.json` ve `VIDEO_INTEGRATION_AUDIT.md` doğrulama bölümü.

Bu kabul turunda uygulama kodu değişmedi ve regression yeniden çalıştırılmadı. Bu önceki kontroller gerçek local authenticated playback/persistence kabulü değildir.

### Production state

**NOT DEPLOYED**

Production Supabase/API/DB, production credential, production SQL veya remote fallback kullanılmadı. Deploy, database reset, migration ve veri mutasyonu yapılmadı.
