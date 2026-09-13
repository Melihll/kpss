import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
} from "../supabase/functions/_shared/ai-coach/provider-runtime-activation-v1.ts";

import {
  AI_TCMB_DAILY_RATES_XML_URL_V1,
} from "../supabase/functions/_shared/ai-coach/provider-fx-acquisition-v1.ts";

import {
  acquireControlledDevFxSnapshotForOperatorV1,
  prepareControlledDevSmokeRuntimeV1,
} from "../supabase/functions/_shared/ai-coach/controlled-dev-smoke-runtime-v1.ts";

const args = process.argv.slice(2);

if (args.length !== 0) {
  throw new Error(
    "DRY_RUN_ONLY: this script accepts no live/provider arguments",
  );
}

const USER_ID = "controlled-dev-dry-run-user";
const PROFILE_ID = "controlled-dev-dry-run-profile";

const NOW = "2026-09-12T10:00:00.000Z";

const FAKE_OPENAI_KEY =
  "sk-controlled-dev-dry-run-only-1234567890";

const TCMB_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="11.09.2026" Date="09/11/2026" Bulten_No="2026/177">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1000</ForexBuying>
    <ForexSelling>41.2500</ForexSelling>
  </Currency>
</Tarih_Date>`;

let mockedTcmbFetchCount = 0;

const mockedTcmbFetch = async (
  url: string,
): Promise<Response> => {
  mockedTcmbFetchCount += 1;

  if (url !== AI_TCMB_DAILY_RATES_XML_URL_V1) {
    throw new Error(`UNEXPECTED_URL:${url}`);
  }

  return new Response(TCMB_FIXTURE, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
    },
  });
};

const acquiredFx =
  await acquireControlledDevFxSnapshotForOperatorV1({
    fetchImpl: mockedTcmbFetch,
    loadedAt: NOW,
  });

const keys = AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

const prepared =
  prepareControlledDevSmokeRuntimeV1({
    serverConfig: {
      [keys.enabled]: "true",
      [keys.environment]: "local_dev",
      [keys.scope]: "one_controlled_dev_smoke_v1",
      [keys.allowedUserId]: USER_ID,
      [keys.allowedProfileId]: PROFILE_ID,
      [keys.acceptUnresolvedCountBillingRisk]: "true",
    },

    serverSecrets: {
      OPENAI_API_KEY: FAKE_OPENAI_KEY,
    },

    userId: USER_ID,
    examProfileId: PROFILE_ID,

    fxSnapshot: acquiredFx.snapshot,
    evaluatedAt: NOW,
  });

const serialized = JSON.stringify(prepared);

if (
  serialized.includes(FAKE_OPENAI_KEY)
  || serialized.includes("Bearer ")
) {
  throw new Error("DRY_RUN_SECRET_LEAK");
}

if (
  prepared.providerCallMade !== false
  || prepared.productionAllowed !== false
  || prepared.activation.productionAllowed !== false
) {
  throw new Error("DRY_RUN_AUTHORITY_VIOLATION");
}

if (
  prepared.routeCatalog.environment !== "local"
  || prepared.pricingCatalog.environment !== "local"
) {
  throw new Error("DRY_RUN_LOCAL_CATALOG_INVALID");
}

if (
  prepared.routeCatalog.routes.some(
    (route) =>
      route.retryPolicy.maxAttempts !== 1
      || route.retryPolicy.retryableCategories.length !== 0
      || route.fallbackTier !== null,
  )
) {
  throw new Error("DRY_RUN_RETRY_OR_FALLBACK_ENABLED");
}

console.log(JSON.stringify({
  status: "GREEN",
  mode: "controlled_dev_preflight_dry_run",

  providerCalls: 0,
  realOpenAiCalls: 0,
  realTcmbCalls: 0,

  mockedTcmbFetchCount,

  activation: {
    environment:
      prepared.activation.deploymentEnvironment,

    scope:
      prepared.activation.scope,

    countBillingAuthority:
      prepared.activation.inputCountBillingAuthority,

    productionAllowed:
      prepared.activation.productionAllowed,
  },

  catalogs: {
    routeEnvironment:
      prepared.routeCatalog.environment,

    pricingEnvironment:
      prepared.pricingCatalog.environment,

    provider:
      prepared.routeCatalog.routes[0]?.provider,

    retryMaxAttempts:
      prepared.routeCatalog.routes.map(
        (route) => route.retryPolicy.maxAttempts,
      ),

    fallbackTiers:
      prepared.routeCatalog.routes.map(
        (route) => route.fallbackTier,
      ),
  },

  fx: {
    sourceKind:
      prepared.fxSnapshot.sourceKind,

    publicationDate:
      acquiredFx.publicationDate,

    rateBasis:
      acquiredFx.rateBasis,

    rate:
      acquiredFx.rate,
  },

  credential:
    prepared.credential.toJSON(),

  productionAccess: 0,
  deploys: 0,
  migrations: 0,
}, null, 2));
