import { describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeComments } from "./policy";
import { checkComments } from "./check";

const three = "first\nsecond\nthird";
const four = `${three}\nfourth`;
const lineComments = (text) =>
  text
    .split("\n")
    .map((line) => `// ${line}`)
    .join("\n");
const violations = (source, filename = "sample.ts") => analyzeComments(filename, source);

describe("informational comment limits", () => {
  test("allows three prose lines with separate block delimiters", () => {
    expect(violations(`/*\n${three}\n*/`)).toEqual([]);
    expect(violations(`/*\n${four}\n*/`)).toHaveLength(1);
    expect(violations(`/* ${four} */`)[0].message).toContain("4 informational lines");
  });

  test("counts adjacent line comments, including inline starts", () => {
    expect(violations(lineComments(three))).toEqual([]);
    expect(violations(`const x = 1; ${lineComments(four)}`)).toHaveLength(1);
  });

  test("keeps groups apart across blank lines, code and same-line comments", () => {
    expect(violations(`${lineComments(three)}\n\n// fourth`)).toEqual([]);
    expect(
      violations("// one\nconst x = 1; // two\nconst y = 2; // three\nconst z = 3; // four"),
    ).toEqual([]);
    expect(violations("/* first */ /* second */ /* third */ /* fourth */")).toEqual([]);
  });

  test("ignores empty block lines and reports the source line", () => {
    expect(violations(`/*\nfirst\n\nsecond\nthird\n*/`)).toEqual([]);
    expect(
      violations(`const emoji = '😀';\r\n\r\n/*\r\n${four.replaceAll("\n", "\r\n")}\r\n*/`)[0].line,
    ).toBe(3);
  });

  test("does not mistake strings, regexes, URLs or template literals for comments", () => {
    expect(
      violations(
        `const url = 'https://example.com';\nconst text = '/* fake */';\nconst pattern = /\\/\\*/;\nconst template = \`// first\n// second\n// third\n// fourth\`;`,
      ),
    ).toEqual([]);
  });
});

describe("documentation exceptions", () => {
  test.each(["=", "-", "*"])("accepts paired %s section fences", (character) => {
    const fence = character.repeat(12);
    expect(
      violations(lineComments(`${fence}\nRendering\nfirst\nsecond\nthird\nfourth\n${fence}`)),
    ).toEqual([]);
    expect(violations(`/*\n${fence}\nRendering\n${four}\n${fence}\n*/`)).toEqual([]);
  });

  test("requires paired fences and a meaningful title", () => {
    expect(violations(lineComments(`========\n${four}`))).toHaveLength(1);
    expect(violations(lineComments(`========\n${four}\n--------`))).toHaveLength(1);
    expect(
      violations(lineComments("========\n........\n........\n........\n========")),
    ).toHaveLength(1);
  });

  test.each(["file", "fileoverview", "section"])(
    "allows explicit @%s banners and diagrams",
    (tag) => {
      expect(
        violations(
          `/**\n * @${tag} render pipeline\n * input --> buffer\n *        |\n *        v\n *       screen\n */`,
        ),
      ).toEqual([]);
    },
  );

  test("ignores JSDoc metadata and its multiline continuations", () => {
    const metadata =
      "* @param {object} options settings\n *   with a detailed descriptor\n *   spanning several lines\n * @returns {Promise<void>}\n *   completion when ready";
    expect(violations(`/**\n * first\n * second\n * third\n ${metadata}\n */`)).toEqual([]);
    expect(violations(`/**\n * ${four.replaceAll("\n", "\n * ")}\n ${metadata}\n */`)).toHaveLength(
      1,
    );
  });

  test("does not treat ordinary block @param prose as JSDoc metadata", () => {
    expect(violations(`/*\n${four}\n@param value\n*/`)).toHaveLength(1);
  });

  test.each([
    "@ts-check",
    "@ts-expect-error explained",
    "prettier-ignore",
    "oxlint-disable no-debugger",
    "eslint-disable no-debugger",
    "c8 ignore next",
    "istanbul ignore file",
    '/ <reference types="astro/client" />',
  ])("exempts the actual directive %s only", (directive) => {
    expect(violations(`// ${directive}\n${lineComments(three)}`)).toEqual([]);
    expect(violations(`// ${directive}\n${lineComments(four)}`)).toHaveLength(1);
  });

  test("does not waive block prose because it mentions a directive", () => {
    expect(violations(`/*\noxlint-disable no-debugger\n${four}\n*/`)).toHaveLength(1);
    expect(
      violations(lineComments("first\nsecond\nthird\nthis mentions prettier-ignore")),
    ).toHaveLength(1);
  });
});

