import {
  AbsoluteFill, Easing, Img, cancelRender, continueRender, delayRender,
  interpolate, staticFile, useCurrentFrame,
} from "remotion";

const fontReady = delayRender("load the portfolio font");
const font = new FontFace("Portfolio Plex", `url(${staticFile("plex.woff2")})`, {
  weight: "100 700",
});
font.load().then((loaded) => {
  document.fonts.add(loaded);
  continueRender(fontReady);
}).catch(cancelRender);

export const portfolioLoopFrames = 180;

const ink = "#3c342e";
const muted = "#786755";
const mouthOpenFrames = [[25, 30], [34, 40], [44, 48], [52, 57], [63, 69], [74, 79], [100, 106], [111, 115], [120, 127]];
const blinkFrames = [[65, 69], [145, 149]];
const characterImages = {
  resting: "character.webp",
  talking: "character-talking.webp",
  blinking: "character-blinking.webp",
  "talking-blinking": "character-talking-blinking.webp",
};

export const Portfolio = () => {
  const frame = useCurrentFrame() % portfolioLoopFrames;
  // eight identical ray groups make each 45-degree turn a seamless visual cycle.
  const sunRotation = 22.5 + 45 * frame / portfolioLoopFrames;
  const gesture = interpolate(frame,
    [0, 18, 38, 60, 92, 114, 140, 179],
    [0, 0, -1.3, 0.8, -0.5, 0, 0, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.645, 0.045, 0.355, 1) },
  );
  const lift = 1 - Math.cos(frame / portfolioLoopFrames * Math.PI * 2);
  const talking = mouthOpenFrames.some(([start, end]) => frame >= start && frame < end);
  const blinking = blinkFrames.some(([start, end]) => frame >= start && frame < end);
  const characterState = blinking ? (talking ? "talking-blinking" : "blinking") : (talking ? "talking" : "resting");
  const character = (
    <div style={{ position: "absolute", left: 42, top: 0, width: 400, height: 400, transformOrigin: "52% 90%", transform: `translateY(${-lift * 1.5}px) rotate(${gesture}deg)` }}>
      {Object.entries(characterImages).map(([state, image]) => (
        <Img key={state} src={staticFile(image)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: state === characterState ? 1 : 0 }} />
      ))}
    </div>
  );

  return (
    <AbsoluteFill style={{ background: "#f4f0e6", color: ink, fontFamily: "Portfolio Plex", overflow: "hidden" }}>
      <Img src={staticFile("paper.webp")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", opacity: 0.62, mixBlendMode: "multiply" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 85% 20%, #fffaf28c 0%, transparent 66%)" }} />

      <div style={{ position: "absolute", inset: "48px 62px auto", fontSize: 23, color: muted }}>
        Josh’s corner
      </div>

      <div style={{ position: "absolute", top: 200, left: 60, fontWeight: 500, letterSpacing: -2.5, lineHeight: 1.06 }}>
        <div style={{ fontSize: 64, whiteSpace: "nowrap" }}>Joshua Constantine</div>
        <div style={{ fontSize: 88, letterSpacing: -3, marginTop: 8 }}>Santos</div>
      </div>
      <div style={{ position: "absolute", left: 64, top: 392, fontSize: 27, letterSpacing: -0.3, color: muted }}>
        Senior fullstack engineer
      </div>

      <svg aria-label="Three stars outside the triangular frame" viewBox="0 0 1200 630" fill="#d6bc93" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {[[940, 50], [772, 334], [1108, 334]].map(([x, y]) => (
          <path key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(36)`} d="M 0 -1 L .2245 -.309 L .9511 -.309 L .3633 .118 L .5878 .809 L 0 .382 L -.5878 .809 L -.3633 .118 L -.9511 -.309 L -.2245 -.309 Z" />
        ))}
      </svg>

      <div style={{ position: "absolute", left: 690, top: 90, width: 500, height: 440 }}>
        <AbsoluteFill style={{ background: "#e6d6bb", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}>
          <svg aria-label="Eight-rayed Filipino sun" viewBox="-21 -21 42 42" fill="#af7e35" opacity="0.3" style={{ position: "absolute", left: 40, top: -50, width: 420, height: 420 }}>
            <defs>
              <clipPath id="sun-major-tip"><path d="M 0 -19 L -19 0 H 19 Z" /></clipPath>
              <clipPath id="sun-minor-tip"><path transform="rotate(-7.25)" d="M -22.11484529 0 L 0 -17 L 5 0 Z" /></clipPath>
            </defs>
            <g transform={`rotate(${sunRotation})`}>
              {Array.from({ length: 8 }, (_, ray) => (
                <g key={ray} transform={`rotate(${ray * 45})`}>
                  {[-1, 1].map((side) => (
                    <g key={side} transform={`scale(${side} 1)`}>
                      <g clipPath="url(#sun-minor-tip)">
                        <path transform="rotate(-11.25)" d="M 0 0 V -19 L 0.76 -19.22 Z" />
                        <path transform="rotate(-7.25)" d="M 0 0 V -19 L -0.76 -19.22 Z" />
                      </g>
                      <g clipPath="url(#sun-major-tip)">
                        <path transform="rotate(-3.75)" d="M 0 -19 V 0 L 1.8 -19.9 Z" />
                      </g>
                    </g>
                  ))}
                </g>
              ))}
              <circle r="9" />
            </g>
          </svg>
          <Img src={staticFile("paper.webp")} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, mixBlendMode: "multiply" }} />
          {character}
        </AbsoluteFill>
        <svg viewBox="0 0 500 440" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
          <path d="M 0 0 H 500 L 250 440 Z" fill="none" stroke="#b89b73" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <AbsoluteFill style={{ clipPath: "polygon(49% 66%, 76% 66%, 76% 100%, 49% 100%)" }}>{character}</AbsoluteFill>
      </div>

      <div style={{ position: "absolute", left: 64, right: 64, bottom: 84, height: 1, background: "#b7a58a", opacity: 0.58 }} />
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 39, display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 20, color: muted }}>
        <span>I try to do things everyday</span>
        <span style={{ color: ink, fontSize: 24, fontWeight: 500 }}>joshsantos.me</span>
      </div>
    </AbsoluteFill>
  );
};
