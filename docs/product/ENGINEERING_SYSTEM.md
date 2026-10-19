# Engineering System v1

Durum: ENG-001 / REVIEW — özgün foundation 4e6a284 için bağımsız review PASS; hedef uyumluluk düzeltmesi yeniden inceleme bekler. Bu görev yalnız yerel integration commit'i hazırlar.
Tarih: 19 Ekim 2026, Europe/Istanbul.

Bu sistem mevcut pnpm/Vitest/Supabase araçlarını ve mimariyi kullanır. Roller görev sorumluluklarıdır; yeni agent framework'ü, otomatik delegasyon veya CI kurulmuş değildir. Ürünün AI Coach/Planner yetkileri geliştirme agent'larına üretim erişimi vermez.

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
4. Bağımsız review ve kullanıcı yetkisi sonrasında **Feature → PR → develop**. Commit/push/merge yetkisi görevdeki açık sınırı aşamaz. Bu hedef uyumluluk görevi yalnız yerel integration commit'i hazırlar; push/PR/merge yapmaz.
5. Production için ayrı temiz release branch/worktree ve yalnız kabul edilen kapsam hazırlanır. `develop`ün tamamı otomatik yayınlanmaz. Git `main` veya Pages branch metadata'sı tek başına production kaynağını kanıtlamaz.
6. Acil hotfix yalnız açık kullanıcı kapsamıyla, doğrulanmış production kaynak/artifact temelinden ayrılır. Minimum değişiklik, bağımsız review, recovery ve uygun kontroller korunur; gerekiyorsa kabul edilen düzeltme daha sonra develop'a ayrı reviewed PR ile taşınır. Dirty kaynak veya çözülemeyen provenance ile yeni yayın GO verilmez.

Worktree kaynak izolasyonudur; DB, port, container, auth veya secret izolasyonu değildir. Mevcut LOCAL resetlenmez. DB testleri ayrı atılabilir ortam ve sentetik actor kullanır; test kaynakları/kayıt koruma sınırı önceden belirtilir.

## E. Gate matrisi

Aşağıdaki kontroller görevde seçilir ve sonuçları kaydedilir; henüz otomatik CI enforcement yoktur.

| Aşama | Gerekli kapsam / mevcut araç |
| --- | --- |
| Dokümantasyon | İzinli diff, bağlantı/tutarlılık incelemesi ve `git diff --check`; yeni untracked belgelerin diff'i de dahil. Test/build gerekmez. |
| Hızlı geliştirme | İlgili unit testleri için `pnpm exec vitest run <unit-test-path> --exclude "tests/integration/**"`; ilgili web/domain typecheck. |
| PR — uygulama | `pnpm test`, `pnpm typecheck`, değişen alan için `pnpm build` veya workspace build; ilgili mevcut safety/UI kontrolleri. Dokümantasyon PR'ı yukarıdaki hafif gate'i kullanır. Genel bir `pnpm lint` script'i varsayılmaz. |
| DB/migration veya writer | Bağımsız exact SQL incelemesi; izole DB'de migration/provenance/uyumluluk ve owner/ACL/RLS/constraint/transaction/stale/retry/concurrency testleri; etkilenen integration suite'leri. Fresh compatibility açığı kapalı gibi gösterilmez. |
| Release preflight | Exact temiz kaynak kimliği ve kapsam; artifact manifest/hash; migration provenance ve beklenen pending liste; uyumlu API/web/DB sırası; doğrulanmış recovery; rollback/forward-fix, owner ve kullanıcı onayı. Web için `pnpm build:release` ve mevcut production artifact taraması. |
| Production acceptance | Ayrıca yetkilendirilmiş hesap/işlem ve önceden tanımlı smoke/gözlem; sürüm/artifact kimliği, accounting ve veri/yetki sınırları. Eksik senaryo PARTIAL/NOT EXECUTED kalır; LOCAL PASS production PASS olmaz. |

Mevcut araç seçimi (hedef origin/develop aad020d ve bu beş belgeli paket):

