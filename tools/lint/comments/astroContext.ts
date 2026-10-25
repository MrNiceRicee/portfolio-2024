import { foreignContent, html, Token } from "parse5";
import { SourceParseError } from "./sourceError";

export type AstNode = Record<string, unknown>;

interface MarkupContext {
  namespace: html.NS;
  name: string;
  attributes: Token.Attribute[];
  literalText: boolean;
}

const rootContext: MarkupContext = {
  namespace: html.NS.HTML,
  name: "",
  attributes: [],
  literalText: false,
};

export function asNode(value: unknown): AstNode | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as AstNode)
    : undefined;
}

export function findAttribute(
  element: AstNode,
  name: string,
  caseInsensitive = false,
): AstNode | undefined {
  if (!Array.isArray(element.attributes)) return undefined;
  return element.attributes.map(asNode).find((attribute) => {
    const attributeName = asNode(attribute?.name)?.name;
    if (typeof attributeName !== "string") return false;
    return (caseInsensitive ? attributeName.toLowerCase() : attributeName) === name;
  });
}

export function attributeValue(attribute: AstNode | undefined): unknown {
  const value = asNode(attribute?.value);
  if (value?.type === "Literal") return value.value;
  const expression = asNode(value?.expression);
  return expression?.type === "Literal" ? expression.value : value;
}

function usesHtmlRules(parent: MarkupContext, name: string): boolean {
  if (parent.namespace === html.NS.HTML) return true;
  const tag = html.getTagID(parent.name);
  if (foreignContent.isIntegrationPoint(tag, parent.namespace, parent.attributes, html.NS.HTML))
    return true;
  if (parent.name === "annotation-xml" && name === "svg") return true;
  return (
    foreignContent.isIntegrationPoint(tag, parent.namespace, parent.attributes, html.NS.MATHML) &&
    name !== "mglyph" &&
    name !== "malignmark"
  );
}

function spreadAttribute(opening: AstNode): AstNode | undefined {
  if (!Array.isArray(opening.attributes)) return undefined;
  return opening.attributes
    .map(asNode)
    .find((attribute) => attribute?.type === "JSXSpreadAttribute");
}

function nativeAttributes(opening: AstNode): Token.Attribute[] {
  if (!Array.isArray(opening.attributes)) return [];
  return opening.attributes.flatMap((value) => {
    const attribute = asNode(value);
    const name = asNode(attribute?.name)?.name;
    return typeof name === "string" ? [{ name: name.toLowerCase(), value: "" }] : [];
  });
}

function requireNoBreakout(opening: AstNode, name: string): void {
  const spread = name === "font" ? spreadAttribute(opening) : undefined;
  if (spread)
    throw new SourceParseError(
      "cannot determine foreign-content breakout from spread font attributes",
      typeof spread.start === "number" ? spread.start : 0,
    );
  const token: Token.TagToken = {
    type: Token.TokenType.START_TAG,
    tagName: name,
    tagID: html.getTagID(name),
    selfClosing: false,
    ackSelfClosing: false,
    attrs: nativeAttributes(opening),
    location: null,
  };
  if (foreignContent.causesExit(token))
    throw new SourceParseError(
      `unsupported foreign-content breakout at ${name}`,
      typeof opening.start === "number" ? opening.start : 0,
    );
}

function elementNamespace(parent: MarkupContext, name: string, opening: AstNode): html.NS {
  if (!usesHtmlRules(parent, name)) {
    requireNoBreakout(opening, name);
    return parent.namespace;
  }
  if (name === "svg") return html.NS.SVG;
  return name === "math" ? html.NS.MATHML : html.NS.HTML;
}

function integrationAttributes(
  opening: AstNode,
  name: string,
  namespace: html.NS,
): Token.Attribute[] {
  if (namespace !== html.NS.MATHML || name !== "annotation-xml") return [];
  const attribute = findAttribute(opening, "encoding", true);
  const encoding = attributeValue(attribute);
  const unresolved = spreadAttribute(opening) ?? (asNode(encoding) ? attribute : undefined);
  if (unresolved)
    throw new SourceParseError(
      "cannot determine MathML integration namespace from dynamic or spread attributes",
      typeof unresolved.start === "number" ? unresolved.start : 0,
    );
  return typeof encoding === "string" ? [{ name: "encoding", value: encoding }] : [];
}

function nativeElementName(opening: AstNode, parent: MarkupContext): string | undefined {
  const name = asNode(opening.name)?.name;
  if (typeof name === "string" && /^[a-z]/u.test(name)) return name;
  if (!usesHtmlRules(parent, ""))
    throw new SourceParseError(
      "unsupported component boundary in foreign content; cannot determine following native namespaces",
      typeof opening.start === "number" ? opening.start : 0,
    );
  return undefined;
}

function elementContext(node: AstNode, parent: MarkupContext | null): MarkupContext | null {
  const opening = asNode(node.openingElement);
  if (!parent || !opening) return null;
  const authoredName = nativeElementName(opening, parent);
  if (!authoredName) return null;
  if (parent.literalText) return parent;
  const name = authoredName.toLowerCase();
  const namespace = elementNamespace(parent, name, opening);
  const adjustedName = foreignContent.SVG_TAG_NAMES_ADJUSTMENT_MAP.get(name) ?? name;
  return {
    namespace,
    name: namespace === html.NS.SVG ? adjustedName : name,
    attributes: integrationAttributes(opening, name, namespace),
    literalText:
      parent.literalText ||
      (namespace === html.NS.HTML &&
        (name === "title" || name === "textarea" || html.hasUnescapedText(name, true))),
  };
}

export function visitAst(
  value: unknown,
  visit: (
    node: AstNode,
    literalText: boolean,
    namespace: html.NS | undefined,
    literalParent: boolean,
  ) => void,
  context: MarkupContext | null = rootContext,
): void {
  if (Array.isArray(value)) {
    for (const child of value) visitAst(child, visit, context);
    return;
  }
  const node = asNode(value);
  if (!node) return;
  const element = node.type === "JSXElement";
  const next = element ? elementContext(node, context) : context;
  visit(node, next?.literalText ?? false, next?.namespace, context?.literalText ?? false);
  for (const [key, child] of Object.entries(node)) {
    if (key !== "comments") visitAst(child, visit, element && key !== "children" ? context : next);
  }
}
