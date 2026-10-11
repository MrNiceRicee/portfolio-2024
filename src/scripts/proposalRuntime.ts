import { initializeProposalFilm } from "./proposalFilm";

/** homepage motion code enters through this lazy boundary */
export async function initializeProposalRuntime(signal: AbortSignal) {
  if (signal.aborted) return;
  initializeProposalFilm();
  const { initializeProposalShaders } = await import("./proposalShaders");
  if (signal.aborted) return;
  await initializeProposalShaders(signal);
}
