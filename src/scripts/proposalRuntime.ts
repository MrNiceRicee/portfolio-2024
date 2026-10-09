import { initializeProposalParticles } from "./proposalParticles";
import { initializeProposalFilm } from "./proposalFilm";

/** all review-only motion code enters through this lazy boundary */
export async function initializeProposalRuntime(signal: AbortSignal) {
  if (signal.aborted) return;
  const rendererAvailable = initializeProposalParticles();
  initializeProposalFilm(rendererAvailable);
  const { initializeProposalShaders } = await import("./proposalShaders");
  if (signal.aborted) return;
  await initializeProposalShaders(signal);
}
