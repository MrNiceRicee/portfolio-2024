import { getPaperVariant, paperVariants } from "./proposalConfig";
import {
  ShaderMount, ShaderFitOptions, getShaderColorFromString,
  getShaderNoiseTexture, paperTextureFragmentShader, type PaperTextureUniforms,
} from "@paper-design/shaders";

/** one static paper mount; the separate CSS film never changes shader time */
export async function initializeProposalShaders(signal: AbortSignal) {
  const root = document.documentElement;
  const host = document.querySelector<HTMLElement>("[data-proposal-paper]");
  if (signal.aborted || !host || root.hasAttribute("data-fallback")) return;
  let paper: ShaderMount | undefined;
  let themeObserver: MutationObserver | undefined;
  let cancelled = false;

  function themeColors(dark: boolean) {
    const color = getShaderColorFromString(dark ? "#0c0a09" : "#fafaf9");
    return {
      u_colorBack: color, u_colorPaper: color,
      u_colorShadow: getShaderColorFromString(dark ? "#40382d" : "#c5bcae"),
    };
  }

  function setStatus(status: "loading" | "ready" | "fallback") {
    if (cancelled || signal.aborted) return;
    root.dataset.shaderStatus = status;
    document.dispatchEvent(new Event("proposalshaderchange"));
  }

  function fallback() {
    themeObserver?.disconnect();
    paper?.dispose();
    paper = undefined;
    host?.replaceChildren();
    setStatus("fallback");
  }

  signal.addEventListener("abort", () => {
    cancelled = true;
    fallback();
  }, { once: true });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    cancelled = true;
    fallback();
  }, { signal });
  setStatus("loading");

  try {
    const noise = getShaderNoiseTexture();
    if (!noise) throw new Error("Paper noise texture unavailable");
    await noise.decode();
    if (cancelled || signal.aborted) return;
    let dark = root.classList.contains("dark");
    const surface = paperVariants[getPaperVariant(root.dataset.surface)];
    const uniforms = {
      u_fit: ShaderFitOptions.cover, u_scale: 1, u_rotation: 0,
      u_originX: 0.5, u_originY: 0.5, u_offsetX: 0, u_offsetY: 0,
      u_worldWidth: 0, u_worldHeight: 0,
      // standalone paper still uses image UVs; no source image sets this automatically
      u_image: undefined, u_imageAspectRatio: 1, u_isImage: false, u_clip: false,
      ...themeColors(dark),
      u_blending: 0, u_distortion: 0, u_angle: 300, u_seed: 4,
      u_roughness: 0.04, u_roughnessSize: 0.3, u_roughnessRows: 0,
      u_fiber: 0.08, u_fiberSize: 0.35,
      u_folds: surface.folds, u_foldSizeX: 0.45, u_foldSizeY: 0.55,
      u_foldOffsetX: 0, u_foldOffsetY: 0,
      u_wrinkles: surface.wrinkles, u_wrinkleSize: 0.4,
      u_crumples: surface.crumples, u_crumpleCount: 6, u_drops: 0,
      u_noiseTexture: noise,
    } satisfies PaperTextureUniforms & { u_imageAspectRatio: number };
    paper = new ShaderMount(host, paperTextureFragmentShader, uniforms,
      { alpha: false, antialias: false, preserveDrawingBuffer: false }, 0, 0, 1, 600_000);
    themeObserver = new MutationObserver(() => {
      const nextDark = root.classList.contains("dark");
      if (cancelled || signal.aborted || !paper || nextDark === dark) return;
      dark = nextDark;
      try {
        paper.setUniforms(themeColors(dark));
      } catch {
        fallback();
      }
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    paper.canvasElement.setAttribute("aria-hidden", "true");
    paper.canvasElement.addEventListener("webglcontextlost", fallback, { once: true });
    // let the vendor resize observer establish the viewport resolution first
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (cancelled || signal.aborted || !paper) return;
    paper.setFrame(0);
    // the vendor can leave a mount after a failed program or texture upload
    const gl = paper.canvasElement.getContext("webgl2");
    // 0.0.81 consumes upload errors; its private texture map confirms successful noise upload
    const textures: unknown = Reflect.get(paper, "textures");
    if (!gl || !(textures instanceof Map) || !textures.has("u_noiseTexture")
      || !gl.getParameter(gl.CURRENT_PROGRAM) || gl.getError() !== gl.NO_ERROR) {
      fallback();
      return;
    }
    setStatus("ready");
  } catch {
    fallback();
  }
}
