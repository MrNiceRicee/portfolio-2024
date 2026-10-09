import { FilmReel } from "./proposalReel";
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

export function initializeProposalParticles(): boolean {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-proposal-particles]");
  if (!canvas || document.documentElement.hasAttribute("data-fallback")) return false;
  let ctx: CanvasRenderingContext2D | null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return false;
  }
  if (!ctx) return false;
  const lifecycle = new AbortController();
  const profile: FilmVariant = getFilmVariant(document.documentElement.dataset.film);
  const particles = Array.from({ length: filmVariants[profile].particles }, () => new FilmParticle());
  const reel = profile === "original" ? undefined : new FilmReel(profile, ctx);
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
    reel?.reset();
  };
  const stop = () => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
    frame = undefined;
    previous = undefined;
    reel?.reset();
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
      if (reel) {
        reel.advance(elapsed, canvas.width, canvas.height);
        reel.draw(canvas.width, canvas.height, dark);
        const grainState = reel.hasGrain ? "ready" : "fallback";
        if (document.documentElement.dataset.reelGrain !== grainState) document.documentElement.dataset.reelGrain = grainState;
      }
      particles.forEach((particle) => {
        // No catch-up burst after a dropped frame or a suspended tab.
        particle.advance(elapsed, canvas.width, canvas.height);
        ctx.fillStyle = `rgba(${rgb}, ${particle.opacity})`;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.drawHeight(profile === "original"));
      });

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
  return true;
}
