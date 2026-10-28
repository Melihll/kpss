# Engineering System v1

Durum: **Engineering System v1 TAMAMLANDI.** ENG-001–ENG-003 altyapı işleri kapalı; ENG-004 dokümantasyon kapanışı bağımsız review için hazırdır.
Tarih: 28 Ekim 2026, Europe/Istanbul.

Bu sistem mevcut pnpm/Vitest/Supabase araçlarını ve mimariyi kullanır. Migration ve Application CI kuruludur; `develop` branch protection aktiftir. Roller görev sorumluluklarıdır; yeni agent framework'ü veya otomatik delegasyon yoktur. Ürünün AI Coach/Planner yetkileri geliştirme agent'larına üretim erişimi vermez. Sonraki odak KPSS Koçu'nun ürün geliştirmesidir; ürün önceliği ve dar görev sözleşmesi kullanıcı kapsamıyla belirlenir.

## A. Görev yaşam döngüsü

`BACKLOG → READY → BUILDING → REVIEW → ACCEPTED → RELEASED`

| Durum | Geçiş koşulu |
| --- | --- |
| BACKLOG | Kullanıcı problemi ve öncelik kayıtlıdır. |
| READY | Planner görev sözleşmesini, başlangıç kaynağını ve kontrol kapsamını netleştirir; mevcut kullanıcı yetkisi kapsamında başlanabilir. |
| BUILDING | Builder izole branch/worktree'de yalnız izinli kapsamı uygular. |
| REVIEW | Diff, kaynak kimliği ve doğrulama kanıtı hazırdır; bağımsız reviewer inceler. |
| ACCEPTED | Gerekli kontroller ve bağımsız review tamamdır; Product Owner kapsamı kabul eder. Bu durum production onayı değildir. |
| RELEASED | Yalnız yayınlanan kapsam için ayrı onay, deploy sonucu ve gereken acceptance/gözlem kanıtı kaydedilmiştir. |

Review düzeltmesi BUILDING'e döner. Eksik bağımlılık ilgili adıma BLOCKED notu olarak yazılır; kanıtsız ilerleme yapılmaz. Yayın gerektirmeyen görev ACCEPTED olarak kapanabilir; RELEASED uydurulmaz. CURRENT_SPRINT aynı anda en fazla üç aktif görev taşır.

## B. Küçük görev sözleşmesi

Her görevde şu alanlar bulunur; kısa görevde tek bir kompakt kayıt yeterlidir:

- **Task ID:** backlog veya kullanıcı kapsamıyla ilişkilendirilen sabit kimlik.
- **Kullanıcı problemi:** hangi somut sorun çözülüyor?
- **Beklenen sonuç:** gözlenebilir davranış veya belge çıktısı.
- **İzinli dosyalar:** açık kaynak dosyası/dizin listesi; başlangıç branch/HEAD'i ve korunacak çalışmalar.
- **Kapsam dışı işlemler:** özellikle production, migration, veri, görsel veya altyapı sınırları.
- **Kabul kriterleri:** reviewer'ın doğrulayabileceği sonuçlar.
- **Gerekli testler:** görev sınıfına göre komutlar/kontroller; yasak veya uygulanamaz kontrollerin nedeni.
- **Risk seviyesi:** düşük / orta / yüksek; planner-accounting ve DB/yetki etkisi ayrıca belirtilir.

Ayrı bir plan belgesi, her rol için yeni dosya veya sıradan işte kapsamlı audit zorunlu değildir. Kullanıcının açık isteği yeterli sözleşmeyi zaten sağlıyorsa yeniden onay döngüsü oluşturulmaz.

## C. Roller

| Rol | Sorumluluk ve sınır |
| --- | --- |
| Product Owner | Kullanıcı; problemi, önceliği, kapsam değişimini, ürün kabulünü ve ayrı production yetkisini belirler. |
| Planner / Tech Lead | Handoff/ADR/kodu okur; en küçük uygulanabilir planı, dosya sınırlarını, riski ve gate'leri belirler. Tamamlanan evreleri yeniden açmaz. |
| Builder | Kapsamı uygular; uygun kontrolleri çalıştırır, diff ve öğrenme notunu teslim eder. Kendi çıktısını bağımsız onaylayamaz. |
| Independent Reviewer | Aynı base/HEAD ve dirty diff'i bağımsız inceler; kabul, kapsam, risk ve kanıtı kontrol eder. Bulgu/eksik kanıtı açıklar; kapsamı veya production yetkisini kendiliğinden genişletmez. |

