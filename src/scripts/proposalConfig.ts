/** selected homepage treatment; explicit queries support regression previews */
export function getProposalConfig(url: URL) {
  const number = <T extends number | undefined>(name: string, fallback: T, min: number, max: number): number | T => {
    const raw = url.searchParams.get(name);
    const value = raw === null || raw.trim() === "" ? fallback : Number(raw);
    return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback;
  };
  const theme = url.searchParams.get("theme");
  return {
    enabled: url.pathname === "/",
    theme: theme === "light" || theme === "dark" ? theme : undefined,
    paper: url.searchParams.get("paper") === "clean" ? "clean" : "crumpled",
    crinkleIntensity: number("crinkles", undefined, 0, 100),
    paperFrequency: number("frequency", 4, 2, 12),
    paperSeed: number("seed", 4, 0, 4294967295),
    tunePaper: url.searchParams.get("tune") === "1",
    fallback: url.searchParams.get("fallback") === "1",
  };
}

/** Explicit tuning wins; otherwise follow the effective appearance. */
export const getPaperIntensity = (dark: boolean, override?: number) => override ?? (dark ? 40 : 30);