- Hedef branch'te mevcut: `pnpm test:integration` LOCAL Supabase durumundan ortam alır; `node scripts/run-s0-safety-tests.mjs <test-path>` S0 kontrollerini çalıştırır. İşe göre mevcut runner seçilir; bu komutlar bu belgeyle çalıştırılmış sayılmaz.
- Hedefte mevcut RLS/auth ve writer boundary örnekleri: `tests/integration/auth-rls.test.ts` ve `tests/integration/s0-r2-plan-writer-boundary.test.ts`. Suite adının varlığı yeni migration/ACL kapsamını otomatik kanıtlamaz.
- **LOCAL-only / pending integration:** `scripts/run-manual-week-plan-tests.mjs` (0c3a694) ve `tests/integration/session-duration-integrity.test.ts` (742ca9e) hedef origin/develop'te yoktur; bu pakete alınmaz ve çalıştırılabilir mevcut komut/test olarak sunulmaz. Seri veri-koruma ve süre/accounting regresyonu gereksinimleri devam eder; ilgili ürün değişikliği için gerekli kontrol eksikse PASS verilmez.
- İlgili mevcut safety script'leri: `pnpm test:ai-coach-safety`, `test:ai-coach-plan-preview-safety`, `test:ai-economics-safety`, `test:planning-v2-shadow-safety`, `test:canonical-planner-v2-readonly-safety` ve `node scripts/check-coach-context-v1-readonly-safety.mjs`.
- `pnpm lint:ux-lab` yalnız ilgili UX Lab kapsamındadır. Tarihsel `check-ai-coach-6g-local-acceptance.mjs` güncel zorunlu gate değildir; eski marker uyumsuzluğu CONCEPT_B_RELEASE_FREEZE.md'de kayıtlıdır.
- Gerçek pointer/browser kabulü gerektiğinde `tests/browser/README.md` kullanılır. Global LOCAL hash karşılaştıran testler eşzamanlı yazan suite'lerle çalıştırılmaz.

Temiz clone için sürümlenen belgeler, package.json/lockfile ve script'ler temel alınır. Ignored `.release/`, özel hesap veya mevcut LOCAL stack hazır varsayılmaz; eksik runtime ilgili kontrolü BLOCKED yapar. Paylaşılan LOCAL'de reset veya mevcut private kanıtı repoya kopyalama çözüm değildir. Kaynak/provenance ve fresh migration açıkları ayrı görevdir; normal belge işini production audit'ine dönüştürmez.

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

## ENG-001 görev kaydı

- **Problem / sonuç:** geliştirme kuralları ve proje hafızası dağınık; küçük, taşınabilir bir rol/gate sözleşmesi ve güncel durum özeti.
- **Özgün foundation:** `742ca9ebd4299be1634c6ca8fa1d1374b6d597fb` üzerinde `codex/engsys-001-harness`; onaylı commit `4e6a284e0745d0f622f4e93bdb1db33c8774db65` ve bağımsız review PASS korunur.
- **Bu uyumluluk paketi:** son doğrulanan origin/develop `aad020d37aca75b32b5e4c3f1805d0708b21d61c` üzerinde `codex/engsys-001-pr`, ayrı worktree; yalnız beş belge taşınır. Yerel ürün commit'leri 0c3a694/742ca9e bu branch'e alınmaz; ana develop'deki 6 modified / 18 untracked korunur.
- **İzinli:** `AGENTS.md`, `docs/product/ENGINEERING_SYSTEM.md`, `PROJECT_HANDOFF.md`, `CURRENT_SPRINT.md`, `RELEASE_PROCESS.md` (son üçü de `docs/product/` altında).
- **Kapsam dışı:** uygulama/SQL, backlog/roadmap yeniden yazımı, CI/framework, paket/test/build, production/LOCAL işlemi, push/PR/merge/rebase/reset/clean ve mevcut worktree içerikleri. Yalnız bu integration branch'inde yerel commit kullanıcı tarafından yetkilidir; kimlik commit'e özel uygulanır, Git config'e yazılmaz.
- **Kabul / kontroller:** yalnız beş belge; tutarlı güncel durum ve açık yetki sınırı; tarihsel evreler korunur; izinli diff ve `git diff --check`. Ana checkout koruması HEAD/status/index ve mevcut dosya hash'leriyle karşılaştırılır.
- **Risk:** düşük; çalıştırılabilir davranış değişmez. Uyumluluk düzeltmesi bağımsız review bekler; push/PR/merge ayrıca yetkilendirilmeden yapılmaz.
- **Öğrenme:** mevcut araçların üstüne kısa rol sözleşmesi seçildi; framework gerekmiyor. Worktree DB'yi ayırmaz, tarihsel acceptance canlı sağlık kanıtı değildir ve ACCEPTED yayın yetkisi vermez.

Kaynaklar: [AGENTS](../../AGENTS.md), [güncel handoff](PROJECT_HANDOFF.md#ux-v3-local-state), [aktif sprint](CURRENT_SPRINT.md), [ADR](ARCHITECTURE_DECISIONS.md), [release süreci](RELEASE_PROCESS.md).
