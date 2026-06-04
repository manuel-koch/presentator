export interface SVGElementNode {
  id: string;
  children: SVGElementNode[];
}

function isVisualElement(el: Element, root: Element): boolean {
  if (el === root) return false;                 // root <svg> itself
  if (el.closest("defs")) return false;          // structural/paint-server definitions
  if (el.tagName.includes(":")) return false;    // namespace-prefixed metadata (sodipodi:*, inkscape:*)
  return true;
}

function walkChildren(el: Element, root: Element, exclude: RegExp | null): SVGElementNode[] {
  const nodes: SVGElementNode[] = [];
  for (const child of el.children) {
    if (!isVisualElement(child, root)) continue;
    const children = walkChildren(child, root, exclude);
    if (child.id) {
      if (exclude?.test(child.id)) continue;
      nodes.push({ id: child.id, children });
    } else {
      // Promote named descendants of unnamed elements up to this level.
      nodes.push(...children);
    }
  }
  return nodes;
}

export function extractNamedElements(svgContent: string, excludeIdPattern?: string): SVGElementNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  let exclude: RegExp | null = null;
  if (excludeIdPattern) {
    try { exclude = new RegExp(excludeIdPattern); } catch { /* invalid pattern — ignore */ }
  }
  return walkChildren(doc.documentElement, doc.documentElement, exclude);
}
