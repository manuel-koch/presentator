export function extractNamedElements(svgContent: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  return Array.from(doc.querySelectorAll("[id]"))
    .map((el) => el.id)
    .filter(Boolean);
}
