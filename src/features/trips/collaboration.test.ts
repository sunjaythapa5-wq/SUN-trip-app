import { describe, expect, it } from "vitest";
import { decisionSummary, isReactionEligible, participationSummary, preferenceSummary } from "./collaboration";

describe("adaptive collaboration language", () => {
  it("keeps solo preferences natural", () => expect(preferenceSummary(["keen"], 1)).toBe("My preference · Keen"));
  it("describes two matching travellers without percentages", () => expect(preferenceSummary(["keen", "keen"], 2)).toBe("Both keen"));
  it("describes two different travellers naturally", () => expect(preferenceSummary(["must_do", "maybe"], 2)).toBe("Different preferences"));
  it("names the missing traveller when available", () => expect(preferenceSummary(["keen"], 2, "Alex")).toBe("Alex hasn't weighed in yet"));
  it("uses useful counts for groups", () => expect(preferenceSummary(["keen", "keen", "keen", "keen", "maybe"], 5)).toBe("4 Keen · 1 Maybe"));
  it("keeps participation separate", () => expect(participationSummary(2, 2)).toBe("Both going"));
  it("keeps solo decisions personal", () => expect(decisionSummary(["Option A"], 1)).toBe("My choice · Option A"));
  it("summarises unresolved group responses", () => expect(decisionSummary(["Hotel A", "Hotel A", "Hotel B"], 5)).toBe("Hotel A · 2 · Hotel B · 1 · 2 haven't responded"));
});

describe("reaction eligibility", () => {
  it("allows preference-worthy planning items", () => expect(isReactionEligible("activity", "planned")).toBe(true));
  it("does not put preferences on booked operational items", () => expect(isReactionEligible("transport", "booked")).toBe(false));
});
