import { proxyAuthenticated } from "@/lib/api/authed-proxy";
import { upstream } from "@/lib/api/upstream";

/** Presigned PUT URL for one part → `GET /videos/{id}/upload/parts/{partNumber}/url`. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; partNumber: string }> },
) {
  const { id, partNumber } = await ctx.params;

  return proxyAuthenticated((authorization) =>
    upstream.GET("/videos/{id}/upload/parts/{partNumber}/url", {
      headers: { Authorization: authorization },
      // Forwarded as-is; the upstream validates the 1..10000 range.
      params: { path: { id, partNumber: partNumber as unknown as number } },
    }),
  );
}
