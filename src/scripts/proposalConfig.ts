/** selected homepage treatment; explicit queries support regression previews */
export function getProposalConfig(url: URL) {
  const number = (name: string, fallback: number, min: number, max: number) => {
    const raw = url.searchParams.get(name);
    const value = raw === null || raw.trim() === "" ? fallback : Number(raw);
    return Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback;
  };
  const theme = url.searchParams.get("theme");
  return {
    enabled: url.pathname === "/",
    theme: theme === "light" || theme === "dark" ? theme : undefined,
    paper: url.searchParams.get("paper") === "clean" ? "clean" : "crumpled",
    crinkleIntensity: number("crinkles", 50, 0, 100),
    paperFrequency: number("frequency", 6, 2, 12),
    paperSeed: number("seed", 4, 0, 4294967295),
    tunePaper: url.searchParams.get("tune") === "1",
    fallback: url.searchParams.get("fallback") === "1",
  };
}
