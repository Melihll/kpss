# DB48 migration provenance

Durum: ENG-002A / READY FOR REVIEW. Bu kayıt tarihsel release kaynak eşlemesidir; canlı production veya temiz kurulum kabulü değildir.

## Tarihsel kaynak eşlemesi

[db48.json](migration-provenance/db48.json), belgelenmiş DB46 release envanterini, DB46→47 execution ve DB47→48 kapanış kanıtlarını birleştiren 48 migration snapshot'ıdır. ENG-002A hazırlığında 48 release SQL artifact'inin ham SHA-256'sı kayıtlı release SHA'larıyla karşılaştırıldı.

Snapshot'ta her sürümün canonical yolu, release artifact SHA'sı, canonical Git kaynak SHA'sı, yalnız CRLF→LF sonrası SHA'sı, kanıt kaynağı ve satır sonu sınıflandırması bulunur. Ignored `.release/` yolları tarihsel kaynak referansıdır; temiz clone'daki kontrol bu dosyalara veya bir DB'ye erişmez.

## Yedi dosyanın geri kazanımı

Aşağıdaki dosyalar `supabase/migrations/` içine kaynak baytları korunarak eklenmiştir:

| Dosya | Doğrulanmış kaynak |
| --- | --- |
| `20261015120000_session_duration_integrity.sql` | Yerel Git commit'i `742ca9ebd4299be1634c6ca8fa1d1374b6d597fb` |
| `20261015121000_session_finish_lock_protocol.sql` | Aynı yerel Git commit'i |
| `20261015122000_session_duration_bound.sql` | Aynı yerel Git commit'i |
| `20261015123000_zero_review_task_state.sql` | Aynı yerel Git commit'i |
| `20261015130000_session_write_boundary.sql` | Ana checkout'taki korunan untracked kaynak |
| `20261017213000_exact_session_repair.sql` | SHA'sı onaylı frozen release runner dosyası |
| `20261018234500_exact_repair_function_privileges.sql` | SHA'sı onaylı frozen release runner dosyası |

Yedisinde de ham kaynak SHA'sı release runner SHA'sıyla eşleşir; SQL yeniden üretilmez veya formatlanmaz. Ürün commit'lerinin tamamı taşınmamıştır. `20261014200000_returning_manual_week_plan.sql` eklenmemiştir ve DB48 snapshot'ının parçası değildir.

## LF/CRLF ve offline kontrol

Ortak 41 SQL'in Git kaynak baytları LF, frozen release artifact'leri CRLF kullanır. Ham SHA'ları farklıdır; yalnız CRLF→LF dönüşümünden sonra içerikleri aynıdır. Bu sonuç **ham bayt eşitliği değildir**. Manifest bu iki ilişkiyi ayrı kaydeder; BOM, boşluk, tek başına CR veya final newline değişikliği normalizasyon kapsamına girmez.

Kontrol: `node scripts/check-migration-provenance.mjs`.

Script yalnız manifesti ve canonical migration dosyalarını okur. Eksik dosya veya içerik drift'i exit 1 üretir; yalnız LF/CRLF farkını ayrı sınıflandırarak kabul eder. Manifest dışındaki SQL'leri ayrıca listeler; bunları production'da uygulanmış veya pending diye sınıflandırmaz. Snapshot'taki bir sürümün ikinci dosya adıyla tekrarı başarısızdır. Diğer manifest dışı SQL'ler bu DB48 hash korumasının kapsamına girmez. Script offline çalışır; DB bağlantısı, migration uygulaması veya otomatik düzeltme yapmaz.

Production runtime ve production'daki gerçek SQL baytlarının doğrudan doğrulanması kapsam dışıdır. Kontrol, tarihsel kayda göre Git kaynak bütünlüğünü gösterir; tüm kaynak dizininin production DB48 ile aynı olduğu iddiasını üretmez.

## Fresh-install: BLOCKED — ENG-002B

[20261010220000_s0_r2_actual_progress_protection.sql](../../supabase/migrations/20261010220000_s0_r2_actual_progress_protection.sql) içinde kapanış `$function$` sonrasında statement sonlandırıcısı `;` eksiktir. Fresh-install replay hâlâ **BLOCKED**; kaynak bütünlüğü PASS sonucu temiz kurulum başarısı değildir.

Bu applied SQL ve migration history ENG-002A'da değiştirilmez. Fresh-install uyumluluğu ENG-002B kapsamında ayrıca çözülecektir; bu görev DB replay veya migration uygulamaz.
