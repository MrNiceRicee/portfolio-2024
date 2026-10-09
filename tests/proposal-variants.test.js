import { expect, test } from "bun:test";
import { getProposalConfig, getProposalFilmStatus, paperVariants } from "../src/scripts/proposalConfig";
import { FilmScratches, FilmParticle } from "../src/scripts/proposalParticles";

test("paper and film allowlists are independent on study and portfolio routes", () => {
  for (const route of ["/", "/proposals"]) {
    const config = getProposalConfig(new URL(`https://example.com${route}?proposal=1&surface=fibers&film=aged&theme=dark`));
    expect([config.surface, config.film, config.theme]).toEqual(["fibers", "aged", "dark"]);
    expect(config.enabled).toBe(route === "/");
    const defaults = getProposalConfig(new URL(`https://example.com${route}?surface=constructor&film=__proto__`));
    expect([defaults.surface, defaults.film]).toEqual(["creased", "original"]);
  }
  expect(getProposalConfig(new URL("https://example.com/?surface=fibers")).film).toBe("original");
  expect(getProposalConfig(new URL("https://example.com/?film=hairlines")).surface).toBe("creased");
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
for (const profile of ["hairlines", "aged"]) {
  test(`${profile} scratches are transient, bounded and do not catch up after suspension`, () => {
    const scratches = new FilmScratches(profile, () => 0.999);
    scratches.advance(16, 390, 720);
    expect(scratches.lines.length).toBe(profile === "aged" ? 3 : 2);
    for (const line of scratches.lines) {
      expect(line.width).toBeGreaterThanOrEqual(1);
      expect(line.width).toBeLessThanOrEqual(profile === "aged" ? 1.6 : 1);
      expect(line.height).toBeGreaterThanOrEqual(profile === "aged" ? 240 : 120);
      expect(line.height).toBeLessThanOrEqual(profile === "aged" ? 640 : 300);
      expect(line.y + line.height).toBeLessThanOrEqual(720);
      expect(line.x + line.width).toBeLessThanOrEqual(390);
      expect(line.life).toBeGreaterThanOrEqual(profile === "aged" ? 220 : 700);
      expect(line.life).toBeLessThanOrEqual(profile === "aged" ? 360 : 1200);
      // even the dark canvas's 25% opacity must leave visible contrast
      expect(line.opacity * 0.25).toBeGreaterThanOrEqual(0.16);
    }
    if (profile === "aged") expect(new Set(scratches.lines.map((line) => line.x)).size).toBe(3);
    scratches.advance(1200, 390, 720);
    expect(scratches.lines.length).toBe(0);
    scratches.advance(60_000, 390, 720);
    expect(scratches.lines.length).toBeLessThanOrEqual(3);
    scratches.reset();
    expect(scratches.lines.length).toBe(0);
  });

  test(`${profile} keeps a quiet gap after lines expire and clamps short viewports`, () => {
    const scratches = new FilmScratches(profile, () => 0);
    const life = profile === "aged" ? 220 : 700;
    const gap = profile === "aged" ? 700 : 600;
    scratches.advance(16, 30, 80);
    expect(scratches.lines.length).toBe(1);
    expect(scratches.lines[0].height).toBe(80);
    expect(scratches.lines[0].life).toBe(life);
    scratches.advance(life, 30, 80);
    expect(scratches.lines.length).toBe(0);
    scratches.advance(gap - 1, 30, 80);
    expect(scratches.lines.length).toBe(0);
    scratches.advance(1, 30, 80);
    expect(scratches.lines.length).toBe(1);
    scratches.reset();
    scratches.advance(60_000, 0, 80);
    expect(scratches.lines.length).toBe(0);
  });
}

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
