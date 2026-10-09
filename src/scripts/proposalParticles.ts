import { filmVariants, getFilmVariant, type FilmVariant } from "./proposalConfig";
/** Original dust/scratch ranges, with lifetime expressed in milliseconds at 60 Hz. */
export class FilmParticle {
  x = 0;
  y = 0;
  size: number;
  opacity = 0;
  life = 0;
  constructor(private random = Math.random) {
    this.size = random() * 2 + 0.25;
  }
  respawn(width: number, height: number) {
    this.x = this.random() * width;
    this.y = this.random() * height;
    this.life = (this.random() * 10 + 5) * 1000 / 60;
    this.opacity = this.random() * 0.5 + 0.1;
  }
  advance(elapsed: number, width: number, height: number) {
    this.life -= elapsed;
    if (this.life < 0) this.respawn(width, height);
  }
  drawHeight(longScratches = true) {
    return this.size * (this.random() > (longScratches ? 0.99 : 1)
      ? this.random() * 25 + 5 : this.random() * 2 + 1);
  }
}

export interface Scratch {
  x: number; y: number; width: number; height: number; life: number; opacity: number;
}
/** Elapsed-time transient lines share the dust renderer's one animation loop. */
export class FilmScratches {
  private activeLines: Scratch[] = [];
  get lines(): readonly Readonly<Scratch>[] { return this.activeLines; }
  private wait = 0;
  constructor(private profile: "hairlines" | "aged", private random = Math.random) {}
  reset() { this.activeLines.length = 0; this.wait = 0; }
  advance(elapsed: number, width: number, height: number) {
    for (let i = this.activeLines.length - 1; i >= 0; i--) {
      const line = this.activeLines[i];
      if (!line) continue;
      line.life -= elapsed;
      if (line.life <= 0) this.activeLines.splice(i, 1);
    }
    this.wait -= elapsed;
    if (this.wait > 0 || this.activeLines.length > 0 || width <= 0 || height <= 0) return;
    const aged = this.profile === "aged";
    const count = 1 + Math.floor(this.random() * (aged ? 3 : 2));
    const clusterX = this.random() * Math.max(0, width - (count - 1) * 5 - 1.6);
    for (let i = 0; i < count; i++) {
      const lineHeight = Math.min(height, aged ? 240 + this.random() * 400 : 120 + this.random() * 180);
      const lineWidth = Math.min(width, aged ? 1 + this.random() * 0.6 : 1);
      this.activeLines.push({
        x: Math.max(0, Math.min(width - lineWidth, aged ? clusterX + i * 5 : this.random() * width)),
        y: this.random() * (height - lineHeight), width: lineWidth, height: lineHeight,
        life: aged ? 220 + this.random() * 140 : 700 + this.random() * 500,
        opacity: aged ? 0.85 : 0.65,
      });
    }
    // A late frame emits at most one bounded group; no catch-up bursts.
    const longestLife = Math.max(...this.activeLines.map((line) => line.life));
    this.wait = longestLife + (aged ? 700 + this.random() * 900 : 600 + this.random() * 900);
  }
}

export function initializeProposalParticles() {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-proposal-particles]");
  if (!canvas || document.documentElement.hasAttribute("data-fallback")) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const lifecycle = new AbortController();
  const profile: FilmVariant = getFilmVariant(document.documentElement.dataset.film);
  const particles = Array.from({ length: filmVariants[profile].particles }, () => new FilmParticle());
  const scratches = profile === "hairlines" || profile === "aged" ? new FilmScratches(profile) : undefined;
  const interval = 1000 / 60;
  let frame: number | undefined;
  let previous: number | undefined;

  const resize = () => {
    // Match the original CSS-pixel canvas, without multiplying work by device DPR.
    const unchanged = canvas.width === window.innerWidth && canvas.height === window.innerHeight;
    if (canvas.width !== window.innerWidth) canvas.width = window.innerWidth;
    if (canvas.height !== window.innerHeight) canvas.height = window.innerHeight;
    if (unchanged) ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle) => particle.respawn(canvas.width, canvas.height));
    scratches?.reset();
  };
  const stop = () => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
    frame = undefined;
    previous = undefined;
    scratches?.reset();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  const animate = (now: number) => {
    frame = undefined;
    const elapsed = previous === undefined ? interval : now - previous;
    if (elapsed >= interval - 0.1) {
      previous = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dark = document.documentElement.classList.contains("dark");
      const rgb = dark ? "255, 255, 255" : "0, 0, 0";
      particles.forEach((particle) => {
        // No catch-up burst after a dropped frame or a suspended tab.
        particle.advance(elapsed, canvas.width, canvas.height);
        ctx.fillStyle = `rgba(${rgb}, ${particle.opacity})`;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.drawHeight(profile === "original"));
      });
      scratches?.advance(elapsed, canvas.width, canvas.height);
      const lines = scratches?.lines;
      const firstLine = lines?.[0];
      if (lines && firstLine) {
        ctx.fillStyle = `rgba(${rgb}, ${firstLine.opacity})`;
        lines.forEach((line) => ctx.fillRect(line.x, line.y, line.width, line.height));
      }
    }
    frame = requestAnimationFrame(animate);
  };
  const update = () => {
    if (document.documentElement.dataset.filmMotion !== "running") { stop(); return; }
    if (frame === undefined) frame = requestAnimationFrame(animate);
  };
  const options = { signal: lifecycle.signal };
  document.addEventListener("proposalfilmchange", update, options);
  window.addEventListener("resize", resize, options);
  window.addEventListener("pagehide", (event) => {
    stop();
    if (!event.persisted) lifecycle.abort();
  }, options);
  window.addEventListener("pageshow", update, options);
  resize();
  update();
}
