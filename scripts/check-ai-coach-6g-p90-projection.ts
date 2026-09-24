import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_MONTHLY_BUDGET_POLICY_V1,
} from "../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  AI_OPENAI_PRICING_CATALOG_V1,
  AI_OPENAI_ROUTE_CATALOG_V1,
} from "../supabase/functions/_shared/ai-coach/provider-runtime-catalog-v1.ts";

const root = resolve(
  fileURLToPath(
    new URL(
      "..",
      import.meta.url,
    ),
  ),
);

const sprint = readFileSync(
  resolve(
    root,
    "docs/product/CURRENT_SPRINT.md",
  ),
  "utf8",
);

const ACCEPTANCE_FX_TRY_PER_USD = 60;

/**
 * Synthetic acceptance envelope only.
 *
 * This is deliberately NOT represented as observed cohort data.
 * It replays bounded normal/heavy monthly usage against the current
 * authoritative provider pricing catalog.
 *
 * 10% extra attempt overhead conservatively covers modeled
 * retry/fallback variance without relying on cache discounts.
 */
const ATTEMPT_OVERHEAD_MULTIPLIER = 1.10;

const TOKEN_ENVELOPE = Object.freeze({
  economy: Object.freeze({
    inputTokens: 4_500,
    outputTokens: 350,
  }),

  standard: Object.freeze({
    inputTokens: 6_500,
    outputTokens: 650,
  }),

  strong: Object.freeze({
    inputTokens: 8_500,
    outputTokens: 1_000,
  }),
});

const NORMAL_PROFILE = Object.freeze({
  name: "normal",
  minimumMonthlyCalls: 60,
  p90MonthlyCalls: 180,
  maximumMonthlyCalls: 210,

  tierMix: Object.freeze({
    economy: 0.30,
    standard: 0.55,
    strong: 0.15,
  }),
});

const HEAVY_PROFILE = Object.freeze({
  name: "heavy",
  minimumMonthlyCalls: 120,
  p90MonthlyCalls: 270,
  maximumMonthlyCalls: 300,

  tierMix: Object.freeze({
    economy: 0.25,
    standard: 0.50,
    strong: 0.25,
  }),
});

type Tier =
  keyof typeof TOKEN_ENVELOPE;

type Profile =
  typeof NORMAL_PROFILE
  | typeof HEAVY_PROFILE;

function fail(
  message: string,
): never {
  throw new Error(
    message,
  );
}

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    fail(
      message,
    );
  }
}

function round6(
  value: number,
): number {
  return Math.round(
    value * 1_000_000,
  ) / 1_000_000;
}

function routeForTier(
  tier: Tier,
) {
  const route =
    AI_OPENAI_ROUTE_CATALOG_V1.routes.find(
      (item) =>
        item.tier === tier,
    );

  assert(
    route !== undefined,
    `ROUTE_MISSING:${tier}`,
  );

  return route;
}

function priceForTier(
  tier: Tier,
) {
  const route =
    routeForTier(
      tier,
    );

  const price =
    AI_OPENAI_PRICING_CATALOG_V1.entries.find(
      (item) =>
        item.provider === route.provider
        && item.modelId === route.modelId,
    );

  assert(
    price !== undefined,
    `PRICE_MISSING:${tier}`,
  );

  assert(
    price.sourceKind ===
      "authoritative_config",
    `PRICE_NOT_AUTHORITATIVE:${tier}`,
  );

  return {
    route,
    price,
  };
}

function projectedCallCostTry(
  tier: Tier,
): number {
  const {
    route,
    price,
  } = priceForTier(
    tier,
  );

  const envelope =
    TOKEN_ENVELOPE[tier];

  assert(
    envelope.outputTokens <=
      route.maxOutputTokens,
    `OUTPUT_ENVELOPE_EXCEEDS_ROUTE:${tier}`,
  );

  /*
   * Intentionally no cached-input discount:
   * use full input rate as conservative acceptance pricing.
   */
  const usd =
    (
      envelope.inputTokens *
        price.inputPerMillionTokens
      +
      envelope.outputTokens *
        price.outputPerMillionTokens
    ) /
    1_000_000;

  return round6(
    usd *
      ACCEPTANCE_FX_TRY_PER_USD,
  );
}