Bağımsız review, başka bir reviewer/ayrı inceleme çalışmasıdır; otomatik agent başlatma gerektirmez. Kullanıcı sonraki review'ı ayrıca başlatabilir. Reviewer mevcut doğrulama kanıtını kullanır; tekrar yalnız değişiklik, başarısızlık veya açık risk gerektiriyorsa yapılır.

## D. Git ve worktree akışı

1. HEAD/branch, staged/modified/untracked, yerel upstream ref'i ve worktree listesi kontrol edilir. Görevde sabitlenen başlangıç değişmişse ilgili adım durur.
2. Görev başına ayrı worktree ve `codex/<task>-<konu>` branch kullanılır. Dirty checkout, landing ve recovery/release worktree'leri korunur; otomatik stash/reset/clean/toplu add yoktur.
3. Builder yalnız izinli diff'i teslim eder. Untracked yeni dosyalar da incelemeye dahil edilir; staged olmadığı için görünmez bırakılmaz.
4. Bağımsız review ve kullanıcı yetkisi sonrasında **Feature → PR → develop**. Aktif branch protection ve zorunlu `migration-replay` / `application` kontrolleri korunur. Commit/push/PR/merge yetkisi görevdeki açık sınırı aşamaz.
5. Production için ayrı temiz release branch/worktree ve yalnız kabul edilen kapsam hazırlanır. `develop`ün tamamı otomatik yayınlanmaz. Git `main` veya Pages branch metadata'sı tek başına production kaynağını kanıtlamaz.
6. Acil hotfix yalnız açık kullanıcı kapsamıyla, doğrulanmış production kaynak/artifact temelinden ayrılır. Minimum değişiklik, bağımsız review, recovery ve uygun kontroller korunur; gerekiyorsa kabul edilen düzeltme daha sonra develop'a ayrı reviewed PR ile taşınır. Dirty kaynak veya çözülemeyen provenance ile yeni yayın GO verilmez.

Worktree kaynak izolasyonudur; DB, port, container, auth veya secret izolasyonu değildir. Mevcut LOCAL resetlenmez. DB testleri ayrı atılabilir ortam ve sentetik actor kullanır; test kaynakları/kayıt koruma sınırı önceden belirtilir.

## E. Gate matrisi

`develop` hedefli her PR'da iki zorunlu GitHub Actions job'u çalışır; workflow'larda path filtresi yoktur:

- [`migration-replay`](../../.github/workflows/migration-replay.yml): offline migration/Docker güvenlik fixture'ları ve sabit image ile izole PG17 replay. Ayrıntı ve sınırlar: [CANONICAL_PG17_REPLAY](CANONICAL_PG17_REPLAY.md).
- [`application`](../../.github/workflows/application-ci.yml): kilitli bağımlılık kurulumu, `pnpm test` (integration hariç), `pnpm typecheck`, `pnpm build`.

Her iki CI için PASS ve `develop` branch protection'ın aktif olduğu 28 Ekim kapanışında kullanıcı tarafından bildirildi; PR #6 ve #7 merge edilmiştir. Branch ayarı repo dosyalarından doğrulanamaz; bu dokümantasyon işi canlı ayar/CI sorgusu veya yeniden koşu yapmaz. CI PASS bağımsız review, göreve özel integration/browser/safety kontrolleri veya production release gate'lerinin yerine geçmez.

Aşağıdaki ek kontroller görev ve riskle orantılı seçilir ve gerçek sonuçları kaydedilir. Dokümantasyon için yerel hafif kontrol yeterlidir; ileride açılacak PR yine iki zorunlu CI kontrolünden geçer.

