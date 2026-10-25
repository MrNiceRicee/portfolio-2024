import { describe, expect, test } from "bun:test";
import { transform } from "@astrojs/compiler-rs";
import { parse } from "parse5";
import { analyzeComments } from "./policy";

const prose = "one\ntwo\nthree\nfour";
const htmlComment = `<!--${prose}-->`;
const javascriptComment = `/*${prose}*/`;

function domComments(node) {
  return (
    (node.nodeName === "#comment" ? 1 : 0) +
    (node.childNodes ?? []).reduce((count, child) => count + domComments(child), 0)
  );
}

function expectLiteralText(source) {
  expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
  expect(domComments(parse(source))).toBe(0);
  expect(analyzeComments("sample.astro", source)).toEqual([]);
}

describe("Astro markup comment contexts", () => {
  test.each(["textarea", "title", "iframe", "noscript", "textArea", "tItle", "iFrame"])(
    "keeps comment markers as literal text inside HTML %s",
    (tag) => {
      for (const newline of ["\n", "\r\n", "\r"]) {
        expectLiteralText(`<${tag}>${htmlComment.replaceAll("\n", newline)}</${tag}>`);
      }
    },
  );

  test.each(["textarea", "title", "iframe"])(
    "still checks JavaScript expression comments inside %s",
    (tag) => {
      const source = `<${tag}>{${javascriptComment}"value"}</${tag}>`;
      const diagnostics = analyzeComments("sample.astro", source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("4 informational lines");
    },
  );

  test.each(["title", "desc", "tItle", "dEsc"])("checks genuine SVG %s comments", (tag) => {
    const source = `<svg><${tag}>${htmlComment}</${tag}></svg>`;
    expect(domComments(parse(source))).toBe(1);
    expect(analyzeComments("sample.astro", source)).toHaveLength(1);
  });

  test.each([
    `<svg><foreignObject><title>${htmlComment}</title></foreignObject></svg>`,
    `<sVg><foreignobject><tItle>${htmlComment}</tItle></foreignobject></sVg>`,
    `<svg><dEsc><textArea>${htmlComment}</textArea></dEsc></svg>`,
    `<svg><desc><title>${htmlComment}</title></desc></svg>`,
    `<svg><title><title>${htmlComment}</title></title></svg>`,
    `<math><annotation-xml encoding="text/html"><title>${htmlComment}</title></annotation-xml></math>`,
    `<math><annotation-xml encoding="application/xhtml+xml"><title>${htmlComment}</title></annotation-xml></math>`,
    `<math><mtext><title>${htmlComment}</title></mtext></math>`,
    `<math><mi><textarea>${htmlComment}</textarea></mi></math>`,
  ])("uses HTML integration points for literal text: %#", (source) => {
    expectLiteralText(source);
  });

  test("resolves literal encoding expressions at MathML integration points", () => {
    const source = `<math><annotation-xml encoding={"text/html"}><title>${htmlComment}</title></annotation-xml></math>`;
    const renderedSource = source.replace('encoding={"text/html"}', 'encoding="text/html"');
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    expect(domComments(parse(renderedSource))).toBe(0);
    expect(analyzeComments("sample.astro", source)).toEqual([]);
  });

  test.each(["Component", "Textarea", "IFRAME"])(
    "retains comments across the unknown %s component boundary",
    (tag) => {
      const source = `<${tag}><title>${htmlComment}</title></${tag}>`;
      expect(analyzeComments("sample.astro", source)).toHaveLength(1);
    },
  );

  test("does not mistake fake frontmatter or expression markup for ancestry", () => {
    const source = `---\nconst fake = '<textarea>';\n---\n{\`<title>\`}\n<div>${htmlComment}</div>`;
    expect(analyzeComments("sample.astro", source)).toHaveLength(1);
  });

  test("retains surrounding genuine comments and embedded CSS and JavaScript comments", () => {
    const source = `<textarea>${htmlComment}</textarea>\n${htmlComment}\n<style>${javascriptComment}</style>\n<script>${javascriptComment}</script>`;
    const diagnostics = analyzeComments("sample.astro", source);
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics.every((diagnostic) => diagnostic.message.includes("4 informational"))).toBe(
      true,
    );
  });
});