describe("language parsers", () => {
  test("reads JSX comments without interpreting JSX text as comments", () => {
    expect(
      violations(`export const element = <div>{/*\n${four}\n*/} // text</div>;`, "view.tsx"),
    ).toHaveLength(1);
  });

  test.each([
    `---\n${lineComments(four)}\n---\n<p>content</p>`,
    `<script>\n${lineComments(four)}\n</script>`,
    `<p>{/*\n${four}\n*/ 'content'}</p>`,
    `<!--\n${four}\n-->`,
    `<style>\n/*\n${four}\n*/\np { color: red; }</style>`,
  ])("checks Astro comment context %#", (source) => {
    expect(violations(source, "component.astro")).toHaveLength(1);
  });

  test("uses original Astro offsets after Unicode and CRLF", () => {
    const source = `---\r\nconst emoji = '😀';\r\n---\r\n<style>\r\np::before { content: '/* fake */'; }\r\n/*\r\n${four.replaceAll("\n", "\r\n")}\r\n*/\r\n</style>`;
    expect(violations(source, "component.astro")[0].line).toBe(6);
  });

  test("checks ordinary HTML and ignores raw script data", () => {
    const source = `<!doctype html><html><script type="application/json">{"text":"<!--\n${four}\n-->"}</script><!--\n${four}\n--></html>`;
    expect(violations(source, "player.html")).toHaveLength(1);
  });

  test("keeps literal HTML braces and template contents out of the Astro parser", () => {
    expect(
      violations("<p>{this is text}</p><template><p>{{ template }}</p></template>", "page.html"),
    ).toEqual([]);
    expect(violations(`<template><!--\n${four}\n--></template>`, "page.html")).toHaveLength(1);
  });

  test("checks real JavaScript and CSS inside HTML at original source positions", () => {
    const source = `<p>😀</p>\r\n<script type="module">\r\n${lineComments(four).replaceAll("\n", "\r\n")}\r\n</script>\r\n<style>/*\r\n${four.replaceAll("\n", "\r\n")}\r\n*/</style>`;
    const diagnostics = violations(source, "page.html");
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].line).toBe(3);
    expect(diagnostics[1].line).toBe(8);
  });

  test.each(['type="TEXT/CSS"', 'type="TeXt/CsS"', 'lang="en"', 'lang="scss"'])(
    "checks HTML CSS independently of the %s attribute",
    (attribute) => {
      expect(
        violations(`<style ${attribute}>/*\n${three}\n*/p { color:red }</style>`, "page.html"),
      ).toEqual([]);
      const diagnostics = violations(
        `<style ${attribute}>/*\n${four}\n*/p { color:red }</style>`,
        "page.html",
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("4 informational lines");
    },
  );

  test("parses SVG CDATA without adding whitespace between JavaScript tokens", () => {
    expect(
      violations("<svg><script><![CDATA[const value = 1;]]></script></svg>", "page.html"),
    ).toEqual([]);
    expect(
      violations("<svg><script>const val<![CDATA[ue]]> = 1;</script></svg>", "page.html"),
    ).toEqual([]);
    expect(
      violations(
        '<svg><script><![CDATA[const marker = "<![CDATA[";]]></script></svg>',
        "page.html",
      ),
    ).toEqual([]);
  });

  test("enforces SVG CDATA comments at original Unicode and CRLF source lines", () => {
    const source = `<p>😀</p>\r\n<svg><script><![CDATA[\r\n${lineComments(four).replaceAll("\n", "\r\n")}\r\n]]></script>\r\n<style><![CDATA[/*\r\n${four.replaceAll("\n", "\r\n")}\r\n*/]]></style></svg>\r\n<!--\r\n${four.replaceAll("\n", "\r\n")}\r\n-->`;
    const diagnostics = violations(source, "page.html");
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics.map((diagnostic) => diagnostic.line).sort((a, b) => a - b)).toEqual([
      3, 8, 14,
    ]);
    expect(
      diagnostics.every((diagnostic) => diagnostic.message.includes("4 informational lines")),
    ).toBe(true);
  });

  test("groups comments across SVG CDATA sections and counts their actual text", () => {
    const source =
      "<svg><script><![CDATA[// first\n]]><![CDATA[// second\n// third\n// fourth]]></script></svg>";
    expect(violations(source, "page.html")[0].message).toContain("4 informational lines");
    expect(
      violations(`<svg><script>/*<![CDATA[\n${three}\n]]>*/</script></svg>`, "page.html"),
    ).toEqual([]);
  });

  test("normalizes foreign input line endings before joining CDATA sections", () => {
    expect(
      violations(
        "<svg><script><![CDATA[// one\r]]><![CDATA[\n// two\n// three\n// four]]></script></svg>",
        "page.html",
      ),
    ).toEqual([]);
    const diagnostics = violations(
      "<svg><script><![CDATA[\r]]><![CDATA[\n// one\n// two\n// three\n// four]]></script></svg>",
      "page.html",
    );
    expect(diagnostics[0].message).toContain("4 informational lines");
    expect(diagnostics[0].line).toBe(3);
  });

  test.each(["script", "style"])(
    "decodes SVG %s references and maps synthetic lines to source",
    (tag) => {
      const comment = "/* first&#10;second&#10;third&#10;fourth */";
      const diagnostics = violations(
        `<p>😀</p>\r\n<svg><${tag}>&#10;${comment}</${tag}></svg>`,
        "page.html",
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("4 informational lines");
      expect(diagnostics[0].line).toBe(2);
      expect(violations(`<svg><${tag}><![CDATA[${comment}]]></${tag}></svg>`, "page.html")).toEqual(
        [],
      );
      expect(violations(`<${tag}>${comment}</${tag}>`, "page.html")).toEqual([]);
    },
  );

  test("parses the decoded JavaScript quotes in foreign text", () => {
    expect(
      violations("<svg><script>const marker = &quot;valid&quot;;</script></svg>", "page.html"),
    ).toEqual([]);
    expect(
      violations('<svg><script>const marker = "&quot;";</script></svg>', "page.html")[0].message,
    ).toContain("cannot parse source");
  });

  test("checks foreign DOM comments separately from the embedded JavaScript text", () => {
    expect(
      violations(
        "<svg><script><!-- short --><![CDATA[const value = ;]]></script></svg>",
        "page.html",
      )[0].message,
    ).toContain("cannot parse source");
    expect(
      violations(
        `<svg><script><!-- short -->\n<![CDATA[${lineComments(three)}]]></script></svg>`,
        "page.html",
      ),
    ).toEqual([]);
    const diagnostics = violations(
      `<svg><script><!--\n${four}\n--><![CDATA[${lineComments(three)}]]></script></svg>`,
      "page.html",
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("4 informational lines");
    expect(diagnostics[0].line).toBe(1);
  });

  test("maps diagnostics after removed multiline markup using their actual offsets", () => {
    const source =
      "<svg><script>const x = 1;<!--\nignored\n--><![CDATA[/*first\nsecond\nthird\nfourth*/]]></script></svg>";
    const diagnostics = violations(source, "page.html");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("4 informational lines");
    expect(diagnostics[0].line).toBe(3);
    const broken = violations(
      "<svg><script>const x = <!--\nignored\n--><![CDATA[;]]></script></svg>",
      "page.html",
    );
    expect(broken[0].message).toContain("cannot parse source");
    expect(broken[0].line).toBe(3);
    const css = violations(
      "<svg><style>p { <!--\nignored\n--><![CDATA[unknown]]></style></svg>",
      "page.html",
    );
    expect(css[0].message).toContain("cannot parse source");
    expect(css[0].line).toBe(3);
  });

  test("keeps CDATA-like strings in HTML scripts literal and reports real SVG parse errors", () => {
    expect(violations('<script>const marker = "<![CDATA[";</script>', "page.html")).toEqual([]);
    const diagnostics = violations(
      "<p>😀</p>\r\n<svg><script><![CDATA[\r\nconst value = ;\r\n]]></script></svg>",
      "page.html",
    );
    expect(diagnostics[0].message).toContain("cannot parse source");
    expect(diagnostics[0].line).toBe(3);
  });

  test("does not interpret non-JavaScript HTML script bodies as comments", () => {
    expect(
      violations(
        `<script type="text/plain">/*\n${four}\n*/</script><script>const fake = '<!-- fake -->';</script>`,
        "page.html",
      ),
    ).toEqual([]);
  });

  test.each(["text/plain", "application/json", "application/ld+json"])(
    "keeps %s Astro script data out of the comment policy",
    (type) => {
      const data = `<script type="${type}">/*\n${four}\n*/\n${lineComments(four)}\n<!--\n${four}\n-->\n{"quoted":"/* fake */", "url":"https://example.test"}</script>`;
      expect(violations(data, "component.astro")).toEqual([]);
      expect(
        violations(
          `<script type="${type}">{"quoted":"<!--\n${four}\n-->"}</script>`,
          "component.astro",
        ),
      ).toEqual([]);
    },
  );

  test("preserves real Astro script, frontmatter and expression comments around raw data", () => {
    const raw = `<script type="text/plain">/*\n${four}\n*/</script>`;
    const source = `---\r\n/*\r\n${four.replaceAll("\n", "\r\n")}\r\n*/\r\n---\r\n<p>😀</p>\r\n${raw}\r\n<script type="module">/*\n${four}\n*/</script>\n<script src="external.js">/*\n${four}\n*/</script>\n<script>/*\n${four}\n*/</script>\n<p>{/*\n${four}\n*/ 'content'}</p>`;
    const diagnostics = violations(source, "component.astro");
    expect(diagnostics).toHaveLength(5);
    expect(
      diagnostics.every((diagnostic) => diagnostic.message.includes("4 informational lines")),
    ).toBe(true);
    expect(diagnostics[0].line).toBe(2);
  });

  test("resolves literal Astro script type expressions without suppressing JavaScript", () => {
    expect(
      violations(`<script type={"text/plain"}>/*\n${four}\n*/</script>`, "component.astro"),
    ).toEqual([]);
    expect(
      violations(`<script type={"module"}>/*\n${four}\n*/</script>`, "component.astro"),
    ).toHaveLength(1);
  });

  test.each([
    "application/ecmascript",
    "application/javascript",
    "application/x-ecmascript",
    "application/x-javascript",
    "text/ecmascript",
    "text/javascript",
    "text/javascript1.0",
    "text/javascript1.1",
    "text/javascript1.2",
    "text/javascript1.3",
    "text/javascript1.4",
    "text/javascript1.5",
    "text/jscript",
    "text/livescript",
    "text/x-ecmascript",
    "text/x-javascript",
  ])("checks the JavaScript MIME essence %s in HTML and Astro", (type) => {
    for (const filename of ["page.html", "component.astro"]) {
      expect(violations(`<script type="${type}">/*\n${four}\n*/</script>`, filename)).toHaveLength(
        1,
      );
      expect(
        violations(
          `<script type=" \t${type.toUpperCase()}\r\n">/*\n${four}\n*/</script>`,
          filename,
        ),
      ).toHaveLength(1);
    }
  });

  test.each(["", "module", "MoDuLe"])("checks the script type %j in HTML and Astro", (type) => {
    for (const filename of ["page.html", "component.astro"]) {
      expect(violations(`<script type="${type}">/*\n${four}\n*/</script>`, filename)).toHaveLength(
        1,
      );
    }
  });

  test.each([
    "application/json",
    "application/ld+json",
    "text/plain",
    "text/javascript1.6",
    "text/javascript; charset=utf-8",
    "module; charset=utf-8",
    " module ",
    " \t\r\n",
    "\u00a0text/javascript\u00a0",
  ])("keeps the non-JavaScript type %j as data in HTML and Astro", (type) => {
    for (const filename of ["page.html", "component.astro"]) {
      expect(violations(`<script type="${type}">/*\n${four}\n*/</script>`, filename)).toEqual([]);
    }
  });

  test("fails closed when the Astro parser silently drops a trailing HTML comment", () => {
    expect(violations("<!-- unfinished", "component.astro")[0].message).toContain("uncovered");
    expect(violations("<p>hello</p>\n<!-- unfinished", "component.astro")[0].message).toContain(
      "uncovered",
    );
    expect(
      violations(`---\nconst fake = '<!-- unfinished';\n---\n<p>hello</p>`, "component.astro"),
    ).toEqual([]);
  });

  test("checks standalone CSS after Unicode and CRLF", () => {
    const source = `p::before { content: '😀 /* fake */'; }\r\n/*\r\n${four.replaceAll("\n", "\r\n")}\r\n*/`;
    expect(violations(source, "style.css")).toHaveLength(1);
    expect(violations(source, "style.css")[0].line).toBe(2);
  });

  test("locates Astro and CSS parse errors after Unicode and CRLF", () => {
    for (const [filename, source] of [
      ["component.astro", "<p>😀</p>\r\n<script>\r\nconst value = ;\r\n</script>"],
      ["component.astro", "<p>😀</p>\r\n<style>\r\np { broken; }\r\n</style>"],
      ["style.css", "/*😀*/\r\np {\r\n broken;\r\n}"],
    ]) {
      const diagnostics = violations(source, filename);
      expect(diagnostics[0].message).toContain("cannot parse source");
      expect(diagnostics[0].line).toBe(3);
    }
  });

  test.each([
    ["broken.ts", "const value = ;"],
    ["broken.astro", "<script>const value = ;</script>"],
    ["broken.css", "p { color:"],
    ["broken.html", "<!-- unfinished"],
    ["broken.html", "<script>const value = ;</script>"],
    ["broken.html", "<svg><script><![CDATA[unfinished"],
    ["unsupported.html", '<style type="text/scss">p {color:red}</style>'],
    ["unsupported.astro", '<style lang="scss">p { color: red; }</style>'],
    ["unsupported.astro", '<style lang={"scss"}>p {color:red}</style>'],
  ])("fails clearly when %s cannot be parsed", (filename, source) => {
    expect(violations(source, filename)[0].message).toContain("cannot parse source");
  });
});

