import { expect, test } from "bun:test";
import { initializeProposalParticles } from "../src/scripts/proposalParticles";
import { initializeProposalFilm } from "../src/scripts/proposalFilm";

for (const film of ["original", "quiet", "used"]) {
  for (const failure of ["null", "throw"]) {
    test(`${film}: ${failure} main context publishes truthful motion and control availability`, () => {
      const values = {
        document: Object.assign(new EventTarget(), {
          documentElement: { dataset: { film, shaderStatus: "ready" }, hasAttribute: () => false }, hidden: false,
        }),
        window: new EventTarget(),
        matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
        IntersectionObserver: class { constructor(callback) { this.callback = callback; } observe() { intersection = this.callback; } disconnect() {} },
        requestAnimationFrame() { frames++; return frames; }, cancelAnimationFrame() {},
      };
      const button = new EventTarget();
      let intersection;
      let frames = 0;
      values.document.querySelector = (selector) => selector === "[data-proposal-particles]" ? {
        getContext() {
          if (failure === "throw") throw new Error("Main context unavailable");
          return null;
        },
      }
        : selector === "[data-pause-film]" ? button : {};
      const originals = Object.keys(values).map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
      try {
        Object.entries(values).forEach(([key, value]) => Object.defineProperty(globalThis, key, { value, configurable: true }));
        const available = initializeProposalParticles();
        initializeProposalFilm(available);
        intersection([{ isIntersecting: true }]);
        const { dataset } = values.document.documentElement;
        expect(frames).toBe(0);
        expect(available).toBe(false);
        expect(dataset.filmMotion).toBe(film === "original" ? "running" : "paused");
        expect(dataset.filmMotionReason).toBe(film === "original" ? "grain-only" : "renderer-unavailable");
        expect(button.hidden).toBe(film !== "original");
        if (film === "original") {
          button.dispatchEvent(new Event("click"));
          expect(dataset.filmMotion).toBe("paused");
          expect(dataset.filmMotionReason).toBe("user-paused");
          button.dispatchEvent(new Event("click"));
          expect(dataset.filmMotionReason).toBe("grain-only");
          values.window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
          expect(dataset.filmMotionReason).toBe("hidden");
          values.window.dispatchEvent(new Event("pageshow"));
          expect(dataset.filmMotionReason).toBe("grain-only");
          expect(frames).toBe(0);
        }
        const exit = Object.assign(new Event("pagehide"), { persisted: false }); values.window.dispatchEvent(exit);
      } finally {
        Object.keys(values).forEach((key, index) => originals[index] ? Object.defineProperty(globalThis, key, originals[index]) : delete globalThis[key]);
      }
    });
  }
}
