import { html, parseFragment, type DefaultTreeAdapterTypes } from "parse5";

interface MappedText {
  parts: string[];
  offsets: number[];
}

function appendText(output: MappedText, content: string, offset: number): void {
  output.parts.push(content);
  for (let index = 0; index < content.length; index += 1) output.offsets.push(offset);
}

function appendRaw(output: MappedText, source: string, start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    const character = source[index] ?? "";
    appendText(output, character === "\r" ? "\n" : character, index);
    if (character === "\r" && source[index + 1] === "\n") index += 1;
  }
}

function decodeReference(reference: string): string {
  return parseFragment(reference)
    .childNodes.map((child) => ("value" in child ? child.value : ""))
    .join("");
}

function appendForeignText(
  output: MappedText,
  source: string,
  start: number,
  end: number,
  cdata: boolean,
): void {
  const tokens = cdata
    ? /<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|&(?:#[xX][\da-fA-F]+;?|#\d+;?|[a-zA-Z][a-zA-Z\d]*;?)/gu
    : /&(?:#[xX][\da-fA-F]+;?|#\d+;?|[a-zA-Z][a-zA-Z\d]*;?)/gu;
  let cursor = start;
  for (const token of source.slice(start, end).matchAll(tokens)) {
    const tokenStart = start + token.index;
    const tokenEnd = tokenStart + token[0].length;
    appendRaw(output, source, cursor, tokenStart);
    if (token[1] !== undefined) {
      const closingLength = token[0].endsWith("]]>") ? 3 : 0;
      appendRaw(output, source, tokenStart + 9, tokenEnd - closingLength);
    } else {
      appendText(output, decodeReference(token[0]), tokenStart);
    }
    cursor = tokenEnd;
  }
  appendRaw(output, source, cursor, end);
}

function appendElementText(
  output: MappedText,
  node: DefaultTreeAdapterTypes.Element,
  source: string,
): void {
  const foreign = node.namespaceURI !== html.NS.HTML;
  for (const child of node.childNodes) {
    const location = child.sourceCodeLocation;
    if (child.nodeName === "#text" && location) {
      if (!foreign && html.hasUnescapedText(node.tagName, true))
        appendRaw(output, source, location.startOffset, location.endOffset);
      else appendForeignText(output, source, location.startOffset, location.endOffset, foreign);
    } else if ("tagName" in child) appendElementText(output, child, source);
  }
}

export function htmlEmbeddedSource(
  node: DefaultTreeAdapterTypes.Element,
  source: string,
  start: number,
  end: number,
): { content: string; sourceOffsetAt: (offset: number) => number } {
  const output: MappedText = { parts: [], offsets: [] };
  if (node.namespaceURI === html.NS.HTML) {
    appendRaw(output, source, start, end);
  } else appendElementText(output, node, source);
  const content = output.parts.join("");
  return { content, sourceOffsetAt: (offset) => output.offsets[offset] ?? end };
}
