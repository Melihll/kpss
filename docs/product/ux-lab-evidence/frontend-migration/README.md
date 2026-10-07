# Frontend migration — yerel kanıtlar

## Gerçek LOCAL video recovery kabulü — 2026-10-05

**LOCAL VIDEO ACCEPTANCE GREEN / NOT DEPLOYED.** `video-recovery-*` kanıtları gerçek product root, dedicated local Auth ve gerçek YouTube playback içindir. Aşağıdaki eski `desktop-*`, `tablet-*`, `mobile-*` dosyaları ise B Lab tasarım fixture'larına aittir; bu iki kanıt grubu birbirinin yerine kullanılmaz. [Tam kabul raporu](../../VIDEO_LOCAL_AUTHENTICATED_ACCEPTANCE.md).

| Dosya | Kanıt |
| --- | --- |
| `video-recovery-api-evidence.json` | İlk gerçek ES256/JWKS signature, altı local application API ve canonical task contract |
| `video-recovery-final-evidence.json` | Son API cevapları, read-only owned DB/canonical adapter zinciri; eski PostgREST 14.15 hataları resolved kayıt |
| `video-recovery-fixture-replay.json` | 0 insert / 18 reuse / 0 update; task status/progress/session korunur |
| `video-recovery-start-db.json`, `video-recovery-paused-db.json`, `video-recovery-finished-db.json` | Aynı session start/break/finish; tek progress, completed session, partially completed task |
| `video-recovery-checkpoint-cadence.json` | 30 saniyede yedi DB okuması; yaklaşık 16 sn checkpoint ve yalnızca iki update |
| `video-recovery-refresh-stable-db.json` | Paused refresh'te 277 sn sabit ve aynı açık break; ardından gerçek resume |
| `video-recovery-missing-mapping-db.json`, `video-recovery-missing-mapping-ui.json` | Kontrollü owned link detach + restore; 0 iframe, güvenli unavailable |
| `video-recovery-postgrest-runtime.json` | Same-env official local 14.18 patch; eski container korunmuş, mount/host port/DB volume değişikliği yok |
| `video-recovery-postgrest-auth-cycles.json` | Bekleme/retry olmadan 10 yeni Auth login, 60/60 protected API read |
| `video-recovery-final-console.json` | Fix sonrası güncel console temiz; önceki giderilmiş SDK hatası açıkça tarihsel ayrılmış |
| `video-recovery-regression-results.json` | 200 dosya, 1509/1509 non-integration tests PASS |
| `video-recovery-validation-summary.json` | Typecheck/build/scoped lint/security, fixture safety, runtime ve ölçüm sınırları |
| `video-recovery-youtube-paused.png`, `video-recovery-focus-playing.png`, `video-recovery-refresh-paused.png` | Gerçek YouTube/native state, Focus ve paused refresh ekranları |
| `video-recovery-missing-mapping.png`, `video-recovery-finished-today.png` | Güvenli unavailable ve bağlantı geri yüklenmiş Today/progress |

Bu kabul tüm frontend migration checklist'ini, remote playlist sync veya physical page akışını kapsamaz. Production deploy, SQL/mutation/migration yapılmadı. Token/private key/parola bu kanıtlarda yoktur.

## Tarihsel B Lab migration görsel kanıtı

2026-10-05 · **NOT DEPLOYED**

Buradaki uygulama ekranları B Lab örnek verileriyle çekilmiştir. Navbar gerçek ürünle ortak `TopNavigation` bileşenidir; timer, kitap, video ve plan verileri Lab simülasyonudur. Bunlar authenticated gerçek ürün smoke sonucu olarak yorumlanmamalıdır.

| Dosya | Kanıt |
| --- | --- |
| `desktop-today.png` / `desktop-focus.png` | 1440×900, ortak navigation ve sidebar olmadan kontrollü workspace |
| `desktop-week.png`, `desktop-resources.png`, `desktop-progress.png`, `desktop-roadmap.png`, `desktop-coach.png` | B ekranları ve ortak navbar |
| `desktop-sticky.png` | Scroll sırasında navbar üstte; gözlenen nav top 0, scrollY ≈471 |
| `desktop-account-review.png` | Hesap dialog'u; örnek profil olduğu açıkça belirtilir |
| `tablet-today.png`, `tablet-focus.png`, `tablet-menu.png` | 834×1112, link sıkıştırmadan menü erişimi |
| `mobile-today.png`, `mobile-focus.png`, `mobile-menu.png`, `mobile-coach.png` | 390×844, mobile sheet/Coach ve stacked materyal alanı |
| `product-login-blocker.png` | Gerçek `/settings#profile` isteği oturum olmadığından `/login` ekranına yönlenir |
| `responsive-matrix.json` | Yüklenmiş 21 B görünümünün DOM ölçümleri; overflow 0, video 1.778 |
| `regression-results.json` | 196 test dosyası, 1463/1463 non-integration test |
| `validation-summary.json` | Derleme, güvenlik, browser kontrolleri ve environment engeli |

Desktop beş navigation linki ve tek aktif destination kontrol edildi. Tablet/mobile menü açıldı; Haftam linki sheet'i kapattı. Mobil menüden Koç açıldı. Tab/Shift+Tab dialog içinde döndü, Escape kapattı ve odağı tetikleyiciye geri verdi. Desktop hesap için Escape dönüşü de geçti. Kaynaklar üzerinde reload, Week'e back ve tekrar Resources'a forward doğru URL/aktif route verdi. Focus deep link ve Bugüne dön kullanıldı.

Görsel inceleme: navbar tek satır, içerik sınırları doğru, Today video/kitap düzeni desktop'ta iki alan; mobile'da üst üste. Native menu top-layer'da, Coach sheet navbar üzerinde. Review toolbar ayrı siyah yüzeydir ve scroll ile normal akışta gider. Bu görevdeki görsel matrix B'ye aittir; A/C markup'ı değiştirilmedi.

Full authenticated ürün testi bekliyor: localhost Auth bağlantısı yok, Docker bulunmuyor. Gerçek video checkpoint'i, fiziksel finish write'ı, haftalık mutation, Coach capability cevabı ve gerçek profile/logout tarayıcı smoke'u bu kanıtların içinde **yoktur**.

Uygulama/API haritası, mevcut manuel replacement sınırı ve kalan checklist: [FRONTEND_MIGRATION.md](../../FRONTEND_MIGRATION.md).
