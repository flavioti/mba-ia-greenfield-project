import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

import { INVALID_ETAG, VIDEO_IDS } from "@/mocks/factories/videos";

const cookieMap = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      cookieMap.has(name) ? { name, value: cookieMap.get(name)! } : undefined,
    set: (name: string, value: string) => { cookieMap.set(name, value); },
    delete: (name: string) => { cookieMap.delete(name); },
  }),
}));

const { setSession, getSession } = await import("@/lib/auth/session");

async function login(accessToken = "active-at") {
  await setSession({
    accessToken,
    refreshToken: "active-rt",
    userId: "u1",
    email: "alice@example.com",
    channelSlug: "alice",
  });
}

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

// Imported after MSW starts listening: openapi-fetch captures `fetch` when the
// upstream client module is created.
let POST: (typeof import("@/app/api/videos/[id]/upload/complete/route"))["POST"];

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/[id]/upload/complete/route"));
});

const request = (id: string, body: unknown) =>
  new Request(`http://localhost/api/videos/${id}/upload/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  cookieMap.clear();
  await login();
});

describe("POST /api/videos/[id]/upload/complete", () => {
  it("passes the processing Video through", async () => {
    const res = await POST(
      request(VIDEO_IDS.UPLOADING, { parts: [{ PartNumber: 1, ETag: '"ok"' }] }),
      params({ id: VIDEO_IDS.UPLOADING }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).processing_status).toBe("processing");
  });

  it("passes 400 INVALID_UPLOAD_PARTS through", async () => {
    const res = await POST(
      request(VIDEO_IDS.UPLOADING, { parts: [{ PartNumber: 1, ETag: INVALID_ETAG }] }),
      params({ id: VIDEO_IDS.UPLOADING }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_UPLOAD_PARTS");
  });
});