function weightedCostPerCallTry(
  profile: Profile,
): number {
  const sum =
    (
      profile.tierMix.economy *
        projectedCallCostTry("economy")
    ) +
    (
      profile.tierMix.standard *
        projectedCallCostTry("standard")
    ) +
    (
      profile.tierMix.strong *
        projectedCallCostTry("strong")
    );

  return round6(
    sum *
      ATTEMPT_OVERHEAD_MULTIPLIER,
  );
}

function buildDistribution(
  profile: Profile,
): readonly number[] {
  /*
   * 100 deterministic synthetic monthly users.
   *
   * Samples 1..90 ramp from the minimum to the
   * stated p90 call envelope.
   *
   * Samples 91..100 ramp from p90 to the stress maximum.
   *
   * Therefore nearest-rank p90 is intentionally bound to
   * profile.p90MonthlyCalls while the top decile still stress-tests
   * higher usage.
   */
  return Object.freeze(
    Array.from(
      {
        length: 100,
      },
      (_, index) => {
        if (index <= 89) {
          const fraction =
            index / 89;

          return Math.round(
            profile.minimumMonthlyCalls
            +
            (
              profile.p90MonthlyCalls
              -
              profile.minimumMonthlyCalls
            ) *
            fraction,
          );
        }

        const fraction =
          (index - 89) / 10;

        return Math.round(
          profile.p90MonthlyCalls
          +
          (
            profile.maximumMonthlyCalls
            -
            profile.p90MonthlyCalls
          ) *
          fraction,
        );
      },
    ),
  );
}

function projectDistribution(
  profile: Profile,
) {
  const perCallTry =
    weightedCostPerCallTry(
      profile,
    );

  const calls =
    buildDistribution(
      profile,
    );

  const costs =
    calls
      .map(
        (count) =>
          round6(
            count *
              perCallTry,
          ),
      )
      .sort(
        (left, right) =>
          left - right,
      );

  const nearestRank = (
    percentile: number,
  ) => {
    const rank =
      Math.ceil(
        percentile *
          costs.length,
      );

    return costs[
      Math.max(
        0,
        rank - 1,
      )
    ]!;
  };

  return Object.freeze({
    profile:
      profile.name,

    sampleCount:
      costs.length,

    perCallTry,

    medianTry:
      nearestRank(
        0.50,
      ),

    p90Try:
      nearestRank(
        0.90,
      ),

    maximumTry:
      costs[
        costs.length - 1
      ]!,

    p90MonthlyCalls:
      profile.p90MonthlyCalls,

    maximumMonthlyCalls:
      profile.maximumMonthlyCalls,

    pathsAboveHardLimit:
      costs.filter(
        (value) =>
          value >
          AI_MONTHLY_BUDGET_POLICY_V1
            .thresholds
            .hardLimitTry,
      ).length,
  });
}


/*
 * Historical real controlled-DEV calibration.
 *
 * This does not authorize another provider call.
 */
assert(
  sprint.includes(
    "exact input tokens `4882`",
  ),
  "REAL_SMOKE_INPUT_EVIDENCE_MISSING",
);

assert(
  sprint.includes(
    "output `153`",
  ),
  "REAL_SMOKE_OUTPUT_EVIDENCE_MISSING",
);

assert(
  sprint.includes(
    "Observed actualTryCost: `0.211052`",
  ),
  "REAL_SMOKE_COST_EVIDENCE_MISSING",
);

const observedStandardInputTokens =
  4_882;

const observedStandardOutputTokens =
  153;

const observedActualTryCost =
  0.211052;

assert(
  TOKEN_ENVELOPE.standard.inputTokens >
    observedStandardInputTokens,
  "STANDARD_INPUT_ENVELOPE_NOT_CONSERVATIVE",
);

assert(
  TOKEN_ENVELOPE.standard.outputTokens >
    observedStandardOutputTokens,
  "STANDARD_OUTPUT_ENVELOPE_NOT_CONSERVATIVE",
);

const standard =
  priceForTier(
    "standard",
  );

const observedRepricedAtAcceptanceFx =
  round6(
    (
      (
        observedStandardInputTokens *
          standard.price
            .inputPerMillionTokens
      )
      +
      (
        observedStandardOutputTokens *
          standard.price
            .outputPerMillionTokens
      )
    )
    /
    1_000_000
    *
    ACCEPTANCE_FX_TRY_PER_USD,
  );

