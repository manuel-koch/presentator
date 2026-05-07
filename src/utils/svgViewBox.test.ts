import { describe, it, expect } from "vitest";
import { parseSvgViewBox, parseAspectRatio } from "./svgViewBox";

describe("parseSvgViewBox", () => {
  it("parses a standard viewBox attribute", () => {
    expect(parseSvgViewBox('<svg viewBox="0 0 800 600">')).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("parses a viewBox with non-zero origin", () => {
    expect(parseSvgViewBox('<svg viewBox="-10 -20 400 300">')).toEqual({ x: -10, y: -20, width: 400, height: 300 });
  });

  it("parses comma-separated viewBox", () => {
    expect(parseSvgViewBox('<svg viewBox="0,0,200,100">')).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it("returns null when viewBox is absent", () => {
    expect(parseSvgViewBox('<svg xmlns="http://www.w3.org/2000/svg">')).toBeNull();
  });

  it("returns null for malformed viewBox", () => {
    expect(parseSvgViewBox('<svg viewBox="0 0 abc 100">')).toBeNull();
  });
});

describe("parseAspectRatio", () => {
  it("parses 16:9", () => {
    expect(parseAspectRatio("16:9")).toBeCloseTo(16 / 9);
  });

  it("parses 4:3", () => {
    expect(parseAspectRatio("4:3")).toBeCloseTo(4 / 3);
  });

  it("falls back to 16:9 for invalid input", () => {
    expect(parseAspectRatio("bad")).toBeCloseTo(16 / 9);
  });
});
