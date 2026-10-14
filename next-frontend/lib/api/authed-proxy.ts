import "server-only";

import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import { withRefresh } from "@/lib/auth/refresh";
import { getSession } from "@/lib/auth/session";

/** Result shape shared by every `openapi-fetch` call. */
interface UpstreamResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

function unauthorized(): Response {
  return Response.json(
    {
      statusCode: 401,
      error: "UNAUTHORIZED",
      message: "Not authenticated",
    } satisfies ApiErrorEnvelope,
    { status: 401 },
  );
}

/**
 * Pass-through proxy for authenticated BFF routes: attaches the session's
 * access token, retries once after a transparent refresh on 401
 * (phase-02-auth-frontend/TD-03) and forwards the upstream status + body
 * unchanged (reshape: none).
 */
export async function proxyAuthenticated(
  call: (authorization: string) => Promise<UpstreamResult>,
): Promise<Response> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.accessToken) {
    return unauthorized();
  }

  return withRefresh(async () => {
    // Re-read on every attempt: a refresh rotates the access token.
    const { accessToken } = await getSession();
    const { data, error, response } = await call(`Bearer ${accessToken}`);
    if (response.status === 204) {
      return new Response(null, { status: 204 });
    }
    return Response.json(error ?? data ?? null, { status: response.status });
  });
}