describe("Astro literal attributes and positioned style failures", () => {
  test.each(['lang="css"', 'lang={"css"}', "lang={'css'}"])(
    "accepts the supported CSS language attribute %s",
    (attribute) => {
      const source = `<style ${attribute}>p {color:red} ${javascriptComment}</style>`;
      expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
      const diagnostics = analyzeComments("sample.astro", source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("4 informational lines");
    },
  );

  test.each(['TYPE="text/plain"', 'TyPe={"text/plain"}'])(
    "classifies HTML script data using the case-insensitive %s attribute",
    (attribute) => {
      const source = `<script ${attribute}>${javascriptComment}</script>`;
      expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
      expect(analyzeComments("sample.astro", source)).toEqual([]);
    },
  );

  test.each(['TYPE="module"', 'TyPe={"text/javascript"}'])(
    "retains genuine JavaScript comments with %s",
    (attribute) => {
      const source = `<script ${attribute}>${javascriptComment}</script>`;
      expect(analyzeComments("sample.astro", source)[0].message).toContain("4 informational lines");
    },
  );

  test("does not classify component props as native script attributes", () => {
    const source = `<Script TYPE="text/plain">{${javascriptComment}"value"}</Script>`;
    expect(analyzeComments("sample.astro", source)[0].message).toContain("4 informational lines");
  });

  test.each(['lang="scss"', 'lang={"scss"}', "lang={language}"])(
    "positions unsupported Astro languages at their original attribute: %s",
    (attribute) => {
      const source = `<p>😀</p>\r\n\r\n<style\r\n  ${attribute}>p {color:red}</style>`;
      const diagnostics = analyzeComments("sample.astro", source);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("unsupported style language");
      expect(diagnostics[0].line).toBe(4);
    },
  );

  test("positions unsupported HTML style types at their original attribute", () => {
    const source = '<p>😀</p>\r\n\r\n<style\r\n  TYPE="text/scss">p {color:red}</style>';
    const diagnostics = analyzeComments("sample.html", source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("unsupported HTML style language");
    expect(diagnostics[0].line).toBe(4);
  });
});

describe("native mixed-case embedded languages", () => {
  test.each(["sCript", "sTyle"])("checks real comments in static %s bodies", (tag) => {
    const source = `<p>😀</p>\r\n<${tag}>${javascriptComment}</${tag}>`;
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    const diagnostics = analyzeComments("sample.astro", source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("4 informational lines");
    expect(diagnostics[0].line).toBe(2);
  });

  test.each([
    "<sCript>const value = {Math.max(1, 2)};</sCript>",
    '<sTyle>{".foo { color: red; }"}</sTyle>',
  ])("fails clearly at templates in executable native bodies: %#", (source) => {
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    const diagnostics = analyzeComments("sample.astro", `<p>😀</p>\r\n${source}`);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("unsupported Astro template in mixed-case");
    expect(diagnostics[0].line).toBe(2);
  });

  test("preserves non-JavaScript templated data and its genuine expression comments", () => {
    expect(
      analyzeComments("sample.astro", '<sCript TYPE="text/plain">{"/* quoted data */"}</sCript>'),
    ).toEqual([]);
    const source = `<sCript type="application/json">{${javascriptComment} JSON.stringify({ok:true})}</sCript>`;
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    const diagnostics = analyzeComments("sample.astro", source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("4 informational lines");
  });

  test("does not parse native-looking markup inside literal text as executable code", () => {
    for (const tag of ["sCript", "sTyle"]) {
      const source = `<textarea><${tag}>${javascriptComment}</${tag}></textarea>`;
      expectLiteralText(source);
    }
  });

  test("keeps decoded foreign quotes and their comment markers as JavaScript data", () => {
    const source = `<svg><sCript>const x = &#96;${javascriptComment}&#96;;</sCript></svg>`;
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    expect(analyzeComments("sample.astro", source)).toEqual([]);
    const htmlSource = `<sCript>const x = &#96;${javascriptComment}&#96;;</sCript>`;
    expect(analyzeComments("sample.astro", htmlSource)[0].message).toContain("cannot parse source");
  });

  test("uses foreign text semantics and original lines for static native bodies", () => {
    const source = `<p>😀</p>\r\n<svg><sCript>/*one&#10;two&#10;three&#10;four*/</sCript></svg>`;
    expect(transform(source, { filename: "sample.astro" }).diagnostics).toEqual([]);
    const diagnostics = analyzeComments("sample.astro", source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("4 informational lines");
    expect(diagnostics[0].line).toBe(2);
  });
});
