# ENG-002C — PG17 fresh-install boundary compatibility

Durum: **READY FOR INDEPENDENT REVIEW**. Tarih: 21 Ekim 2026, Europe/Istanbul.

PG17.6 üzerinde **69/69 replay PASS**, **18/18 scoped ACL/RLS postcheck PASS**.
Bu sonuç üç test uyumluluk kopyasına aittir. Değiştirilmemiş canonical dizinin
doğrudan fresh-install kabulü veya production kabulü değildir.

## Görev ve kaynak kimliği

- Başlangıç: PR #4 merge commit'i `19fecf22386a9b8427f48f326927096a210d30ed`.
- Branch: `codex/eng-002c-canonical-compatibility`; aynı izole worktree.
- İzinli yeni dosyalar: bu rapor; `scripts/replay-canonical-clean-install.mjs`,
  `scripts/lib/canonical-replay-compatibility.mjs`,
  `scripts/check-canonical-replay-compatibility.mjs`.
- Amaç: production'a özgü DB46/47 sınırlarını yalnız yeni test DB'sinde,
  kaynak/version/sıra doğrulamasıyla değerlendirmek. Risk: orta, test aracı.
- Canonical/applied SQL, DB48 manifesti, DB48 runner'ı ve `config.toml` değişmez.
  Production, paylaşılan LOCAL, landing, diğer worktree'ler, commit/push/PR kapsam dışıdır.

## Üç geçici kopya

1. `20261010220000`: yalnız eksik bir `;` baytı. Canonical Git SHA-256:
   `753779b041d36f0acbc2541cac9c5caa497c7552731e7ab1fc6bb717d3dc33eb`.
2. `20261017213000`: yalnız history toplamı `46` koşulu yerine beklenen ilk
   **67 version**; ek test guard'ı başarılı sıra, canonical/kopya SHA'ları,
   run UUID, kaynak commit, image ve özel test kaydının yetkilerini doğrular.
3. `20261018234500`: aynı yöntemle ilk **68 version**; 68. migration'ın başarılı
   kaydı ve geçici kopya SHA'sı da bu sınırın parçasıdır.

İki count koşulu ve eklenen test assertion'ı geri alındığında orijinal SQL
baytlarının birebir geri geldiği kanıtlanır. Fonksiyon gövdeleri/hash'leri,
operator, repair role/membership, sahiplik, schema/EXECUTE ACL kontrolleri ve
son güvenlik postcondition'ları aynen korunur. Canonical dosyaya production
modu, GUC bayrağı veya bypass yolu eklenmez.

Runner 69 dosyanın Git blob SHA'larını sabit başlangıç commit'ine karşı
doğrular. Checkout için yalnız LF/CRLF eşdeğerliği kabul edilir; başka drift
FAIL üretir. Fazladan/eksik migration ve beklenmeyen version reddedilir.
Her SQL başarıyla tamamlandıktan sonra yalnız bu yeni DB'ye history ve
özel `eng002c_replay.completed` kaydı aynı transaction'da eklenir. Sonraki
migration başlamadan version kümesi, ordinal sıra ve iki SHA doğrulanır.
History sayısını 46/47 göstermek için kayıt silinmez veya gizlenmez.

## Doğrulama

- Offline kaynak/copy/history/sıra/SHA fixture'ları: **20/20 PASS**.
- Yeni PG17.6 DB: **69/69 PASS**, ilk 67 başarılı migration sonrası her iki
  boundary değerlendirilerek devam edildi. Eski atılabilir DB kullanılmadı.
- Canlı negatif guard fixture'ları: **24/24 PASS**. İki sınırda eksik/fazla/
  aynı sayıda yanlış history, sıra, canonical ve kopya SHA'sı, run UUID,
  ledger ACL ve operator farkı reddedildi. 68'de eski boundary fonksiyon hash'i
  ve önceden var repair rolü; 69'da üyelik, LOGIN, fonksiyon hash'i ve owner
  farkı da reddedildi. Her fixture transaction'ı rollback edildi; önce/sonra
  pozitif guard probe'u ve history/kayıt eşitliği doğrulandı.
