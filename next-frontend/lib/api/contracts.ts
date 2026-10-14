/**
 * BFF ↔ Components contracts barrel.
 *
 * This file is the **only** module in the project authorized to import `paths`
 * from `./types.gen`. Every Route Handler and every Component consumes BFF
 * shapes via named aliases exported from here — never by indexing `paths`
 * directly elsewhere.
 *
 * Two alias forms by convention:
 *
 * 1. **Pass-through alias** — BFF returns the upstream NestJS shape as-is.
 *    The alias indexes `paths` for the route's success-content type:
 *
 *      export type Video =
 *        paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];
 *
 * 2. **Reshape alias** — BFF projects a subset or composed shape. The alias
 *    name is named-only (does NOT index `paths`), making reshapes greppable
 *    against the wire shape:
 *
 *      export type VideoCard = Pick<Video, "id" | "title" | "thumbnailUrl">;
 *
 * Feature SIs append aliases here as endpoints are wired through the BFF.
 * The barrel starts empty by design.
 */
import type { paths } from "./types.gen";

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Request bodies (fields are empty in the current openapi.json — will expand as the upstream spec grows)
export type RegisterDto =
  paths["/auth/register"]["post"]["requestBody"]["content"]["application/json"];

export type LoginDto =
  paths["/auth/login"]["post"]["requestBody"]["content"]["application/json"];

export type ForgotPasswordDto =
  paths["/auth/forgot-password"]["post"]["requestBody"]["content"]["application/json"];

export type RefreshTokenDto =
  paths["/auth/refresh"]["post"]["requestBody"]["content"]["application/json"];

// Upstream success response bodies
export type RegisterResponse =
  paths["/auth/register"]["post"]["responses"][201]["content"]["application/json"];

// LoginTokenPair: upstream 200 body — BFF reads it to seal into the iron-session cookie;
// tokens never cross to the browser (per phase-02-auth-frontend/TD-02).
export type LoginTokenPair =
  paths["/auth/login"]["post"]["responses"][200]["content"]["application/json"];

export type RefreshTokenPair =
  paths["/auth/refresh"]["post"]["responses"][200]["content"]["application/json"];

// Shared error envelope (all auth 4xx responses)
export type ApiErrorEnvelope =
  paths["/auth/register"]["post"]["responses"][400]["content"]["application/json"];

// ─── Videos (upload & processing — Phase 03) ──────────────────────────────────

// Request bodies
export type CreateVideoUploadDto =
  paths["/videos"]["post"]["requestBody"]["content"]["application/json"];

export type CompleteVideoUploadDto =
  paths["/videos/{id}/upload/complete"]["post"]["requestBody"]["content"]["application/json"];

// Pass-through success bodies
export type CreateVideoUploadResponse =
  paths["/videos"]["post"]["responses"][201]["content"]["application/json"];

export type Video =
  paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];

export type VideoProcessingStatus = Video["processing_status"];

export type UploadPartsResponse =
  paths["/videos/{id}/upload/parts"]["get"]["responses"][200]["content"]["application/json"];

export type UploadedPart = UploadPartsResponse["parts"][number];

export type UploadPartUrlResponse =
  paths["/videos/{id}/upload/parts/{partNumber}/url"]["get"]["responses"][200]["content"]["application/json"];
