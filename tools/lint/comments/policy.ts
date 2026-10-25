import { parse as parseAstro } from "@astrojs/compiler-rs";
import { Buffer } from "node:buffer";
import { parseSync } from "oxc-parser";
import { parse as parseHtml, type DefaultTreeAdapterTypes } from "parse5";
import postcss, { CssSyntaxError } from "postcss";
import { htmlEmbeddedSource } from "./htmlSource";

export interface CommentDiagnostic {
  line: number;
  message: string;
}

interface SourceDiagnostic {
  offset: number;
  message: string;
}

class SourceParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

interface CommentSpan {
  start: number;
  end: number;
  kind: "line" | "block" | "html";
}

interface Extraction {
  comments: CommentSpan[];
  diagnostics: SourceDiagnostic[];
  embeddedDiagnostics?: SourceDiagnostic[];
}

type SourceRange = Pick<CommentSpan, "start" | "end">;

type AstNode = Record<string, unknown>;

const javascriptMimeEssences = new Set([
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
]);

function asNode(value: unknown): AstNode | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as AstNode)
    : undefined;
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r\n|[\n\r\u2028\u2029]/u).length;
}

function cssErrorOffset(error: CssSyntaxError, source: string): number {
  if (error.input?.offset !== undefined) return error.input.offset;
  const lines = source.split("\n");
  const preceding = lines.slice(0, Math.max(0, (error.line ?? 1) - 1));
  return (
    preceding.reduce((offset, line) => offset + line.length + 1, 0) +
    Math.max(0, (error.column ?? 1) - 1)
  );
}

function javascriptComments(filename: string, source: string): Extraction {
  const parsed = parseSync(filename, source);
  return {
    comments: parsed.comments.map(({ start, end, type }) => ({
      start,
      end,
      kind: type === "Line" ? "line" : "block",
    })),
    diagnostics: parsed.errors.map((error) => ({
      offset: error.labels[0]?.start ?? 0,
      message: `cannot parse source: ${error.message}`,
    })),
  };
}

function cssComments(filename: string, source: string, offset = 0): CommentSpan[] {
  const comments: CommentSpan[] = [];
  let parsed: postcss.Root;
  try {
    parsed = postcss.parse(source, { from: filename });
  } catch (error) {
    if (error instanceof CssSyntaxError)
      throw new SourceParseError(error.message, offset + cssErrorOffset(error, source));
    throw error;
  }
  parsed.walkComments((comment) => {
    const start = comment.source?.start?.offset;
    const end = comment.source?.end?.offset;
    if (start === undefined || end === undefined) {
      throw new Error("CSS parser did not provide comment positions");
    }
    comments.push({ start: start + offset, end: end + offset, kind: "block" });
  });
  return comments;
}

function attributeValue(element: AstNode, name: string): unknown {
  if (!Array.isArray(element.attributes)) return undefined;
  const attribute = element.attributes.find((value: unknown) => {
    const node = asNode(value);
    return asNode(node?.name)?.name === name;
  });
  const value = asNode(asNode(attribute)?.value);
  return value?.type === "Literal" ? value.value : value;
}

function extractStyle(node: AstNode, source: string, filename: string): CommentSpan[] {
  const opening = asNode(node.openingElement);
  const closing = asNode(node.closingElement);
  if (!opening || asNode(opening.name)?.name !== "style") return [];
  const language = attributeValue(opening, "lang");
  if (language !== undefined && language !== "css") {
    throw new Error(`unsupported style language: ${String(language)}`);
  }
  if (typeof opening.end !== "number" || typeof closing?.start !== "number") return [];
  return cssComments(filename, source.slice(opening.end, closing.start), opening.end);
}

function visitAst(value: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) visitAst(child, visit);
    return;
  }
  const node = asNode(value);
  if (!node) return;
  visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== "comments") visitAst(child, visit);
  }
}

function isJavaScriptType(value: string | undefined): boolean {
  if (value === undefined || value === "") return true;
  const type = value.toLowerCase();
  return (
    type === "module" ||
    javascriptMimeEssences.has(type.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu, ""))
  );
}

function rawScriptRange(node: AstNode): SourceRange | undefined {
  const opening = asNode(node.openingElement);
  if (!opening || asNode(opening.name)?.name !== "script") return undefined;
  const value = attributeValue(opening, "type");
  const literal = typeof value === "string" ? value : asNode(asNode(value)?.expression)?.value;
  if (isJavaScriptType(typeof literal === "string" ? literal : undefined)) return undefined;
  const closing = asNode(node.closingElement);
  if (typeof opening.end !== "number" || typeof closing?.start !== "number") return undefined;
  return { start: opening.end, end: closing.start };
}

