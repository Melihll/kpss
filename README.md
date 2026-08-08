# KPSS Koçu — Phase 04

pnpm/React/Supabase tabanlı KPSS koçluğu çekirdeği. Auth/RLS, sınav-ders-müfredat, kapasite, kaynaklar, deterministik Weekly Planning Engine V0 ve task lifecycle yanında canlı/sonradan çalışma, D/Y/B sonuçları, yanlış inceleme ve Telegram pilot akışını içerir.

## Gereksinimler

- Node.js 20.19 veya üzeri
- pnpm 11.16
- Çalışan Docker Desktop (local Supabase için)

Supabase CLI global olarak gerekmez; workspace dev dependency'sidir.

## Kurulum ve local geliştirme

```bash
pnpm install
pnpm supabase:start
pnpm supabase:reset
pnpm dev
```

`pnpm supabase:start`, local API URL ve anon key değerlerini git tarafından yok sayılan `apps/web/.env.local` dosyasına yazar. Uygulama `http://127.0.0.1:5173` adresinde açılır. Manuel environment kurulumu gerekirse `.env.example` dosyasını temel alın; frontend'e service-role key eklemeyin.

Local servisleri durdurmak için:

```bash
pnpm supabase:stop
```

## Doğrulama

```bash
pnpm edge:bundle
pnpm typecheck
pnpm test
pnpm build
pnpm supabase:reset
pnpm test:integration
pnpm supabase:status
```

Entegrasyon testleri çalışan local Supabase ve uygulanmış migration gerektirir; Auth, RLS, catalog/domain, planning/task ve execution/result regresyonlarını gerçek local API üzerinden doğrular.

## Edge Functions

Planning bundle ile `app-api` ve `telegram-webhook` function'larını ayrı terminalde başlatın:

```bash
pnpm supabase:functions:serve
```

Normal kullanıcı JWT'siyle app API smoke testi:

```bash
pnpm test:edge
```

Telegram local deterministic smoke testi için function server'ı şu environment ile çalıştırın:

```bash
TELEGRAM_WEBHOOK_SECRET=local-test-secret TELEGRAM_TRANSPORT_MODE=mock TELEGRAM_BOT_USERNAME=local_test_bot pnpm supabase:functions:serve
pnpm test:telegram
```

## V1 Pilot Local Run

Normal local pilot için `pnpm install`, `pnpm supabase:start` ve `pnpm dev` yeterlidir. Otomasyon/Telegram akışını yerelde çalıştırmak için Edge-only `TELEGRAM_*` ve `SCHEDULER_WORKER_SECRET` değerlerini ayarlayıp `pnpm supabase:functions:serve` komutunu ayrı terminalde çalıştırın. Phase 07 ayrıntıları [V1 pilot closure dokümanında](docs/phase-07-v1-pilot-closure.md) bulunur.

PowerShell'de environment değerlerini `$env:TELEGRAM_WEBHOOK_SECRET='local-test-secret'` biçiminde ayrı ayrı ayarlayın.

## Gerçek Telegram bot kurulumu

1. BotFather üzerinden bot oluşturun.
2. Edge Function secret olarak `TELEGRAM_BOT_TOKEN` değerini ayarlayın.
3. Rastgele ve güçlü `TELEGRAM_WEBHOOK_SECRET` değerini ayarlayın.
4. Bot kullanıcı adını `TELEGRAM_BOT_USERNAME` olarak ayarlayın.
5. Telegram `setWebhook` çağrısında URL'yi `<SUPABASE_URL>/functions/v1/telegram-webhook`, `secret_token` değerini de aynı webhook secret olarak verin.

Frontend'e service-role, Telegram bot token veya webhook secret eklemeyin. Telegram transport credential yokken dış API çağrısı yapmaz; local mock test gerçek bot gerektirmez. Ayrıntılar [Phase 04 dokümanında](docs/phase-04-execution-results-telegram.md) bulunur.
