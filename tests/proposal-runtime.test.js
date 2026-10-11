import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/components/ProposalSurface.astro", import.meta.url), "utf8");
const script = component.match(/<script>([\s\S]*?)<\/script>/)[1];
const executable = script.replace(/import\(([^)]+)\)/, "loadRuntime($1)");

for (const [proposal, fallback, title] of [
  [false, false, "non-proposal page guard never imports or starts proposal runtime"],
  [true, true, "plain fallback preview never imports or starts the renderer runtime"],
]) {
  test(title, () => {
    let imports = 0;
    const document = Object.assign(new EventTarget(), {
      documentElement: { dataset: {}, hasAttribute: key => key === "data-proposal" ? proposal : key === "data-fallback" && fallback },
    });
    const events = [];
    document.addEventListener("proposalshaderchange", () => events.push("shader-change"));
    new Function("document", "loadRuntime", executable)(document, () => { imports++; throw new Error("unexpected runtime import"); });
    expect(imports).toBe(0);
    expect(events).toEqual([]);
    expect(document.documentElement.dataset).toEqual({});
  });
}
