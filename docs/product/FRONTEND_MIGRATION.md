# Concept B — gerçek frontend ve üst gezinme

> **2026-10-07 — RELEASE BLOCKER CLOSURE: LOCAL GREEN / NOT DEPLOYED**
>
> - Original 45 tracked + 183 untracked paths individually classified and preserved; intentional accepted source/tests/docs/evidence enter one authorized local release commit. LOCAL/generated inputs are ignored. The exact RC is the commit containing this record; parent `ea17ee281cb192304abfb518ff4f50b1ab3ecfdd`. Final exact-HEAD/postcommit validation and clean 1/0 upstream state are required before GO; see ignored `.release/final-freeze.json` and the final report.
> - Full regression **1535 tests / 204 files PASS**, domain/web typecheck, 19-file scoped lint, production-input build/endpoint scan, six authoritative safety scripts and diff check PASS. Production process inputs override the unchanged LOCAL env file; no new production secret.
> - Existing video PUT now has one active + one latest pending checkpoint, 15-second error backoff, critical lifecycle flush and stale/owner protection. Real slow/fail concurrency max 1; no storm. Finish pauses the mounted partial-task player; async ready seek restoration cannot autoplay.
> - Full authenticated real-root acceptance on Oct 6: physical page/atomic finish, Week add/edit/exact move/review/confirm, Resources/Progress/Roadmap/Coach/account/logout/relogin and 390 px mobile PASS. Existing Planner preview/confirm/apply gates remain OFF; safe blocked explanation PASS. Original historical task/session/progress preserved; separate scoped LOCAL fixtures, no DB reset/schema/second tracking.
> - Source diff confirms future surfaces **app-api → web**, other Edge/database migration/new production secrets **NONE**; app-api backward compatibility PASS from source/tests. Exact rollback remains web `395a536d` / Pages `f7c4dd8e-e3a4-4a19-8b47-cbcd8016abae`, app-api `735de8d` / code v75 / config v78. No live production drift query, deploy, SQL, data/secret mutation or Git push.
> - [Current evidence and limits](release-blocker-evidence/README.md), [source/rollback report](CONCEPT_B_RELEASE_FREEZE.md). Historical NO-GO/GREEN records below are retained. **Production NOT DEPLOYED; stop after clean local RC and postcommit checks.**


> **2026-10-06 release readiness: NO-GO / DIRTY / NOT DEPLOYED.** Fresh full regression 1509 tests / 200 files, typecheck, scoped lint, compilation and current safety checks PASS. Compilation is not artifact readiness: the local build embeds loopback Supabase. Accepted source is uncommitted; video checkpoint failure/backpressure and the complete authenticated physical/Week/rest-of-product smoke remain release blockers. Two mobile action buttons received explicit accessible names and passed a read-only 390 px product check. [Final freeze audit, inventory and rollback plan](CONCEPT_B_RELEASE_FREEZE.md). No production operation, commit or push. The dated source/acceptance records below remain preserved.

2026-10-05 · **SOURCE IMPLEMENTED / LOCAL VIDEO ACCEPTANCE GREEN / FULL PRODUCT SMOKE PENDING / NOT DEPLOYED**

Güncel video recovery gerçek `/` root'unda local Auth/ES256/JWKS, canonical task, YouTube playback, checkpoint, paused refresh/resume, Today→Focus ve session finish zincirini doğruladı. Existing schema korunarak local CLI/Edge ve PostgREST sürüm uyumu giderildi; frontend SDK readiness/resume düzeltildi. Regression 1509/1509 test PASS. [VIDEO_LOCAL_AUTHENTICATED_ACCEPTANCE.md](VIDEO_LOCAL_AUTHENTICATED_ACCEPTANCE.md) güncel kanıttır. Aşağıdaki backend-kapalı/auth-pending gözlemleri migration'ın ilk snapshot'ına aittir; kalan fiziksel materyal ve diğer product akışları için full checklist henüz tamamlanmadı. Production **NOT DEPLOYED**.

Kullanıcı Concept B V2 ve visual reset yönünü kabul ederek gerçek frontend kaynak değişikliklerini yetkilendirdi. Bu kayıt önceki prototip checkpoint'lerinin “migration henüz yetkili değil” ifadelerini bu görev bakımından günceller. Yayınlama, production SQL/veri işlemleri ve kapı/secret değişiklikleri kapsam dışındadır.