| Aşama | Gerekli kapsam / mevcut araç |
| --- | --- |
| Dokümantasyon | İzinli diff, bağlantı/tutarlılık incelemesi ve `git diff --check`; yeni untracked belgelerin diff'i de dahil. Test/build gerekmez. |
| Hızlı geliştirme | İlgili unit testleri için `pnpm exec vitest run <unit-test-path> --exclude "tests/integration/**"`; ilgili web/domain typecheck. |
| PR — uygulama | Zorunlu Application CI test/typecheck/build çalıştırır; değişen alan için ilgili mevcut safety/UI ve integration kontrolleri ayrıca gerekir. Genel bir `pnpm lint` script'i varsayılmaz. |
| DB/migration veya writer | Zorunlu migration CI'ya ek olarak bağımsız exact SQL incelemesi; izole DB'de değişikliğe özel uyumluluk ve owner/ACL/RLS/constraint/transaction/stale/retry/concurrency testleri; etkilenen integration suite'leri. PG17 test ortamı production uyumluluğunu kanıtlamaz. |
| Release preflight | Exact temiz kaynak kimliği ve kapsam; artifact manifest/hash; migration provenance ve beklenen pending liste; uyumlu API/web/DB sırası; doğrulanmış recovery; rollback/forward-fix, owner ve kullanıcı onayı. Web için `pnpm build:release` ve mevcut production artifact taraması. |
| Production acceptance | Ayrıca yetkilendirilmiş hesap/işlem ve önceden tanımlı smoke/gözlem; sürüm/artifact kimliği, accounting ve veri/yetki sınırları. Eksik senaryo PARTIAL/NOT EXECUTED kalır; LOCAL PASS production PASS olmaz. |

Mevcut araç seçimi (`origin/develop` db65a84 kaynak ağacı):

- Hedef branch'te mevcut: `pnpm test:integration` LOCAL Supabase durumundan ortam alır; `node scripts/run-s0-safety-tests.mjs <test-path>` S0 kontrollerini çalıştırır. İşe göre mevcut runner seçilir; bu komutlar bu belgeyle çalıştırılmış sayılmaz.
- Hedefte mevcut RLS/auth ve writer boundary örnekleri: `tests/integration/auth-rls.test.ts` ve `tests/integration/s0-r2-plan-writer-boundary.test.ts`. Suite adının varlığı yeni migration/ACL kapsamını otomatik kanıtlamaz.
- **LOCAL-only / pending integration:** `scripts/run-manual-week-plan-tests.mjs` (0c3a694) ve `tests/integration/session-duration-integrity.test.ts` (742ca9e) bu kaynak ağacında yoktur. DB48 SQL kaynaklarının geri kazanılması bu ürün commit'lerinin, runner veya testlerinin entegre edildiği anlamına gelmez. Seri veri-koruma ve süre/accounting regresyonu gereksinimleri devam eder; ilgili ürün değişikliği için gerekli kontrol eksikse PASS verilmez.
- İlgili mevcut safety script'leri: `pnpm test:ai-coach-safety`, `test:ai-coach-plan-preview-safety`, `test:ai-economics-safety`, `test:planning-v2-shadow-safety`, `test:canonical-planner-v2-readonly-safety` ve `node scripts/check-coach-context-v1-readonly-safety.mjs`.
- `pnpm lint:ux-lab` yalnız ilgili UX Lab kapsamındadır. Tarihsel `check-ai-coach-6g-local-acceptance.mjs` güncel zorunlu gate değildir; eski marker uyumsuzluğu CONCEPT_B_RELEASE_FREEZE.md'de kayıtlıdır.
- Gerçek pointer/browser kabulü gerektiğinde `tests/browser/README.md` kullanılır. Global LOCAL hash karşılaştıran testler eşzamanlı yazan suite'lerle çalıştırılmaz.

Temiz clone için sürümlenen belgeler, package.json/lockfile ve script'ler temel alınır. Ignored `.release/`, özel hesap veya mevcut LOCAL stack hazır varsayılmaz; eksik runtime ilgili kontrolü BLOCKED yapar. Paylaşılan LOCAL'de reset veya mevcut private kanıtı repoya kopyalama çözüm değildir. [DB48 kaynak eşlemesi](MIGRATION_PROVENANCE.md) ve [izole PG17 replay](CANONICAL_PG17_REPLAY.md) tamamdır; değişmemiş canonical SQL'in temiz kurulumu, PG15/tam Supabase runtime ve production uyumluluğu kanıtlanmış değildir. Production exact kaynak eşlemesi ve ürün kabul açıkları [handoff](PROJECT_HANDOFF.md#ux-v3-local-state) içinde korunur.

## F. İnsan onayı ve production sınırı

Ayrı açık kullanıcı onayı gerektiren işlemler:

- Production migration / DDL ve veri yazımı / data repair.
- API veya web deployment.
- Güvenlik/özellik gate'lerinin değişmesi.
- Yetki, rol veya secret değişikliği.
- Production okuması ve kabul smoke'u için belirtilen hesap/endpoint/veri kapsamı.

