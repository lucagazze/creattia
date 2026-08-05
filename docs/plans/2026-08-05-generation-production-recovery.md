# Generation Production Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make static image generation work against both the current production Supabase schema and the new product-media schema, then verify and deploy the complete fix.

**Architecture:** Keep `media_type` as an optional compatibility feature at the API boundary. Reads try the richer media query first and fall back to the legacy image-only columns when production has not received the migration; writes use the richer column when available and retry without it when necessary. The generation pipeline remains the existing OpenAI/Gemini flow, with the actual provider error persisted for diagnosis.

**Tech Stack:** Astro API routes, React, Supabase JS, Vercel serverless functions, OpenAI Images API, Gemini image API.

---

### Task 1: Make product media reads schema-compatible

**Files:**
- Modify: `src/pages/api/creativos/generate.ts`
- Modify: `src/pages/api/creativos/batch-worker.ts`
- Modify: `src/pages/api/creativos/batch-start.ts`
- Modify: `src/pages/api/creativos/batch-url.ts`
- Modify: `src/pages/api/creativos/carousel-start.ts`

**Steps:**
1. Add narrow fallback handling for missing `media_type` columns.
2. Preserve legacy rows as image media in the fallback result.
3. Keep hard failures for unrelated Supabase errors.
4. Verify with typecheck and a production-shaped REST schema probe.

### Task 2: Make product media writes compatible during migration propagation

**Files:**
- Modify: `src/lib/creattia/product-assets.ts`
- Modify: `src/pages/api/creativos/products.ts`

**Steps:**
1. Retry image/video row writes without `media_type` when the column is unavailable.
2. Keep product primary storage paths usable even if the legacy table cannot store media metadata.
3. Preserve the existing richer behavior once the migration is applied.

### Task 3: Improve generation failure observability and prevent false success states

**Files:**
- Modify: `src/pages/api/creativos/generate.ts`
- Modify: `src/components/creattia/CreativeApp.tsx`

**Steps:**
1. Persist the useful root cause in the failed generation row.
2. Surface the saved failure reason in the active batch UI.
3. Confirm refunds remain idempotent and only cover unused credits.

### Task 4: Verify, publish, and deploy

**Files:**
- No additional source files.

**Steps:**
1. Run `npm run check`, `npm run build`, and `git diff --check`.
2. Run one provider smoke test and one production-shaped generation-path test without exposing credentials.
3. Commit only the generation recovery changes plus the already-local product carousel changes that belong to this release.
4. Push the current branch to GitHub.
5. Deploy the resulting commit to Vercel production and confirm the deployment is `READY`.
