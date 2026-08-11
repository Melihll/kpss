# KPSSP48 2027 Pilot Planı

Bu plan pilot amaçlıdır. Hedef sınav tarihi kullanıcı varsayımıyla **6 Eylül 2027** kabul edilir. Üniversite vize/final tarihleri kesin akademik takvim gelene kadar tahmini boşluklardır.

## Çalışma kapasitesi

- Normal hafta: **30 saat / 1.800 dakika**
- Nominal ay: **120 saat / 7.200 dakika**
- Varsayılan dağılım: Pazartesi-Cuma 18:00-22:00, Cumartesi-Pazar 13:00-18:00
- Geçmiş günler veya sınav boşlukları haftalık üretimde otomatik düşülür.

## İlk kaynak havuzu

Fotoğraflardan çıkarılan 26 gerçek kaynak yaklaşık **1.150 saatlik ilk çalışma havuzu** olarak modellenmiştir. Saatler kitapların resmi tamamlanma süreleri değil, planlamayı başlatmak için kullanılan ilk iş yükü tahminleridir. Telegram'dan kaydedilen gerçek süreler bu tahminlerin üzerine yazılmaz; ilerleme ve kaynak bitiş öngörüsü gerçek süre biriktikçe yeniden hesaplanır.

## Haftalık ilk dağılım

İlk kaynak havuzunun büyüklüğü ve P48 alan ağırlığı birlikte düşünülerek 30 saat şu şekilde dağıtılır:

- Hukuk: 7s 30dk
- İktisat: 6s
- Maliye: 3s 30dk
- Muhasebe: 3s 30dk
- Matematik: 3s
- Tarih: 2s 30dk
- Türkçe: 2s
- Coğrafya: 2s

Toplam: **30 saat**.

Bu dağılım sabit bir başarı reçetesi değildir. Pilotun amacı, gerçek çalışma hızına göre kalan haftayı düzenlemek ve kaynak bitiş tahminlerini sürekli güncellemektir.

## Tahmini akademik boşluklar

- Güz vize: 9-15 Kasım 2026
- Güz final: 4-17 Ocak 2027
- Bahar vize: 5-11 Nisan 2027
- Bahar final: 7-20 Haziran 2027

Bu aralıklarda KPSS kapasitesi 0 kabul edilir. Kesin üniversite takvimi geldiğinde tarihlerin değiştirilmesi gerekir.

## Kaynak bitiş mantığı

İlk tahminle mevcut kaynak havuzunda yeni kaynak zamanı yaklaşık olarak:

- Maliye: 17 Mayıs 2027
- Matematik: 17 Mayıs 2027
- Coğrafya: 17 Mayıs 2027
- Tarih: 24 Mayıs 2027
- Hukuk: 5 Temmuz 2027
- İktisat: 5 Temmuz 2027
- Muhasebe: 5 Temmuz 2027
- Türkçe: 5 Temmuz 2027

Bu tarihler gerçek çalışma süresi geldikçe ileri veya geri kayar. Kaynak kuyruğu bittiğinde takvimde **Yeni kaynak zamanı** bloğu görünür.

Vatandaşlık / güncel bilgiler için mevcut fotoğraf setinde ayrı bir kaynak bulunmadığı için sistem bunu kaynak açığı olarak işaretler.

## Neden bütün yılı günlük görev olarak önceden yazmıyoruz?

Aylık yol haritası sınava kadar oluşturulur fakat veritabanında sadece güncel hafta gerçek görevlere çevrilir. Bunun nedeni pilotun ana davranışıdır:

1. Haftanın programı oluşturulur.
2. Telegram gerçek çalışma süresini kaydeder.
3. Planlanan ve gerçekleşen süre karşılaştırılır.
4. Kalan hafta yeniden dengelenir.
5. Sonraki hafta başladığında scheduler veya Telegram yeni haftayı güncel kaynak ilerlemesiyle otomatik üretir.

Böylece Eylül 2027'ye kadar eski varsayımlarla kilitlenmiş binlerce görev yerine, her hafta son gerçek veriden üretilen bir program kullanılır.
