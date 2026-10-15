import { createCrtRenderer, type CrtRenderer } from "./crtRenderer";
import { BLACK_FRAME, LIT_FRAME, POWER_OFF_MS, POWER_ON_MS, blendLight, easeOut, powerFrame, type LightFrame } from "./crtPower";

type PowerState = "on" | "off" | "starting" | "stopping";
interface PowerTransition { on: boolean; started: number; initial: LightFrame; replay: boolean }

function getElements() {
  const root = document.querySelector<HTMLElement>("[data-crt404]");
  const canvas = root?.querySelector<HTMLCanvasElement>("[data-crt-canvas]");
  const heading = root?.querySelector<HTMLHeadingElement>("h1");
  const home = root?.querySelector<HTMLAnchorElement>("[data-crt-home]");
  const controls = root?.querySelector<HTMLElement>("[data-crt-controls]");
  const power = root?.querySelector<HTMLButtonElement>("[data-crt-power-button]");
  const powerLabel = power?.querySelector<HTMLElement>("[data-power-label]");
  const replay = root?.querySelector<HTMLButtonElement>("[data-crt-replay]");
  if (!root || !canvas || !heading || !home || !controls || !power || !powerLabel || !replay) return;
  return { root, canvas, heading, home, controls, power, powerLabel, replay };
}

