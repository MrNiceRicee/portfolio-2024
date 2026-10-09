import { expect, test } from "bun:test";
import { FilmParticle } from "../src/scripts/proposalParticles";

test("original minimum dust size, opacity and five-frame lifetime", () => {
  const particle = new FilmParticle(() => 0);
  particle.respawn(390, 820);
  expect(particle.size).toBe(0.25);
  expect(particle.opacity).toBe(0.1);
  expect(particle.life).toBeCloseTo(5 * 1000 / 60);
  particle.advance(4 * 1000 / 60, 390, 820);
  expect(particle.life).toBeCloseTo(1000 / 60);
  particle.advance(2 * 1000 / 60, 390, 820);
  expect(particle.life).toBeCloseTo(5 * 1000 / 60);
});

test("respawn changes position and opacity but preserves original particle size", () => {
  let value = 0;
  const particle = new FilmParticle(() => value);
  particle.respawn(390, 820);
  value = 0.5;
  particle.advance(1000, 390, 820);
  expect([particle.x, particle.y, particle.opacity, particle.size]).toEqual([195, 410, 0.35, 0.25]);
  expect(particle.life).toBeCloseTo(10 * 1000 / 60);
});

test("only a draw above the original 99 percent threshold makes an elongated scratch", () => {
  let value = 0.99;
  const particle = new FilmParticle(() => value);
  expect(particle.drawHeight()).toBeCloseTo(particle.size * 2.98);
  value = 0.999;
  expect(particle.drawHeight()).toBeCloseTo(particle.size * 29.975);
});
