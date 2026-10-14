import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { BAD_REQUEST_FILE_NAME, VIDEO_IDS } from "@/mocks/factories/videos";

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
let POST: (typeof import("@/app/api/videos/route"))["POST"];

beforeAll(async () => {
  ({ POST } = await import("@/app/api/videos/route"));
});

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = { file_name: "holiday.mp4", mime_type: "video/mp4", size_bytes: 1024 };

beforeEach(async () => {
  cookieMap.clear();
  await login();
});

describe("POST /api/videos", () => {
  it("passes the upstream 201 body through unchanged with the session bearer token", async () => {
    let authorization: string | null = null;
    server.use(
      http.post(`${env.API_URL}/videos`, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json(
          { videoId: VIDEO_IDS.UPLOADING, uploadId: "u", key: "k" },
          { status: 201 },
        );
      }),
    );

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ videoId: VIDEO_IDS.UPLOADING, uploadId: "u", key: "k" });
    expect(authorization).toBe("Bearer active-at");
  });

  it("passes a 400 VALIDATION_ERROR through", async () => {
    const res = await POST(createRequest({ ...validBody, file_name: BAD_REQUEST_FILE_NAME }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION_ERROR");
  });

  it("answers 401 UNAUTHORIZED without calling upstream when there is no session", async () => {
    cookieMap.clear();
    let upstreamCalls = 0;
    server.use(
      http.post(`${env.API_URL}/videos`, () => {
        upstreamCalls++;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
    expect(upstreamCalls).toBe(0);
  });

  it("refreshes transparently on an upstream 401 and retries with the new access token", async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.post(`${env.API_URL}/videos`, ({ request }) => {
        seen.push(request.headers.get("authorization"));
        return seen.length === 1
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ videoId: VIDEO_IDS.UPLOADING, uploadId: "u", key: "k" }, { status: 201 });
      }),
      http.post(`${env.API_URL}/auth/refresh`, () =>
        HttpResponse.json({ access_token: "rotated-at", refresh_token: "rotated-rt" }),
      ),
    );

    const res = await POST(createRequest(validBody));

    expect(res.status).toBe(201);
    expect(seen).toEqual(["Bearer active-at", "Bearer rotated-at"]);
    expect((await getSession()).accessToken).toBe("rotated-at");
  });
});
