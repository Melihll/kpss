# Phase 02 — Domain Core

## Amaç

Kullanıcının KPSS sınav profilini, ders seçimini, müfredat ilerleme iskeletini, haftalık kapasitesini ve çalışma kaynaklarını güvenli ilişkisel veriler olarak yönetmesini sağlamak.

## Eklenen domain'ler

- Exam → ExamEdition → ExamSubject → Subject global kataloğu
- Hiyerarşik CurriculumNode ve kullanıcıya özel TopicProgress
- ExamProfile, UserSubject, WeeklyAvailability, CalendarPeriod ve ScheduleException
- Resource → ResourceSection → ResourceUnit → ResourceUnitProgress
- Pure TypeScript kapasite, bulk unit ve dashboard progress utilities

## Schema özeti

Global katalog tabloları user-owned tablolardan ayrıdır. Child user tablolarında `(exam_profile_id, user_id)` composite foreign key'leri profil sahibini yapısal olarak korur. Curriculum parent composite foreign key'i parent ve child node'un aynı subject altında olmasını sağlar. Enum-benzeri alanlar, tarih/saat aralıkları ve negatif sayaçlar check constraint'lerle doğrulanır.

## RLS modeli

Global kataloglar yalnızca authenticated SELECT kabul eder. User-owned tablolarda `auth.uid() = user_id` uygulanır. Resource section, unit ve unit progress politikaları kaynak sahibini ilişkisel `EXISTS` kontrolleriyle doğrular; frontend kontrolüne güvenmez. RPC helper'ları `SECURITY INVOKER` olarak çağıranın RLS yetkileriyle çalışır.

## Seed kapsamı

Seed, KPSS Lisans sınavını, tarihsiz 2026 edition'ını, 14 stabil ders kodunu ve bunların sınav ilişkilerini içerir. Matematik, Tarih ve Hukuk için küçük bir representative curriculum seed bulunur.

> Full official KPSS curriculum data is not yet included; current curriculum seed is representative development data.

## Onboarding akışı

1. Exam profile ve tarihler
2. Ders seçimi ve idempotent topic progress initialization
3. ISO weekday (1=Monday, 7=Sunday) haftalık çalışma pencereleri
4. Kaynak, section, tek unit ve toplu test oluşturma
5. Özet ve `draft → active` geçişi

Aktif profil dashboard'unda sınav, ders/kapasite, topic durum grupları ve kaynak/unit sayıları gösterilir.

## Testler

Unit testleri overlap-safe haftalık kapasiteyi, bulk range üretimini ve topic durum sayımlarını kapsar. Local Supabase integration testleri global katalog read-only davranışını, profil/ders/progress/availability izolasyonunu ve Resource → Section → Unit sahiplik zincirini iki normal kullanıcıyla doğrular.

## Bilinen sınırlamalar

- CalendarPeriod ve ScheduleException verileri şemada hazırdır; Planning Engine etkileri henüz hesaplanmaz.
- TopicProgress state/mastery otomatik hesaplanmaz.
- Official curriculum import ve production katalog yönetimi ayrı data görevidir.
- Plan, task, session, result, revision ve AI domainleri bu phase kapsamında değildir.

## Phase 03'e hazır noktalar

Aktif sınav profili, seçili dersler, initialize edilmiş curriculum progress, overlap-safe kapasite ve çalışılabilir resource unit'ler Planning Engine + Task phase'i için hazırdır.
