import { beforeEach, describe, expect, it } from "vitest";
import { loadKey, saveKey } from "./storage.js";

beforeEach(() => {
  localStorage.clear();
});

describe("storage", () => {
  it("returns fallback when key is missing", async () => {
    const result = await loadKey("missing", false, { hello: "world" });
    expect(result).toEqual({ hello: "world" });
  });

  it("round-trips a value through save and load", async () => {
    await saveKey("tc:test", { a: 1, b: [2, 3] }, false);
    const result = await loadKey("tc:test", false, null);
    expect(result).toEqual({ a: 1, b: [2, 3] });
  });

  it("returns fallback when stored value is malformed JSON", async () => {
    localStorage.setItem("tc:bad", "not-json");
    const result = await loadKey("tc:bad", false, []);
    expect(result).toEqual([]);
  });

  it("ignores the shared flag for now", async () => {
    await saveKey("tc:test", "ok", true);
    const result = await loadKey("tc:test", true, null);
    expect(result).toBe("ok");
  });
});