export async function initializeCrt404(makeRenderer = createCrtRenderer): Promise<void> {
  const elements = getElements();
  if (!elements) return;
  const { root, canvas, heading, home, controls, power, powerLabel, replay } = elements;

  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const colors = matchMedia("(forced-colors: active)");
  let renderer: CrtRenderer | null = null;
  let state: PowerState = "on";
  let light: LightFrame = { ...LIT_FRAME };
  let transition: PowerTransition | undefined;
  let frame: number | undefined;
  let resizeTimer: number | undefined;
  let pendingNavigation: string | undefined;
  let homeDeparture = false;
  let boot = 0;
  let disposed = false;
  let suspended = false;
  let gpuFailed = false;
  const origin = performance.now();
  const staticPreferred = () => motion.matches || colors.matches;

  function stopFrame(): void {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  }

  function navigate(): void {
    if (!pendingNavigation) return;
    const destination = pendingNavigation;
    pendingNavigation = undefined;
    setState(state);
    window.location.assign(destination);
  }

  function setState(next: PowerState): void {
    state = next;
    root.dataset.crtPower = next;
    if (next === "on" || next === "off") root.dataset.crtPhase = next;
    const isOn = next === "on" || next === "starting";
    power.setAttribute("aria-pressed", String(isOn));
    power.setAttribute("aria-label", isOn ? "Power off screen" : "Power on screen");
    powerLabel.textContent = isOn ? "Power off" : "Power on";
    power.disabled = pendingNavigation !== undefined;
    replay.disabled = pendingNavigation !== undefined || next === "starting" || next === "stopping";
  }

  function staticMode(error?: unknown): void {
    ++boot;
    stopFrame();
    transition = undefined;
    renderer?.dispose();
    renderer = null;
    root.dataset.crtRenderer = "static";
    controls.hidden = true;
    light = { ...LIT_FRAME };
    setState("on");
    if (error) console.warn("[CRT] Using the static error page", error);
    navigate();
  }

  function fail(error?: unknown): void {
    gpuFailed = true;
    staticMode(error);
  }

  function updateTexture(): void {
    if (!renderer) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const ratio = Math.min(devicePixelRatio || 1, 2, renderer.maxTextureSize / Math.max(bounds.width, bounds.height), Math.sqrt(2_000_000 / (bounds.width * bounds.height)));
    const source = document.createElement("canvas");
    source.width = Math.max(1, Math.floor(bounds.width * ratio));
    source.height = Math.max(1, Math.floor(bounds.height * ratio));
    const context = source.getContext("2d");
    if (!context) throw new Error("CRT text rasterization unavailable");
    context.scale(source.width / bounds.width, source.height / bounds.height);
    const smoke = context.createRadialGradient(bounds.width * 0.46, bounds.height * 0.4, 0, bounds.width * 0.5, bounds.height * 0.45, Math.max(bounds.width, bounds.height) * 0.74);
    smoke.addColorStop(0, "#1a201c");
    smoke.addColorStop(0.6, "#101512");
    smoke.addColorStop(1, "#080b09");
    context.fillStyle = smoke;
    context.fillRect(0, 0, bounds.width, bounds.height);
    root.querySelectorAll<HTMLElement>("[data-crt-ink]").forEach(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const text = element.textContent?.trim() ?? "";
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      context.fillStyle = element === home && (home.matches(":hover") || document.activeElement === home)
        ? "#e8eddf" : element.dataset.crtInk ?? "#d7dec9";
      const metrics = context.measureText(text);
      const baseline = rect.top - bounds.top + (rect.height - metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2 + metrics.actualBoundingBoxAscent;
      const x = rect.left - bounds.left + rect.width / 2;
      context.fillText(text, x, baseline);
      if (element === home) {
        context.fillRect(x - metrics.width / 2, baseline + 4, metrics.width, 1);
      }
    });
    const title = heading.getBoundingClientRect();
    renderer.upload(source, { width: bounds.width, height: bounds.height, titleTop: (title.top - bounds.top) / bounds.height, titleBottom: (title.bottom - bounds.top) / bounds.height });
  }

  function ensureFrame(): void {
    if (frame === undefined && renderer && !document.hidden && !suspended && !disposed && state !== "off") frame = requestAnimationFrame(tick);
  }

  function begin(on: boolean, repeat = false): void {
    transition = { on, replay: repeat, started: performance.now(), initial: { ...light } };
    setState(on ? "starting" : "stopping");
    ensureFrame();
  }

  function tick(now: number): void {
    frame = undefined;
    if (!renderer || disposed || suspended || document.hidden) return;
    const active = transition;
    const elapsed = active ? Math.max(0, now - active.started) : 0;
    if (active) {
      light = blendLight(active.initial, powerFrame(active.on, elapsed), easeOut(elapsed / 65));
      root.dataset.crtPhase = active.on ? elapsed < 180 ? "ignition" : "opening"
        : elapsed < 160 ? "collapse" : elapsed < 330 ? "pinch" : "afterglow";
    }
    try { renderer.render((now - origin) / 1000, light, state === "on"); }
    catch (error) { fail(error); return; }
    if (active && elapsed >= (active.on ? POWER_ON_MS : POWER_OFF_MS)) {
      transition = undefined;
      light = { ...(active.on ? LIT_FRAME : BLACK_FRAME) };
      setState(active.on ? "on" : "off");
      if (!active.on) {
        navigate();
        if (active.replay && !disposed) begin(true);
      }
    }
    ensureFrame();
  }

  async function enable(): Promise<void> {
    if (disposed || suspended || renderer || gpuFailed || staticPreferred()) return;
    const version = ++boot;
    try {
      await document.fonts.ready;
      if (version !== boot || disposed || suspended || staticPreferred()) return;
      renderer = makeRenderer(canvas);
      if (!renderer) { fail(); return; }
      updateTexture();
      light = { ...BLACK_FRAME };
      renderer.render(0, light, false);
      root.dataset.crtRenderer = "webgl";
      controls.hidden = false;
      begin(true);
    } catch (error) { fail(error); }
  }

  function refreshTexture(): void {
    if (!renderer || disposed || suspended) return;
    try {
      updateTexture();
      renderer.render((performance.now() - origin) / 1000, light, state === "on");
    } catch (error) { fail(error); }
  }

  function settle(): void {
    if (!transition) return;
    const on = transition.on || transition.replay;
    transition = undefined;
    light = { ...(on ? LIT_FRAME : BLACK_FRAME) };
    setState(on ? "on" : "off");
  }

  power.addEventListener("click", () => { if (renderer && !pendingNavigation) begin(state === "off" || state === "stopping"); }, options);
  replay.addEventListener("click", () => { if (renderer && !pendingNavigation) begin(state === "off", state !== "off"); }, options);
  home.addEventListener("click", event => {
    if (event.detail === 0 || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !renderer) return;
    event.preventDefault();
    if (pendingNavigation) return;
    homeDeparture = true;
    pendingNavigation = home.href;
    if (document.hidden || state === "off") navigate();
    else begin(false);
  }, options);
  for (const event of ["pointerenter", "pointerleave", "focus", "blur"]) home.addEventListener(event, refreshTexture, options);
  canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); fail(); }, options);
  const resize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refreshTexture, 120);
  };
  window.addEventListener("resize", resize, options);
  window.addEventListener("scroll", refreshTexture, { ...options, passive: true });
  window.visualViewport?.addEventListener("resize", resize, options);
  const modeChanged = () => {
    if (staticPreferred()) staticMode();
    else void enable();
  };
  motion.addEventListener("change", modeChanged, options);
  colors.addEventListener("change", modeChanged, options);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopFrame(); settle(); navigate(); }
    else { refreshTexture(); ensureFrame(); }
  }, options);
  window.addEventListener("pagehide", event => {
    suspended = true;
    ++boot;
    stopFrame();
    clearTimeout(resizeTimer);
    pendingNavigation = undefined;
    settle();
    setState(state);
    if (event.persisted) return;
    disposed = true;
    renderer?.dispose();
    renderer = null;
    lifetime.abort();
  }, options);
  window.addEventListener("pageshow", event => {
    suspended = false;
    if (event.persisted && homeDeparture) {
      homeDeparture = false;
      transition = undefined;
      light = { ...LIT_FRAME };
      setState("on");
    }
    if (renderer) { refreshTexture(); ensureFrame(); }
    else void enable();
  }, options);
  await enable();
}
