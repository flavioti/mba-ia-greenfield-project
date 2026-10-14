import { proxyAuthenticated } from "@/lib/api/authed-proxy";
import { upstream } from "@/lib/api/upstream";

/** Parts already stored (resume) → `GET /videos/{id}/upload/parts`. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  return proxyAuthenticated((authorization) =>
    upstream.GET("/videos/{id}/upload/parts", {
      headers: { Authorization: authorization },
      params: { path: { id } },
    }),
  );
}
