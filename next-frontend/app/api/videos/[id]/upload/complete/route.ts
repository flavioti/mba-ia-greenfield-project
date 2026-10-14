import type { CompleteVideoUploadDto } from "@/lib/api/contracts";
import { proxyAuthenticated } from "@/lib/api/authed-proxy";
import { upstream } from "@/lib/api/upstream";

/** Completes the multipart upload and starts processing → `POST /videos/{id}/upload/complete`. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await request.json()) as CompleteVideoUploadDto;

  return proxyAuthenticated((authorization) =>
    upstream.POST("/videos/{id}/upload/complete", {
      headers: { Authorization: authorization },
      params: { path: { id } },
      body,
    }),
  );
}
