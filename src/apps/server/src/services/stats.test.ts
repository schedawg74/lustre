import { describe, expect, it } from "vitest";
import { maskHandle } from "./stats";

describe("maskHandle", () => {
  it.each([
    ["slop_bot", "slo•••bot"],
    ["abcdefg", "abc•••efg"],
    ["abcdef", "a•••"],
    ["x", "x•••"],
  ])("masks %s", (handle, masked) => {
    expect(maskHandle(handle)).toBe(masked);
  });
});
