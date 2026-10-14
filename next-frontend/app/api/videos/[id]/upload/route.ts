import { proxyAuthenticated } from "@/lib/api/authed-proxy";
import { upstream } from "@/lib/api/upstream";

/** Cancels the upload → `DELETE /videos/{id}/upload`. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  return proxyAuthenticated((authorization) =>
    upstream.DELETE("/videos/{id}/upload", {
      headers: { Authorization: authorization },
      params: { path: { id } },
    }),
  );
}
