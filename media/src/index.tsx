import { Composition, registerRoot } from "remotion";
import { Portfolio, portfolioLoopFrames } from "./portfolio";

const Root = () => (
  <Composition id="Portfolio" component={Portfolio} width={1200} height={630}
    fps={30} durationInFrames={portfolioLoopFrames} />
);

registerRoot(Root);
