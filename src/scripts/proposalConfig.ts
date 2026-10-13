/** selected homepage treatment; explicit queries support regression previews */
export function getProposalConfig(url: URL) {
  const rawIntensity = url.searchParams.get("crinkles");
  const intensity = rawIntensity === null || rawIntensity.trim() === "" ? 50 : Number(rawIntensity);
  const crinkleIntensity = Number.isFinite(intensity) ? Math.round(Math.max(0, Math.min(100, intensity))) : 50;
  const theme = url.searchParams.get("theme");
  return {
    enabled: url.pathname === "/",
    theme: theme === "light" || theme === "dark" ? theme : undefined,
    paper: url.searchParams.get("paper") === "clean" ? "clean" : "crumpled",
    crinkleIntensity,
    tunePaper: url.searchParams.get("tune") === "1",
    fallback: url.searchParams.get("fallback") === "1",
  };
}
