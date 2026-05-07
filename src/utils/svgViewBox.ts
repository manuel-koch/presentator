export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseSvgViewBox(svgContent: string): ViewBox | null {
  const match = svgContent.match(/\bviewBox="([^"]+)"/i);
  if (!match) return null;
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

export function parseAspectRatio(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h || isNaN(w) || isNaN(h)) return 16 / 9;
  return w / h;
}
