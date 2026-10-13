import { getPaperIntensity } from "./proposalConfig";

const wrap = (value: number, size: number) => ((value % size) + size) % size;
const hash = (value: number, seed: number) => {
  let n = Math.imul(value, 374761393) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

/** Feather only the narrow outer border so wrapped reference pixels meet. */
export function preparePaper(source: Uint8ClampedArray, size: number) {
  const pixels = source.slice(), band = 16;
  for (const axis of [0, 1]) for (let i = 0; i < band; i++) for (let j = 0; j < size; j++) {
    const a = (axis ? i * size + j : j * size + i) * 4;
    const b = (axis ? (size - 1 - i) * size + j : j * size + size - 1 - i) * 4;
    const weight = 0.5 * (1 - i / band) ** 2;
    for (let c = 0; c < 3; c++) {
      const left = pixels[a + c]!, right = pixels[b + c]!;
      pixels[a + c] = left * (1 - weight) + right * weight;
      pixels[b + c] = right * (1 - weight) + left * weight;
    }
  }
  return pixels;
}

/** Seed varies placement and orientation of existing folds, not their topology. */
export function* samplePaper(source: Uint8ClampedArray, size: number, seed: number) {
  const pixels = new Uint8ClampedArray(source.length);
  const ox = hash(1, seed) % size, oy = hash(2, seed) % size;
  const turn = hash(3, seed) % 4, mirror = hash(4, seed) % 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let u = mirror ? size - 1 - x : x, v = y;
      for (let rotation = 0; rotation < turn; rotation++) [u, v] = [size - 1 - v, u];
      const from = (wrap(v + oy, size) * size + wrap(u + ox, size)) * 4, to = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) pixels[to + c] = source[from + c]!;
    }
    if (y % 64 === 63) yield;
  }
  return pixels;
}

async function referencePixels(url: string, size: number) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D paper context unavailable");
  context.drawImage(image, 0, 0, size, size);
  return preparePaper(context.getImageData(0, 0, size, size).data, size);
}