assert(
  observedRepricedAtAcceptanceFx >
    observedActualTryCost,
  "ACCEPTANCE_FX_NOT_CONSERVATIVE_VS_REAL_SMOKE",
);


const normal =
  projectDistribution(
    NORMAL_PROFILE,
  );

const heavy =
  projectDistribution(
    HEAVY_PROFILE,
  );


const {
  normalTargetTry,
  heavyTargetTry,
  hardLimitTry,
} =
  AI_MONTHLY_BUDGET_POLICY_V1
    .thresholds;


/*
 * Contract acceptance.
 */
assert(
  normal.medianTry <=
    normalTargetTry,
  `NORMAL_MEDIAN_EXCEEDS_TARGET:${normal.medianTry}`,
);

assert(
  normal.p90Try <= 200,
  `NORMAL_P90_EXCEEDS_200:${normal.p90Try}`,
);

assert(
  heavy.p90Try <=
    heavyTargetTry,
  `HEAVY_P90_EXCEEDS_250:${heavy.p90Try}`,
);

assert(
  normal.pathsAboveHardLimit === 0,
  "NORMAL_PATH_ABOVE_300",
);

assert(
  heavy.pathsAboveHardLimit === 0,
  "HEAVY_PATH_ABOVE_300",
);

assert(
  normal.maximumTry <=
    hardLimitTry,
  `NORMAL_MAX_EXCEEDS_300:${normal.maximumTry}`,
);

assert(
  heavy.maximumTry <=
    hardLimitTry,
  `HEAVY_MAX_EXCEEDS_300:${heavy.maximumTry}`,
);


console.log(
  "=== 6G-B1 P90 COST PROJECTION ===",
);

console.log(
  `PRICING_VERSION=${AI_OPENAI_PRICING_CATALOG_V1.version}`,
);

console.log(
  `ROUTE_CATALOG_VERSION=${AI_OPENAI_ROUTE_CATALOG_V1.version}`,
);

console.log(
  `ACCEPTANCE_FX_TRY_PER_USD=${ACCEPTANCE_FX_TRY_PER_USD}`,
);

console.log(
  `ATTEMPT_OVERHEAD_MULTIPLIER=${ATTEMPT_OVERHEAD_MULTIPLIER}`,
);

console.log(
  `REAL_SMOKE_ACTUAL_TRY=${observedActualTryCost}`,
);

console.log(
  `REAL_SMOKE_REPRICED_AT_ACCEPTANCE_FX_TRY=${observedRepricedAtAcceptanceFx}`,
);

console.log(
  `ECONOMY_PROJECTED_CALL_TRY=${projectedCallCostTry("economy")}`,
);

console.log(
  `STANDARD_PROJECTED_CALL_TRY=${projectedCallCostTry("standard")}`,
);

console.log(
  `STRONG_PROJECTED_CALL_TRY=${projectedCallCostTry("strong")}`,
);

console.log(
  `NORMAL_SAMPLE_COUNT=${normal.sampleCount}`,
);

console.log(
  `NORMAL_MEDIAN_TRY=${normal.medianTry}`,
);

console.log(
  `NORMAL_P90_TRY=${normal.p90Try}`,
);

console.log(
  `NORMAL_MAX_TRY=${normal.maximumTry}`,
);

console.log(
  `HEAVY_SAMPLE_COUNT=${heavy.sampleCount}`,
);

console.log(
  `HEAVY_P90_TRY=${heavy.p90Try}`,
);

console.log(
  `HEAVY_MAX_TRY=${heavy.maximumTry}`,
);

console.log(
  `SIMULATED_PATHS_ABOVE_300=${
    normal.pathsAboveHardLimit
    +
    heavy.pathsAboveHardLimit
  }`,
);

console.log(
  "NORMAL_P90_ACCEPTED=true",
);

console.log(
  "HEAVY_P90_ACCEPTED=true",
);

console.log(
  "HARD_300_SIMULATION_ACCEPTED=true",
);

console.log(
  "PROJECTION_KIND=synthetic_conservative_acceptance_v1",
);

console.log(
  "OBSERVED_PRODUCTION_COHORT=false",
);

console.log(
  "PRODUCTION_ACTION=0",
);

console.log(
  "EVRE_6G_B1_P90_PROJECTION_OK",
);
