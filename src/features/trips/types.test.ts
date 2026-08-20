import { describe, expect, it } from "vitest";
import { formatTripDates, initials } from "./types";

describe("trip presentation", () => {
  it("does not fabricate unknown dates", () => {
    expect(formatTripDates(null, null)).toBe("Dates need checking");
  });

  it("formats exact canonical dates", () => {
    expect(formatTripDates("2027-05-01", "2027-05-20")).toBe("1 May 2027 – 20 May 2027");
  });

  it("builds compact member initials", () => {
    expect(initials("Sunny Traveller")).toBe("ST");
    expect(initials(null)).toBe("T");
  });
});
