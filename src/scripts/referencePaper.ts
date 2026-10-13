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
  const host = document.querySelector<HTMLElement>(".portfolio-decoration");
  if (!host) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  host.dataset.paperSeed = String(seed);
  const lifetime = new AbortController();
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) lifetime.abort();
  }, { signal: lifetime.signal });
  root.dataset.paperTexture = "static-fallback";
  try {
    const size = 768, canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    if (!context) return;
    const originals = await Promise.all([referencePixels(host.dataset.paperLight!, size), referencePixels(host.dataset.paperDark!, size)]);
    if (lifetime.signal.aborted) return;
    canvas.width = canvas.height = size;
    const urls = { light: "", dark: "" };
    for (const [index, theme] of (["light", "dark"] as const).entries()) {
      const pixels = await renderPixels(originals[index]!, size, seed, () => !lifetime.signal.aborted);
      if (!pixels) return;
      context.putImageData(new ImageData(pixels, size, size), 0, 0);
      urls[theme] = canvas.toDataURL();
    }
    for (const theme of ["light", "dark"] as const) host.style.setProperty(`--crinkle-${theme}`, `url("${urls[theme]}")`);
    root.dataset.paperTexture = "reference";
  } catch (error) {
    if (!lifetime.signal.aborted) console.warn("[Portfolio paper] Reference texture unavailable", error);
  }
}
