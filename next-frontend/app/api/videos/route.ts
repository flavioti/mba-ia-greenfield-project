import type { CreateVideoUploadDto } from "@/lib/api/contracts";
import { proxyAuthenticated } from "@/lib/api/authed-proxy";
import { upstream } from "@/lib/api/upstream";

/** Pre-registers the draft and starts the multipart upload → `POST /videos`. */
export async function POST(request: Request) {
  const body = (await request.json()) as CreateVideoUploadDto;

  return proxyAuthenticated((authorization) =>
    upstream.POST("/videos", { headers: { Authorization: authorization }, body }),
  );
}
