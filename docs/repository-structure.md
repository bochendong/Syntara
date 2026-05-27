# Repository Structure

Syntara is organized around stable route shells and feature-domain implementation.

## Primary Boundaries

- `app`: Next.js route shells only. Route groups such as `app/(qa)` may organize files without changing public URLs.
- `features`: product-domain code. New or touched feature work should enter here first, then old `lib` paths can remain as compatibility facades.
- `components`: shared UI primitives and cross-domain interface pieces.
- `lib`: cross-domain infrastructure, stores, rendering engines, server helpers, and low-level utilities.
- `scripts`: operational scripts grouped by purpose:
  - `scripts/notebooks`: one-off notebook, lecture, and fixture generation scripts.
  - `scripts/maintenance`: local/dev/ops and migration helpers.
  - `scripts/smoke`: provider and integration smoke checks.
  - `scripts/shared`: script-only helper modules.

## QA Surfaces

QA pages live under `app/(qa)` so URLs remain stable while the route tree stays visibly separate from production pages. Large QA clients and helpers should live under the owning feature domain, for example `features/ppt-generation/qa`, `features/problems/qa`, or `features/review/qa`.

The `/test` page reads its test catalog from `features/qa/test-center` instead of defining the registry inline.

## Fixtures And Generated Data

Fixtures that are actively read by QA routes remain in `testfile`. Generated notebooks, queue PDFs, temporary screenshots, and ad hoc outputs should not be added to Git going forward. Shared server paths live in `lib/server/project-paths.ts`; script-only paths live in `scripts/shared/paths.mjs`.

## Structure Audit

Run `pnpm repo:audit` before and after directory cleanup batches. The audit reports source files above the line-count warning/failure thresholds, QA pages outside `app/(qa)`, route-handler counts, and large generated or local-only directories that are still tracked by Git.
