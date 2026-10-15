import { test, expect } from "bun:test";
import { BLACK_FRAME, LIT_FRAME, POWER_ON_MS, POWER_OFF_MS, blendLight, easeOut, powerFrame } from "../src/scripts/crtPower";

test("power settles exactly to lit or black even after a suspended frame", () => {
  for (const extra of [0, 16, 60_000]) {
    expect(powerFrame(true, POWER_ON_MS + extra)).toEqual(LIT_FRAME);
    expect(powerFrame(false, POWER_OFF_MS + extra)).toEqual(BLACK_FRAME);
  }
});

test("white ignition precedes the picture, and shutdown leaves a decaying bulb", () => {
  const ignition = powerFrame(true, 60);
  expect(ignition.core).toBeGreaterThan(0);
  expect(ignition.gain).toBe(0);
  expect(powerFrame(true, 120).beam).toBeGreaterThan(0);
  expect(powerFrame(true, 280).flood).toBeGreaterThan(0);
  const bulb = powerFrame(false, 400);
  expect(bulb.gain).toBe(0);
  expect(bulb.core).toBeGreaterThan(0);
  expect(powerFrame(false, 600).core).toBeLessThan(bulb.core);
  expect(powerFrame(false, 600).halo).toBeLessThan(bulb.halo);
});

test("a reversal begins at the captured brightness rather than jumping to an endpoint", () => {
  const interrupted = powerFrame(false, 130);
  expect(blendLight(interrupted, powerFrame(true, 0), easeOut(0))).toEqual(interrupted);
  expect(blendLight(interrupted, LIT_FRAME, easeOut(1))).toEqual(LIT_FRAME);
});

test("every transition sample remains finite and within physical control bounds", () => {
  const boundaries = [0, 79, 80, 159, 160, 179, 180, 329, 330, 449, 450, 519, 520, 1049, 1050];
  for (const on of [false, true]) for (const elapsed of boundaries) {
    const values = Object.values(powerFrame(on, elapsed));
    expect(values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
  }
});
