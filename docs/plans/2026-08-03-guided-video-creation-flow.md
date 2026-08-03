# Guided Video Creation Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make “Usar esta idea” for winning videos follow the same clear, guided structure as image generation while producing a fully analyzed, editable video plan adapted to the user's product and brand.

**Architecture:** Rebuild `VideoCreationFlow` around the image flow's left reference/right wizard layout and intake patterns. Product URLs continue through the existing product scanner, while manual and saved products share the current video-plan/start APIs. The full winning video remains the source for Gemini analysis; the frontend captures strategy, casting, format, duration and audio decisions, then exposes the generated hook, timeline and script for approval before credits are used.

**Tech Stack:** Astro, React 18, TypeScript, Supabase product/avatar APIs, Gemini full-video analysis, OpenAI planning, Playwright.

---

### Task 1: Match the image creation intake and navigation

**Files:**
- Modify: `src/components/creattia/VideoCreationFlow.tsx`
- Modify: `src/components/creattia/creative-app.css`
- Test: `scripts/test-video-ui.py`

**Steps:**
1. Add URL, saved-product and manual tabs to the first video step.
2. Route URLs through `/api/creativos/products` and keep the imported product ID for planning/generation.
3. Reuse the image flow's progress, card, buttons, helper text and responsive behavior.
4. Add assertions for URL/manual choices and mobile overflow.

### Task 2: Add strategy and casting guidance

**Files:**
- Modify: `src/components/creattia/VideoCreationFlow.tsx`
- Modify: `src/components/creattia/creative-app.css`

**Steps:**
1. Add explicit modes for adapting idea + script, visual idea, script structure or free inspiration.
2. Keep objective, audience, benefit, proof, offer and CTA as short guided decisions with concrete examples.
3. Add original woman/man/custom creator choices plus saved avatar, direct upload and no-person modes.
4. Show avatar quality guidance, previews, identity description and consent next to the selected avatar path.

### Task 3: Add production controls tied to the reference

**Files:**
- Modify: `src/components/creattia/VideoCreationFlow.tsx`
- Modify: `src/components/creattia/creative-app.css`
- Test: `scripts/test-video-pipeline.mjs`

**Steps:**
1. Default duration to the closest supported duration to the winning video.
2. Offer similar, shorter, longer and explicit duration choices with the computed credit cost.
3. Offer original, vertical and horizontal formats, language, spoken dialogue, voice-over, music, sound effects and captions.
4. Send every production choice to both planning and generation requests.

### Task 4: Make analysis and script review transparent

**Files:**
- Modify: `src/components/creattia/VideoCreationFlow.tsx`
- Modify: `src/lib/creattia/video-engines.ts`
- Test: `scripts/test-video-pipeline.mjs`
- Test: `scripts/test-video-ui.py`

**Steps:**
1. Show the full-video analysis: hook, rhythm, camera, speech purpose and reusable scene structure.
2. Present editable hook, message, scenes, exact dialogue, voice-over, captions, audio and CTA.
3. Make the plan prompt explicitly honor music/voice/person choices and reference-relative duration.
4. Keep plan creation free and generation behind explicit approval.

### Task 5: Verify the complete flow

**Files:**
- Test: `scripts/test-video-ui.py`

**Steps:**
1. Run the targeted pipeline tests.
2. Run Astro type checking and production build.
3. Exercise URL and manual intake, casting, production, review and responsive layouts in Playwright without starting a paid generation.
4. Review the final diff and report any remaining provider-level limitations honestly.
