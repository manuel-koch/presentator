import { describe, it, expect } from "vitest";
import { hashString } from "./hash";

describe("hashString", () => {
  it("returns the same hash for identical strings", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("returns different hashes for different strings", () => {
    expect(hashString("hello")).not.toBe(hashString("world"));
  });

  it("distinguishes empty string from whitespace", () => {
    expect(hashString("")).not.toBe(hashString(" "));
  });

  it("is sensitive to content changes", () => {
    const base = "<svg><rect id='a'/></svg>";
    const modified = "<svg><rect id='b'/></svg>";
    expect(hashString(base)).not.toBe(hashString(modified));
  });
});
