import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";
import { server } from "@/mocks/server";
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
let GET: (typeof import("@/app/api/videos/[id]/upload/parts/route"))["GET"];

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/[id]/upload/parts/route"));
});

const request = (id: string) => new Request(`http://localhost/api/videos/${id}/upload/parts`);

beforeEach(async () => {
  cookieMap.clear();
  await login();
});

describe("GET /api/videos/[id]/upload/parts", () => {
  it("passes the uploaded parts through", async () => {
    const parts = [{ PartNumber: 1, Size: 67108864, ETag: '"abc"' }];
    server.use(
      http.get(`${env.API_URL}/videos/:id/upload/parts`, () => HttpResponse.json({ parts })),
    );

    const res = await GET(request(VIDEO_IDS.UPLOADING), params({ id: VIDEO_IDS.UPLOADING }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ parts });
  });

  it("passes 409 UPLOAD_NOT_IN_PROGRESS through", async () => {
    const res = await GET(request(VIDEO_IDS.PROCESSING), params({ id: VIDEO_IDS.PROCESSING }));

    expect(res.status).toBe(409);
  });
});
