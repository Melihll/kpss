import type { AiFxSnapshotV1 } from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";
import { createApprovedTcmbUsdTryFxSnapshotV1 } from "./provider-fx-policy-v1.ts";

export const AI_TCMB_FX_ACQUISITION_V1_VERSION =
  "ai-tcmb-fx-acquisition-v1" as const;
export const AI_TCMB_DAILY_RATES_XML_URL_V1 =
  "https://www.tcmb.gov.tr/kurlar/today.xml" as const;

export const AI_TCMB_FX_UPDATE_AUTHORITY_V1 = Object.freeze({
  owner: "server_side_scheduled_config_acquisition" as const,
  browserAllowed: false as const,
  userRequestAllowed: false as const,
  coachPromptAllowed: false as const,
  plannerAllowed: false as const,
  arbitraryUrlAllowed: false as const,
  productionSchedulerDeployed: false as const,
});

export interface ParsedTcmbUsdTryPublicationV1 {
  readonly version: typeof AI_TCMB_FX_ACQUISITION_V1_VERSION;
  readonly sourceUrl: typeof AI_TCMB_DAILY_RATES_XML_URL_V1;
  readonly publicationDate: string;
  readonly effectiveAt: string;
  readonly loadedAt: string;
  readonly rate: number;
  readonly rateBasis: "ForexSelling";
  readonly snapshot: AiFxSnapshotV1;
}

function exactlyOne(pattern: RegExp, value: string, error: string): RegExpMatchArray {
  const matches = [...value.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(error);
  return matches[0];
}

function publicationDateFromXml(xml: string): string {
  const root = exactlyOne(/<Tarih_Date\b[^>]*\bTarih="(\d{2})\.(\d{2})\.(\d{4})"[^>]*>/g, xml, "AI_TCMB_FX_PUBLICATION_DATE_INVALID");
  const day = root[1];
  const month = root[2];
  const year = root[3];
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== iso
  ) throw new Error("AI_TCMB_FX_PUBLICATION_DATE_INVALID");
  return iso;
}

/**
 * TCMB indicative rates are published for the dated bulletin at 15:30
 * Europe/Istanbul. Turkey is UTC+03 year-round, so the publication instant is
 * represented as 12:30Z. Reloading the same bulletin changes loadedAt only;
 * it never advances effectiveAt or freshness.
 */
export function parseTcmbUsdTryXmlV1(input: {
  readonly xml: string;
  readonly loadedAt: string;
}): ParsedTcmbUsdTryPublicationV1 {
  if (!input.xml.trim()) throw new Error("AI_TCMB_FX_XML_EMPTY");
  const loadedMs = Date.parse(input.loadedAt);
  if (!input.loadedAt.includes("T") || !Number.isFinite(loadedMs)) {
    throw new Error("AI_TCMB_FX_LOADED_AT_INVALID");
  }
  const publicationDate = publicationDateFromXml(input.xml);
  const currency = exactlyOne(
    /<Currency\b[^>]*\bCurrencyCode="USD"[^>]*>([\s\S]*?)<\/Currency>/g,
    input.xml,
    "AI_TCMB_FX_USD_ROW_INVALID",
  )[1];
  const selling = exactlyOne(/<ForexSelling>([^<]+)<\/ForexSelling>/g, currency, "AI_TCMB_FX_SELLING_RATE_MISSING")[1].trim();
  if (!/^\d+(?:\.\d+)?$/.test(selling)) throw new Error("AI_TCMB_FX_SELLING_RATE_INVALID");
  const rate = Number(selling);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("AI_TCMB_FX_SELLING_RATE_INVALID");
  const effectiveAt = `${publicationDate}T12:30:00.000Z`;
  const snapshotVersion = `tcmb-usd-try-${publicationDate}-${selling}`;
  const snapshot = createApprovedTcmbUsdTryFxSnapshotV1({
    snapshotVersion,
    rate,
    effectiveAt,
    loadedAt: input.loadedAt,
  });
  return Object.freeze({
    version: AI_TCMB_FX_ACQUISITION_V1_VERSION,
    sourceUrl: AI_TCMB_DAILY_RATES_XML_URL_V1,
    publicationDate,
    effectiveAt,
    loadedAt: input.loadedAt,
    rate,
    rateBasis: "ForexSelling",
    snapshot,
  });
}

export async function acquireTcmbUsdTrySnapshotV1(input: {
  readonly fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  readonly loadedAt: string;
  readonly timeoutMs?: number;
}): Promise<ParsedTcmbUsdTryPublicationV1> {
  const timeoutMs = input.timeoutMs ?? 8_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("AI_TCMB_FX_TIMEOUT_INVALID");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await input.fetchImpl(AI_TCMB_DAILY_RATES_XML_URL_V1, {
      method: "GET",
      headers: { "Accept": "application/xml,text/xml" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI_TCMB_FX_HTTP_ERROR:${response.status}`);
    return parseTcmbUsdTryXmlV1({ xml: await response.text(), loadedAt: input.loadedAt });
  } finally {
    clearTimeout(timeout);
  }
}
