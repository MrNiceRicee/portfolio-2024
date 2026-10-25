import { expect, test } from "bun:test";
import { transform } from "@astrojs/compiler-rs";
import { analyzeComments } from "./policy";

const comment = "<!--one\ntwo\nthree\nfour-->";
const quotedScript = "const x = &#96;/*one\ntwo\nthree\nfour*/&#96;;";

function expectBoundary(source, message, line) {
  expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
  const diagnostics = analyzeComments("sample.astro", source);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0].message).toContain(message);
  expect(diagnostics[0].line).toBe(line);
}

test.each([
  `<svg><div><title>${comment}</title></div></svg>`,
  `<math><p><textarea>${comment}</textarea></p></math>`,
  `<svg><div><sCript>${quotedScript}</sCript></div></svg>`,
  `<svg><div></div><sCript>${quotedScript}</sCript></svg>`,
  `<svg><p /><sCript>${quotedScript}</sCript></svg>`,
])("fails at foreign breakouts before trusting their descendants or siblings: %#", (source) => {
  expectBoundary(`<p>😀</p>\r\n${source}`, "unsupported foreign-content breakout", 2);
});

test.each(["color", "size", "face"])("rejects the foreign font breakout attribute %s", (name) => {
  const source = `<svg>\r\n<font ${name}="value"></font><sCript>${quotedScript}</sCript></svg>`;
  expectBoundary(source, "unsupported foreign-content breakout", 2);
});

test("rejects a foreign font spread whose presence can trigger breakout", () => {
  const source = `<svg>\r\n<font {...attributes}></font><sCript>${quotedScript}</sCript></svg>`;
  expectBoundary(source, "cannot determine foreign-content breakout", 2);
});

test.each(["encoding={encoding}", "{...attributes}", 'encoding="application/xml" {...attributes}'])(
  "fails at unresolved MathML integration attributes: %s",
  (attribute) => {
    const source = `---\r\nconst encoding = "text/html";\r\nconst attributes = { encoding };\r\n---\r\n<math><annotation-xml\r\n  ${attribute}><sCript>${quotedScript}</sCript></annotation-xml></math>`;
    expectBoundary(source, "cannot determine MathML integration namespace", 6);
  },
);

test("retains source-known integrations and ordinary HTML breakout tag names", () => {
  for (const source of [
    `<svg><foreignObject><div><title>${comment}</title></div></foreignObject></svg>`,
    `<math><annotation-xml encoding="text/html"><p><textarea>${comment}</textarea></p></annotation-xml></math>`,
    `<math><annotation-xml encoding={"text/html"}><title>${comment}</title></annotation-xml></math>`,
  ]) {
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    expect(analyzeComments("sample.astro", source)).toEqual([]);
  }
});

test("template guidance requires a literal body without promising spelling-only fixes", () => {
  const source = "<sCript>const value = {Math.max(1, 2)};</sCript>";
  const diagnostics = analyzeComments("sample.astro", source);
  expect(diagnostics[0].message).toContain("use a literal body");
  expect(diagnostics[0].message).not.toContain("canonical");
});

test("does not apply foreign namespace recovery to markup rendered as literal textarea text", () => {
  for (const source of [
    `<textarea><svg><div>${comment}</div></svg></textarea>`,
    "<textarea><math><annotation-xml encoding={encoding}>value</annotation-xml></math></textarea>",
  ]) {
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    expect(analyzeComments("sample.astro", source)).toEqual([]);
  }
});

test.each(["sCript", "sTyle"])("keeps direct MathML %s text inert", (tag) => {
  for (const body of ["/*one\ntwo\nthree\nfour*/", "ordinary math text"]) {
    const source = `<math><${tag}>${body}</${tag}></math>`;
    const compiled = transform(source, { filename: "sample.astro" });
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.scripts).toHaveLength(0);
    expect(compiled.css).toHaveLength(0);
    expect(analyzeComments("sample.astro", source)).toEqual([]);
    expect(analyzeComments("sample.html", source)).toEqual([]);
  }
});

test.each(["script", "style"])("keeps ordinary HTML MathML %s text inert", (tag) => {
  const source = `<math><${tag}>ordinary math text</${tag}></math>`;
  expect(analyzeComments("sample.html", source)).toEqual([]);
});

test("retains genuine MathML comments and evaluated Astro attribute comments", () => {
  const source = `<math><sCript>${comment}</sCript></math>`;
  expect(analyzeComments("sample.astro", source)[0].message).toContain("4 informational lines");
  expect(analyzeComments("sample.html", source)[0].message).toContain("4 informational lines");
  const expression =
    '<math><sTyle data-value={/*one\ntwo\nthree\nfour*/ "value"}>text</sTyle></math>';
  expect(analyzeComments("sample.astro", expression)[0].message).toContain("4 informational lines");
});

test.each(["script", "style"])(
  "retains canonical Astro %s compiler extraction in MathML",
  (tag) => {
    const source = `<math><${tag}>/*one\ntwo\nthree\nfour*/</${tag}></math>`;
    const compiled = transform(source, { filename: "sample.astro" });
    expect(compiled.diagnostics).toEqual([]);
    expect(tag === "script" ? compiled.scripts : compiled.css).toHaveLength(1);
    expect(analyzeComments("sample.astro", source)[0].message).toContain("4 informational lines");
  },
);

test.each(["sCript", "sTyle"])("retains executable %s in HTML integrations and SVG", (tag) => {
  for (const source of [
    `<math><mtext><${tag}>/*one\ntwo\nthree\nfour*/</${tag}></mtext></math>`,
    `<svg><${tag}>/*one\ntwo\nthree\nfour*/</${tag}></svg>`,
  ]) {
    expect(analyzeComments("sample.astro", source)[0].message).toContain("4 informational lines");
    expect(analyzeComments("sample.html", source)[0].message).toContain("4 informational lines");
  }
});

test.each(["Component", "components.Content"])(
  "fails at opaque foreign %s boundaries before trusting later siblings",
  (name) => {
    const source = `<svg>\r\n<${name} /><sCript>${quotedScript}</sCript></svg>`;
    expectBoundary(source, "unsupported component boundary in foreign content", 2);
  },
);

test("allows opaque components at source-known HTML integration points", () => {
  for (const source of [
    `<svg><foreignObject><Component /><title>${comment}</title></foreignObject></svg>`,
    `<math><mtext><Component /><title>${comment}</title></mtext></math>`,
    `<math><annotation-xml encoding="text/html"><Component /><title>${comment}</title></annotation-xml></math>`,
  ]) {
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    expect(analyzeComments("sample.astro", source)).toEqual([]);
  }
});
