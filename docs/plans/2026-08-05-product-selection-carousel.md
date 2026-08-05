# Product Selection Carousel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make product references predictable and easy to select by showing only the primary product gallery in a horizontal carousel, supporting one or multiple product URLs, and sending only the selected products to generation.

**Architecture:** Keep the URL scanner as the source of truth, but stop exposing the raw page-wide image fallback when mirrored product media already exists. The creation flow will track selected product IDs separately from every scanned product, while the review component will present each product as a selectable horizontal card/carousel. Generation will receive only the selected IDs; the first URL remains the primary product and additional URLs are optional product candidates.

**Tech Stack:** Astro, React, TypeScript, Supabase Storage, existing product import and generation APIs.

---

### Task 1: Narrow product media returned by the scraper

**Files:**
- Modify: `src/lib/creattia/catalog-scanner.ts`
- Modify: `src/pages/api/creativos/products.ts`

**Step 1: Exclude recommendation/product-grid containers from generic gallery extraction.**

Use the existing product-photo filters and page selectors, but ignore ancestors whose class or id identifies related, recommended, upsell, cross-sell, similar, collection, or product-card content.

**Step 2: Keep a bounded primary gallery.**

Prefer structured product images and high-confidence gallery selectors; use the broad page fallback only when no product gallery was found, and cap the result at six images.

**Step 3: Stop returning all raw `sourceImageUrls` when mirrored image rows exist.**

Use mirrored `creative_product_images` rows as the visible gallery. Only use a capped source URL fallback for legacy products with no image rows.

**Step 4: Run `npm run check`.**

Expected: 0 errors.

### Task 2: Turn the imported media review into a product carousel

**Files:**
- Modify: `src/components/creattia/ProductAssetReview.tsx`
- Modify: `src/components/creattia/creative-app.css`

**Step 1: Add selection props.**

Accept `selectedProductIds` and `onToggleProduct` so a product can be included or excluded without mutating the imported catalog.

**Step 2: Replace the page-wide grid with a horizontal product carousel.**

Each product remains a clear card with product number, name, URL, selected state, and a horizontal media rail. Show only image media in the rail and keep videos available as small review items without sending them to AI.

**Step 3: Make the primary product explicit.**

Label the first imported product as the primary URL product and show a concise helper that additional selected products come from extra URLs.

**Step 4: Add responsive behavior.**

Use horizontal scrolling for media and product cards, preserve touch gestures, and avoid any full-page overflow or card stretching.

### Task 3: Support selecting one or multiple product URLs

**Files:**
- Modify: `src/components/creattia/CreationFlow.tsx`

**Step 1: Track selected IDs independently.**

Initialize the selection to all successfully scanned URLs so a user who enters three URLs gets all three by default, while still being able to deselect down to one.

**Step 2: Allow adding another product URL in every URL-based flow.**

Keep carousel-page-specific URL behavior intact, but expose an additional “otro producto” URL control for single-image and same-product carousel generation.

**Step 3: Validate selection before generation.**

Require at least one selected product and pass only those IDs as `productIds` to `/api/creativos/generate`.

**Step 4: Keep carousel generation compatible.**

For a full carousel using the same product, use the selected primary product. For distinct products per page, preserve the existing one-URL-per-page mapping.

### Task 4: Verify the end-to-end behavior

**Files:**
- Test: `npm run check`
- Test: `npm run build`
- Inspect: `git diff --check`

**Step 1: Confirm TypeScript/Astro diagnostics.**

Expected: 0 errors.

**Step 2: Confirm production build.**

Expected: successful Astro/Vercel build; existing chunk-size warnings may remain.

**Step 3: Review the diff scope.**

Expected: only product scanner/API, review component, creation flow, and related CSS changes.
