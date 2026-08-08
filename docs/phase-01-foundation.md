# Phase 01 — Foundation

## Amaç

Tekrarlanabilir pnpm monorepo, React/Vite web uygulaması, local Supabase Auth ve kullanıcı bazlı veri izolasyonu kurmak.

## Yapılanlar

- Merkezi Supabase browser client, kayıt/giriş/çıkış ve session yenileme
- `/login`, `/register` ve korumalı `/` route'ları
- Minimal `@kpss-coach/domain` paketi ve Vitest altyapısı
- Local Supabase environment senkronizasyonu

## Database değişiklikleri

Yalnızca `public.user_profiles` tablosu eklendi. `id`, `auth.users.id` alanına cascade foreign key'dir. Auth signup trigger'ı metadata'daki `display_name` ile idempotent profil oluşturur. `updated_at` update trigger'ı ile yenilenir.

## RLS politikaları

RLS aktiftir. `authenticated` rolü yalnızca `auth.uid() = id` olan kaydı SELECT ve UPDATE edebilir. Anon rolünün tablo yetkisi yoktur; INSERT/DELETE policy yoktur.

## Nasıl test edilir

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm supabase:start
pnpm supabase:reset
pnpm test:integration
```

## Bilinen sınırlamalar

Production deployment ve remote Supabase ayarları bu phase kapsamında değildir. Integration test kullanıcıları bir sonraki local database reset'e kadar kalır.

## Bir sonraki phase için hazır noktalar

Typed domain paketi, authenticated route, profil yaşam döngüsü, migration sistemi ve doğrulanabilir kullanıcı izolasyonu hazırdır.
