import {
  ShaderMount, ShaderFitOptions, getShaderColorFromString,
  getShaderNoiseTexture, paperTextureFragmentShader, type PaperTextureUniforms,
} from "@paper-design/shaders";

/** one static paper mount; the separate CSS film never changes shader time */
export async function initializeProposalShaders(signal: AbortSignal) {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>("[data-proposal-paper]");
  if (signal.aborted || !host || root.hasAttribute("data-fallback")) return;
  // The clean comparison retains the approved fiber-only material.
  const crumpled = root.dataset.paper === "crumpled";
  let paper: ShaderMount | undefined;
  let themeObserver: MutationObserver | undefined;
  let stage = "noise-texture";

  function themeUniforms(dark: boolean) {
    const color = getShaderColorFromString(dark ? "#0c0a09" : "#fafaf9");
    return {
      u_colorBack: color, u_colorPaper: color,
      u_colorShadow: getShaderColorFromString(dark ? "#40382d" : crumpled ? "#ccccca" : "#b8b8b5"),
      u_fiber: dark ? 0.08 : 0.14, u_fiberSize: dark ? 0.35 : 0.1,
      u_roughness: dark ? 0.04 : 0,
      // Irregular larger facets plus three scales of finer creases; never animated.
      u_crumples: crumpled ? (dark ? 0.22 : 0.32) : 0,
      u_wrinkles: crumpled ? (dark ? 0.12 : 0.18) : 0,
    };
  }

  function setStatus(status: "loading" | "ready" | "fallback") {
    if (signal.aborted) return;
    if (status !== "fallback") delete root.dataset.shaderFailure;
    root.dataset.shaderStatus = status;
    document.dispatchEvent(new Event("proposalshaderchange"));
  }

  function fallback(reason?: string, error?: unknown) {
    // Keep failure evidence after removing the failed canvas. Normal teardown is silent.
    if (!signal.aborted && reason) {
      root.dataset.shaderFailure = reason;
      console.warn(`[Portfolio paper] Fallback at ${reason}`, error ?? "");
    }
    themeObserver?.disconnect();
    paper?.dispose();
    paper = undefined;
    host?.replaceChildren();
    setStatus("fallback");
  }

  signal.addEventListener("abort", () => fallback(), { once: true });
  setStatus("loading");

  try {
    const noise = getShaderNoiseTexture();
    if (!noise) throw new Error("Paper noise texture unavailable");
    stage = "noise-decode";
    await noise.decode();
    if (signal.aborted) return;
    stage = "uniforms";
    let dark = root.classList.contains("dark");
    const uniforms = {
      u_fit: ShaderFitOptions.cover, u_scale: 1, u_rotation: 0,
      u_originX: 0.5, u_originY: 0.5, u_offsetX: 0, u_offsetY: 0,
      u_worldWidth: 0, u_worldHeight: 0,
      // standalone paper still uses image UVs; no source image sets this automatically
      u_image: undefined, u_imageAspectRatio: 1, u_isImage: false, u_clip: false,
      ...themeUniforms(dark),
      u_blending: 0, u_distortion: 0, u_angle: 300, u_seed: 4,
      u_roughnessSize: 0.3, u_roughnessRows: 0,
      u_folds: 0, u_foldSizeX: 0.45, u_foldSizeY: 0.55,
      u_foldOffsetX: 0, u_foldOffsetY: 0,
      u_wrinkleSize: 0.18, u_crumpleCount: 15, u_drops: 0,
      u_noiseTexture: noise,
    } satisfies PaperTextureUniforms & { u_imageAspectRatio: number };
    stage = "mount";
    paper = new ShaderMount(host, paperTextureFragmentShader, uniforms,
      { alpha: false, antialias: false, preserveDrawingBuffer: false }, 0, 0, 1, 600_000);
    themeObserver = new MutationObserver(() => {
      const nextDark = root.classList.contains("dark");
      if (signal.aborted || !paper || nextDark === dark) return;
      dark = nextDark;
      try {
        paper.setUniforms(themeUniforms(dark));
      } catch (error) {
        fallback("theme-uniforms", error);
      }
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    paper.canvasElement.setAttribute("aria-hidden", "true");
    paper.canvasElement.addEventListener("webglcontextlost", () => fallback("context-lost"), { once: true });
    stage = "first-frame";
    // let the vendor resize observer establish the viewport resolution first
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (signal.aborted || !paper) return;
    paper.setFrame(0);
    // the vendor can leave a mount after a failed program or texture upload
    const gl = paper.canvasElement.getContext("webgl2");
    // 0.0.81 consumes upload errors; its private texture map confirms successful noise upload
    const textures: unknown = Reflect.get(paper, "textures");
    if (!gl) { fallback("webgl-context"); return; }
    if (!(textures instanceof Map) || !textures.has("u_noiseTexture")) {
      fallback("noise-upload"); return;
    }
    if (!gl.getParameter(gl.CURRENT_PROGRAM)) { fallback("shader-program"); return; }
    const glError = gl.getError();
    if (glError !== gl.NO_ERROR) { fallback("webgl-error", glError); return; }
    setStatus("ready");
  } catch (error) {
    fallback(stage, error);
  }
}
