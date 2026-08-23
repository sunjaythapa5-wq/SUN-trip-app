import { describe, expect, it } from "vitest";
import { getRouteDecision, isSafeInternalPath, safeDestination } from "./routing";

describe("authentication route decisions", () => {
  it("redirects signed-out users away from protected routes", () => {
    expect(getRouteDecision("/app", false)).toEqual({ type: "redirect", pathname: "/auth", next: "/app" });
    expect(getRouteDecision("/app/settings", false)).toEqual({ type: "redirect", pathname: "/auth", next: "/app/settings" });
  });

  it("allows authenticated users into protected routes", () => {
    expect(getRouteDecision("/app", true)).toEqual({ type: "continue" });
  });

  it("redirects authenticated users away from the auth screen", () => {
    expect(getRouteDecision("/auth", true)).toEqual({ type: "redirect", pathname: "/app" });
  });

  it("treats the Alpha root as an app entry point", () => {
    expect(getRouteDecision("/", false)).toEqual({ type: "redirect", pathname: "/auth" });
    expect(getRouteDecision("/", true)).toEqual({ type: "redirect", pathname: "/app" });
  });

  it("allows the auth callback to continue", () => {
    expect(getRouteDecision("/auth/callback", false)).toEqual({ type: "continue" });
  });
});

describe("safe auth redirects", () => {
  it("accepts local application paths", () => {
    expect(isSafeInternalPath("/app/settings")).toBe(true);
    expect(safeDestination("/app/settings")).toBe("/app/settings");
  });

  it("rejects external, protocol-relative, and backslash paths", () => {
    expect(isSafeInternalPath("https://example.com")).toBe(false);
    expect(isSafeInternalPath("//example.com")).toBe(false);
    expect(isSafeInternalPath("/\\example.com")).toBe(false);
    expect(safeDestination("https://example.com")).toBe("/app");
  });
});
