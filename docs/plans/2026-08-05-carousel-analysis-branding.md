# Carousel Analysis, Viewer and URL Branding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make carousel generation use the same analysis and intelligent review flow as static generation, improve URL-derived branding, and provide slide-by-slide navigation when viewing saved carousels.

**Architecture:** Keep one shared reference-analysis contract for static and carousel creatives, with slide-aware analysis data passed into the existing generation prompt. Strengthen the catalog scanner's brand extraction by prioritizing explicit logo metadata, navbar images, and favicons, then use the same resolved brand colors/logo in the generation flow. Extend the existing creative viewer with a carousel index and keyboard/swipe navigation.

**Tech Stack:** Astro, React, TypeScript, Supabase storage, existing OpenAI/Gemini image analysis pipeline, Playwright smoke tests.

---

### Task 1: Trace the existing static analysis and carousel generation paths

**Files:**
- Inspect: `src/components/creattia/CreationFlow.tsx`
- Inspect: `src/components/creattia/CreativeApp.tsx`
- Inspect: `src/lib/creattia/ad-analysis.ts`
- Inspect: `src/pages/api/creativos/analyze.ts`
- Inspect: `src/pages/api/creativos/generate.ts`

**Steps:**
1. Identify the exact request payload used by static reference analysis.
2. Identify where carousel slide images and copy are currently assembled.
3. Identify the existing contextual decision/question contract and preserve its fields.

### Task 2: Make carousel references slide-aware during analysis

**Files:**
- Modify: `src/lib/creattia/ad-analysis.ts`
- Modify: `src/pages/api/creativos/analyze.ts` or the current analysis route found in Task 1
- Test: focused TypeScript/check verification

**Steps:**
1. Add a slide collection to the analysis input/output without breaking static references.
2. Analyze each carousel slide for visible copy, layout role, product placement, logo presence, people, comparisons, and required user decisions.
3. Aggregate the slide analyses into the same review model used by static references.
4. Pass detected carousel copy and contextual questions into the review UI and final generation prompt.

### Task 3: Improve logo and brand-color extraction from URLs

**Files:**
- Modify: `src/lib/creattia/catalog-scanner.ts`
- Modify: `src/lib/creattia/product-assets.ts`
- Modify: `src/pages/api/creativos/products.ts` or the URL scan route

**Steps:**
1. Prefer `og:logo`, JSON-LD brand/logo, header/navbar logo assets, and favicon/app icons in that order.
2. Resolve relative and protocol-relative URLs against the scanned origin.
3. Validate candidate images before storing them, rejecting generic placeholders and unrelated recommendation assets.
4. Extract colors from the URL's page/logo/header assets and preserve them as the URL brand identity.
5. Return the resolved logo and colors in the same product/brand payload consumed by the creation flow.

### Task 4: Add carousel slide navigation to the enlarged creative viewer

**Files:**
- Inspect/modify: `src/components/creattia/CreativeApp.tsx`
- Inspect/modify: `src/components/creattia/WinnersLibrary.tsx`
- Modify: `src/components/creattia/creative-app.css`

**Steps:**
1. Detect carousel assets in the existing creative viewer state.
2. Add previous/next controls, slide count, keyboard arrows, and swipe support.
3. Keep static creatives unchanged and preserve download/save actions.
4. Ensure the active slide resets when a different carousel opens.

### Task 5: Verify the complete flow

**Files:**
- Test: `npm run check`
- Test: `git diff --check`
- Test: Playwright smoke script through `scripts/with_server.py`

**Steps:**
1. Confirm TypeScript/Astro diagnostics have zero errors.
2. Confirm the carousel review UI exposes detected copy and contextual questions.
3. Confirm a carousel opened in the viewer can move forward and backward.
4. Confirm the URL scanner returns navbar/favicon logo candidates and URL colors for a known site.
5. Run a production build if disk space permits; otherwise report the environment blocker explicitly.

## Implementation status

- [x] Carousel pages are sent together to the shared vision analysis and receive slide-aware copy zones, people, comparisons and contextual decisions.
- [x] The reviewed carousel plan is reused by the batch worker, filtered to each output page before generation.
- [x] Enlarged carousel viewing supports previous/next controls, looping, keyboard arrows and touch swipes.
- [x] URL branding prioritizes the home/navbar logo and explicit logo assets, with favicon/app-icon fallback; scraped theme/CSS colors are preserved as the source of truth.
- [x] `npm run check` passes with 0 errors and 0 warnings (63 pre-existing hints). `git diff --check` passes; the production build remains pending because the workspace drive has only about 434 MB free after prior generated artifacts.
