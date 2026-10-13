const wrap = (value: number, period: number) => ((value % period) + period) % period;
const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};
const unit = (value: number) => value / 4294967295;
const smooth = (value: number) => value * value * (3 - 2 * value);
function noise(x: number, y: number, seed: number, period: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const sample = (dx: number, dy: number) => unit(hash(wrap(ix + dx, period), wrap(iy + dy, period), seed));
  const a = sample(0, 0), b = sample(1, 0), c = sample(0, 1), d = sample(1, 1);
  return a + fx * (b - a) + fy * (c - a + fx * (a - b - c + d));
}

/** Seeded fold-height fields with periodic noise warping. Shade their slopes,
 * not drawn outlines; taper ends and vary width along each crease. */
export function createPaperRelief(seed: number, frequency: number, size = 384) {
  let counter = 0;
  const random = () => unit(hash(++counter, 983, seed));
  const slopes = new Float32Array(size * size);
  let branch = { x: random(), y: random() };
  for (let crease = 0; crease < frequency * 12; crease++) {
    const start = crease % 4 === 1 ? branch : { x: random(), y: random() };
    const angle = random() * Math.PI * 2, length = (0.08 + 0.27 * random()) / Math.sqrt(frequency / 6);
    const bend = (random() - 0.5) * 0.03;
    const width = (0.7 + 3.2 * random()) / Math.sqrt(frequency / 6), depth = 0.4 + 0.6 * random();
    const points = Array.from({ length: 7 }, (_, j) => {
      const t = j / 6, curve = Math.sin(t * Math.PI) * bend;
      const x = start.x + Math.cos(angle) * length * t - Math.sin(angle) * curve;
      const y = start.y + Math.sin(angle) * length * t + Math.cos(angle) * curve;
      return { x: (x + 0.012 * (noise(x * 3, y * 3, seed, 3) - 0.5)) * size,
        y: (y + 0.012 * (noise(x * 5, y * 5, seed ^ 91, 5) - 0.5)) * size };
    });
    branch = { x: points[3]!.x / size, y: points[3]!.y / size };
    for (let segment = 0; segment < 6; segment++) {
      const a = points[segment]!, b = points[segment + 1]!;
      const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
      if (length2 < 0.001) continue;
      const len = Math.sqrt(length2), normal = (-dy * -0.8 + dx * -0.6) / len;
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        const radius = width * 3;
        const left = Math.max(0, Math.floor(Math.min(a.x, b.x) + ox - radius));
        const right = Math.min(size - 1, Math.ceil(Math.max(a.x, b.x) + ox + radius));
        const top = Math.max(0, Math.floor(Math.min(a.y, b.y) + oy - radius));
        const bottom = Math.min(size - 1, Math.ceil(Math.max(a.y, b.y) + oy + radius));
        for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
          const x = px - a.x - ox, y = py - a.y - oy, along = (x * dx + y * dy) / length2;
          if (along < 0 || along >= 1) continue;
          const progress = (segment + along) / 6;
          const taper = smooth(Math.min(1, progress * 8)) * smooth(Math.min(1, (1 - progress) * 8));
          const localWidth = width * (0.65 + 0.35 * Math.sin(progress * Math.PI));
          const distance = (x * -dy + y * dx) / (len * localWidth);
          slopes[py * size + px]! += depth * taper * Math.sign(distance) * Math.exp(-Math.abs(distance)) * normal;
        }
      }
    }
  }
  const light = new Uint8ClampedArray(size * size * 4), dark = new Uint8ClampedArray(light.length);
  for (let i = 0; i < slopes.length; i++) {
    const shade = Math.max(-1.5, Math.min(1.5, slopes[i]!));
    for (let channel = 0; channel < 3; channel++) {
      light[i * 4 + channel] = (channel === 2 ? 249 : 250) + shade * 40;
      dark[i * 4 + channel] = (channel === 0 ? 12 : channel === 1 ? 10 : 9) + shade * 64;
    }
    light[i * 4 + 3] = dark[i * 4 + 3] = 255;
  }
  return { light, dark, size };
}

