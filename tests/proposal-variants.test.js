import { expect, test } from "bun:test";
import { getProposalConfig, paperVariants } from "../src/scripts/proposalConfig";
import { FilmParticle } from "../src/scripts/proposalParticles";

test("paper and film allowlists are independent on study and portfolio routes", () => {
  for (const route of ["/", "/proposals"]) {
    const config = getProposalConfig(new URL(`https://example.com${route}?proposal=1&surface=fibers&film=used&theme=dark`));
    expect([config.surface, config.film, config.theme]).toEqual(["fibers", "used", "dark"]);
    expect(config.enabled).toBe(route === "/");
    const defaults = getProposalConfig(new URL(`https://example.com${route}?surface=constructor&film=__proto__`));
    expect([defaults.surface, defaults.film]).toEqual(["fibers", "original"]);
  }
  expect(getProposalConfig(new URL("https://example.com/?surface=fibers")).film).toBe("original");
  expect(getProposalConfig(new URL("https://example.com/?film=quiet")).surface).toBe("fibers");
});
test("the actual homepage defaults to the selected combination and system theme", () => {
  const config = getProposalConfig(new URL("https://example.com/"));
  expect(config.enabled).toBe(true);
  expect([config.surface, config.film, config.focus]).toEqual(["fibers", "original", "b"]);
  expect(config.theme).toBeUndefined();
  expect(config.fallback).toBe(false);
  for (const route of ["/assets", "/assets/", "/proposals"]) {
    expect(getProposalConfig(new URL(`https://example.com${route}?proposal=1`)).enabled).toBe(false);
  }
});
test("only explicit valid theme queries override system preference", () => {
  for (const theme of ["light", "dark"]) {
    expect(getProposalConfig(new URL(`https://example.com/?theme=${theme}`)).theme).toBe(theme);
  }
  for (const theme of ["", "system", "unknown", "constructor"]) {
    expect(getProposalConfig(new URL(`https://example.com/?theme=${theme}`)).theme).toBeUndefined();
  }
  expect(getProposalConfig(new URL("https://example.com/?fallback=1")).fallback).toBe(true);
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