async function renderPixels(source: Uint8ClampedArray, size: number, seed: number, current: () => boolean) {
  const work = samplePaper(source, size, seed);
  while (current()) {
    const step = work.next();
    if (step.done) return step.value;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return undefined;
}

export async function initializeReferencePaper() {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>(".proposal-decoration");
  if (!host || root.dataset.paper !== "crumpled" || root.hasAttribute("data-fallback")) return;
  let seed = Number(host.dataset.crinkleSeed), frequency = Number(host.dataset.crinkleFrequency);
  const tuner = document.querySelector<HTMLElement>("[data-paper-tuning]");
  const intensity = tuner?.querySelector<HTMLInputElement>("#crinkle-intensity");
  let override = host.dataset.crinkleIntensity === undefined ? undefined : Number(host.dataset.crinkleIntensity);
  if (intensity) {
    intensity.value = String(getPaperIntensity(root.classList.contains("dark"), override));
    const output = tuner?.querySelector<HTMLOutputElement>("[data-crinkle-output]");
    if (output) output.value = `${intensity.value}%`;
  }
  const density = tuner?.querySelector<HTMLInputElement>("#crinkle-frequency");
  const reroll = tuner?.querySelector<HTMLButtonElement>("[data-crinkle-reroll]");
  const link = tuner?.querySelector<HTMLAnchorElement>("[data-crinkle-link]");
  const status = tuner?.querySelector<HTMLElement>("[data-paper-status]");
  const backup = { light: host.style.getPropertyValue("--crinkle-light"), dark: host.style.getPropertyValue("--crinkle-dark") };
  const fallback = () => {
    for (const theme of ["light", "dark"] as const) host.style.setProperty(`--crinkle-${theme}`, backup[theme]);
    root.dataset.paperTexture = "static-fallback";
    if (reroll) reroll.disabled = true;
    if (status) status.hidden = false;
    if (link) link.textContent = "Save/share these settings";
    return false;
  };
  const lifetime = new AbortController(), options = { signal: lifetime.signal };
  let generation = 0;
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) { generation++; lifetime.abort(); }
  }, options);
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  const size = 768;
  // Decode each existing asset once; subsequent rerolls reuse its cached pixels.
  let sources: Promise<Uint8ClampedArray[]> | undefined;
  const render = async () => {
    const request = ++generation, requestedSeed = seed;
    if (!context) return fallback();
    try {
      sources ??= Promise.all([referencePixels(host.dataset.crinkleLight!, size), referencePixels(host.dataset.crinkleDark!, size)]);
      const originals = await sources;
      if (request !== generation || lifetime.signal.aborted) return false;
      canvas.width = canvas.height = size;
      const urls = { light: "", dark: "" };
      for (const [index, theme] of (["light", "dark"] as const).entries()) {
        const pixels = await renderPixels(originals[index]!, size, requestedSeed, () => request === generation && !lifetime.signal.aborted);
        if (!pixels) return false;
        context.putImageData(new ImageData(pixels, size, size), 0, 0);
        urls[theme] = canvas.toDataURL();
      }
      for (const theme of ["light", "dark"] as const) host.style.setProperty(`--crinkle-${theme}`, `url("${urls[theme]}")`);
      host.dataset.crinkleSeed = String(requestedSeed);
      host.dataset.crinkleFrequency = String(frequency);
      root.dataset.paperTexture = "reference";
      if (status) status.hidden = true;
      return true;
    } catch (error) {
      if (request !== generation || lifetime.signal.aborted) return false;
      console.warn("[Portfolio paper] Reference texture failed", error); return fallback();
    }
  };
  root.dataset.paperTexture = "static-fallback";
  const available = await render();
  if (lifetime.signal.aborted) return;
  host.style.setProperty("--crinkle-size", `${768 * Math.sqrt(6 / frequency)}px`);
  if (!tuner || !intensity || !density || !reroll || !link) return;
  const update = () => {
    host.style.setProperty("--crinkle-size", `${768 * Math.sqrt(6 / frequency)}px`);
    host.dataset.crinkleFrequency = String(frequency);
    intensity.value = String(getPaperIntensity(root.classList.contains("dark"), override));
    if (override === undefined) host.style.removeProperty("--crinkle-intensity");
    else host.style.setProperty("--crinkle-intensity", String(override / 100));
    tuner.querySelector<HTMLOutputElement>("[data-crinkle-output]")!.value = `${intensity.value}%`;
    tuner.querySelector<HTMLOutputElement>("[data-frequency-output]")!.value = String(frequency);
    tuner.querySelector<HTMLOutputElement>("[data-seed-output]")!.value = String(seed);
    const url = new URL(window.location.href);
    if (override === undefined) url.searchParams.delete("crinkles");
    else url.searchParams.set("crinkles", String(override));
    url.searchParams.set("frequency", String(frequency));
    url.searchParams.set("seed", String(seed));
    link.href = url.href;
    link.textContent = root.dataset.paperTexture === "reference" ? "Save/share this pattern" : "Save/share these settings";
  };
  intensity.addEventListener("input", () => { override = Number(intensity.value); update(); }, options);
  const appearance = new MutationObserver(update);
  appearance.observe(root, { attributes: true, attributeFilter: ["class"] });
  lifetime.signal.addEventListener("abort", () => appearance.disconnect(), { once: true });
  density.addEventListener("input", () => {
    frequency = Number(density.value); update();
  }, options);
  reroll.addEventListener("click", () => {
    const next = crypto.getRandomValues(new Uint32Array(1))[0]!;
    seed = next === seed ? (seed + 1) >>> 0 : next;
    void render(); update();
  }, options);
  intensity.disabled = false;
  density.disabled = false;
  reroll.disabled = !available;
  update();
}
