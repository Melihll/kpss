# KPSS Koçu — agent çalışma kuralları

## Mimari ve kaynaklar

- `apps/web`: React/TypeScript/Vite istemcisi; `packages/domain`: deterministik domain ve planlama; `supabase/functions` ve `supabase/migrations`: API, veri ve yetki sınırları. Mevcut mimariyi koru.
- Güncel durum: [PROJECT_HANDOFF](docs/product/PROJECT_HANDOFF.md#ux-v3-local-state). Aktif iş: [CURRENT_SPRINT](docs/product/CURRENT_SPRINT.md). İş akışı: [ENGINEERING_SYSTEM](docs/product/ENGINEERING_SYSTEM.md).
- Kararlar: [ARCHITECTURE_DECISIONS](docs/product/ARCHITECTURE_DECISIONS.md); yayın: [RELEASE_PROCESS](docs/product/RELEASE_PROCESS.md). PRODUCT_BACKLOG/ROADMAP tarihsel veya eski durum içerebilir; güncel handoff ve açık kullanıcı kapsamıyla karşılaştır.
- Kod/SQL/script uygulanmış davranışın kanıtıdır; geçmiş test sonucu veya belge canlı runtime doğrulaması değildir. Bilinmeyeni UNKNOWN yaz. Ignored `.release/` temiz clone'da bulunmak zorunda değildir.

## Roller ve yetki

- Product Owner kullanıcıdır: problemi, önceliği, ürün kabulünü ve yayın yetkisini belirler.
- Planner küçük görev sözleşmesini, dosya kapsamını, kabulü, riski ve gereken kontrolleri tanımlar.
- Builder yalnız bu kapsamı uygular ve kanıtını sunar. Independent Reviewer aynı diff/kaynak kimliğini bağımsız inceler; Builder kendi bağımsız review onayını veremez.
- Görev için zaten verilmiş yetkiyi kullan; rutin, geri alınabilir kapsam içi işler için tekrar onay isteme. Kapsam genişlemesi veya ayrı korunan işlem gerekiyorsa somut nedeni bildir.
- Production erişimi, DDL/DML/migration, data repair, API/web deployment, güvenlik gate'i, yetki veya secret değişikliği ayrı açık kullanıcı onayı olmadan yasaktır. Yerel test/ACCEPTED durumu bu yetkiyi vermez.

## Göreve başlamadan

- HEAD/branch, upstream'in yerel kaydı, staged/modified/untracked dosyalar ve worktree listesini oku. Remote ref'i canlı doğrulanmış gibi sunma.
- Görev sözleşmesindeki başlangıç ve izinli dosyaları doğrula. Beklenmeyen değişiklikte üzerine yazma; bağımsız güvenli işi sürdür, bağımlı adımı durdur ve farkı bildir.
- Görev bazlı `codex/<task>-<konu>` branch ve ayrı worktree kullan. Kirli checkout, landing, recovery ve başkasının değişikliğini koru; izinsiz stash/reset/clean/toplu staging yapma.
- Worktree DB/servis izolasyonu sağlamaz. Test için paylaşılan LOCAL'i resetleme veya mevcut kullanıcı/veriyi temizleme.

## Değişiklik ve doğrulama

- Yalnız görevde izin verilen kaynak dosyalarını değiştir; ilgisiz refactor, yeni framework/CI/agent altyapısı ekleme. Kapsamı kullanıcıyla açıkça genişletmeden aşma.
- Kontrolleri görev ve riskle orantılı seç; mevcut pnpm/Vitest scriptlerini kullan. Dokümantasyon işi için diff/tutarlılık ve `git diff --check` yeterlidir; yasaklanmış test/build'i çalıştırma.
- Anlamlı davranış değişikliğinde ilgili testleri ve gerekli regresyonu doğrula. Çalıştırılmayan, başarısız veya eski kanıtı PASS diye raporlama; kaynak değişmediyse kontrolü gereksiz tekrarlama.
- Deterministik Planner yetkisini, açık Preview/Confirm/Apply sınırlarını, ownership/RLS, stale/idempotency, Today koruması ve actual/credit/materyal ayrımını koru.
- Migration forward-only'dir: applied SQL/history'yi sessizce değiştirme veya yeniden yazma. Migration değişikliği izole, atılabilir DB'de uyumluluk ve ACL/RLS/owner/transaction/retry regresyonuyla doğrulanır; production uygulaması ayrıca onaylanır.
- Secret/credential/token, özel Auth satırı veya backup içeriğini keşif amacıyla açma; diff, log ve belgeye koyma. Gerekli yetkili işlemde sırları yalnız güvenli mekanizmayla kullan, değerlerini raporlama; ignored/private kanıtı repoya taşıma.

## Teslim

- Kısa rapor: sonuç/durum, branch/HEAD ve dosyalar, yapılan kontroller, kalan belirsizlik, korunan çalışmalar ve reviewer için kapsam.
- Mimari tercihi, nedenini ve geliştiricinin anlaması gereken teknik konuyu birkaç cümleyle açıkla.
- Commit/push/merge ve yayın için kullanıcının mevcut yetkisine ve görevdeki durma sınırına uy. ENG-001 bağımsız review ve commit öncesinde durur.
