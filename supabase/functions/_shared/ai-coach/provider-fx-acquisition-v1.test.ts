import { describe, expect, it, vi } from "vitest";
import {
  AI_TCMB_DAILY_RATES_XML_URL_V1,
  AI_TCMB_FX_UPDATE_AUTHORITY_V1,
  acquireTcmbUsdTrySnapshotV1,
  parseTcmbUsdTryXmlV1,
} from "./provider-fx-acquisition-v1.ts";
import { validateApprovedTcmbUsdTryFxSnapshotV1 } from "./provider-fx-policy-v1.ts";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="11.09.2026" Date="09/11/2026" Bulten_No="2026/177">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit><Isim>ABD DOLARI</Isim><CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1000</ForexBuying><ForexSelling>41.2500</ForexSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
    <ForexBuying>48.0000</ForexBuying><ForexSelling>48.2000</ForexSelling>
  </Currency>
</Tarih_Date>`;

describe("6B.6B.2 TCMB FX acquisition boundary", () => {
  it("parses the one official USD ForexSelling row deterministically", () => {
    const first = parseTcmbUsdTryXmlV1({ xml: FIXTURE, loadedAt: "2026-09-11T12:35:00.000Z" });
    const second = parseTcmbUsdTryXmlV1({ xml: FIXTURE, loadedAt: "2026-09-11T12:35:00.000Z" });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ publicationDate: "2026-09-11", effectiveAt: "2026-09-11T12:30:00.000Z", loadedAt: "2026-09-11T12:35:00.000Z", rate: 41.25, rateBasis: "ForexSelling" });
  });

  it("does not refresh effective freshness when the same old publication is reloaded", () => {
    const reloaded = parseTcmbUsdTryXmlV1({ xml: FIXTURE, loadedAt: "2026-09-20T12:35:00.000Z" });
    expect(reloaded.effectiveAt).toBe("2026-09-11T12:30:00.000Z");
    expect(validateApprovedTcmbUsdTryFxSnapshotV1(reloaded.snapshot, "2026-09-20T12:35:00.000Z")).toEqual({ valid: false, reason: "stale_snapshot" });
  });

  it("rejects missing, duplicate, malformed, and non-positive USD selling rates", () => {
    expect(() => parseTcmbUsdTryXmlV1({ xml: FIXTURE.replace('CurrencyCode="USD"', 'CurrencyCode="GBP"'), loadedAt: "2026-09-11T12:35:00.000Z" })).toThrow("USD_ROW_INVALID");
    expect(() => parseTcmbUsdTryXmlV1({ xml: FIXTURE.replace("</Tarih_Date>", `${FIXTURE.match(/<Currency\b[^>]*CurrencyCode="USD"[\s\S]*?<\/Currency>/)![0]}</Tarih_Date>`), loadedAt: "2026-09-11T12:35:00.000Z" })).toThrow("USD_ROW_INVALID");
    expect(() => parseTcmbUsdTryXmlV1({ xml: FIXTURE.replace("41.2500", "NaN"), loadedAt: "2026-09-11T12:35:00.000Z" })).toThrow("SELLING_RATE_INVALID");
    expect(() => parseTcmbUsdTryXmlV1({ xml: FIXTURE.replace("41.2500", "0"), loadedAt: "2026-09-11T12:35:00.000Z" })).toThrow("SELLING_RATE_INVALID");
  });

  it("uses only the fixed official URL through injected server fetch", async () => {
    const fetchImpl = vi.fn(async () => new Response(FIXTURE, { status: 200 }));
    const result = await acquireTcmbUsdTrySnapshotV1({ fetchImpl, loadedAt: "2026-09-11T12:35:00.000Z" });
    expect(result.sourceUrl).toBe(AI_TCMB_DAILY_RATES_XML_URL_V1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(AI_TCMB_DAILY_RATES_XML_URL_V1);
  });

  it("encodes server-side scheduled/config ownership without deploying a scheduler", () => {
    expect(AI_TCMB_FX_UPDATE_AUTHORITY_V1).toEqual({
      owner: "server_side_scheduled_config_acquisition", browserAllowed: false, userRequestAllowed: false,
      coachPromptAllowed: false, plannerAllowed: false, arbitraryUrlAllowed: false, productionSchedulerDeployed: false,
    });
  });
});
