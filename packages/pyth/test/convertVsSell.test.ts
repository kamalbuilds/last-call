import { getQuote, USDC_MINT } from "@fineprint/exec";
import { describe, expect, it } from "vitest";
import {
  MissingPythKeyError,
  SPACEX_PRESTOCKS_MINT,
  SPCXX_DECIMALS,
  SPCXX_MINT,
  SPCX_EQUITY_FEED_ID,
  SPCXX_CRYPTO_FEED_ID,
  convertVsSell,
  fetchHermesPrices,
} from "../src/index.js";

// A holding of 1 SPACEX (9 decimals) is enough to exercise real quotes without
// caring about price impact here; slicing/impact is @lastcall/slice's job.
const ONE_SPACEX_RAW = 1_000_000_000n;
const HAS_KEY = typeof process.env["PYTH_API_KEY"] === "string" && process.env["PYTH_API_KEY"] !== "";

describe("convertVsSell", () => {
  it("throws MissingPythKeyError, never fakes a price, when PYTH_API_KEY is absent", async () => {
    if (HAS_KEY) {
      // Environment has a real key: prove the guard would still fire on a genuinely empty key,
      // without permanently mutating process.env for the rest of the suite.
      const saved = process.env["PYTH_API_KEY"];
      delete process.env["PYTH_API_KEY"];
      try {
        await expect(convertVsSell({ amountRaw: ONE_SPACEX_RAW })).rejects.toBeInstanceOf(
          MissingPythKeyError,
        );
      } finally {
        process.env["PYTH_API_KEY"] = saved;
      }
      return;
    }
    await expect(convertVsSell({ amountRaw: ONE_SPACEX_RAW })).rejects.toBeInstanceOf(
      MissingPythKeyError,
    );
  });

  it("rejects a non-positive amount before making any network call", async () => {
    await expect(convertVsSell({ amountRaw: 0n })).rejects.toBeInstanceOf(RangeError);
  });

  it.runIf(HAS_KEY)(
    "with a real key: sellNowUsdc, convertNowSpcxxUi and convertNowReferenceUsdc all come from live reads and are internally consistent",
    async () => {
      const result = await convertVsSell({ amountRaw: ONE_SPACEX_RAW });
      expect(result.sellNowUsdc).toBeGreaterThan(0);
      expect(result.convertNowSpcxxUi).toBeGreaterThan(0);
      expect(result.pyth.spcxxUsd.price).toBeGreaterThan(0);
      expect(result.pyth.equitySpcxUsd.price).toBeGreaterThan(0);
      // convertNowReferenceUsdc must equal the reported SPCXx amount times the reported Pyth price:
      // if this drifts, the function is not actually deriving one from the other.
      expect(result.convertNowReferenceUsdc).toBeCloseTo(
        result.convertNowSpcxxUi * result.pyth.spcxxUsd.price,
        9,
      );
    },
  );

  it.runIf(HAS_KEY)("fetchHermesPrices returns both requested feed ids with the real response shape", async () => {
    const prices = await fetchHermesPrices([SPCXX_CRYPTO_FEED_ID, SPCX_EQUITY_FEED_ID]);
    expect(prices.has(SPCXX_CRYPTO_FEED_ID)).toBe(true);
    expect(prices.has(SPCX_EQUITY_FEED_ID)).toBe(true);
    for (const p of prices.values()) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.publishTimeUnix).toBeGreaterThan(0);
    }
  });

  it("without a key: the math (Jupiter side) is still verified live, independent of convertVsSell", async () => {
    const [sellQuote, convertQuote] = await Promise.all([
      getQuote({ inputMint: SPACEX_PRESTOCKS_MINT, outputMint: USDC_MINT, amount: ONE_SPACEX_RAW, slippageBps: 300 }),
      getQuote({ inputMint: SPACEX_PRESTOCKS_MINT, outputMint: SPCXX_MINT, amount: ONE_SPACEX_RAW, slippageBps: 300 }),
    ]);
    const sellNowUsdc = Number(sellQuote.outAmount) / 1_000_000;
    const convertNowSpcxxUi = Number(convertQuote.outAmount) / 10 ** SPCXX_DECIMALS;
    // A real, failable check: 1 SPACEX today is worth low hundreds of dollars either way.
    // If this stops holding the mints/decimals or the arithmetic broke.
    expect(sellNowUsdc).toBeGreaterThan(1);
    expect(sellNowUsdc).toBeLessThan(100_000);
    expect(convertNowSpcxxUi).toBeGreaterThan(0);
    expect(convertNowSpcxxUi).toBeLessThan(100_000);
  });
});
