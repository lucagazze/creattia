# Production Video Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Creattia's winner-video workflow generate polished, brand-specific videos—including rewritten spoken dialogue—while supporting 4–30 second outputs and persisting every asynchronous job safely.

**Architecture:** Creattia analyzes the complete winner video with Gemini, creates an editable production plan, divides the output into natural segments of at most 10 seconds, and sends each segment plus product/avatar references to Gemini Omni Flash. The status route tracks all segment jobs, joins completed clips into one MP4, stores the final asset in Supabase, and refunds credits exactly once if any segment fails.

**Tech Stack:** Astro API routes, React, TypeScript, Google Gen AI SDK, OpenAI structured planning, Supabase Postgres/Storage, FFmpeg.

### Task 1: Add deterministic pipeline primitives

**Files:**
- Create: `src/lib/creattia/video-pipeline.ts`
- Create: `scripts/test-video-pipeline.mjs`

1. Define supported output durations, segment boundaries, dynamic credit cost, dialogue-line types, and segment-level plan selection.
2. Add tests for 4, 10, 20, and 30 second segmentation, credit calculation, and dialogue assignment.
3. Run the tests and confirm every boundary is deterministic.

### Task 2: Analyze the real reference video and generate brand-safe dialogue

**Files:**
- Modify: `src/lib/creattia/video-engines.ts`
- Modify: `src/pages/api/creativos/video-plan.ts`

1. Upload the complete reference video to Gemini Files and wait until it is active.
2. Analyze scene timing, pacing, shots, audio, speaking roles, dialogue purpose, and CTA without copying identity or exact wording.
3. Extend the production-plan schema with editable dialogue lines, speaker/delivery metadata, and a speech mode.
4. Require dialogue to name the selected brand/product naturally and prohibit invented prices, claims, guarantees, or testimonials.

### Task 3: Generate and assemble multi-segment videos

**Files:**
- Create: `src/lib/creattia/video-media.ts`
- Modify: `src/lib/creattia/video-engines.ts`
- Modify: `src/pages/api/creativos/video-start.ts`
- Modify: `src/pages/api/creativos/video-status.ts`
- Modify: `package.json`

1. Add a deployable FFmpeg binary and safe temporary-file helpers.
2. Split the reference at segment boundaries and provide the actual matching video segment to Gemini Omni Flash.
3. Start one asynchronous Gemini job per output segment and persist all provider IDs and durations.
4. Poll all jobs, calculate aggregate progress, concatenate successful clips, and upload one final MP4.
5. Reserve/refund credits dynamically according to segment count and make terminal state handling idempotent.

### Task 4: Make dialogue and duration explicit in the UI

**Files:**
- Modify: `src/components/creattia/VideoCreationFlow.tsx`

1. Offer 4, 8, 10, 20, and 30 second output choices with their credit costs.
2. Ask whether to adapt the reference dialogue, create a new script, or make a video without dialogue.
3. Ask for mandatory talking points and expose each generated line for review before spending credits.
4. Correct provider wording so the UI describes direct Gemini generation accurately.

### Task 5: Apply and verify persistence

**Files:**
- Modify: `supabase/migrations/20260803010000_runway_video_defaults.sql`
- Verify: `supabase/migrations/20260803000000_add_video_generations.sql`
- Verify: `supabase/migrations/20260803020000_add_creative_avatars.sql`

1. Align provider/model defaults with direct Gemini Omni Flash.
2. Apply the video-generation, storage-bucket, and avatar migrations to the linked Supabase project.
3. Verify tables, indexes, RLS policies, functions, and storage buckets through read-only queries.

### Task 6: End-to-end verification

**Files:**
- Modify if needed: `scripts/verify-creattia-production.mjs`

1. Run pipeline unit tests, `npm run check`, and `npm run build`.
2. Test video-plan generation against a real winner reference.
3. Generate one short real video to minimize provider spend, poll it to completion, verify the MP4 with FFmpeg, and confirm the database row and storage object.
4. Test one expected failure and confirm credits are refunded only once.
5. Remove temporary test users/assets and report any provider-level limitation honestly.