- Scoped postcheck: **18/18 PASS**. DB48'deki 10 kontrolün yanında tam repair
  üyeliği, sekiz kısıtlı writer rolü, client membership yokluğu, altı ek RLS
  tablosu/policy kapsamı, writer/repair sahipliği ve test kaydının kapalılığı.
- PostgreSQL operator'ü normal `postgres`, superuser değil; Auth kullanıcıları
  ve public uygulama tabloları başlangıçta sıfır, migration history yok.
- Sabit image: `public.ecr.aws/supabase/postgres@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b`.
  UUID/ownership ve exact ID/name kontrolü, `network=none`, portsuz, tmpfs;
  host bind veya kalıcı volume yok. Image pull/engine start yapılmaz.
- Yalnız görev container'ı ve tmpfs'i kaldırıldı. Kaynaklar değişmedi.

Komutlar:

```text
node scripts/check-canonical-replay-compatibility.mjs
node scripts/replay-canonical-clean-install.mjs
node scripts/replay-canonical-clean-install.mjs --db48-evidence <existing-DB48-result.json>
```

Son iki komut alternatiflerdir; aynı incelemede gereksiz tekrar gerekmez.
Runner hiçbir DB URL'si/mevcut container hedefi almaz ve env/credential dosyası okumaz.

Yerel kanıt: OS temp altında `kpss-eng002c-boundary-ZFkrt7/result.json`;
69 kopya `migrations/`, üç original/compatibility çifti `compatibility/`.
Raw test çıktısı repoya taşınmadı; temiz clone'da mevcut varsayılmaz.

Result SHA-256: `e380404b1cdb1516eeba00dd47aabd23c9eb5ff6b9d49f37db7af88282c8031f`.
Son koşunun test kaynak SHA-256'ları:

| Dosya | SHA-256 |
| --- | --- |
| `replay-canonical-clean-install.mjs` | `de2ce0c81a7e1ba82a5cc3f874f0687729a79ed4253b03728fa5bcebb8a24519` |
| `lib/canonical-replay-compatibility.mjs` | `c22d0aab49437301db8b9032c9f70650369eba5e0612e42ad19acb48d97a7aa6` |
| `check-canonical-replay-compatibility.mjs` | `cf5e90aaea9f5a99aba3054049139d1e1bf9a49cbb3eb4bc970132f4ec8aa64f` |

Önceki DB48 **48/48 replay / 10/10 postcheck PASS** kanıtı ve source hash'leri
yeniden kullanıldı. Önceki result SHA-256'sı
`d23906924870bb901f05bd2603c6d4a280f8d9a77282cecb552e41775ba10c45` değişmedi.

## Kalan sınır ve öğrenme

**PostgreSQL 15 uyumsuzluğu ayrı BLOCKED kalır.** Canonical `20261015130000`,
`20261017213000`, `20261018234500` PG16+ rol üyeliği seçenekleri/katalog
alanlarını kullanır. PG15 replay yapılmadı; `config.toml` major_version=15
ve production ayarları değiştirilmedi. [PG15 GRANT](https://www.postgresql.org/docs/15/sql-grant.html),
[PG15 pg_auth_members](https://www.postgresql.org/docs/15/catalog-pg-auth-members.html),
[PG17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html).

Tam Supabase servis yığını, uygulama runtime'ı ve bütün ACL/RLS davranışları bu
scoped postcheck ile kabul edilmiş sayılmaz. Bağımsız review ve PG15 çözümü
bekler; commit/push/PR/deploy yapılmadı.

Mimari tercih: production'a bağlı applied SQL'i değiştirmek yerine exact
kaynaklardan geçici test kopyaları türetildi. History toplamı, farklı migration
envanterlerinde güvenilir kimlik değildir; version kümesi ve yalnız başarılı
işlemlerden oluşan sıralı SHA kaydı fresh-install sınırını doğrular.
