import type { FilmVariant } from "./proposalConfig";
type ReelProfile = Exclude<FilmVariant, "original">;
interface Fragment { x: number; y: number; width: number; height: number; }
interface Blemish { x: number; y: number; life: number; opacity: number; light: boolean; fragments: Fragment[]; }
const profiles = {
  quiet: { gap: 240, spread: 800, grain: 46 },
  used: { gap: 100, spread: 460, grain: 66 },
} as const;
const grainSize = 128;
const filmInterval = 1000 / 24;

/** fresh film frames and tiny defects, driven by the existing particle loop */
export class FilmReel {
  private marks: Blemish[] = [];
  private wait = 0;
  private grainElapsed = filmInterval;
  private tile: HTMLCanvasElement | undefined;
  private tileContext: CanvasRenderingContext2D | undefined;
  private pixels: ImageData | undefined;
  private pattern: CanvasPattern | undefined;
  get blemishes(): readonly Readonly<Blemish>[] { return this.marks; }
  get hasGrain() { return this.pattern !== undefined; }

  constructor(private profile: ReelProfile, private target: CanvasRenderingContext2D, private random = Math.random) {
    // allocation or capability failures leave the static SVG grain available
    try {
      const tile = document.createElement("canvas");
      tile.width = tile.height = grainSize;
      const context = tile.getContext("2d");
      if (!context) return;
      this.pixels = context.createImageData(grainSize, grainSize);
      this.tile = tile;
      this.tileContext = context;
    } catch { this.disableGrain(); }
  }

  private disableGrain() {
    this.tile = undefined;
    this.tileContext = undefined;
    this.pixels = undefined;
    this.pattern = undefined;
  }
  reset() {
    this.marks.length = 0;
    this.wait = 0;
    this.grainElapsed = filmInterval;
  }
  advance(elapsed: number, width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.grainElapsed += elapsed;
    if (this.grainElapsed >= filmInterval) {
      // one refresh after a late frame, with no catch-up allocation or emission
      this.grainElapsed %= filmInterval;
      this.refreshGrain();
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      this.marks[i]!.life -= elapsed;
      if (this.marks[i]!.life <= 0) this.marks.splice(i, 1);
    }
    this.wait -= elapsed;
    if (this.wait > 0 || this.marks.length >= 2) return;
    const elongated = this.random() > 0.92;
    const extent = elongated ? 12 + this.random() * 24 : 2 + this.random() * 4;
    const count = elongated ? 4 : 3;
    const fragments: Fragment[] = [];
    for (let i = 0; i < count; i++) {
      fragments.push({
        x: this.random() * (elongated ? 1.4 : extent * 0.6),
        y: elongated ? i * extent / count : this.random() * extent * 0.6,
        width: elongated ? 0.4 + this.random() * 0.7 : 0.6 + this.random() * 1.8,
        height: elongated ? extent / count * (0.2 + this.random() * 0.55) : 0.5 + this.random() * 2,
      });
    }
    this.marks.push({
      x: this.random() * Math.max(0, width - 6),
      y: this.random() * Math.max(0, height - extent),
      life: filmInterval * (1 + Math.floor(this.random() * 3)),
      opacity: 0.25 + this.random() * 0.4,
      light: this.random() > 0.78,
      fragments,
    });
    this.wait = profiles[this.profile].gap + this.random() * profiles[this.profile].spread;
  }
  private refreshGrain() {
    if (!this.tile || !this.tileContext || !this.pixels) return;
    try {
      const data = this.pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = this.random();
        data[i] = data[i + 1] = data[i + 2] = value > 0.5 ? 255 : 0;
        data[i + 3] = Math.abs(value - 0.5) * 2 * profiles[this.profile].grain;
      }
      this.tileContext.putImageData(this.pixels, 0, 0);
      this.pattern = this.target.createPattern(this.tile, "repeat") ?? undefined;
      if (!this.pattern) this.disableGrain();
    } catch { this.disableGrain(); }
  }
  draw(width: number, height: number, dark: boolean) {
    if (this.pattern) {
      this.target.fillStyle = this.pattern;
      this.target.fillRect(0, 0, width, height);
    }
    for (const mark of this.marks) {
      const light = dark !== mark.light;
      this.target.fillStyle = `rgba(${light ? "255, 255, 255" : "0, 0, 0"}, ${mark.opacity})`;
      for (const fragment of mark.fragments) {
        this.target.fillRect(mark.x + fragment.x, mark.y + fragment.y,
          Math.max(0, Math.min(fragment.width, width - mark.x - fragment.x)),
          Math.max(0, Math.min(fragment.height, height - mark.y - fragment.y)));
      }
    }
  }
}
