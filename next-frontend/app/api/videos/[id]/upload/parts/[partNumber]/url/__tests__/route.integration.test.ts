import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

import { VIDEO_IDS } from "@/mocks/factories/videos";

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
let GET: (typeof import("@/app/api/videos/[id]/upload/parts/[partNumber]/url/route"))["GET"];

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/[id]/upload/parts/[partNumber]/url/route"));
});

const request = (id: string, partNumber: string) =>
  new Request(`http://localhost/api/videos/${id}/upload/parts/${partNumber}/url`);

beforeEach(async () => {
  cookieMap.clear();
  await login();
});

describe("GET /api/videos/[id]/upload/parts/[partNumber]/url", () => {
  it("passes the presigned part URL through", async () => {
    const res = await GET(
      request(VIDEO_IDS.UPLOADING, "3"),
      params({ id: VIDEO_IDS.UPLOADING, partNumber: "3" }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain("partNumber=3");
  });

  it("passes the upstream 400 for an out-of-range part number through", async () => {
    const res = await GET(
      request(VIDEO_IDS.UPLOADING, "0"),
      params({ id: VIDEO_IDS.UPLOADING, partNumber: "0" }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION_ERROR");
  });
});
