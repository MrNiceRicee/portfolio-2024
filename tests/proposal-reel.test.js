import { expect, test } from "bun:test";
import { FilmReel } from "../src/scripts/proposalReel";

function withGrain(action, failure) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const writes = [];
  const buffers = [];
  let tiles = 0;
  const context = {
    createImageData(w, h) { const buffer = { data: new Uint8ClampedArray(w * h * 4) }; buffers.push(buffer); return buffer; },
    putImageData(buffer) { if (failure === "write") throw new Error("write unavailable"); writes.push(buffer.data.slice()); },
  };
  const target = {
    createPattern() { if (failure === "pattern") return null; return {}; },
    fillRect() {},
  };
  const document = { createElement() { tiles++; return { getContext: () => failure === "context" ? null : context }; } };
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  try { action({ target, writes, buffers, tiles: () => tiles }); }
  finally { original ? Object.defineProperty(globalThis, "document", original) : delete globalThis.document; }
}

for (const profile of ["quiet", "used"]) {
  test(`${profile} grain changes pixels, reuses one bounded buffer and has no catch-up refresh`, () => withGrain(({ target, writes, buffers, tiles }) => {
    let value = 0.1;
    const reel = new FilmReel(profile, target, () => value);
    reel.advance(16, 390, 820);
    expect(reel.hasGrain).toBe(true);
    const first = writes[0];
    value = 0.9;
    reel.advance(16, 390, 820);
    expect(writes.length).toBe(1);
    reel.advance(16, 390, 820);
    expect(writes.length).toBe(2);
    expect(writes[1]).not.toEqual(first);
    reel.advance(60_000, 390, 820);
    expect(writes.length).toBe(3);
    for (let i = 0; i < 240; i++) reel.advance(1000 / 60, 390, 820);
    expect(writes.length - 3).toBeGreaterThanOrEqual(95);
    expect(writes.length - 3).toBeLessThanOrEqual(97);
    expect(tiles()).toBe(1);
    expect(buffers.length).toBe(1);
    expect(buffers[0].data.length).toBeLessThanOrEqual(192 * 192 * 4);
    reel.reset();
    expect(reel.blemishes.length).toBe(0);
  }));

  test(`${profile} tiny defects expire, change shape and stay bounded through long runs and stalls`, () => withGrain(({ target }) => {
    let seed = 42;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const reel = new FilmReel(profile, target, random);
    const shapes = new Set();
    for (let i = 0; i < 2400; i++) {
      reel.advance(i % 200 === 0 ? 60_000 : 1000 / 60, 390, 820);
      expect(reel.blemishes.length).toBeLessThanOrEqual(2);
      for (const mark of reel.blemishes) {
        expect(mark.life).toBeGreaterThan(0);
        expect(mark.life).toBeLessThanOrEqual(125);
        expect(mark.fragments.length).toBeLessThanOrEqual(4);
        const extent = Math.max(...mark.fragments.map(f => f.y + f.height));
        expect(extent).toBeLessThanOrEqual(36);
        shapes.add(JSON.stringify(mark.fragments));
      }
    }
    expect(shapes.size).toBeGreaterThan(10);
    reel.reset(); reel.advance(16, 390, 820);
    const born = reel.blemishes[0];
    reel.advance(130, 390, 820);
    expect(reel.blemishes).not.toContain(born);
    reel.reset(); reel.advance(60_000, 0, 820);
    expect(reel.blemishes.length).toBe(0);
    const sizes = [];
    target.fillRect = (x, y, w, h) => sizes.push([w, h]);
    reel.advance(16, 1, 1); reel.draw(1, 1, false);
    expect(sizes.every(([w, h]) => w >= 0 && h >= 0)).toBe(true);
  }, "context"));
}
for (const failure of ["context", "write", "pattern"]) {
  test(`grain ${failure} failure keeps static-grain eligibility without repeated allocation`, () => withGrain(({ target, tiles, buffers }) => {
    const reel = new FilmReel("quiet", target, () => 0.5);
    for (let i = 0; i < 20; i++) reel.advance(100, 390, 820);
    expect(reel.hasGrain).toBe(false);
    expect(tiles()).toBe(1);
    expect(buffers.length).toBeLessThanOrEqual(1);
  }, failure));
}