function markupComments(filename: string, source: string): Extraction {
  const parsed = parseAstro(source);
  const ast: AstNode = parsed.ast;
  const comments: CommentSpan[] = [];
  const rawScripts: SourceRange[] = [];
  if (Array.isArray(ast.comments)) {
    for (const value of ast.comments) {
      const comment = asNode(value);
      if (typeof comment?.start === "number" && typeof comment.end === "number") {
        comments.push({
          start: comment.start,
          end: comment.end,
          kind: comment.type === "Line" ? "line" : "block",
        });
      }
    }
  }
  visitAst(ast, (node) => {
    if (
      node.type === "AstroComment" &&
      typeof node.start === "number" &&
      typeof node.end === "number"
    ) {
      comments.push({ start: node.start, end: node.end, kind: "html" });
    }
    if (node.type === "JSXElement") {
      const rawScript = rawScriptRange(node);
      if (rawScript) rawScripts.push(rawScript);
      comments.push(...extractStyle(node, source, filename));
    }
  });
  const diagnostics = parsed.diagnostics
    .filter((error) => error.severity === "error")
    .map((error) => ({
      offset: Buffer.from(source)
        .subarray(0, error.labels[0]?.start ?? 0)
        .toString("utf8").length,
      message: `cannot parse source: ${error.text}`,
    }));
  const body: unknown[] = Array.isArray(ast.body) ? ast.body : [];
  const ends = [asNode(ast.frontmatter)?.end, ...body.map((node) => asNode(node)?.end)];
  const coveredEnd = Math.max(0, ...ends.filter((end): end is number => typeof end === "number"));
  if (source.slice(coveredEnd).trim()) {
    diagnostics.push({
      offset: coveredEnd,
      message: "cannot parse source: Astro parser left trailing source uncovered",
    });
  }
  return {
    comments: comments.filter(
      (comment) =>
        !rawScripts.some((range) => comment.start >= range.start && comment.end <= range.end),
    ),
    diagnostics,
  };
}

function visitHtml(
  node: DefaultTreeAdapterTypes.Node,
  visit: (node: DefaultTreeAdapterTypes.Node) => void,
): void {
  visit(node);
  if ("childNodes" in node) {
    for (const child of node.childNodes) visitHtml(child, visit);
  }
  if ("content" in node) visitHtml(node.content, visit);
}

function htmlAttribute(node: DefaultTreeAdapterTypes.Element, name: string): string | undefined {
  return node.attrs.find((attribute) => attribute.name === name)?.value;
}

function htmlEmbeddedComments(
  node: DefaultTreeAdapterTypes.Element,
  source: string,
  filename: string,
): SourceDiagnostic[] {
  const start = node.sourceCodeLocation?.startTag?.endOffset;
  const end = node.sourceCodeLocation?.endTag?.startOffset ?? node.sourceCodeLocation?.endOffset;
  if (start === undefined || end === undefined) return [];
  const type = htmlAttribute(node, "type");
  if (node.tagName === "style") {
    if (type && type.toLowerCase() !== "text/css")
      throw new Error("unsupported HTML style language");
  } else if (!isJavaScriptType(type)) return [];
  const { content, sourceOffsetAt } = htmlEmbeddedSource(node, source, start, end);
  return analyzeSource(`${filename}.${node.tagName === "style" ? "css" : "js"}`, content).map(
    (diagnostic) => ({
      ...diagnostic,
      offset: sourceOffsetAt(diagnostic.offset),
    }),
  );
}

function htmlComments(filename: string, source: string): Extraction {
  const embeddedDiagnostics: SourceDiagnostic[] = [];
  const result: Extraction = { comments: [], diagnostics: [], embeddedDiagnostics };
  const document = parseHtml(source, {
    sourceCodeLocationInfo: true,
    onParseError(error) {
      if (
        error.code.includes("comment") ||
        error.code === "eof-in-tag" ||
        error.code === "eof-in-cdata"
      )
        result.diagnostics.push({
          offset: error.startOffset,
          message: `cannot parse source: ${error.code}`,
        });
    },
  });
  visitHtml(document, (node) => {
    const location = node.sourceCodeLocation;
    if (node.nodeName === "#comment" && location)
      result.comments.push({ start: location.startOffset, end: location.endOffset, kind: "html" });
    if ("tagName" in node && (node.tagName === "style" || node.tagName === "script")) {
      embeddedDiagnostics.push(...htmlEmbeddedComments(node, source, filename));
    }
  });
  return result;
}

