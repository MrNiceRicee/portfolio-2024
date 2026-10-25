const hash = (value: number, seed: number) => {
  let n = Math.imul(value, 374761393) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

/** Feather only the narrow outer border so wrapped reference pixels meet. */
export function preparePaper(source: Uint8ClampedArray, size: number) {
  const pixels = source.slice(),
    band = 16;
  for (const axis of [0, 1])
    for (let i = 0; i < band; i++)
      for (let j = 0; j < size; j++) {
        const a = (axis ? i * size + j : j * size + i) * 4;
        const b = (axis ? (size - 1 - i) * size + j : j * size + size - 1 - i) * 4;
        const weight = 0.5 * (1 - i / band) ** 2;
        for (let c = 0; c < 3; c++) {
          const left = pixels[a + c]!,
            right = pixels[b + c]!;
          pixels[a + c] = left * (1 - weight) + right * weight;
          pixels[b + c] = right * (1 - weight) + left * weight;
        }
      }
  return pixels;
}

/** Integer canvas transforms preserve seeded placement without resampling pixels. */
export function drawPaper(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  seed: number,
) {
  const size = source.width;
  const mapping = new DOMMatrix().translate(hash(1, seed) % size, hash(2, seed) % size);
  const turn = new DOMMatrix([0, 1, -1, 0, size, 0]);
  for (let i = 0; i < hash(3, seed) % 4; i++) mapping.multiplySelf(turn);
  if (hash(4, seed) % 2) mapping.multiplySelf(new DOMMatrix([-1, 0, 0, 1, size, 0]));
  context.save();
  context.imageSmoothingEnabled = false;
  context.setTransform(mapping.inverse());
  for (const x of [0, size]) for (const y of [0, size]) context.drawImage(source, x, y);
  context.restore();
}

async function referenceCanvas(url: string, size: number) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D paper context unavailable");
  context.drawImage(image, 0, 0, size, size);
  context.putImageData(
    new ImageData(preparePaper(context.getImageData(0, 0, size, size).data, size), size, size),
    0,
    0,
  );
  return canvas;
}

export async function initializeReferencePaper() {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>(".portfolio-decoration");
  if (!host) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  host.dataset.paperSeed = String(seed);
  const lifetime = new AbortController();
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) lifetime.abort();
    },
    { signal: lifetime.signal },
  );
  root.dataset.paperTexture = "static-fallback";
  try {
    const size = 768,
      canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) return;
    const originals = await Promise.all([
      referenceCanvas(host.dataset.paperLight!, size),
      referenceCanvas(host.dataset.paperDark!, size),
    ]);
    if (lifetime.signal.aborted) return;
    canvas.width = canvas.height = size;
    const urls = { light: "", dark: "" };
    for (const [index, theme] of (["light", "dark"] as const).entries()) {
      drawPaper(context, originals[index]!, seed);
      urls[theme] = canvas.toDataURL();
    }
    for (const theme of ["light", "dark"] as const)
      host.style.setProperty(`--crinkle-${theme}`, `url("${urls[theme]}")`);
    root.dataset.paperTexture = "reference";
  } catch (error) {
    if (!lifetime.signal.aborted)
      console.warn("[Portfolio paper] Reference texture unavailable", error);
  }
}