Onay exact kaynak/artifact veya SQL, hedef ortam/servis ve işlem kapsamına bağlanır. Genel görev, preview, test veya önceki yayın onayı yeni production işlemini yetkilendirmez. Zaten verilmiş aynı kapsam yetkisi tekrar sorulmaz; yeni hedef/sapma ilgili adımı durdurur.

Planner/Builder/Reviewer production credential'ı devralmaz; production env/profile/backup açmaz. Gerekli production işlemi ayrıca yetkilendirilmiş operatör bağlamında, sırları raporlamadan yapılır. Bu dosya erişimi teknik olarak sandbox'layan bir altyapı değildir; görev ve araç yetkileri aynı sınırı korumalıdır.

## G. Teslim ve öğrenme

Her anlamlı görev sonunda kısa kayıt:

- Sonuç ve lifecycle durumu; branch/base/HEAD, değişen dosyalar ve reviewer'ın inceleyeceği diff.
- Kontrollerin gerçek sonucu; çalıştırılmayanlar, risk/belirsizlik ve korunan çalışmalar.
- **Mimari karar / neden / teknik öğrenme:** ne seçildi, neden mevcut sisteme uyuyor ve geliştirici hangi teknik ilişkiyi anlamalı? Birkaç cümle yeterlidir.

## Engineering System v1 kapanış kaydı — ENG-004

| Tamamlanan iş | Kapanış dayanağı |
| --- | --- |
| ENG-001 — foundation ve hedef uyarlama | PR #2 MERGED, a81d136. Özgün 4e6a284 bağımsız review PASS kaydı korunur. |
| ENG-002A — DB48 migration provenance | PR #3 MERGED, 22c5c9e; tarihsel 48 migration kaynak eşlemesi ve offline bütünlük kontrolü. |
| ENG-002B — DB48 clean replay | PR #4 MERGED, 19fecf2; izole PG17 DB48 48/48 replay ve 10/10 scoped postcheck. |
| ENG-002C — canonical PG17 compatibility | PR #5 MERGED, d8b576b; üç geçici test kopyasıyla 69/69 replay, scoped postcheck ve negatif fixture'lar. |
| ENG-003A — Migration CI | [PR #6 MERGED](https://github.com/Melihll/kpss/pull/6), 833cf6b; migration CI PASS. |
| ENG-003C — Application CI | [PR #7 MERGED](https://github.com/Melihll/kpss/pull/7), db65a84; Application CI PASS. |
| develop branch protection | Aktif; zorunlu kontroller `migration-replay`, `application`. |

Merge kimlikleri fetch edilmiş Git geçmişindedir. Altyapı kapanışı açık teknik sınırlamaları kapatmaz; yeni altyapı işi başlatılmaz.

**ENG-004 / REVIEW:** başlangıç `origin/develop` / `db65a849c47e6a03e9db375e26072d9e51fff0ff`; branch `codex/eng-004-system-closure`, ayrı worktree. İzinli yedi dosya: `AGENTS.md` ve `docs/product/` altında `ENGINEERING_SYSTEM.md`, `CURRENT_SPRINT.md`, `PROJECT_HANDOFF.md`, `RELEASE_PROCESS.md`, `MIGRATION_PROVENANCE.md`, `CANONICAL_PG17_REPLAY.md`. Kabul: eski aktif durumlar düzeltilmiş, kurallar ve gerçek riskler korunmuş, sonraki odak ürün geliştirmesi; kontrol: dokümantasyon diff/bağlantı/tutarlılık ve `git diff --check`. Düşük risk; uygulama/SQL/workflow değişikliği, test/build, production/LOCAL işlemi veya commit/push/PR yok. Builder bağımsız review onayı vermez; ENG-004 kapanış diff'i inceleme bekler.

**Karar / öğrenme:** rol ve gate sözleşmesi mevcut araçlar üzerinde kalır; biten altyapı işleri yerine ürün değerine dönülür. Worktree DB'yi ayırmaz; CI PASS test hedefini doğrular, production uyumluluğunu veya yayın yetkisini vermez.

Kaynaklar: [AGENTS](../../AGENTS.md), [güncel handoff](PROJECT_HANDOFF.md#ux-v3-local-state), [aktif sprint](CURRENT_SPRINT.md), [ADR](ARCHITECTURE_DECISIONS.md), [release süreci](RELEASE_PROCESS.md).
