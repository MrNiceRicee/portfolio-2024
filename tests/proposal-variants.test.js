import { expect, test } from "bun:test";
import { getProposalConfig, getProposalFilmStatus, paperVariants } from "../src/scripts/proposalConfig";
import { FilmParticle } from "../src/scripts/proposalParticles";

test("paper and film allowlists are independent on study and portfolio routes", () => {
  for (const route of ["/", "/proposals"]) {
    const config = getProposalConfig(new URL(`https://example.com${route}?proposal=1&surface=fibers&film=used&theme=dark`));
    expect([config.surface, config.film, config.theme]).toEqual(["fibers", "used", "dark"]);
    expect(config.enabled).toBe(route === "/");
    const defaults = getProposalConfig(new URL(`https://example.com${route}?surface=constructor&film=__proto__`));
    expect([defaults.surface, defaults.film]).toEqual(["creased", "original"]);
  }
  expect(getProposalConfig(new URL("https://example.com/?surface=fibers")).film).toBe("original");
  expect(getProposalConfig(new URL("https://example.com/?film=quiet")).surface).toBe("creased");
});
test("fiber-only paper removes each crease mechanism, leaving baseline intact", () => {
  expect([paperVariants.fibers.folds, paperVariants.fibers.wrinkles, paperVariants.fibers.crumples]).toEqual([0, 0, 0]);
  expect([paperVariants.creased.folds, paperVariants.creased.wrinkles, paperVariants.creased.crumples]).toEqual([0.3, 0.12, 0.04]);
});
test("custom film dust suppresses the original long scratch but preserves dust size", () => {
  const particle = new FilmParticle(() => 0.999);
  expect(particle.drawHeight(false)).toBeCloseTo(particle.size * 2.998);
  expect(particle.drawHeight()).toBeGreaterThan(particle.size * 20);
});
test("retired and unknown film values safely return the original control", () => {
  for (const film of ["hairlines", "aged", "weave", "constructor", "__proto__", "unknown"]) {
    expect(getProposalConfig(new URL(`https://example.com/?proposal=1&film=${film}`)).film).toBe("original");
  }
});

test("study status explains motion eligibility without overriding preferences", () => {
  const running = { enabled: true, plain: false, reason: "running" };
  expect(getProposalFilmStatus(running)).toContain("Film running");
  expect(getProposalFilmStatus({ ...running, reason: "user-paused" })).toContain("Resume film");
  expect(getProposalFilmStatus({ ...running, reason: "loading" })).toContain("Film waiting");
  expect(getProposalFilmStatus({ ...running, reason: undefined })).toContain("Film waiting");
  expect(getProposalFilmStatus({ ...running, reason: "constructor" })).toContain("Film waiting");
  expect(getProposalFilmStatus({ ...running, reason: "fallback" })).toContain("static surface fallback");
  expect(getProposalFilmStatus({ ...running, reason: "reduced-motion" })).toContain("Reduced motion");
  expect(getProposalFilmStatus({ ...running, reason: "forced-colors" })).toContain("film effects are hidden");
  expect(getProposalFilmStatus({ ...running, reason: "offscreen" })).toContain("Bring the preview into view");
  expect(getProposalFilmStatus({ ...running, reason: "hidden" })).toContain("page is visible again");
  expect(getProposalFilmStatus({ ...running, reason: "unsupported" })).toContain("Visibility detection is unavailable");
  expect(getProposalFilmStatus({ ...running, reason: "unsupported" })).not.toContain("Resume");
  expect(getProposalFilmStatus({ ...running, enabled: false })).toContain("Reapply the comparison");
  expect(getProposalFilmStatus({ ...running, enabled: false })).not.toContain("Film running");
  expect(getProposalFilmStatus({ ...running, plain: true })).toContain("Plain surface");
});
