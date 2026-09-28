import { describe, expect, it } from "vitest";
import { extractJson } from "./ai.js";

describe("extractJson", () => {
  it("parses raw JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const text = '```json\n{"a":1}\n```';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    const text = '```\n{"a":1}\n```';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it("slices to outermost braces when prose precedes JSON", () => {
    const text = 'Here is the result:\n{"why":"x","what":"y"}\nDone.';
    expect(extractJson(text)).toEqual({ why: "x", what: "y" });
  });

  it("throws on empty input", () => {
    expect(() => extractJson("")).toThrow(/empty/i);
  });

  it("throws when no JSON object present", () => {
    expect(() => extractJson("no json here")).toThrow(/json/i);
  });

  it("repairs JSON with a trailing comma", () => {
    expect(extractJson('{"a":1,"b":[1,2,3,],}')).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("repairs JSON with a missing comma between objects in an array", () => {
    expect(
      extractJson('{"ops":[{"x":1}{"y":2}]}'),
    ).toEqual({ ops: [{ x: 1 }, { y: 2 }] });
  });
});
