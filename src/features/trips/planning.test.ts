import { describe, expect, it } from "vitest";
import { dateRange, formatDay, formatShortRange, itemLabel, nightsBetween, statusLabel } from "./planning";

describe("visual planning helpers", () => {
  it("derives inclusive days without storing day records", () => {
    expect(dateRange("2027-02-15", "2027-02-17")).toEqual(["2027-02-15", "2027-02-16", "2027-02-17"]);
  });
  it("derives nights and deterministic UTC labels", () => {
    expect(nightsBetween("2027-02-15", "2027-02-19")).toBe(4);
    expect(formatDay("2027-02-16")).toContain("16 FEB");
    expect(formatShortRange("2027-02-15", "2027-02-19")).toBe("15 Feb – 19 Feb");
  });
  it("uses traveller-facing labels", () => {
    expect(itemLabel("food_place")).toBe("Food / place");
    expect(statusLabel("needs_checking")).toBe("Needs checking");
  });
});
