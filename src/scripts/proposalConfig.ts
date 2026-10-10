export const paperVariants = {
  creased: { folds: 0.3, wrinkles: 0.12, crumples: 0.04 },
  fibers: { folds: 0, wrinkles: 0, crumples: 0 },
} as const;
export const filmVariants = {
  original: { particles: 15 },
  quiet: { particles: 9 },
  used: { particles: 15 },
} as const;
export type PaperVariant = keyof typeof paperVariants;
export type FilmVariant = keyof typeof filmVariants;
export function getPaperVariant(value: string | null | undefined): PaperVariant {
  return value && Object.hasOwn(paperVariants, value) ? value as PaperVariant : "fibers";
}
export function getFilmVariant(value: string | null | undefined): FilmVariant {
  return value && Object.hasOwn(filmVariants, value) ? value as FilmVariant : "original";
}
/** selected homepage treatment; allowlisted queries support regression previews */
export function getProposalConfig(url: URL) {
  const enabled = url.pathname === "/";
  return {
    enabled,
    focus: ["a", "b", "c"].includes(url.searchParams.get("focus") ?? "")
      ? url.searchParams.get("focus")! : "b",
    surface: getPaperVariant(url.searchParams.get("surface")),
    film: getFilmVariant(url.searchParams.get("film")),
    theme: ["light", "dark"].includes(url.searchParams.get("theme") ?? "")
      ? url.searchParams.get("theme")! : undefined,
    fallback: url.searchParams.get("fallback") === "1",
  };
}
