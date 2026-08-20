import { NextResponse, type NextRequest } from "next/server";
import { getRouteDecision } from "@/features/auth/routing";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const decision = getRouteDecision(request.nextUrl.pathname, Boolean(userId));
  if (decision.type === "continue") return response;

  const destination = request.nextUrl.clone();
  destination.pathname = decision.pathname;
  destination.search = "";
  if (decision.next) destination.searchParams.set("next", decision.next);

  const redirectResponse = NextResponse.redirect(destination);
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