## Gezinme mimarisi

`TopNavigation` gerçek `AppShell` ile Lab B'nin kullandığı aynı bileşendir. Kimlik, profil ve çıkış yetkisi çağıran katmandadır. Gerçek shell mevcut `useAuth` ve `signOut` davranışını kullanır. Lab açıkça örnek profil gösterir; hesap işlemi taklit etmez.

Beyaz navbar seçildi: nötr canvas, beyaz workspace, Geist, ink metin ve ince indigo aktif işaret mevcut ürünle aynı dili korur. Siyah Lab inceleme çubuğu ayrı ve yalnızca Lab'dedir. Navbar desktop/tablet 64px, mobil 60px; sticky, gölge yalnızca scroll sonrasında, hover 160ms. İçerik 1320px dış sınır ve 1264px kullanılabilir alanla ortalanır.

Sol Sidebar ve eski MobileNav bileşenleri, eski sidebar/mobile nav stilleri ve sol alan telafisi kaldırıldı. Desktop tek satırda Bugün, Haftam, Yol Haritası, Kaynaklar, İlerleme; sağda Koça Sor ve hesap düğmesi bulunur. 1000px altında linkler menü sheet'ine geçer. 600px altında profil de sheet içindedir. Ana navigation yatay kaydırılmaz veya satır kırmaz.

Focus aynı navbar'ın sade modunu kullanır: ürün, Odak Modu, Bugüne dön; masaüstünde Koç erişimi de kalır. Mobil Focus içindeki bağlamsal Koç düğmesi erişimi korur. Kullanıcı çalışma ekranından çıkabilir.

Native dialog menüsü etiketli, Escape ile kapanır, Tab/Shift+Tab odağı içeride tutar, kapandığında tetikleyiciye döner ve arka planı kaydırmaz. Linkler `aria-current` ve görünür odak işaretleri kullanır. Gerçek profil bağlantısı `/settings#profile`, ayarlar `/settings`, çıkış mevcut Supabase auth akışıdır.

## Taşınan ekranlar ve işlemler

| Ekran | Gerçek üründeki sonuç |
| --- | --- |
| Bugün `/` | Tarih, sınava kalan gün, gerçek günlük kapasite ve Görev Ekle / Vaktim Değişti / Koça Sor korunur. Şimdi kartı gerçek görev, oturum, video ve sayfa alanını birleştirir. Devam listesinin sıra ve materyal işlemleri korunur. |
| Focus `/session` | Yeni deep link. Bugün ile aynı mounted workspace kullanılır; görev, iframe, video konumu ve sayfa taslağı route değişiminde yeniden oluşturulmaz. Diğer sayfalarda aktif çalışmaya dönüş bağlantısı bulunur; gizli videonun oynatımı durur. |
| Haftam `/week` | Gün şeridi, görev detayları, gerçek materyal açma, görev ekleme, süre önizlemesi, hedef gün taşıma önizlemesi ve ayrı plan düzenleme penceresi. Canonical Planner V2 önizlemesi ve kapıları korunur. |
| Kaynaklar `/resources` | Ders filtreleri, gerçek kaynak/progress/drawer davranışı korunur. Bugünkü uygun kaynak görevine `/?task=…` ile devam edilir; yoksa `/week?resource=…` gerçek kaynak seçili taslağı açar. |
| İlerleme `/progress` | Haftalık rapor ana yüzey; konu, tekrar ve plan uyumu ikincil disclosure içinde. Mevcut kayıt/test araçları erişilebilir. |
| Yol Haritası `/roadmap` | Gerçek timeline/projection korunur. Kaynak listesi ilk altı satırla başlar, tümü açılabilir; daha geniş ortalanmış içerik. |
| Koç | Shell'de tek ortak, gerçek Reactive Coach drawer. Üst menü genel bağlam; Bugün kapasite düğmesi kapasite bağlamı. Provider ve Planner yetkileri değiştirilmez. |
| Ayarlar `/settings` | Üst hesap menüsünden profil, ayarlar ve çıkış. Mevcut profil ve Telegram işlemleri korunur. |

