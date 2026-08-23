import { describe, expect, it } from "vitest";
import { contextualDate, dateRange, formatDay, formatShortRange, isDateWithin, itemLabel, journeyWidth, nightsBetween, statusLabel } from "./planning";

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
  it("prioritises the most specific trip calendar context", () => {
    expect(contextualDate({ selectedDate: "2028-01-04", destinationStart: "2028-01-02", tripStart: "2027-12-28" })).toBe("2028-01-04");
    expect(contextualDate({ destinationStart: "2028-01-02", itemDate: "2027-12-30", tripStart: "2027-12-28" })).toBe("2028-01-02");
    expect(contextualDate({ transitionDate: "2028-01-01", tripStart: "2027-12-28" })).toBe("2028-01-01");
    expect(contextualDate({}, "2026-08-22")).toBe("2026-08-22");
  });
  it("handles valid ranges and multi-month or multi-year context", () => {
    expect(isDateWithin("2028-01-04", "2027-12-28", "2028-01-08")).toBe(true);
    expect(isDateWithin("2028-01-09", "2027-12-28", "2028-01-08")).toBe(false);
  });
  it("gives longer stays more visual weight within safe bounds", () => {
    expect(journeyWidth(2)).toBeLessThan(journeyWidth(7));
    expect(journeyWidth(0)).toBe(140);
    expect(journeyWidth(100)).toBe(240);
  });
});
