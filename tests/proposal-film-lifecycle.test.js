import { expect, test } from "bun:test";
import { initializeProposalFilm } from "../src/scripts/proposalFilm";

function withFilm(run, { failure, observation = true } = {}) {
  const root = { dataset: { shaderStatus: "loading" }, hasAttribute: () => false, classList: { contains: () => false } };
  const document = Object.assign(new EventTarget(), { documentElement: root, hidden: false });
  const window = Object.assign(new EventTarget(), { innerWidth: 390, innerHeight: 820 });
  const button = new EventTarget();
  const stats = { draws: 0, clears: 0, disconnected: false };
  const ctx = { clearRect() { stats.clears++; }, fillRect() { stats.draws++; } };
  const canvas = { width: 0, height: 0, getContext() {
    if (failure === "throw") throw new Error("context unavailable");
    return failure === "null" ? null : ctx;
  } };
  document.querySelector = (selector) => selector === "[data-pause-film]" ? button
    : selector === "[data-proposal-particles]" ? canvas : {};
  const reduced = Object.assign(new EventTarget(), { matches: false });
  const forced = Object.assign(new EventTarget(), { matches: false });
  const frames = new Map();
  let next = 0, intersection;
  const values = {
    document, window,
    matchMedia: (query) => query.includes("reduced") ? reduced : forced,
    IntersectionObserver: observation ? class {
      constructor(callback) { intersection = callback; }
      observe() {}
      disconnect() { stats.disconnected = true; }
    } : undefined,
    requestAnimationFrame(callback) { frames.set(++next, callback); return next; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const originals = Object.keys(values).map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const hide = (persisted) => window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted }));
  const ready = () => { root.dataset.shaderStatus = "ready"; document.dispatchEvent(new Event("proposalshaderchange")); };
  try {
    Object.entries(values).forEach(([key, value]) => Object.defineProperty(globalThis, key, { value, configurable: true }));
    initializeProposalFilm();
    run({ root, document, window, button, canvas, reduced, forced, frames, stats, hide, ready,
      intersect(visible) { intersection([{ isIntersecting: visible }]); },
      runFrame(time) { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time); },
    });
  } finally {
    hide(false);
    Object.keys(values).forEach((key, index) => originals[index] ? Object.defineProperty(globalThis, key, originals[index]) : delete globalThis[key]);
  }
}

test("film eligibility, pause, cadence, resize and page lifetime share one resumable loop", () => {
  withFilm(({ root, document, window, button, canvas, reduced, forced, frames, stats, hide, ready, intersect, runFrame }) => {
    expect(root.dataset.filmMotion).toBe("paused");
    expect(button.hidden).toBe(true);
    intersect(true);
    root.dataset.shaderStatus = "fallback"; document.dispatchEvent(new Event("proposalshaderchange"));
    expect(frames.size).toBe(0); expect(button.hidden).toBe(true);
    ready();
    expect(root.dataset.filmMotion).toBe("running"); expect(button.hidden).toBe(false);
    expect(frames.size).toBe(1);
    runFrame(0); expect(stats.draws).toBe(15);
    runFrame(8); expect(stats.draws).toBe(15); // high-refresh frames keep the original cadence
    runFrame(17); expect(stats.draws).toBe(30);
    runFrame(5000); expect(stats.draws).toBe(45); // one render after a stall, no catch-up burst
    button.dispatchEvent(new Event("click"));
    expect(button.textContent).toBe("Resume film"); expect(frames.size).toBe(0);
    hide(true); window.dispatchEvent(new Event("pageshow"));
    expect(root.dataset.filmMotion).toBe("paused"); expect(frames.size).toBe(0);
    expect(button.textContent).toBe("Resume film");
    button.dispatchEvent(new Event("click")); expect(frames.size).toBe(1);
    expect(button.textContent).toBe("Pause film");
    document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); expect(frames.size).toBe(0);
    document.hidden = false; document.dispatchEvent(new Event("visibilitychange")); expect(frames.size).toBe(1);
    intersect(false); expect(root.dataset.filmMotion).toBe("paused"); expect(frames.size).toBe(0);
    intersect(true); expect(frames.size).toBe(1);
    for (const media of [reduced, forced]) {
      media.matches = true; media.dispatchEvent(new Event("change"));
      expect(root.dataset.filmMotion).toBe("paused"); expect(frames.size).toBe(0); expect(button.hidden).toBe(true);
      media.matches = false; media.dispatchEvent(new Event("change")); expect(frames.size).toBe(1);
    }
    hide(true); expect(frames.size).toBe(0); expect(stats.disconnected).toBe(false);
    window.dispatchEvent(new Event("pageshow")); expect(frames.size).toBe(1);
    const beforeResize = stats.clears;
    window.dispatchEvent(new Event("resize")); expect(stats.clears).toBe(beforeResize + 1);
    window.innerWidth = 800; window.dispatchEvent(new Event("resize")); expect(canvas.width).toBe(800);
    hide(false); expect(frames.size).toBe(0); expect(stats.disconnected).toBe(true);
    window.dispatchEvent(new Event("pageshow")); ready(); button.dispatchEvent(new Event("click"));
    expect(frames.size).toBe(0); expect(root.dataset.filmMotion).toBe("paused");
  });
});

for (const failure of ["null", "throw"]) {
  test(`${failure} canvas keeps CSS grain pauseable through BFCache without particle work`, () => {
    withFilm(({ root, window, button, frames, stats, hide, ready, intersect }) => {
      ready(); intersect(true);
      expect(root.dataset.filmMotion).toBe("running"); expect(button.hidden).toBe(false);
      button.dispatchEvent(new Event("click"));
      expect(root.dataset.filmMotion).toBe("paused"); expect(button.textContent).toBe("Resume film");
      hide(true); window.dispatchEvent(new Event("pageshow"));
      expect(root.dataset.filmMotion).toBe("paused");
      button.dispatchEvent(new Event("click"));
      expect(root.dataset.filmMotion).toBe("running"); expect(button.textContent).toBe("Pause film");
      hide(true); expect(root.dataset.filmMotion).toBe("paused");
      window.dispatchEvent(new Event("pageshow")); expect(root.dataset.filmMotion).toBe("running");
      expect(frames.size).toBe(0); expect(stats.draws).toBe(0);
    }, { failure });
  });
}

test("missing visibility observation keeps motion and controls unavailable", () => {
  withFilm(({ root, button, frames, ready }) => {
    ready();
    expect(root.dataset.filmMotion).toBe("paused");
    expect(button.hidden).toBe(true); expect(frames.size).toBe(0);
  }, { observation: false });
});
