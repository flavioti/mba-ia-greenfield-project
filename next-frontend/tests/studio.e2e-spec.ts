import { expect, test } from "./fixtures"

import type { Page } from "@playwright/test"

// Upstream is faked server-side by mocks/ MSW (instrumentation.ts). Login uses the
// default success branch of the shared auth handlers; the iron-session cookie it
// seals is what the /studio layout guard reads.
async function login(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email address").fill("creator@example.com")
  await page.getByLabel("Password", { exact: true }).fill("secret123")
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Sign in" }).click()
  expect((await loginResponse).status()).toBe(200)
}

test.describe("studio", () => {
  test("anonymous visitors are redirected to /login", async ({ page }) => {
    await page.goto("/studio/videos/new")

    await expect(page).toHaveURL(/\/login$/)
  })

  test("authenticated users get the minimal shell: logo, upload shortcut and avatar, no sidebar/search", async ({
    page,
  }) => {
    await login(page)

    await page.goto("/studio/videos/new")

    const header = page.locator("[data-slot='app-header']")
    await expect(header).toBeVisible()
    await expect(header.getByText("StreamTube")).toBeVisible()
    await expect(header.getByRole("link", { name: "Enviar vídeo" })).toHaveAttribute(
      "href",
      "/studio/videos/new",
    )
    await expect(header.getByRole("img", { name: /creator@example\.com/ })).toBeVisible()
    await expect(page.getByRole("searchbox")).toHaveCount(0)
    await expect(page.locator("aside")).toHaveCount(0)
  })
})
