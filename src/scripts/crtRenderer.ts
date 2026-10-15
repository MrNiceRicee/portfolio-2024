import type { LightFrame } from "./crtPower";

export interface CrtLayout {
  width: number;
  height: number;
  titleTop: number;
  titleBottom: number;
}

export interface CrtRenderer {
  readonly maxTextureSize: number;
  upload(source: HTMLCanvasElement, layout: CrtLayout): void;
  render(time: number, light: LightFrame, signal: boolean): void;
  dispose(): void;
}

const vertex = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const sceneFragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D image;
uniform vec2 viewport;
uniform vec2 cssSize;
uniform vec2 titleBounds;
uniform float time;
uniform float seed;
uniform float signalAmount;
uniform vec4 aperture;
uniform vec4 bulb;

float grain(vec2 p) {
  return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453);
}

float gaussian(float x) {
  return exp(-x * x);
}

vec3 phosphor(vec2 at) {
  vec2 pixel = vec2(0.65 / cssSize.x, 0.0);
  vec3 ink = texture(image, at).rgb * 0.5;
  ink += (texture(image, at - pixel).rgb + texture(image, at + pixel).rgb) * 0.21;
  ink += (texture(image, at - pixel * 2.0).rgb + texture(image, at + pixel * 2.0).rgb) * 0.04;
  return ink + vec3((grain(at * viewport) - 0.5) * 0.014);
}

void main() {
  vec2 q = uv - 0.5;
  vec2 curved = q * (vec2(1.0) + 0.14 * vec2(q.y * q.y, q.x * q.x));
  vec2 at = curved + 0.5;
  float cycle = floor(time / 7.5);
  float eventSeed = fract(cycle * 0.618034 + seed);
  float age = time - cycle * 7.5 - (1.8 + eventSeed * 3.0);
  float pulse = smoothstep(0.0, 0.012, age) * (1.0 - smoothstep(0.14, 0.22, age));
  float title = smoothstep(titleBounds.x, titleBounds.x + 0.012, at.y)
    * (1.0 - smoothstep(titleBounds.y - 0.012, titleBounds.y, at.y));
  float row = mix(titleBounds.x, titleBounds.y, 0.25 + eventSeed * 0.5);
  float stripe = 1.0 - smoothstep(5.0, 7.0, abs(at.y - row) * cssSize.y);
  float direction = eventSeed > 0.5 ? 1.0 : -1.0;
  float settle = 0.72 + 0.28 * sin(floor(age * 40.0) * 2.1);
  float slip = pulse * stripe * direction * (7.0 + eventSeed * 7.0) * settle;
  float bandDistance = (at.y - fract(time * 0.09 + 0.1)) * cssSize.y;
  float scanEnvelope = gaussian(bandDistance / 15.0);
  float scanBend = 4.5 * sin(bandDistance / 9.0) * scanEnvelope;
  float wobble = 0.25 * sin(time * 1.4 + at.y * 9.0);
  vec2 shift = vec2((wobble * title + slip * title + scanBend) / cssSize.x * signalAmount, 0.0);
  float dpr = viewport.y / cssSize.y;
  float phaseStep = 6.283185 / (3.0 * dpr);
  float scanAverage = sin(phaseStep * 0.5) / (phaseStep * 0.5);
  float scanline = 0.95 + 0.05 * scanAverage * cos(at.y * viewport.y * phaseStep);
  float scanCore = gaussian(bandDistance / 2.5);
  float scanCharge = gaussian(bandDistance / 9.0);
  float scanTrail = gaussian((bandDistance + 12.0) / 17.0);
  float brightness = 1.0 + signalAmount * (0.7 * scanCore + 0.28 * scanCharge
    - 0.12 * scanTrail - title * stripe * pulse * 0.12);
  vec2 edgeDistance = min(at, vec2(1.0) - at) * viewport;
  float feather = min(viewport.x, viewport.y) * 0.2;
  vec2 edgeFade = smoothstep(vec2(0.0), vec2(feather), edgeDistance);
  float glass = (0.1 + 0.9 * edgeFade.x) * (0.1 + 0.9 * edgeFade.y);
  vec2 extent = max(aperture.xy * 0.5, vec2(0.0001));
  vec2 opening = vec2(1.0) - smoothstep(extent - 0.004, extent + 0.004, abs(curved));
  float inside = opening.x * opening.y * step(0.0002, aperture.x) * step(0.0002, aperture.y);
  float horizontal = exp(-pow(abs(q.x) / max(bulb.x, 0.0001), 6.0));
  float lineCore = gaussian(q.y / 0.0018);
  float lineHalo = gaussian(q.y / 0.012);
  vec2 p = q * vec2(cssSize.x / cssSize.y, 1.0);
  float r2 = dot(p, p);
  float hot = exp(-r2 / 0.00001225);
  float shoulder = exp(-r2 / 0.000196);
  float aura = exp(-r2 / 0.0025);
  float line = aperture.w * horizontal * (lineCore * 4.0 + lineHalo * 0.65);
  float white = line + hot * bulb.y * 8.0 + (shoulder * 2.2 + aura * 0.4) * bulb.z
    + bulb.w * inside * 2.4;
  color = vec4(phosphor(at + shift) * scanline * brightness * glass * inside * aperture.z + white, 1.0);
}`;

const blurFragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D image;
uniform vec2 direction;
uniform bool extractLight;
vec3 sampleLight(vec2 at) {
  vec3 ink = texture(image, vec2(at.x, 1.0 - at.y)).rgb;
  return extractLight ? max(ink - vec3(0.6), vec3(0.0)) : ink;
}
void main() {
  vec3 glow = sampleLight(uv) * 0.227027;
  glow += (sampleLight(uv + direction * 1.384615) + sampleLight(uv - direction * 1.384615)) * 0.316216;
  glow += (sampleLight(uv + direction * 3.230769) + sampleLight(uv - direction * 3.230769)) * 0.070270;
  color = vec4(glow, 1.0);
}`;

const compositeFragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D image;
uniform sampler2D bloom;
uniform float intensity;
void main() {
  vec2 at = vec2(uv.x, 1.0 - uv.y);
  color = vec4(texture(image, at).rgb + texture(bloom, at).rgb * intensity, 1.0);
}`;

interface Program {
  handle: WebGLProgram;
  uniforms: ReadonlyMap<string, WebGLUniformLocation>;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

export function createCrtRenderer(canvas: HTMLCanvasElement): CrtRenderer | null {
  let gl: WebGL2RenderingContext | null;
  try {
    gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
  } catch { return null; }
  if (!gl) return null;
  const context = gl;
  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];
  const textures: WebGLTexture[] = [];
  const framebuffers: WebGLFramebuffer[] = [];
  let vao: WebGLVertexArrayObject | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    shaders.forEach(shader => context.deleteShader(shader));
    programs.forEach(program => context.deleteProgram(program));
    textures.forEach(texture => context.deleteTexture(texture));
    framebuffers.forEach(framebuffer => context.deleteFramebuffer(framebuffer));
    context.deleteVertexArray(vao);
  };

  const compile = (type: number, source: string) => {
    const shader = context.createShader(type);
    if (!shader) throw new Error("CRT shader allocation failed");
    shaders.push(shader);
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error("CRT shader compilation failed");
    return shader;
  };
  const makeProgram = (fragment: string, names: readonly string[]): Program => {
    const handle = context.createProgram();
    if (!handle) throw new Error("CRT program allocation failed");
    programs.push(handle);
    context.attachShader(handle, compile(context.VERTEX_SHADER, vertex));
    context.attachShader(handle, compile(context.FRAGMENT_SHADER, fragment));
    context.linkProgram(handle);
    if (!context.getProgramParameter(handle, context.LINK_STATUS)) throw new Error("CRT shader link failed");
    const uniforms = new Map<string, WebGLUniformLocation>();
    for (const name of names) {
      const location = context.getUniformLocation(handle, name);
      if (location === null) throw new Error(`CRT uniform unavailable: ${name}`);
      uniforms.set(name, location);
    }
    return { handle, uniforms };
  };
  const location = (program: Program, name: string) => {
    const uniform = program.uniforms.get(name);
    if (!uniform) throw new Error(`Unknown CRT uniform: ${name}`);
    return uniform;
  };
  const makeTexture = () => {
    const texture = context.createTexture();
    if (!texture) throw new Error("CRT texture allocation failed");
    textures.push(texture);
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    return texture;
  };
  const makeTarget = (): Target => {
    const texture = makeTexture();
    const framebuffer = context.createFramebuffer();
    if (!framebuffer) throw new Error("CRT framebuffer allocation failed");
    framebuffers.push(framebuffer);
    return { texture, framebuffer };
  };

  try {
    vao = context.createVertexArray();
    if (!vao) throw new Error("CRT vertex array allocation failed");
    context.bindVertexArray(vao);
    const scene = makeProgram(sceneFragment, ["image", "viewport", "cssSize", "titleBounds", "time", "seed", "signalAmount", "aperture", "bulb"]);
    const blur = makeProgram(blurFragment, ["image", "direction", "extractLight"]);
    const composite = makeProgram(compositeFragment, ["image", "bloom", "intensity"]);
    const sourceTexture = makeTexture();
    const sceneTarget = makeTarget();
    const horizontal = makeTarget();
    const vertical = makeTarget();
    const maxTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
    const seed = Math.random();
    let layout: CrtLayout | undefined;
    let bloomWidth = 1;
    let bloomHeight = 1;

    const allocateTarget = (target: Target, width: number, height: number) => {
      context.bindTexture(context.TEXTURE_2D, target.texture);
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA8, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null);
      context.bindFramebuffer(context.FRAMEBUFFER, target.framebuffer);
      context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, target.texture, 0);
      if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) throw new Error("CRT framebuffer unavailable");
    };
    const bindImage = (texture: WebGLTexture, unit = 0) => {
      context.activeTexture(context.TEXTURE0 + unit);
      context.bindTexture(context.TEXTURE_2D, texture);
    };
    const draw = (program: Program, target: Target | null, width: number, height: number) => {
      context.bindFramebuffer(context.FRAMEBUFFER, target?.framebuffer ?? null);
      context.viewport(0, 0, width, height);
      context.useProgram(program.handle);
    };
    return {
      maxTextureSize,
      upload(source, nextLayout) {
        if (disposed) return;
        try {
          if (source.width < 1 || source.height < 1 || source.width > maxTextureSize || source.height > maxTextureSize
            || !Number.isFinite(nextLayout.width) || nextLayout.width <= 0
            || !Number.isFinite(nextLayout.height) || nextLayout.height <= 0) throw new Error("Invalid CRT source dimensions");
          bindImage(sourceTexture);
          // canvas rows start at the top; only framebuffer textures need a Y flip.
          context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false);
          context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, source);
          canvas.width = source.width;
          canvas.height = source.height;
          bloomWidth = Math.max(1, Math.ceil(source.width / 4));
          bloomHeight = Math.max(1, Math.ceil(source.height / 4));
          allocateTarget(sceneTarget, source.width, source.height);
          allocateTarget(horizontal, bloomWidth, bloomHeight);
          allocateTarget(vertical, bloomWidth, bloomHeight);
          if (context.getError() !== context.NO_ERROR) throw new Error("CRT texture upload failed");
          layout = { ...nextLayout };
        } catch (error) { dispose(); throw error; }
      },
      render(time, light, signal) {
        if (disposed || !layout) return;
        context.bindVertexArray(vao);
        draw(scene, sceneTarget, canvas.width, canvas.height);
        bindImage(sourceTexture);
        context.uniform1i(location(scene, "image"), 0);
        context.uniform2f(location(scene, "viewport"), canvas.width, canvas.height);
        context.uniform2f(location(scene, "cssSize"), layout.width, layout.height);
        context.uniform2f(location(scene, "titleBounds"), layout.titleTop, layout.titleBottom);
        context.uniform1f(location(scene, "time"), time);
        context.uniform1f(location(scene, "seed"), seed);
        context.uniform1f(location(scene, "signalAmount"), signal ? 1 : 0);
        context.uniform4f(location(scene, "aperture"), light.x, light.y, light.gain, light.beam);
        context.uniform4f(location(scene, "bulb"), light.width, light.core, light.halo, light.flood);
        context.drawArrays(context.TRIANGLES, 0, 3);

        draw(blur, horizontal, bloomWidth, bloomHeight);
        bindImage(sceneTarget.texture);
        context.uniform1i(location(blur, "image"), 0);
        context.uniform1i(location(blur, "extractLight"), 1);
        context.uniform2f(location(blur, "direction"), 6 / layout.width, 0);
        context.drawArrays(context.TRIANGLES, 0, 3);
        draw(blur, vertical, bloomWidth, bloomHeight);
        bindImage(horizontal.texture);
        context.uniform1i(location(blur, "extractLight"), 0);
        context.uniform2f(location(blur, "direction"), 0, 6 / layout.height);
        context.drawArrays(context.TRIANGLES, 0, 3);

        draw(composite, null, canvas.width, canvas.height);
        bindImage(sceneTarget.texture);
        bindImage(vertical.texture, 1);
        context.uniform1i(location(composite, "image"), 0);
        context.uniform1i(location(composite, "bloom"), 1);
        context.uniform1f(location(composite, "intensity"), 0.3 + Math.min(1, light.beam + light.halo + light.flood) * 1.5);
        context.drawArrays(context.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch { dispose(); return null; }
}
