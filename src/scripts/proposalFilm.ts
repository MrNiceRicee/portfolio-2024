/** One eligibility state gates both CSS grain and the particle canvas. */
export function initializeProposalFilm() {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>("[data-proposal-film]");
  const button = document.querySelector<HTMLButtonElement>("[data-pause-film]");
  if (!host || !button || root.hasAttribute("data-fallback")) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const forcedColors = matchMedia("(forced-colors: active)");
  const lifecycle = new AbortController();
  let visible = false;
  let paused = false;
  let suspended = false;

  const update = () => {
    const available = observer !== undefined && root.dataset.shaderStatus === "ready"
      && !reducedMotion.matches && !forcedColors.matches;
    const running = available && visible && !paused && !suspended && !document.hidden;
    const motion = running ? "running" : "paused";
    let reason = "running";
    if (forcedColors.matches) reason = "forced-colors";
    else if (reducedMotion.matches) reason = "reduced-motion";
    else if (observer === undefined) reason = "unsupported";
    else if (root.dataset.shaderStatus === "fallback") reason = "fallback";
    else if (root.dataset.shaderStatus !== "ready") reason = "loading";
    else if (paused) reason = "user-paused";
    else if (suspended || document.hidden) reason = "hidden";
    else if (!visible) reason = "offscreen";
    if (root.dataset.filmMotion !== motion || root.dataset.filmMotionReason !== reason) {
      root.dataset.filmMotion = motion;
      root.dataset.filmMotionReason = reason;
      document.dispatchEvent(new Event("proposalfilmchange"));
    }
    button.hidden = !available;
    button.textContent = paused ? "Resume film" : "Pause film";
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
  window.addEventListener("pageshow", () => { suspended = false; update(); }, options);
  window.addEventListener("pagehide", (event) => {
    suspended = true;
    update();
    if (event.persisted) return;
    observer?.disconnect();
    lifecycle.abort();
  }, options);
  update();
}
