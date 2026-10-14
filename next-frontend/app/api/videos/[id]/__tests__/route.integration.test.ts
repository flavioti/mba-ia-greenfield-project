import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { VIDEO_IDS, buildReadyVideo } from "@/mocks/factories/videos";

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
let GET: (typeof import("@/app/api/videos/[id]/route"))["GET"];

beforeAll(async () => {
  ({ GET } = await import("@/app/api/videos/[id]/route"));
});

const request = (id: string) => new Request(`http://localhost/api/videos/${id}`);

beforeEach(async () => {
  cookieMap.clear();
  await login();
});

describe("GET /api/videos/[id]", () => {
  it("passes the upstream Video through unchanged", async () => {
    const res = await GET(request(VIDEO_IDS.READY), params({ id: VIDEO_IDS.READY }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(buildReadyVideo());
  });

  it("passes 404 VIDEO_NOT_FOUND through", async () => {
    const res = await GET(request(VIDEO_IDS.NOT_FOUND), params({ id: VIDEO_IDS.NOT_FOUND }));

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("VIDEO_NOT_FOUND");
  });

  it("answers 401 UNAUTHORIZED and destroys the session when the refresh fails", async () => {
    server.use(
      http.get(`${env.API_URL}/videos/:id`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${env.API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    );

    const res = await GET(request(VIDEO_IDS.READY), params({ id: VIDEO_IDS.READY }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
    expect((await getSession()).isLoggedIn).toBeFalsy();
  });
});
