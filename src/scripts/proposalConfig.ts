export const paperVariants = {
  creased: { label: "Fibers + creases · baseline", description: "Stationary fibers and gentle crease shading follow the words.", folds: 0.3, wrinkles: 0.12, crumples: 0.04 },
  fibers: { label: "Fibers only", description: "The same paper and fibers, with folds, wrinkles and crumples removed.", folds: 0, wrinkles: 0, crumples: 0 },
} as const;
export const filmVariants = {
  original: { label: "Original film · baseline", description: "Fifteen random dust/scratch particles; original grain strength and cadence.", particles: 15 },
  quiet: { label: "Quiet print", description: "Fresh fine grain with sparse, brief flecks and rare tiny fragmented blemishes.", particles: 9 },
  used: { label: "Used reel", description: "Fresh grain with more frequent irregular flecks and occasional short fragmented blemishes.", particles: 15 },
} as const;
export type PaperVariant = keyof typeof paperVariants;
export type FilmVariant = keyof typeof filmVariants;
export function getPaperVariant(value: string | null | undefined): PaperVariant {
  return value && Object.hasOwn(paperVariants, value) ? value as PaperVariant : "creased";
}
export function getFilmVariant(value: string | null | undefined): FilmVariant {
  return value && Object.hasOwn(filmVariants, value) ? value as FilmVariant : "original";
}
/** Review-only flags. Unknown values cannot turn on a treatment. */
export function getProposalConfig(url: URL) {
  const enabled = url.pathname === "/" && url.searchParams.get("proposal") === "1";
  return {
    enabled,
    focus: ["a", "b", "c"].includes(url.searchParams.get("focus") ?? "")
      ? url.searchParams.get("focus")! : "b",
    surface: getPaperVariant(url.searchParams.get("surface")),
    film: getFilmVariant(url.searchParams.get("film")),
    theme: url.searchParams.get("theme") === "dark" ? "dark" : "light",
    fallback: url.searchParams.get("fallback") === "1",
  };
}

export interface ProposalFilmState {
  enabled: boolean;
  plain: boolean;
  reason: string | undefined;
}
const filmMotionMessages = {
  "forced-colors": "Film off · Forced colors is enabled; film effects are hidden.",
  "reduced-motion": "Film static · Reduced motion is enabled; grain stays still and particles are hidden.",
  unsupported: "Film static · Visibility detection is unavailable; moving effects are off.",
  "renderer-unavailable": "Film static · Film renderer unavailable; grain stays still and moving effects are off.",
  "grain-only": "Film running · Original grain is active; the particle renderer is unavailable.",
  loading: "Film waiting · Preparing the paper surface.",
  fallback: "Film static · Paper shader unavailable; using the static surface fallback.",
  "user-paused": "Film paused · Use Resume film inside the preview to restart the effects.",
  hidden: "Film paused · Moving effects resume when the page is visible again.",
  offscreen: "Film paused · Bring the preview into view to restart the effects.",
  running: "Film running · Grain and the selected film effect are active.",
} as const;
/** the preview owns eligibility; the study only explains its published reason */
export function getProposalFilmStatus(state: ProposalFilmState): string {
  if (!state.enabled) return "Comparison inactive · Reapply the comparison to restore the film preview.";
  if (state.plain) return "Film off · Plain surface removes decoration.";
  return state.reason && Object.hasOwn(filmMotionMessages, state.reason)
    ? filmMotionMessages[state.reason as keyof typeof filmMotionMessages] : filmMotionMessages.loading;
}
