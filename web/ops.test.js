import { beforeEach, describe, expect, it } from "vitest";
import { applyOps } from "./ops.js";

const baseWs = {
  id: "ws1",
  name: "Test",
  whys: [
    {
      id: "why1",
      text: "ship by Q3",
      sourceContributionIds: ["c0"],
      summary: "initial",
      whats: [
        {
          id: "what1",
          text: "build onboarding",
          sourceContributionIds: ["c0"],
          summary: "from contribution 0",
          hows: [
            {
              id: "how1",
              text: "wire sign-up form",
              sourceContributionIds: ["c0"],
              summary: "from c0",
            },
          ],
        },
      ],
    },
  ],
};

const newCid = "c1";

describe("applyOps", () => {
  it("addWhy appends a new top-level Why with empty whats", () => {
    const ops = [{ type: "addWhy", text: "reduce churn", summary: "added" }];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys).toHaveLength(2);
    expect(next.whys[1].text).toBe("reduce churn");
    expect(next.whys[1].whats).toEqual([]);
    expect(next.whys[1].summary).toBe("added");
    expect(next.whys[1].sourceContributionIds).toEqual([newCid]);
    expect(next.whys[1].id).toEqual(expect.any(String));
  });

  it("addWhy with nested whats and hows creates the full subtree", () => {
    const ops = [
      {
        type: "addWhy",
        text: "expand internationally",
        summary: "new strategic goal",
        whats: [
          {
            text: "localize UI",
            summary: "child what",
            hows: [{ text: "extract strings", summary: "grandchild how" }],
          },
        ],
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    const addedWhy = next.whys[1];
    expect(addedWhy.whats).toHaveLength(1);
    expect(addedWhy.whats[0].text).toBe("localize UI");
    expect(addedWhy.whats[0].hows).toHaveLength(1);
    expect(addedWhy.whats[0].hows[0].text).toBe("extract strings");
    expect(addedWhy.whats[0].sourceContributionIds).toEqual([newCid]);
    expect(addedWhy.whats[0].hows[0].sourceContributionIds).toEqual([newCid]);
  });

  it("addWhat nests a new What under the right Why", () => {
    const ops = [
      {
        type: "addWhat",
        parentWhyId: "why1",
        text: "build dashboard",
        summary: "added",
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats).toHaveLength(2);
    expect(next.whys[0].whats[1].text).toBe("build dashboard");
    expect(next.whys[0].whats[1].hows).toEqual([]);
    expect(next.whys[0].whats[1].sourceContributionIds).toEqual([newCid]);
  });

  it("addWhat with nested hows creates the subtree", () => {
    const ops = [
      {
        type: "addWhat",
        parentWhyId: "why1",
        text: "build dashboard",
        summary: "added",
        hows: [{ text: "design wireframes", summary: "first task" }],
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats[1].hows).toHaveLength(1);
    expect(next.whys[0].whats[1].hows[0].text).toBe("design wireframes");
  });

  it("addWhat with unknown parentWhyId silently no-ops", () => {
    const ops = [
      {
        type: "addWhat",
        parentWhyId: "ghost",
        text: "orphan",
        summary: "should not appear",
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats).toHaveLength(1); // unchanged
  });

  it("addHow nests a new How under the right What", () => {
    const ops = [
      {
        type: "addHow",
        parentWhatId: "what1",
        text: "write tests",
        summary: "tasks added",
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats[0].hows).toHaveLength(2);
    expect(next.whys[0].whats[0].hows[1].text).toBe("write tests");
    expect(next.whys[0].whats[0].hows[1].sourceContributionIds).toEqual([newCid]);
  });

  it("addHow with unknown parentWhatId silently no-ops", () => {
    const ops = [
      {
        type: "addHow",
        parentWhatId: "ghost",
        text: "orphan",
        summary: "x",
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats[0].hows).toHaveLength(1); // unchanged
  });

  it("editStatement updates text + summary on a Why and appends contributionId", () => {
    const ops = [
      {
        type: "editStatement",
        id: "why1",
        text: "ship by end of Q3",
        summary: "tightened deadline",
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].text).toBe("ship by end of Q3");
    expect(next.whys[0].summary).toBe("tightened deadline");
    expect(next.whys[0].sourceContributionIds).toEqual(["c0", newCid]);
  });

  it("editStatement updates a deeply nested How", () => {
    const ops = [
      {
        type: "editStatement",
        id: "how1",
        text: "wire and validate sign-up form",
        summary: "added validation",
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats[0].hows[0].text).toBe(
      "wire and validate sign-up form",
    );
  });

  it("editStatement with unknown id silently no-ops", () => {
    const ops = [
      { type: "editStatement", id: "ghost", text: "x", summary: "y" },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next).toEqual(baseWs);
  });

  it("deleteStatement removes a How and only that How", () => {
    const ops = [{ type: "deleteStatement", id: "how1", summary: "obsolete" }];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats[0].hows).toEqual([]);
    expect(next.whys[0].whats[0].id).toBe("what1");
  });

  it("deleteStatement on a What removes the What and its children", () => {
    const ops = [{ type: "deleteStatement", id: "what1", summary: "obsolete" }];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats).toEqual([]);
  });

  it("deleteStatement on a Why removes the Why and its descendants", () => {
    const ops = [{ type: "deleteStatement", id: "why1", summary: "obsolete" }];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys).toEqual([]);
  });

  it("applies ops in order: adds first, then edits, then deletes", () => {
    const ops = [
      { type: "deleteStatement", id: "what1", summary: "del" },
      {
        type: "editStatement",
        id: "what1",
        text: "build improved onboarding",
        summary: "edited",
      },
      {
        type: "addWhat",
        parentWhyId: "why1",
        text: "build dashboard",
        summary: "added",
      },
    ];
    const next = applyOps(baseWs, ops, newCid);
    expect(next.whys[0].whats).toHaveLength(1);
    expect(next.whys[0].whats[0].text).toBe("build dashboard");
  });

  it("returns a structurally-fresh tree (no shared references with input)", () => {
    const ops = [{ type: "addWhy", text: "x", summary: "y" }];
    const next = applyOps(baseWs, ops, newCid);
    expect(next).not.toBe(baseWs);
    expect(next.whys).not.toBe(baseWs.whys);
  });
});
