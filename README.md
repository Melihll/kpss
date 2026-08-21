# KPSS Koçu

**KPSS hazırlık sürecini planlamak, takip etmek ve öğrencinin çalışma sürecini daha yönetilebilir hale getirmek için geliştirilen adaptif çalışma planlama ve koçluk platformu.**

KPSS Koçu; öğrencinin hedeflerini, kullanılabilir çalışma süresini ve ders ilerlemesini dikkate alarak daha düzenli ve sürdürülebilir bir çalışma sistemi oluşturmayı amaçlar.

Proje yalnızca bir görev listesi olmak yerine; **planlama, çalışma takibi, oturumlar, sonuç analizi ve koçluk süreçlerini tek bir sistem altında birleştirmeyi** hedeflemektedir.

> **Aktif Geliştirme**
>
> KPSS Koçu halen aktif olarak geliştirilmektedir. Mimari yapı, özellikler ve kullanıcı deneyimi düzenli olarak iyileştirilmektedir.

---

## Mevcut Özellikler

* **Kullanıcı kimlik doğrulama**
* **PostgreSQL Row Level Security (RLS)**
* **Sınav, ders ve müfredat yönetimi**
* **Haftalık çalışma planlama**
* **Deterministik planlama motoru**
* **Çalışma görevlerinin yaşam döngüsü**
* **Çalışma oturumu takibi**
* **Doğru, yanlış ve boş sonuç takibi**
* **Yanlış cevap inceleme akışları**
* **Yapay zeka destekli koçluk özellikleri**
* **Telegram entegrasyonu**
* **Birim ve entegrasyon testleri**

---

## Teknoloji Yığını

### Frontend

* React
* TypeScript

### Backend ve Veri Katmanı

* Supabase
* PostgreSQL
* Supabase Auth
* Edge Functions

### Geliştirme ve Test

* pnpm workspace
* Vitest
* Integration tests
* Database migrations
* RLS tabanlı yetkilendirme

---

## Proje Yapısı

```text
kpss/
├── apps/
│   └── web/              # Web uygulaması
├── packages/
│   └── domain/           # Ortak domain mantığı
├── supabase/             # Veritabanı migration'ları ve Edge Function'lar
├── tests/                # Entegrasyon testleri
├── scripts/              # Geliştirme ve doğrulama scriptleri
└── docs/                 # Proje dokümantasyonu
```

---

## Yerel Geliştirme Ortamı

### Gereksinimler

* Node.js 20.19+
* pnpm 11.16+
* Docker Desktop

### Kurulum

```bash
pnpm install
pnpm supabase:start
pnpm supabase:reset
pnpm dev
```

Web uygulaması varsayılan olarak aşağıdaki adreste çalışır:

```text
http://127.0.0.1:5173
```

---

## Test ve Doğrulama

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
```

Entegrasyon testleri yerel Supabase ortamında çalışır ve temel akışları doğrulamayı amaçlar.

Bu kapsamda özellikle:

* Kimlik doğrulama
* Yetkilendirme
* Çalışma planlama
* Görev yönetimi
* Kullanıcıya ait veri izolasyonu
* Temel çalışma akışları

test edilmektedir.

---

## Yol Haritası

Projenin ilerleyen aşamalarında aşağıdaki alanların geliştirilmesi planlanmaktadır:

* Daha adaptif çalışma planlama sistemi
* Yapay zeka destekli koçluk sisteminin geliştirilmesi
* İlerleme ve performans analizlerinin iyileştirilmesi
* Kaynak ve içerik önerileri
* Öğrencinin performansına göre planların yeniden düzenlenmesi
* Mobil kullanım deneyiminin geliştirilmesi
* Production ortamına geçiş
* Monitoring ve hata takibi

---

## Proje Durumu

**Aktif geliştirme aşamasındadır.**

Mevcut odak yalnızca yeni özellikler eklemek değil; aynı zamanda sistemin **mimarisini, güvenilirliğini, test altyapısını ve kullanıcı deneyimini** geliştirmektir.

---

## Geliştirici

**Melih Dereli**

Yönetim Bilişim Sistemleri öğrencisi.

Software, veri ve yapay zeka odaklı ürünler geliştiriyorum.

* GitHub: [Melihll](https://github.com/Melihll)
* LinkedIn: [melihdrl](https://www.linkedin.com/in/melihdrl)
* Medium: [drlmelih8](https://medium.com/@drlmelih8)
