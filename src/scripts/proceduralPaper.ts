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

/** Shade continuous, softly peaked fold ridges. Each curved crease contributes
 * once per pixel, so segment joins cannot create overlapping facets or cut edges. */
function* paperRelief(seed: number, frequency: number, size = 768) {
  let counter = 0;
  const random = () => unit(hash(++counter, 983, seed));
  const slopes = new Float32Array(size * size);
  const nearest = new Float32Array(slopes.length), position = new Float32Array(slopes.length);
  const stamps = new Uint16Array(slopes.length);
  let branch = { x: random(), y: random() };
  for (let crease = 0; crease < frequency * 48; crease++) {
    const start = crease % 4 === 1 ? branch : { x: random(), y: random() };
    const angle = random() * Math.PI * 2, length = (0.06 + 0.22 * random()) / Math.sqrt(frequency / 6);
    const bend = (random() - 0.5) * 0.07;
    const width = (0.6 + 1.6 * random()) / Math.sqrt(frequency / 6), depth = 0.5 + 0.5 * random();
    const points = Array.from({ length: 17 }, (_, j) => {
      const t = j / 16, curve = Math.sin(t * Math.PI) * bend;
      const x = start.x + Math.cos(angle) * length * t - Math.sin(angle) * curve;
      const y = start.y + Math.sin(angle) * length * t + Math.cos(angle) * curve;
      return { x: (x + 0.008 * (noise(x * 3, y * 3, seed, 3) - 0.5)) * size,
        y: (y + 0.008 * (noise(x * 5, y * 5, seed ^ 91, 5) - 0.5)) * size };
    });
    branch = { x: points[8]!.x / size, y: points[8]!.y / size };
    const touched: number[] = [], stamp = crease + 1;
    for (let segment = 0; segment < 16; segment++) {
      const a = points[segment]!, b = points[segment + 1]!;
      const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
      if (length2 < 0.001) continue;
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        const radius = width * 4;
        const left = Math.max(0, Math.floor(Math.min(a.x, b.x) + ox - radius));
        const right = Math.min(size - 1, Math.ceil(Math.max(a.x, b.x) + ox + radius));
        const top = Math.max(0, Math.floor(Math.min(a.y, b.y) + oy - radius));
        const bottom = Math.min(size - 1, Math.ceil(Math.max(a.y, b.y) + oy + radius));
        for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
          const x = px - a.x - ox, y = py - a.y - oy;
          const along = Math.max(0, Math.min(1, (x * dx + y * dy) / length2));
          const crossX = x - along * dx, crossY = y - along * dy;
          const distance = (crossX * crossX + crossY * crossY) * Math.sign(x * -dy + y * dx);
          const index = py * size + px;
          if (stamps[index] !== stamp) {
            stamps[index] = stamp; nearest[index] = distance; touched.push(index);
          } else if (Math.abs(distance) >= Math.abs(nearest[index]!)) continue;
          nearest[index] = distance;
          position[index] = (segment + along) / 16;
        }
      }
    }
    for (const index of touched) {
      const progress = position[index]!;
      const taper = smooth(Math.min(1, progress * 12)) * smooth(Math.min(1, (1 - progress) * 12));
      const localWidth = width * (0.75 + 0.25 * Math.sin(progress * Math.PI));
      const squared = nearest[index]!;
      const distance = Math.sign(squared) * Math.sqrt(Math.abs(squared)) / localWidth;
      const normal = Math.cos(angle + Math.PI / 2) * -0.8 + Math.sin(angle + Math.PI / 2) * -0.6;
      slopes[index]! += depth * taper * distance * Math.exp(-distance * distance / 2) * normal;
    }
    if (crease % 8 === 7) yield;
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

/** Synchronous entry point for material inspection and deterministic checks. */
export function createPaperRelief(seed: number, frequency: number, size = 768) {
  const work = paperRelief(seed, frequency, size);
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

async function renderPixels(seed: number, frequency: number, current: () => boolean) {
  const work = paperRelief(seed, frequency);
  while (current()) {
    const step = work.next();
    if (step.done) return step.value;
    // Only texture generation yields; there is no idle animation or scroll loop.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return undefined;
}

export async function initializeProceduralPaper() {
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
    host.style.removeProperty("--crinkle-size");
    host.style.removeProperty("--crinkle-width");
    root.dataset.paperTexture = "static-fallback";
    if (density) density.disabled = true;
    if (reroll) reroll.disabled = true;
    if (status) status.hidden = false;
    if (link) link.textContent = "Save/share these settings";
    return false;
  };
  const lifetime = new AbortController(), options = { signal: lifetime.signal };
  let timer: number | undefined, generation = 0;
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) { generation++; window.clearTimeout(timer); lifetime.abort(); }
  }, options);
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  const render = async () => {
    const request = ++generation, requestedSeed = seed, requestedFrequency = frequency;
    if (!context) return fallback();
    try {
      const pixels = await renderPixels(requestedSeed, requestedFrequency, () => request === generation && !lifetime.signal.aborted);
      if (!pixels) return false;
      canvas.width = canvas.height = pixels.size;
      const urls = { light: "", dark: "" };
      for (const theme of ["light", "dark"] as const) {
        context.putImageData(new ImageData(pixels[theme], pixels.size, pixels.size), 0, 0);
        urls[theme] = canvas.toDataURL();
      }
      for (const theme of ["light", "dark"] as const) host.style.setProperty(`--crinkle-${theme}`, `url("${urls[theme]}")`);
      host.style.setProperty("--crinkle-size", "1536px");
      host.style.setProperty("--crinkle-width", "max(1536px, 100%)");
      host.dataset.crinkleSeed = String(requestedSeed);
      host.dataset.crinkleFrequency = String(requestedFrequency);
      root.dataset.paperTexture = "procedural";
      if (status) status.hidden = true;
      return true;
    } catch (error) { console.warn("[Portfolio paper] Procedural texture failed", error); return fallback(); }
  };
  root.dataset.paperTexture = "static-fallback";
  const available = await render();
  if (lifetime.signal.aborted) return;
  if (!tuner || !intensity || !density || !reroll || !link) return;
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
    generation++; frequency = Number(density.value); update();
    window.clearTimeout(timer); timer = window.setTimeout(() => { void render(); }, 120);
  }, options);
  reroll.addEventListener("click", () => {
    const next = crypto.getRandomValues(new Uint32Array(1))[0]!;
    seed = next === seed ? (seed + 1) >>> 0 : next;
    window.clearTimeout(timer); void render(); update();
  }, options);
  intensity.disabled = false;
  density.disabled = reroll.disabled = !available;
  update();
}
