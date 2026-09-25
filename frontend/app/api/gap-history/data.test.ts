import assert from "node:assert/strict";
import test from "node:test";
import { verifySpaceXPriceScale } from "./data";

test("verifies the five-times SPACEX scale against Jupiter", () => {
  assert.equal(verifySpaceXPriceScale(580, 116, 5), 5);
});

test("accepts a pool already quoted in Jupiter UI units", () => {
  assert.equal(verifySpaceXPriceScale(116, 116, 5), 1);
});

test("rejects a price that matches neither supported scale", () => {
  assert.throws(() => verifySpaceXPriceScale(200, 100, 5), /Jupiter/);
});
