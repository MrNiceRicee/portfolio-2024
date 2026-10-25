import { describe, expect, test } from "bun:test";
import { parse } from "parse5";
import { htmlEmbeddedSource } from "./htmlSource";

function embeddedSource(source, tag = "script") {
  const document = parse(source, { sourceCodeLocationInfo: true });
  function find(node) {
    if (node.tagName === tag) return node;
    for (const child of node.childNodes ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  }
  const node = find(document);
  return htmlEmbeddedSource(
    node,
    source,
    node.sourceCodeLocation.startTag.endOffset,
    node.sourceCodeLocation.endTag.startOffset,
  );
}

describe("HTML embedded source normalization", () => {
  test("omits empty CDATA and DOM comments while mapping the end of input", () => {
    const source = "<svg><script><![CDATA[]]><!-- comment --><![CDATA[]]></script></svg>";
    const normalized = embeddedSource(source);
    expect(normalized.content).toBe("");
    expect(normalized.sourceOffsetAt(0)).toBe(source.indexOf("</script>"));
  });

  test("normalizes physical newlines before joining adjacent CDATA sections", () => {
    const source =
      "<svg><script><![CDATA[// one\r]]><![CDATA[\n// two\n// three\n// four]]></script></svg>";
    const normalized = embeddedSource(source);
    expect(normalized.content).toBe("// one\n\n// two\n// three\n// four");
    expect(normalized.sourceOffsetAt(normalized.content.indexOf("// two"))).toBe(
      source.indexOf("// two"),
    );
    expect(embeddedSource("<svg><script>\r<![CDATA[\n// first]]></script></svg>").content).toBe(
      "\n\n// first",
    );
  });

  test.each(["script", "style"])(
    "maps decoded %s newlines back to their source references",
    (tag) => {
      const source = `<svg><${tag}>/* first&#10;second&#xA;third&NewLine;fourth */</${tag}></svg>`;
      const normalized = embeddedSource(source, tag);
      expect(normalized.content).toBe("/* first\nsecond\nthird\nfourth */");
      expect(normalized.sourceOffsetAt(normalized.content.indexOf("\n"))).toBe(
        source.indexOf("&#10;"),
      );
      expect(normalized.sourceOffsetAt(normalized.content.indexOf("third"))).toBe(
        source.indexOf("third"),
      );
    },
  );

  test("decodes quotes and legacy references outside CDATA only", () => {
    const source =
      "<svg><script>const value = &quot;quoted&quot;; &notit;<![CDATA[&#10;<![CDATA[&quot;]]></script></svg>";
    const normalized = embeddedSource(source);
    expect(normalized.content).toBe('const value = "quoted"; ¬it;&#10;<![CDATA[&quot;');
    expect(normalized.sourceOffsetAt(normalized.content.indexOf('"'))).toBe(
      source.indexOf("&quot;"),
    );
  });

  test("preserves HTML namespace raw text", () => {
    const source = "<script><![CDATA[&quot;&#10;]]>\r\n// value</script>";
    const normalized = embeddedSource(source);
    expect(normalized.content).toBe("<![CDATA[&quot;&#10;]]>\n// value");
    expect(normalized.sourceOffsetAt(normalized.content.indexOf("// value"))).toBe(
      source.indexOf("// value"),
    );
  });

  test("excludes DOM comments and attributes while retaining descendant text", () => {
    const source =
      '<svg><script><!-- <![CDATA[&quot;]]> --><g title="<![CDATA[&quot;]]>"></g><![CDATA[&quot;]]></script></svg>';
    const normalized = embeddedSource(source);
    expect(normalized.content).toBe("&quot;");
    expect(normalized.sourceOffsetAt(0)).toBe(source.lastIndexOf("&quot;"));
    expect(
      embeddedSource("<svg><script><g><![CDATA[const value = ;]]></g></script></svg>").content,
    ).toBe("const value = ;");
  });

  test("respects HTML raw text and RCDATA inside foreign descendants", () => {
    const source =
      "<svg><script><foreignObject><textarea><![CDATA[&quot;]]></textarea><style><![CDATA[&quot;]]></style></foreignObject></script></svg>";
    expect(embeddedSource(source).content).toBe('<![CDATA["]]><![CDATA[&quot;]]>');
  });

  test("maps Unicode and newlines without assuming normalized and source lines match", () => {
    const source =
      "😀\r\n<svg><script>const x = 1;\u2028// first&#13;&#10;// second\u2029// third\r// fourth</script></svg>";
    const normalized = embeddedSource(source);
    expect(normalized.content).toBe(
      "const x = 1;\u2028// first\r\n// second\u2029// third\n// fourth",
    );
    for (const comment of ["// first", "// second", "// third", "// fourth"]) {
      expect(normalized.sourceOffsetAt(normalized.content.indexOf(comment))).toBe(
        source.indexOf(comment),
      );
    }
  });

  test("maps text joined across removed multiline markup", () => {
    const source =
      "<svg><script>const x = 1;<!--\nignored\n--><![CDATA[/*first\nsecond\nthird\nfourth*/]]></script></svg>";
    const normalized = embeddedSource(source);
    expect(normalized.content).toBe("const x = 1;/*first\nsecond\nthird\nfourth*/");
    expect(normalized.sourceOffsetAt(normalized.content.indexOf("/*first"))).toBe(
      source.indexOf("/*first"),
    );
  });

  test("uses the same foreign-text normalization in MathML", () => {
    expect(
      embeddedSource("<math><script><![CDATA[&quot;]]>&quot;x&quot;</script></math>").content,
    ).toBe('&quot;"x"');
  });
});
