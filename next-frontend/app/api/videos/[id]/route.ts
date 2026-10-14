import { proxyAuthenticated } from "@/lib/api/authed-proxy";
import { upstream } from "@/lib/api/upstream";

/** Owned video (polled while uploading/processing) → `GET /videos/{id}`. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  return proxyAuthenticated((authorization) =>
    upstream.GET("/videos/{id}", {
      headers: { Authorization: authorization },
      params: { path: { id } },
    }),
  );
}
