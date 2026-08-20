export type RouteDecision =
  | { type: "continue" }
  | { type: "redirect"; pathname: string; next?: string };

export function isSafeInternalPath(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\"));
}

export function safeDestination(value: string | null | undefined, fallback = "/app") {
  return isSafeInternalPath(value) ? value : fallback;
}

export function getRouteDecision(pathname: string, isAuthenticated: boolean): RouteDecision {
  const isProtected = pathname === "/app" || pathname.startsWith("/app/");
  if (isProtected && !isAuthenticated) {
    return { type: "redirect", pathname: "/auth", next: pathname };
  }
  if (pathname === "/auth" && isAuthenticated) {
    return { type: "redirect", pathname: "/app" };
  }
  return { type: "continue" };
}