Sidebar'ın beş sayfa bağlantısı, hesap/profil, ayarlar ve çıkışı üst navigation'a taşındı. Çalışma başlat, mola, devam ve bitir mevcut oturum API'lerine bağlıdır. Eski kaynak görüntüle/video/page drawer erişimleri görev menülerinde ve Kaynaklar'da devam eder.

## Gerçek API ve domain sınırları

| Deneyim | Mevcut bağlantı / koruma |
| --- | --- |
| Bugün | `/weekly-plan/current`, `/study-sessions/active`, `/execution/summary`, `/tasks/next`; gerçek server oturumu ve molalarından geçen süre. Eşzamanlı eski load yanıtları yeni oturum durumunu ezmez. |
| Oturum | `/study-sessions/start`, `/:id/pause`, `/:id/resume`, `/:id/finish`; örtüşme ve fiziksel çalışma lifecycle yetkisi server'da. |
| Fiziksel bitiş | `physical_v1` capture varsa inline sayfa sadece taslaktır. Bitirmeden önce server molası; bir sınır girdisi, tek mevcut finish isteğinde süre + sayfa kaydı. Aktif korumalı oturumda bağımsız progress yazımı eklenmedi. |
| Diğer sayfa ilerlemesi | Mevcut `GET/PUT /resources/:id/progress`; bu kaynak ilerlemesidir, görev tamamlandı diye varsayılmaz. |
| Video | Gerçek YouTube iframe ve `/resources/:id/youtube-videos`, `/youtube-videos/:id/progress`. Mevcut izlenen süre hesaplayıcısı korunur. Checkpoint sonrası iframe yeniden yaratılma sorunu giderildi; video başına konum/% ile seri tamamlanma sayısı ayrı gösterilir. Exact video bulunamazsa başka video otomatik seçilmez. |
| Materyal | Sadece API'nin `material_resource_id` / `material_scope` bilgisi. Başlık veya açıklamadan sayfa/video/ikinci kaynak uydurulmaz. Karma alan yalnızca gerçek aynı kaynağın video kütüphanesi varsa gösterilir; Lab'in ayrı kitap+video fixture eşleşmesi kopyalanmaz. |
| Gün taşıma | Mevcut Today carryover sözleşmesi kullanılır. Yeni opsiyonel `targetDate` yalnızca read-only action-preview kaynağına eklendi. Seçilen gün haftanın gelecekteki günlerinden olmalı; kapasite yoksa başka güne sessiz geçiş yapılmaz. Onay mevcut korumalı `/study-intent/carryovers/confirm` akışında. Yanıttaki görev/hedef eşleşmiyorsa onay açılmaz. |
| Haftalık düzenleme | Mevcut `/weekly-plan/options` ve `/weekly-plan/manual`, mevcut RPC ve günlük kapasite kontrolü. Bu API tüm bekleyen haftayı değiştirir; tek görev patch API'si değildir. İnceleme ekranı değişecek bütün görevleri ve tüm günlerin önce/sonra toplamlarını açıkça gösterir. Başlamış/ilerleme kaydı olan/tamamlanmış görevler draft'a tekrar alınmaz. |
| Koç ve Planner | Mevcut gerçek API, capability ve güvenli preview/confirmation/apply sınırları. Chat metni yetki vermez; hiçbir kapı etkinleştirilmedi. |

Taşıma işlemi mevcut sözleşmede yalnızca bugünün aktif olmayan, tamamlanmamış görevi için kullanılabilir. Gelecek günlerdeki bütün görevlerin serbestçe sürüklenmesi veya kalıcı exact materyal sınırı düzenleme yeni bir domain/API kabiliyeti gerektirir. Bunlar Lab modelinden gerçek ürüne taklit olarak eklenmedi. Mobil/klavye için hedef gün seçimi aynı gerçek önizlemeye alternatif erişimdir.

Manuel haftalık taslak replacement semantiği korunur: “Planı düzenle” seçili görev üzerinde küçük bir patch yapıyormuş gibi sunulmaz. Kaynak eklemek için mevcut Görev Ekle akışı da korunur. UI toplamı mevcut options kapasitesine göre ön kontrol yapar; gerçek günlük ve efektif kalan kapasite doğrulaması mevcut API'dedir.

## Lab'de kalanlar

