# AI Coach — Read-Only Provider Orchestrator V1

Status: `EVRE_6B.6B.1_LOCAL_ENGINEERING_ACCEPTANCE — PRODUCTION_DISABLED — LIVE_COACH_UNCHANGED — CONFIRM_OFF — APPLY_OFF`

Contract versions:

- request: `openai-coach-request-v1`;
- request fingerprint: `openai-coach-request-fingerprint-v1`;
- prompt: `read-only-coach-prompt-v1`;
- grounded response: `grounded-coach-response-v1`;
- orchestrator: `read-only-coach-orchestrator-v1`;
- exact input count: `ai-openai-input-token-count-v1`;
- billing bound: `ai-provider-billable-bound-v1`;
- cost authorization: `ai-provider-cost-authorization-v1`.

## 1. Scope and authority

6B.6B.1 connects the accepted read-only context, evidence, deterministic-signal, routing, economics, reservation, provider-observation, usage-ledger, and grounded-response contracts behind one new internal orchestrator. Count and generation transports are injected fixtures. The orchestrator explicitly rejects `production`, contains no network client, is not exported through a live endpoint, and does not replace the current Coach prompt or provider path.

The only permitted persistent changes are AI accounting records through the service-owned reservation/ledger RPCs. The flow has no task, material, workload, capacity, session, Planner proposal, Preview, Confirm, or Apply mutation surface.

```text
authenticated user/profile
  -> loadCoachContextV1ReadOnly
  -> capability-scoped CoachEvidenceViewV1 + deterministic signals
  -> centralized route decision
  -> immutable server-owned Responses request
  -> exact count fixture bound to the request fingerprint
  -> complete billing bound + worst-case TRY authorization
  -> atomic user/month reservation RPC
  -> injected mocked provider attempt
  -> defensive usage extraction
  -> atomic ledger settlement or reconciliation
  -> grounded read-only result
```

## 2. Phase 0 provider audit

The manual provider commits `12d8d34`, `d822c7f`, `7f82cf9`, and `71af3a9` were checked against the 6A, 6B.5, and 6B.6A contracts and current official sources.

Corrections and hardening:

- route and pricing model aliases were replaced with the documented pinned GPT-5.4 snapshots;
- the official GPT-5.4 long-context price multiplier and regional-processing uplift were made explicit guardrails; this request contract permits only global-standard processing and caps Coach input at 200,000 tokens, below the 272,000-token pricing boundary;
- exact input count is now tied to the complete immutable request fingerprint and model; a post-count change rejects the request;
- cache hits are never assumed for reservation; all input tokens use the ordinary non-cached rate;
- cache-write usage is parsed, and any non-zero unmodeled cache-write class fails to unknown/reconciliation;
- exact-count authority and billing labels cannot be mixed between fixture and official modes;
- `max_output_tokens` is treated as the combined visible-output plus reasoning-token ceiling, and reasoning usage remains an output-token subset;
- production authorization remains fail-closed because the official documentation reviewed does not explicitly establish the billing treatment of `POST /responses/input_tokens`, nor the selected-route cache-write billing treatment;
- the TCMB source, timestamp semantics, and non-binding nature of indicative rates are explicit.

Official facts verified on 2026-09-12:

- OpenAI documents `POST /responses/input_tokens` and its request shape: <https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count>;
- Responses `max_output_tokens` includes visible output and reasoning tokens, and usage can include cached/cache-write input details plus reasoning output details: <https://developers.openai.com/api/reference/cli/resources/responses/methods/retrieve>;
- GPT-5.4 is documented with a 1,050,000-token context window, `$2.50` input, `$0.25` cached input, and `$15.00` output per million tokens: <https://developers.openai.com/api/docs/models/gpt-5.4>;
- GPT-5.4 mini is documented with a 400,000-token context window and `$0.75 / $0.075 / $4.50` rates: <https://developers.openai.com/api/docs/models/gpt-5.4-mini>;
- GPT-5.4 nano is documented with a 400,000-token context window and `$0.20 / $0.02 / $1.25` rates: <https://developers.openai.com/api/docs/models/gpt-5.4-nano>.

These facts make the checked-in server catalog production-shaped; they do not make a provider call eligible. Pricing/version review ownership, live FX acquisition, token-count endpoint billing, cache-write billing, operational controls, production migration, secrets, deployment, and runtime activation remain separate gates.

## 3. TCMB FX review

The policy uses TCMB's official indicative exchange-rate publication as provenance and the USD indicative selling rate as a conservative TRY conversion basis. TCMB states that indicative rates are published on business days at 15:30 and are non-binding; weekends, public holidays, and half-days may lack a publication: <https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Temel%2BFaaliyetler/Doviz%2BEfektif/Doviz%2Bve%2BEfektif%2BPiyasalari/Gosterge%2BNiteligindeki%2BKurlar>.

`effectiveAt` means the official publication instant represented by the snapshot. `loadedAt` means the server acquisition/approval instant and cannot precede `effectiveAt` or be in the future. The 96-hour maximum age is a bounded availability policy that covers an ordinary weekend; it does not guess holidays, roll forward a stale quote, or make an old rate current. A long holiday can therefore block provider authorization. A later production acquisition job needs explicit ownership, refresh monitoring, alerting, and immutable snapshot rotation.

## 4. Immutable request and fingerprint

