export interface LightFrame {
  x: number;
  y: number;
  gain: number;
  beam: number;
  width: number;
  core: number;
  halo: number;
  flood: number;
}

export const BLACK_FRAME: Readonly<LightFrame> = { x: 0, y: 0, gain: 0, beam: 0, width: 0, core: 0, halo: 0, flood: 0 };
export const LIT_FRAME: Readonly<LightFrame> = { x: 1, y: 1, gain: 1, beam: 0, width: 0, core: 0, halo: 0, flood: 0 };
export const POWER_ON_MS = 520;
export const POWER_OFF_MS = 1050;

export const easeOut = (value: number): number => 1 - (1 - Math.min(1, Math.max(0, value))) ** 3;

export function powerFrame(on: boolean, elapsed: number): LightFrame {
  if (elapsed >= (on ? POWER_ON_MS : POWER_OFF_MS)) return { ...(on ? LIT_FRAME : BLACK_FRAME) };
  if (on) {
    if (elapsed < 80) return { ...BLACK_FRAME, core: easeOut(elapsed / 80), halo: easeOut(elapsed / 80) * 0.75 };
    if (elapsed < 180) {
      const progress = easeOut((elapsed - 80) / 100);
      return { ...BLACK_FRAME, beam: progress, width: 0.45 * progress, core: 1 - progress, halo: 0.75 * (1 - progress) };
    }
    const progress = Math.min(1, Math.max(0, (elapsed - 180) / 270));
    const opening = easeOut(progress);
    return { x: 1, y: Math.max(0.001, opening), gain: easeOut((progress - 0.45) / 0.55), beam: (1 - opening) ** 2, width: 0.45, core: 0, halo: 0, flood: Math.sin(progress * Math.PI) };
  }
  if (elapsed < 160) {
    const progress = Math.max(0, elapsed / 160);
    return { x: 1, y: Math.max(0.001, (1 - progress) ** 3), gain: 1 - progress ** 2, beam: progress ** 2, width: 0.45, core: 0, halo: 0, flood: Math.sin(progress * Math.PI) };
  }
  if (elapsed < 330) {
    const progress = (elapsed - 160) / 170;
    return { ...BLACK_FRAME, beam: 1 - progress ** 8, width: 0.45 * (1 - progress) ** 2, core: easeOut((progress - 0.4) / 0.6), halo: easeOut(progress) };
  }
  const age = elapsed - 330;
  return { ...BLACK_FRAME, core: Math.exp(-age / 85), halo: Math.exp(-age / 190) };
}

export function blendLight(from: LightFrame, to: LightFrame, amount: number): LightFrame {
  const mix = (start: number, end: number) => start + (end - start) * amount;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), gain: mix(from.gain, to.gain), beam: mix(from.beam, to.beam), width: mix(from.width, to.width), core: mix(from.core, to.core), halo: mix(from.halo, to.halo), flood: mix(from.flood, to.flood) };
}