test("CLI includes untracked authored files and respects generated, third-party and gitignored exclusions", () => {
  const directory = mkdtempSync(join(tmpdir(), "portfolio-comments-"));
  const error = spyOn(console, "error").mockImplementation(() => {});
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    execFileSync("git", ["init", "--quiet", directory]);
    mkdirSync(join(directory, "src"));
    mkdirSync(join(directory, "tools", "lint", "comments"), { recursive: true });
    mkdirSync(join(directory, "public", "third-party"), { recursive: true });
    mkdirSync(join(directory, "media", "assets"), { recursive: true });
    writeFileSync(join(directory, ".gitignore"), "ignored.ts\n");
    writeFileSync(join(directory, "src", "untracked.ts"), lineComments(four));
    writeFileSync(join(directory, "tools", "lint", "comments", "untracked.ts"), lineComments(four));
    writeFileSync(join(directory, "ignored.ts"), lineComments(four));
    writeFileSync(join(directory, "public", "third-party", "licensed.js"), lineComments(four));
    writeFileSync(join(directory, "media", "assets", "generated.js"), lineComments(four));
    writeFileSync(join(directory, "src", "schema.generated.ts"), lineComments(four));
    writeFileSync(
      join(directory, "src", "generated.ts"),
      `/** @generated */\n${lineComments(four)}`,
    );
    expect(checkComments(directory)).toBe(1);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0][0]).toContain("src/untracked.ts:1:");
    expect(error.mock.calls[1][0]).toContain("tools/lint/comments/untracked.ts:1:");
    writeFileSync(join(directory, "src", "untracked.ts"), lineComments(three));
    writeFileSync(
      join(directory, "tools", "lint", "comments", "untracked.ts"),
      lineComments(three),
    );
    expect(checkComments(directory)).toBe(0);
  } finally {
    error.mockRestore();
    log.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});