function extractComments(filename: string, source: string): Extraction {
  if (/\.astro$/iu.test(filename)) return markupComments(filename, source);
  if (/\.html$/iu.test(filename)) return htmlComments(filename, source);
  if (/\.css$/iu.test(filename))
    return { comments: cssComments(filename, source), diagnostics: [] };
  return javascriptComments(filename, source);
}

function commentLines(comment: CommentSpan, source: string): string[] {
  const raw = source.slice(comment.start, comment.end);
  if (comment.kind === "line") return [raw.slice(2).trim()];
  const content = comment.kind === "html" ? raw.slice(4, -3) : raw.slice(2, -2);
  return content.split(/\r\n|[\n\r\u2028\u2029]/u).map((line) =>
    line
      .trim()
      .replace(/^\*(?:[ \t]|$)/u, "")
      .trim(),
  );
}

function isDirective(line: string): boolean {
  return /^(?:@ts-(?:check|nocheck|ignore|expect-error)\b|(?:prettier|format)-ignore\b|(?:oxlint|eslint)(?:-disable|-enable)\b|(?:istanbul|c8|v8)\s+ignore\b|\/\s*<(?:reference|amd-module|amd-dependency)\b[^>]*\/?>\s*$)/u.test(
    line,
  );
}

function isBanner(lines: string[]): boolean {
  if (lines.some((line) => /^@(?:file|fileoverview|section)\b/u.test(line))) return true;
  const first = lines[0];
  const last = lines.at(-1);
  if (!first || !last || lines.length < 3) return false;
  const fence = /^([=*_~#-])\1{2,}$/u;
  return (
    fence.test(first) &&
    fence.test(last) &&
    first[0] === last[0] &&
    lines.slice(1, -1).some((line) => /[\p{L}\p{N}]/u.test(line))
  );
}

function informationalLines(comments: CommentSpan[], source: string): number {
  const lines = comments.flatMap((comment) => commentLines(comment, source)).filter(Boolean);
  if (isBanner(lines)) return 0;
  const first = comments[0];
  const jsdoc = first?.kind === "block" && source.startsWith("/**", first.start);
  const metadata = jsdoc
    ? lines.findIndex((line) => /^@[a-z]/iu.test(line) && !isDirective(line))
    : -1;
  return (metadata === -1 ? lines : lines.slice(0, metadata)).filter((line) => !isDirective(line))
    .length;
}

function consecutiveLines(previous: CommentSpan, next: CommentSpan, source: string): boolean {
  if (previous.kind !== "line" || next.kind !== "line") return false;
  const gap = source.slice(previous.end, next.start);
  return /^\s*$/u.test(gap) && lineAt(gap, gap.length) === 2;
}

function analyzeSource(filename: string, source: string): SourceDiagnostic[] {
  let extraction: Extraction;
  try {
    extraction = extractComments(filename, source);
  } catch (error) {
    return [
      {
        offset: error instanceof SourceParseError ? error.offset : 0,
        message: `cannot parse source: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
  if (extraction.diagnostics.length > 0) return extraction.diagnostics;
  const diagnostics: SourceDiagnostic[] = [...(extraction.embeddedDiagnostics ?? [])];
  const groups: CommentSpan[][] = [];
  for (const comment of extraction.comments.sort((left, right) => left.start - right.start)) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    if (previous && consecutiveLines(previous, comment, source)) group?.push(comment);
    else groups.push([comment]);
  }
  for (const group of groups) {
    const count = informationalLines(group, source);
    const first = group[0];
    if (count > 3 && first) {
      diagnostics.push({
        offset: first.start,
        message: `comment has ${count} informational lines; maximum is 3 (section/file banners and JSDoc metadata are exempt)`,
      });
    }
  }
  return diagnostics.sort((left, right) => left.offset - right.offset);
}

export function analyzeComments(filename: string, source: string): CommentDiagnostic[] {
  return analyzeSource(filename, source).map(({ offset, message }) => ({
    line: lineAt(source, offset),
    message,
  }));
}