export function initializeProceduralPaper() {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>(".proposal-decoration");
  if (!host || root.dataset.paper !== "crumpled" || root.hasAttribute("data-fallback")) return;
  let seed = Number(host.dataset.crinkleSeed), frequency = Number(host.dataset.crinkleFrequency);
  const tuner = document.querySelector<HTMLElement>("[data-paper-tuning]");
  const intensity = tuner?.querySelector<HTMLInputElement>("#crinkle-intensity");
  const density = tuner?.querySelector<HTMLInputElement>("#crinkle-frequency");
  const reroll = tuner?.querySelector<HTMLButtonElement>("[data-crinkle-reroll]");
  const link = tuner?.querySelector<HTMLAnchorElement>("[data-crinkle-link]");
  const status = tuner?.querySelector<HTMLElement>("[data-paper-status]");
  const backup = { light: host.style.getPropertyValue("--crinkle-light"), dark: host.style.getPropertyValue("--crinkle-dark") };
  const fallback = () => {
    for (const theme of ["light", "dark"] as const) host.style.setProperty(`--crinkle-${theme}`, backup[theme]);
    root.dataset.paperTexture = "static-fallback";
    if (density) density.disabled = true;
    if (reroll) reroll.disabled = true;
    if (status) status.hidden = false;
    if (link) link.textContent = "Save/share these settings";
    return false;
  };
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  const render = () => {
    if (!context) return fallback();
    try {
      const pixels = createPaperRelief(seed, frequency);
      canvas.width = canvas.height = pixels.size;
      const urls = { light: "", dark: "" };
      for (const theme of ["light", "dark"] as const) {
        context.putImageData(new ImageData(pixels[theme], pixels.size, pixels.size), 0, 0);
        urls[theme] = canvas.toDataURL();
      }
      for (const theme of ["light", "dark"] as const) host.style.setProperty(`--crinkle-${theme}`, `url("${urls[theme]}")`);
      host.dataset.crinkleSeed = String(seed);
      host.dataset.crinkleFrequency = String(frequency);
      root.dataset.paperTexture = "procedural";
      if (status) status.hidden = true;
      return true;
    } catch (error) { console.warn("[Portfolio paper] Procedural texture failed", error); return fallback(); }
  };
  root.dataset.paperTexture = "static-fallback";
  const available = render();
  if (!tuner || !intensity || !density || !reroll || !link) return;
  const lifetime = new AbortController(), options = { signal: lifetime.signal };
  let timer: number | undefined;
  const update = () => {
    host.style.setProperty("--crinkle-intensity", String(Number(intensity.value) / 100));
    tuner.querySelector<HTMLOutputElement>("[data-crinkle-output]")!.value = `${intensity.value}%`;
    tuner.querySelector<HTMLOutputElement>("[data-frequency-output]")!.value = String(frequency);
    tuner.querySelector<HTMLOutputElement>("[data-seed-output]")!.value = String(seed);
    const url = new URL(window.location.href);
    url.searchParams.set("crinkles", intensity.value);
    url.searchParams.set("frequency", String(frequency));
    url.searchParams.set("seed", String(seed));
    link.href = url.href;
    link.textContent = root.dataset.paperTexture === "procedural" ? "Save/share this pattern" : "Save/share these settings";
  };
  intensity.addEventListener("input", update, options);
  density.addEventListener("input", () => {
    frequency = Number(density.value); update();
    window.clearTimeout(timer); timer = window.setTimeout(render, 120);
  }, options);
  reroll.addEventListener("click", () => {
    const next = crypto.getRandomValues(new Uint32Array(1))[0]!;
    seed = next === seed ? (seed + 1) >>> 0 : next;
    window.clearTimeout(timer); render(); update();
  }, options);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) { window.clearTimeout(timer); lifetime.abort(); }
  }, options);
  intensity.disabled = false;
  density.disabled = reroll.disabled = !available;
  update();
}
