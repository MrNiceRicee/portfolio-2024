/** Original dust/scratch ranges, with lifetime expressed in milliseconds at 60 Hz. */
class FilmParticle {
  x = 0;
  y = 0;
  size: number;
  opacity = 0;
  life = 0;
  constructor() {
    this.size = Math.random() * 2 + 0.25;
  }
  respawn(width: number, height: number) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.life = (Math.random() * 10 + 5) * 1000 / 60;
    this.opacity = Math.random() * 0.5 + 0.1;
  }
  advance(elapsed: number, width: number, height: number) {
    this.life -= elapsed;
    if (this.life < 0) this.respawn(width, height);
  }
  drawHeight() {
    return this.size * (Math.random() > 0.99
      ? Math.random() * 25 + 5 : Math.random() * 2 + 1);
  }
}

/** one lifetime gates both CSS grain and the optional particle canvas */
export function initializeProposalFilm() {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>("[data-proposal-film]");
  const button = document.querySelector<HTMLButtonElement>("[data-pause-film]");
  if (!host || !button || root.hasAttribute("data-fallback")) return;
  const canvas = document.querySelector<HTMLCanvasElement>("[data-proposal-particles]");
  let ctx: CanvasRenderingContext2D | null = null;
  // unavailable canvas leaves the CSS grain and pause control usable
  try { ctx = canvas?.getContext("2d") ?? null; } catch {}
  const particles = ctx ? Array.from({ length: 15 }, () => new FilmParticle()) : [];
  const interval = 1000 / 60;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const forcedColors = matchMedia("(forced-colors: active)");
  const lifecycle = new AbortController();
  let frame: number | undefined;
  let previous: number | undefined;
  let visible = false;
  let paused = false;
  let suspended = false;

  const resize = () => {
    if (!canvas || !ctx) return;
    // keep the original CSS-pixel canvas without multiplying work by device DPR
    const unchanged = canvas.width === window.innerWidth && canvas.height === window.innerHeight;
    if (canvas.width !== window.innerWidth) canvas.width = window.innerWidth;
    if (canvas.height !== window.innerHeight) canvas.height = window.innerHeight;
    if (unchanged) ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle) => particle.respawn(canvas.width, canvas.height));
  };
  const stop = () => {
    if (frame === undefined) return;
    cancelAnimationFrame(frame);
    frame = undefined;
    previous = undefined;
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  const animate = (now: number) => {
    frame = undefined;
    if (!canvas || !ctx) return;
    const elapsed = previous === undefined ? interval : now - previous;
    if (elapsed >= interval - 0.1) {
      previous = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const rgb = root.classList.contains("dark") ? "255, 255, 255" : "0, 0, 0";
      particles.forEach((particle) => {
        // no catch-up burst after a dropped frame or a suspended tab
        particle.advance(elapsed, canvas.width, canvas.height);
        ctx.fillStyle = `rgba(${rgb}, ${particle.opacity})`;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.drawHeight());
      });
    }
    frame = requestAnimationFrame(animate);
  };
  const update = () => {
    const available = observer !== undefined && root.dataset.shaderStatus === "ready"
      && !reducedMotion.matches && !forcedColors.matches;
    const running = available && visible && !paused && !suspended && !document.hidden;
    root.dataset.filmMotion = running ? "running" : "paused";
    button.hidden = !available;
    button.textContent = paused ? "Resume film" : "Pause film";
    if (!running) stop();
    else if (ctx && frame === undefined) frame = requestAnimationFrame(animate);
  };

  // intersection observations include clipping by an embedding iframe's viewport
  const observer = typeof IntersectionObserver === "undefined" ? undefined
    : new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting === true;
      update();
    });
  observer?.observe(host);
  const options = { signal: lifecycle.signal };
  button.addEventListener("click", () => { paused = !paused; update(); }, options);
  document.addEventListener("visibilitychange", update, options);
  document.addEventListener("proposalshaderchange", update, options);
  reducedMotion.addEventListener("change", update, options);
  forcedColors.addEventListener("change", update, options);
  window.addEventListener("resize", resize, options);
  window.addEventListener("pageshow", () => { suspended = false; update(); }, options);
  window.addEventListener("pagehide", (event) => {
    suspended = true;
    update();
    if (event.persisted) return;
    observer?.disconnect();
    lifecycle.abort();
  }, options);
  resize();
  update();
}
