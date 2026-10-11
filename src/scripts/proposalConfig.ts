/** selected homepage treatment; explicit queries support regression previews */
export function getProposalConfig(url: URL) {
  const theme = url.searchParams.get("theme");
  return {
    enabled: url.pathname === "/",
    theme: theme === "light" || theme === "dark" ? theme : undefined,
    fallback: url.searchParams.get("fallback") === "1",
  };
}
