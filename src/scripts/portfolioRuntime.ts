import { initializePortfolioFilm } from "./portfolioFilm";

/** homepage motion code enters through this lazy boundary */
export async function initializePortfolioRuntime(signal: AbortSignal) {
  if (signal.aborted) return;
  initializePortfolioFilm();
  const { initializePortfolioShaders } = await import("./portfolioShaders");
  if (signal.aborted) return;
  await initializePortfolioShaders(signal);
}
