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
let DELETE: (typeof import("@/app/api/videos/[id]/upload/route"))["DELETE"];

beforeAll(async () => {
  ({ DELETE } = await import("@/app/api/videos/[id]/upload/route"));
});

const request = (id: string) =>
  new Request(`http://localhost/api/videos/${id}/upload`, { method: "DELETE" });

beforeEach(async () => {
  cookieMap.clear();
  await login();
});

describe("DELETE /api/videos/[id]/upload", () => {
  it("answers 204 with an empty body when the upload is cancelled", async () => {
    const res = await DELETE(request(VIDEO_IDS.UPLOADING), params({ id: VIDEO_IDS.UPLOADING }));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("passes 409 UPLOAD_NOT_IN_PROGRESS through", async () => {
    const res = await DELETE(request(VIDEO_IDS.READY), params({ id: VIDEO_IDS.READY }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("UPLOAD_NOT_IN_PROGRESS");
  });
});