Örnek kimlik, bellekte timer/video/page/Coach/Planner reducer'ı, hazır cevaplar, fixture roadmap/kapasite, scenario menüsü, A/C karşılaştırmaları ve siyah review toolbar Lab'e aittir. Gerçek product girişinin hiçbir Lab state import'u yoktur. Development-only bootstrap production build'den çıkarılır. Lab B yalnızca yeni gerçek navbar bileşenini paylaşır.

## Doğrulama ve açık engel

- Domain ve web TypeScript PASS; gerçek frontend Vite build PASS.
- Non-integration regression: **196 dosya / 1463 test PASS**. Yeni kontroller navigation route/focus modu, inline materyal kimliği/korumalı capture ve exact taşıma hedefini kapsar. Eski source contract kontrolleri ortak shell/inline workspace mimarisine güncellendi; güvenlik koşulları korunur.
- UX Lab izolasyon/strict-unused kontrolü PASS. AI Coach, AI Coach plan-preview, canonical read-only Planner ve Planning V2 shadow safety PASS.
- Değişen Edge kaynaklarının syntax/transpile kontrolü PASS; **Deno/HTTP runtime smoke yerine geçmez**.
- Lab B: 7 ekran × 1440×900 / 834×1112 / 390×844 = **21 görünüm**, page horizontal overflow 0. Video 16:9; desktop/tablet/mobil nav yüksekliği doğru. Sticky scroll, aktif route, masaüstü linkler, tablet/mobil menü, mobil Coach, Escape/Tab/Shift+Tab, back/forward/refresh/deep-link kontrolü geçti.
- Browser ve screenshot kanıtları [frontend-migration/README.md](ux-lab-evidence/frontend-migration/README.md). Bu görsel kanıtlar **Lab örnek verileriyle** alınmıştır; oturumlu ürün veya gerçek YouTube/DB kayıt kanıtı değildir.

**Yerel oturumlu full product smoke tamamlanamadı:** `127.0.0.1:54321/auth/v1/health` bağlantısı kurulamıyor. Docker komutu ve standart Docker Desktop executable mevcut değil. Gerçek ürün `/settings#profile` giriş kontrolünde `/login` gösteriyor; mevcut yerel hesap oturumu yok. Sahte oturum, mock backend veya production bağlantısı kullanılmadı.

Yerel Supabase/Auth/Functions çalıştığında test edilmesi gereken akış: Today → Start → gerçek video/page → Focus → pause → resume → finish → Week taşıma incele/onay/vazgeç ve manuel tam hafta incele/kaydet → Resources devam → Progress → Roadmap → Coach → profile/settings/logout. Gerçek kaynak sahipliği, kayıt sonrası refresh, eski preview/kapasite engeli, fiziksel capture ve mobil dialog doğrulaması bu koşulda bekliyor. Docker kurma veya güvenlik/auth politikasını değiştirme yapılmadı.

## Yerel inceleme bağlantıları

Frontend 5174 üzerinde açık:

- Görsel inceleme: http://127.0.0.1:5174/ux-lab/today?concept=coach
- Focus örneği: http://127.0.0.1:5174/ux-lab/session?concept=coach
- Gerçek ürün: http://127.0.0.1:5174/ (yerel oturum gerektirir)
- Gerçek routes: `/week`, `/roadmap`, `/resources`, `/progress`, `/settings`; yeni `/session`. Mevcut URL'ler değişmedi.

Tekrar açmak gerekirse proje `apps/web` dizininde `node node_modules/vite/bin/vite.js --port 5174 --strictPort` çalıştırılabilir. Yerel backend için repository'nin `supabase:start` ve `supabase:functions:serve` akışları Docker mevcut olduğunda kullanılmalı; eski yerel JWT uyumluluk notları ayrı tarihsel kayıttır, bu görev auth politikasını değiştirmedi.

## Production durumu

Kaynak kodu yerel çalışma ağacında. Cloudflare/Supabase deploy, production migration/SQL/veri mutasyonu, gate/secret/provider değişimi, remote push/merge: **0**. Yeni opsiyonel preview hedefi yalnızca kaynak değişikliğidir; Functions runtime'ına yayınlanmadı. Oturumlu smoke tamamlanmadan release acceptance verilmiş sayılmaz.

**NOT DEPLOYED**