`buildOpenAiCoachRequestV1` is the only request builder for this flow. It accepts an explicit allowlisted capability and a bounded `CoachEvidenceViewV1`; the server owns model, instructions, locale behavior, JSON schema, reasoning mode, output limit, service tier, and endpoint class.

The V1 request is text-only and strict structured-output-only. It sets `store: false`, `background: false`, `truncation: disabled`, `reasoning.effort: none`, `service_tier: default`, and an explicit route-owned `max_output_tokens`. Tools, parallel tools, web/file search, code interpreter, computer use, and user-defined tools are absent and prohibited.

Canonical serialization recursively sorts object keys, preserves array order, rejects undefined/non-finite/unserializable values, and is SHA-256 hashed. The fingerprint covers the complete immutable request specification, including model, instructions, exact evidence/signal payload, response schema, and every count/sent request field. It does not contain raw DB state not present in evidence, and raw CoachContext is never persisted for fingerprinting. The exact-count result must repeat both fingerprint and model; the same fingerprint is checked again before provider transport entry.

## 5. Billing bound and hard ceiling

For this text-only global-standard contract, the request maximum is:

```text
nativeMaximum = exactCompleteInputTokens × ordinaryNonCachedInputRate
              + maxOutputTokens × outputRate

tryMaximum = ceilToMicroTry(nativeMaximum × frozenUsdTryRate)
```

A reservation never assumes a cache hit. Visible output and reasoning share the provider-enforced `max_output_tokens` bound and output rate. A route is prohibited if any additional billable class is present or unresolved, the exact input exceeds the 200,000-token product cap, input plus output exceeds the model context, price/FX is missing or stale, or identity/version fields differ.

The database RPC remains the only monthly budget authority. It atomically evaluates settled cost plus active/reconciliation reservations plus the new worst-case reservation against the user-wide, Europe/Istanbul calendar-month ceiling of exactly 300 TRY. TypeScript does not recreate the monthly sum. Same-user profiles share the ceiling.

Fixture counting is explicitly marked `test_fixture_no_charge`. Official counting remains `production_billing_status_unverified`; no silence-based assumption is made. This unresolved fact blocks production provider eligibility.

## 6. Provider and accounting lifecycle

The orchestrator accepts count and generation transports by dependency injection and implements no network transport. Reservation denial yields zero generation calls. A failure before attempt start releases the reservation. Once the attempt is marked in-flight, a thrown transport error or explicitly unknown outcome requires reconciliation. Request/model mismatch, missing or unmodeled usage, exact-input mismatch, output overrun, or actual-over-reserved settlement cannot be treated as free or normal; the user/month fails closed through reconciliation.

Retries and fallbacks require separate attempt and reservation identities. The ledger stores sanitized identity, route, usage, pricing, FX, cost, execution, retry, and fallback facts, not raw prompts, responses, full CoachContext, or secrets.

## 7. Grounded response and prompt

The provider must return exactly:

- `answer`;
- `sourceFactPaths`;
- `acknowledgedUnknowns`;
- `staleOrBlockedWarnings`.

The server adds response/capability/evidence/signal versions and `noMutationPerformed: true`; route/model/request IDs remain server observability. A factual reference must name a supplied fact envelope or leaf, not a broad evidence root. Unknown references must match supplied unknown paths, and stale/blocked warnings must match supplied stale/blocked paths. Unknown, stale, blocked, `canonical_selector_unavailable`, and `pln002_completeness_unresolved` cannot be promoted to known claims.

The new prompt is not live. It defaults to the CoachContext locale, uses concise Coach language, and limits vocabulary to durum analizi, ilerleme değerlendirmesi, ders dengesi, çalışma eğilimi, and plan riski. It prohibits workload/Planner recomputation, invented canonical work, mutation claims, unsupported ahead/on-track/behind claims, and teacher/tutoring/quiz/mastery or medical-style diagnosis.

## 8. Acceptance and release boundary

Mocked A–Z unit acceptance covers the three happy-path capabilities plus unknown/stale/blocked truth, hallucinated references, request/model drift, exact-count/price/FX/budget failures, timeouts, reconciliation, retries/fallbacks, idempotency delegation, isolation, and zero non-accounting mutation. Additional failure-path tests cover release before provider start and reconciliation after ambiguous transport failure.

Loopback integration runs the same orchestrator against real local Coach rows and the real reservation/ledger RPCs while count/generation remain injected fixtures. Domain mutable-row delta and Planner lifecycle/proposal delta must remain zero; only the expected reservation/event/usage rows may be created.

Accepted local evidence on 2026-09-12 is: focused context/evidence/signal/economics/provider/orchestrator `139/139`; full loopback integration/RLS `157/157`; full non-integration `1,096/1,096`; workspace typecheck PASS; local DB lint PASS; AI economics, Coach, preview, and canonical Planner read-only safety PASS; generated AI Coach bundle byte-identical before/after canonical rebuild; docs consistency and diff check PASS. The real local orchestrator path reported domain mutation delta `0`, Planner lifecycle/proposal delta `0`, and real provider network calls `0`.

6B.6B.1 is locally closed as an engineering foundation. Closure does not authorize one real DEV call. That requires a separately approved scope resolving count-endpoint billing, cache-write billing, FX acquisition/current snapshot, configuration update ownership, a real gateway with timeout/request-ID/usage fidelity, operational reconciliation/alerting, secrets, production migration/deployment, and kill/rollback controls.

Production remains untouched. The current Coach runtime is unchanged. Provider production eligibility is false. Planner Confirm and Apply remain OFF.
