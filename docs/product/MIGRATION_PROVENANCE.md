# DB48 migration provenance

Durum: **ENG-002A / MERGED (PR #3); ENG-002B / MERGED (PR #4), KAPALI.** Güncelleme: 28 Ekim 2026. Bu kayıt tarihsel DB48 kaynak eşlemesi ve izole DB48 testidir; canlı production kabulü değildir. Sonraki canonical PG17 replay ve Migration CI kapanışı [CANONICAL_PG17_REPLAY](CANONICAL_PG17_REPLAY.md) içindedir.

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

## DB48 clean install — ENG-002B / MERGED

20 Ekim 2026: PR #3 develop'a merge edildi; başlangıç commit'i `22c5c9e10a5b36f3e72ecc8f4f9e8a6c5875939a`. İzole replay **48/48 PASS**. Yeni DB'de public uygulama tablosu ve Auth kullanıcısı başlangıçta sıfırdı; migration history yoktu. Her başarılı SQL'den sonra yalnız bu yeni DB'ye history kaydı yazıldı; son sıralı 48 version manifestle birebir karşılaştırıldı.

Tekrar çalıştırma: `node scripts/replay-db48-clean-install.mjs`.

Gereksinimler: Node.js, Git, çalışan yerel Docker Desktop `desktop-linux` context'i ve yerelde bulunan şu sabit image:

`public.ecr.aws/supabase/postgres@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b`

Doğrulanan sürüm PostgreSQL 17.6'dır. DB47/48 SQL'lerinin rol üyeliği seçenekleri PostgreSQL 16+ gerektirir; repo config'indeki major_version=15 bu testin ortamı değildir ve değiştirilmemiştir. Production PostgreSQL sürümü UNKNOWN; PG17 test ortamı production uyumluluğunu kanıtlamaz. PostgreSQL 15 veya tam Supabase servis yığını uyumluluğu iddia edilmez.

Runner yeni UUID adlı, ownership etiketli container oluşturur: `network=none`, yayınlanan port yok, host bind/kalıcı volume yok, DB verisi tmpfs'te. Hiçbir DB URL'si veya mevcut container hedefi kabul etmez; image indirmez, Docker engine'i başlatmaz, env/credential dosyası okumaz. SQL yalnız kendi container'ındaki Unix socket üzerinden normal, superuser olmayan `postgres` rolüyle çalışır. Mevcut LOCAL veya production'dan bootstrap/veri kopyalanmaz; platform bootstrap sabit image'dan gelir.

Kaynaklar provenance kontrolünden geçer. Yalnız manifestteki 48 SQL'in HEAD Git blob'u canonical SHA ile eşleştirilerek geçici klasöre kopyalanır ve manifest sırasıyla çalışır. Checkout CRLF olsa da replay exact canonical Git baytlarını kullanır. İlk SQL hatasında durur; başarısız SQL'e history eklemez, otomatik SQL düzeltmesi veya retry yapmaz. Normal sonuç/hata çıkışında yalnız sahipliği doğrulanan görev container'ını kaldırır. Zorla process/host kapanması halinde otomatik cleanup garantisi yoktur.

Başarılı tam replay sonrası kontroller: exact history; user_profiles/tasks/study_sessions/weekly_plans RLS ve policy varlığı; Auth, finish ve session-boundary fonksiyonları; dokuz private repair fonksiyonu; PUBLIC/client EXECUTE ve private schema erişiminin kapalı olması; kısıtlı repair rolü; operator EXECUTE; sıfır Auth kullanıcı verisi. **10/10 kontrol PASS**. Bunlar kapsamlı uygulama runtime, bütün ACL'ler veya production kabulü değildir.

Çıktı OS geçici dizinindeki yeni `kpss-eng002b-replay-*` klasörüne yazılır: 48 kaynak SQL, iki compatibility kopyası ve `result.json`. Son rapor kaynak commit/image kimliğini, SHA'ları, sıra/sonuçları, ilk engeli (varsa), postcheck ve cleanup sonucunu içerir. Doğrulanan son koşuda `replay=PASS`, `canonicalFilesUnchanged=true`, `cleanup=REMOVED OWN CONTAINER AND TMPFS` kaydedildi.

### Snapshot dışındaki semicolon sorunu

`20261010220000_s0_r2_actual_progress_protection.sql` DB48 manifestinde **yoktur**; 21 snapshot-dışı SQL'den biridir. Önceki genel fresh-install BLOCKED kaydı DB48-only replay için engel değildir. Bu dosyanın production'da uygulanma durumu bu görevde sorgulanmadı/doğrulanmadı; manifest dışından uygulanmışlık sonucu çıkarılmaz.

Canonical Git SHA-256: `753779b041d36f0acbc2541cac9c5caa497c7552731e7ab1fc6bb717d3dc33eb`. Runner bu exact kaynağı ve checkout'un yalnız LF/CRLF varyantı olduğunu doğrular. Ayrı geçici kopyada son `$function$` sonrasına yalnız tek `;` baytı ekler; bu baytı kaldırınca orijinalin birebir geri geldiğini, boyut farkının +1 ve diğer farkların sıfır olduğunu kanıtlar. Kaynak/geçici SHA ve offset raporlanır.

Bu compatibility kopyası **DB48 runner'ında çalıştırılmaz**, DB48'e/history'ye eklenmez. Canonical SQL, eski history ve 21 snapshot-dışı SQL değişmemiştir. DB48 için kalan replay engeli yoktur; ENG-002B PR #4 ile kapanmıştır.

Sonraki ENG-002C/ENG-003A, snapshot dışındaki bu SQL'i de kapsayan canonical dizini **üç geçici uyumluluk kopyasıyla** izole PG17'de başarıyla replay eder; Migration CI PASS ve PR #6 MERGED. Bu genişletilmiş test, değişmemiş canonical dizinin temiz kurulum kabulü değildir. Eski genel fresh-install engeli DB48/PG17 test işlerini açık tutmaz; değişmemiş SQL, PG15/tam Supabase runtime ve production uyumluluğu sınırları [canonical replay raporunda](CANONICAL_PG17_REPLAY.md#limits-and-historical-evidence) korunur.
