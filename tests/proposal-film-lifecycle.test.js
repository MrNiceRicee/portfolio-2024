import { expect, test } from "bun:test";
import { initializeProposalFilm } from "../src/scripts/proposalFilm";
import { initializeProposalParticles } from "../src/scripts/proposalParticles";

for (const film of ["original", "quiet", "used"]) {
for (const grainFailure of [false, true]) {
test(`${film} ${grainFailure ? "grain fallback" : "fresh grain"} film and particles pause for user, hidden/offscreen, motion preferences and page lifecycle`, () => {
  const keys = ["document", "window", "matchMedia", "IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame"];
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const root = { dataset: { shaderStatus: "loading", film }, hasAttribute: () => false, classList: { contains: () => false } };
  const document = new EventTarget();
  document.documentElement = root;
  document.hidden = false;
  const window = Object.assign(new EventTarget(), { innerWidth: 390, innerHeight: 820 });
  const button = new EventTarget();
  const host = {};
  let draws = 0;
  let clears = 0;
  let grainWrites = 0;
  let allocations = 0;
  const tileContext = {
    createImageData(w, h) { allocations++; if (grainFailure) throw new Error("unavailable"); return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() { grainWrites++; },
  };
  document.createElement = () => ({ width: 0, height: 0, getContext: () => tileContext });
  const ctx = { createPattern: () => ({}), clearRect() { clears++; }, fillRect() { draws++; } };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  document.querySelector = (selector) => selector === "[data-proposal-film]" ? host
    : selector === "[data-pause-film]" ? button
    : selector === "[data-proposal-particles]" ? canvas : null;
  const reduced = Object.assign(new EventTarget(), { matches: false });
  const forced = Object.assign(new EventTarget(), { matches: false });
  const frames = new Map();
  let next = 0;
  let intersection;
  let disconnected = false;
  const reasons = [];
  document.addEventListener("proposalfilmchange", () => reasons.push(root.dataset.filmMotionReason));
  const values = {
    document, window,
    matchMedia: (query) => query.includes("reduced") ? reduced : forced,
    IntersectionObserver: class {
      constructor(callback) { intersection = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    requestAnimationFrame(callback) { const id = ++next; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const runFrame = (time) => {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id); callback(time);
  };
  const pageHide = (persisted) => {
    const event = new Event("pagehide"); Object.defineProperty(event, "persisted", { value: persisted }); window.dispatchEvent(event);
  };
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, { value: values[key], configurable: true, writable: true });
    initializeProposalFilm(initializeProposalParticles());
    expect(root.dataset.filmMotion).toBe("paused");
    expect(root.dataset.filmMotionReason).toBe("loading");
    expect(frames.size).toBe(0);
    intersection([{ isIntersecting: true }]);
    expect(reasons).toEqual(["loading"]); // unchanged eligibility does not repeat an announcement
    root.dataset.shaderStatus = "fallback"; document.dispatchEvent(new Event("proposalshaderchange"));
    expect(root.dataset.filmMotionReason).toBe("fallback");
    expect(reasons).toEqual(["loading", "fallback"]); // the reason changes while motion stays paused
    expect(frames.size).toBe(0);
    root.dataset.shaderStatus = "ready"; document.dispatchEvent(new Event("proposalshaderchange"));
    expect(root.dataset.filmMotion).toBe("running");
    expect(root.dataset.filmMotionReason).toBe("running");
    expect(frames.size).toBe(1);
    const dustCount = film === "quiet" ? 9 : 15;
    const maxExtraDraws = film === "original" ? 0 : 9;
    runFrame(0); expect(draws).toBeGreaterThanOrEqual(dustCount); expect(draws).toBeLessThanOrEqual(dustCount + maxExtraDraws);
    expect(allocations).toBe(film === "original" ? 0 : 1);
    expect(grainWrites).toBe(film === "original" || grainFailure ? 0 : 1);
    if (film !== "original") expect(root.dataset.reelGrain).toBe(grainFailure ? "fallback" : "ready");
    const firstDraws = draws;
    runFrame(8); expect(draws).toBe(firstDraws); // high-refresh display does not double particle cadence
    runFrame(17); expect(draws - firstDraws).toBeGreaterThanOrEqual(dustCount); expect(draws - firstDraws).toBeLessThanOrEqual(dustCount + maxExtraDraws);
    const beforeStall = draws;
    runFrame(5000); expect(draws - beforeStall).toBeGreaterThanOrEqual(dustCount); expect(draws - beforeStall).toBeLessThanOrEqual(dustCount + maxExtraDraws); // no catch-up burst
    const beforePauseGrain = grainWrites;
    button.dispatchEvent(new Event("click"));
    expect(grainWrites).toBe(beforePauseGrain);
    expect(button.textContent).toBe("Resume film"); expect(frames.size).toBe(0);
    expect(root.dataset.filmMotionReason).toBe("user-paused");
    reduced.matches = true; reduced.dispatchEvent(new Event("change"));
    expect(root.dataset.filmMotionReason).toBe("reduced-motion"); expect(frames.size).toBe(0);
    forced.matches = true; forced.dispatchEvent(new Event("change"));
    expect(root.dataset.filmMotionReason).toBe("forced-colors"); expect(frames.size).toBe(0);
    forced.matches = false; forced.dispatchEvent(new Event("change"));
    expect(root.dataset.filmMotionReason).toBe("reduced-motion");
    reduced.matches = false; reduced.dispatchEvent(new Event("change"));
    expect(root.dataset.filmMotionReason).toBe("user-paused"); expect(frames.size).toBe(0);
    button.dispatchEvent(new Event("click")); expect(frames.size).toBe(1);
    expect(root.dataset.filmMotionReason).toBe("running");
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); expect(frames.size).toBe(0);
    expect(root.dataset.filmMotionReason).toBe("hidden");
    document.hidden = false; document.dispatchEvent(new Event("visibilitychange")); expect(frames.size).toBe(1);
    intersection([{ isIntersecting: false }]); expect(frames.size).toBe(0);
    expect(root.dataset.filmMotionReason).toBe("offscreen");
    intersection([{ isIntersecting: true }]); expect(frames.size).toBe(1);
    reduced.matches = true; reduced.dispatchEvent(new Event("change")); expect(frames.size).toBe(0); expect(button.hidden).toBe(true);
    expect(root.dataset.filmMotionReason).toBe("reduced-motion");
    reduced.matches = false; reduced.dispatchEvent(new Event("change")); expect(frames.size).toBe(1);
    forced.matches = true; forced.dispatchEvent(new Event("change")); expect(frames.size).toBe(0);
    expect(root.dataset.filmMotionReason).toBe("forced-colors");
    forced.matches = false; forced.dispatchEvent(new Event("change")); expect(frames.size).toBe(1);
    pageHide(true); expect(frames.size).toBe(0); expect(disconnected).toBe(false);
    expect(root.dataset.filmMotionReason).toBe("hidden");
    window.dispatchEvent(new Event("pageshow")); expect(frames.size).toBe(1);
    expect(root.dataset.filmMotionReason).toBe("running");
    window.innerWidth = 800; window.dispatchEvent(new Event("resize")); expect(canvas.width).toBe(800);
    pageHide(false); expect(frames.size).toBe(0); expect(disconnected).toBe(true);
    window.dispatchEvent(new Event("pageshow")); expect(frames.size).toBe(0);
    expect(clears).toBeGreaterThan(3);
  } finally {
    keys.forEach((key, index) => originals[index] ? Object.defineProperty(globalThis, key, originals[index]) : delete globalThis[key]);
  }
});

}
}

test("missing visibility observation publishes unsupported and keeps film controls unavailable", () => {
  const keys = ["document", "window", "matchMedia", "IntersectionObserver"];
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const root = { dataset: { shaderStatus: "ready" }, hasAttribute: () => false };
  const document = new EventTarget();
  document.documentElement = root;
  document.hidden = false;
  const window = new EventTarget();
  const button = new EventTarget();
  document.querySelector = (selector) => selector === "[data-pause-film]" ? button : {};
  const reduced = Object.assign(new EventTarget(), { matches: false });
  const forced = Object.assign(new EventTarget(), { matches: false });
  const values = { document, window, matchMedia: (query) => query.includes("reduced") ? reduced : forced, IntersectionObserver: undefined };
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, { value: values[key], configurable: true, writable: true });
    initializeProposalFilm(true);
    expect(root.dataset.filmMotion).toBe("paused");
    expect(root.dataset.filmMotionReason).toBe("unsupported");
    expect(button.hidden).toBe(true);
    reduced.matches = true; reduced.dispatchEvent(new Event("change"));
    expect(root.dataset.filmMotionReason).toBe("reduced-motion");
    reduced.matches = false; reduced.dispatchEvent(new Event("change"));
    expect(root.dataset.filmMotionReason).toBe("unsupported");
    const exit = new Event("pagehide"); Object.defineProperty(exit, "persisted", { value: false }); window.dispatchEvent(exit);
  } finally {
    keys.forEach((key, index) => originals[index] ? Object.defineProperty(globalThis, key, originals[index]) : delete globalThis[key]);
  }
});
