# Plan: service/SaaS creative identities and semantic brand palette

## Goal

Allow the generation flow to create strong static creatives for services and SaaS products that do not have a physical product, while making URL branding concrete and reviewable: extracted logo, semantic colors, typography, and optional person/avatar references.

## Tasks

- [ ] Add a service/SaaS subject mode that reuses URL brand data without treating unrelated page images as product assets.
- [ ] Extend brand extraction with semantic background, text, accent, and secondary colors and expose them in review.
- [ ] Add saved-avatar and multi-image avatar reference selection for the review step, with an explicit no-person option.
- [ ] Pass the selected identity, palette, and service context through plan and generation workers without breaking physical-product flows.
- [ ] Run type checks and diff validation; report any production-build limitation separately.

## Verification

- `npm run check`
- `git diff --check`
