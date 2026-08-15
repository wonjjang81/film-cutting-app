# Continuous Roll and Remnants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minimize new continuous-roll length by using eligible saved film remnants first, then provide reusable presets, recent jobs, and CSV/PDF work instructions.

**Architecture:** Keep optimization as deterministic pure modules and persistence/export behind small interfaces. The screen composes these modules but does not contain packing, inventory mutation, serialization, or document-generation rules.

**Tech Stack:** TypeScript 5.9, React 19, React Native 0.81, Expo 54, Expo Router 6, AsyncStorage, react-native-svg, expo-print, expo-sharing, Vitest 2.

## Global Constraints

- Optimization priority is new-roll length, overproduction, waste, rotations, then row-pattern count.
- Roll width is fixed and roll length is continuous.
- Finite remnants pass their exact length as `maxLengthMm`; new-roll optimization has no maximum length.
- Quantity must be an integer from 1 through 100,000.
- Remnants are saved as exact rectangular width and length with required brand and product number.
- Remnant inventory changes only after explicit job confirmation.
- Persistent history contains at most 20 jobs and no credentials or personal information.
- All dimensions use millimetres internally.

---

## File Structure

- `src/features/cutting/optimizeContinuousRollLayout.ts`: row-pattern generation, dynamic programming, and coordinate output.
- `src/features/cutting/optimizeContinuousRollLayout.test.ts`: continuous-roll behavior and geometry tests.
- `src/features/remnants/planWithRemnants.ts`: eligible-remnant selection, savings ordering, and new-roll fallback.
- `src/features/remnants/planWithRemnants.test.ts`: remnant selection and inventory-delta tests.
- `src/features/library/models.ts`: versioned preset, job-history, and remnant data types.
- `src/features/library/libraryRepository.ts`: small persistence interface and validated document operations.
- `src/features/library/asyncStorageLibraryAdapter.ts`: AsyncStorage adapter.
- `src/features/library/libraryRepository.test.ts`: save/load/migration/corruption tests using an in-memory adapter.
- `src/features/export/createCsv.ts`: deterministic UTF-8 CSV generation.
- `src/features/export/createWorkOrderHtml.ts`: printable HTML with escaped user data and SVG diagram.
- `src/features/export/exporters.test.ts`: CSV schema, escaping, and work-order tests.
- `src/features/cutting/FilmLayoutPreview.tsx`: continuous-roll and remnant drawing.
- `app/(tabs)/input.tsx`: responsive orchestration, preset/history/remnant panels, confirmation and export actions.
- `docs/IMPLEMENTATION_PROGRESS.md`: delivered behavior and verification evidence.

---

### Task 1: Continuous-Roll Optimizer

**Files:**
- Create: `src/features/cutting/optimizeContinuousRollLayout.ts`
- Create: `src/features/cutting/optimizeContinuousRollLayout.test.ts`
- Modify: `src/features/cutting/FilmLayoutPreview.tsx`

**Interfaces:**
- Consumes: `ContinuousRollInput` from the approved design.
- Produces: `optimizeContinuousRollLayout(input): ContinuousRollResult` with placements, used length, overproduction, utilization, orientation counts, row usage, and estimated cut lines.

- [ ] **Step 1: Write a failing minimum-length test**

```ts
it('uses no more than 80mm for three 60x40 pieces on a 100mm roll', () => {
  const result = optimizeContinuousRollLayout({
    rollWidthMm: 100, pieceWidthMm: 60, pieceLengthMm: 40,
    quantity: 3, gapMm: 0, sideMarginMm: 0,
    startEndMarginMm: 0, allowRotation: true,
  });
  expect(result.usedLengthMm).toBeLessThanOrEqual(80);
  expect(result.producedQuantity).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run src/features/cutting/optimizeContinuousRollLayout.test.ts`

Expected: FAIL because `optimizeContinuousRollLayout` does not exist.

- [ ] **Step 3: Implement row patterns and dynamic programming**

Generate every `(normalCount, rotatedCount)` row that fits the usable width, plus vertical-partition blocks that combine stacked normal pieces beside stacked rotated pieces. Record each candidate's occupied height, capacity, rotations, and cut complexity. Build states `0..quantity + maxPatternCapacity`, where each state stores the best predecessor under the global priority tuple. Reject candidates or sequences beyond optional `maxLengthMm`.

```ts
export function optimizeContinuousRollLayout(input: ContinuousRollInput): ContinuousRollResult {
  const patterns = generateRowPatterns(validate(input));
  const best = findMinimumLengthPatternSequence(patterns, input.quantity);
  return materializePlacements(best, input);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm exec vitest run src/features/cutting/optimizeContinuousRollLayout.test.ts`

Expected: PASS.

- [ ] **Step 5: Add one failing test at a time for geometry and tie-breaking**

Cover side/start/end margins, gaps, rotation disabled, exact quantity, minimum overproduction on equal length, deterministic output, non-overlap, bounds, finite `maxLengthMm`, vertical-partition geometry, and quantity 100,001 rejection. Run each test before implementing the corresponding behavior and confirm the expected failure.

- [ ] **Step 6: Extend the preview to continuous-roll coordinates**

Render a fixed-width, variable-length SVG. Add row separators and labels while preserving placement colors. The preview consumes only `ContinuousRollResult` and dimensions.

- [ ] **Step 7: Run optimizer tests and TypeScript**

Run: `pnpm exec vitest run src/features/cutting/optimizeContinuousRollLayout.test.ts && pnpm check`

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/features/cutting/optimizeContinuousRollLayout.ts src/features/cutting/optimizeContinuousRollLayout.test.ts src/features/cutting/FilmLayoutPreview.tsx
git commit -m "feat: optimize continuous roll layouts"
```

---

### Task 2: Remnant-Aware Planning

**Files:**
- Create: `src/features/remnants/planWithRemnants.ts`
- Create: `src/features/remnants/planWithRemnants.test.ts`

**Interfaces:**
- Consumes: `ContinuousRollInput`, `FilmRemnant[]`, `brand`, and `productNumber`.
- Produces: `planWithRemnants(input): RemnantPlan`, containing tentative remnant uses, residual rectangles, new-roll result, and an inventory delta that is not applied automatically.

```ts
type RemnantPlanRequest = ContinuousRollInput & {
  brand: string;
  productNumber: string;
  remnants: FilmRemnant[];
};
type RemnantUse = {
  remnantId: string;
  placements: Placement[];
  producedQuantity: number;
  savedNewRollLengthMm: number;
};
type RemnantPlan = {
  remnantUses: RemnantUse[];
  newRollQuantity: number;
  newRollResult: ContinuousRollResult | null;
  inventoryDelta: InventoryDelta;
};
```

- [ ] **Step 1: Write a failing eligibility test**

```ts
it('uses a narrower remnant when the requested piece fits', () => {
  const plan = planWithRemnants(baseRequest, [{
    id: 'r1', brand: 'A', productNumber: 'P1', widthMm: 80,
    lengthMm: 100, quantity: 1, createdAt: now, updatedAt: now,
  }]);
  expect(plan.remnantUses[0]?.remnantId).toBe('r1');
  expect(plan.newRollQuantity).toBeLessThan(baseRequest.quantity);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run src/features/remnants/planWithRemnants.test.ts`

Expected: FAIL because the remnant planner does not exist.

- [ ] **Step 3: Implement eligibility and savings ordering**

Filter exact brand/product-number matches. Optimize each rectangle independently with `rollWidthMm = remnant.widthMm` and `maxLengthMm = remnant.lengthMm`, discard zero-capacity candidates, then sort by avoided new-roll length descending and remnant area ascending.

- [ ] **Step 4: Run the test and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 5: Add failing tests for multiple remnants and fallback**

Test that multiple eligible remnants contribute, unusable remnants remain untouched, and only the remaining quantity is sent to `optimizeContinuousRollLayout`.

- [ ] **Step 6: Add failing tests for residual rectangle geometry**

Assert that right/bottom residuals are positive rectangles, stay within the original remnant, do not overlap, keep brand/product number, and are omitted when no requested piece can fit.

- [ ] **Step 7: Implement tentative inventory delta**

```ts
type InventoryDelta = {
  removeIds: string[];
  add: FilmRemnant[];
  basedOnUpdatedAt: Record<string, string>;
};
```

Return the delta without mutating the input. Use `basedOnUpdatedAt` to detect stale inventory during confirmation.

- [ ] **Step 8: Run remnant and optimizer suites**

Run: `pnpm exec vitest run src/features/remnants src/features/cutting`

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/remnants
git commit -m "feat: plan cuts with reusable remnants"
```

---

### Task 3: Versioned Local Library

**Files:**
- Create: `src/features/library/models.ts`
- Create: `src/features/library/libraryRepository.ts`
- Create: `src/features/library/asyncStorageLibraryAdapter.ts`
- Create: `src/features/library/libraryRepository.test.ts`

**Interfaces:**
- Consumes: a two-method key-value adapter: `get(key): Promise<string | null>` and `set(key, value): Promise<void>`.
- Produces: `createLibraryRepository(adapter)` with `load`, `savePreset`, `deletePreset`, `saveJob`, `renameJob`, `deleteJob`, `saveRemnant`, `deleteRemnant`, and `applyInventoryDelta`.

```ts
type LibraryDocument = {
  version: 1;
  presets: FilmPreset[];
  jobs: SavedCuttingJob[];
  remnants: FilmRemnant[];
};
type LibraryLoadResult = { document: LibraryDocument; warnings: string[] };
type KeyValueAdapter = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};
```

- [ ] **Step 1: Write a failing round-trip test with an in-memory adapter**

```ts
it('saves and reloads a branded remnant at its exact size', async () => {
  const repository = createLibraryRepository(memoryAdapter());
  await repository.saveRemnant(remnant({ brand: 'A', productNumber: 'P1', widthMm: 83, lengthMm: 217 }));
  expect((await repository.load()).remnants[0]).toMatchObject({ widthMm: 83, lengthMm: 217 });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run src/features/library/libraryRepository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement version-1 document validation and immutable writes**

Use one storage key, `film-cutting-library-v1`, with `{ version: 1, presets, jobs, remnants }`. Validate strings, finite positive dimensions, timestamps, and arrays during load. Ignore invalid records and return a `warnings` array.

- [ ] **Step 4: Run the test and verify GREEN**

Run the focused test. Expected: PASS.

- [ ] **Step 5: Add failing tests for history limit and stale inventory**

Verify the 21st job drops the oldest, corrupted records yield warnings, duplicate IDs replace records, and `applyInventoryDelta` rejects mismatched `updatedAt` values without writing.

- [ ] **Step 6: Implement remaining repository methods and AsyncStorage adapter**

The AsyncStorage adapter contains no validation; it only satisfies the key-value seam. All behavior remains in `libraryRepository.ts`.

- [ ] **Step 7: Run library tests and TypeScript**

Run: `pnpm exec vitest run src/features/library && pnpm check`

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/features/library
git commit -m "feat: persist presets jobs and remnants"
```

---

### Task 4: CSV and PDF Work-Order Content

**Files:**
- Create: `src/features/export/createCsv.ts`
- Create: `src/features/export/createWorkOrderHtml.ts`
- Create: `src/features/export/exporters.test.ts`

**Interfaces:**
- Consumes: the confirmed job record and layout SVG markup.
- Produces: `createCsv(job): string` and `createWorkOrderHtml(job, svg): string`.

```ts
export function createCsv(job: SavedCuttingJob): string;
export function createWorkOrderHtml(job: SavedCuttingJob, layoutSvg: string): string;
```

- [ ] **Step 1: Write failing CSV schema and escaping tests**

Assert UTF-8 BOM, fixed Korean headers, CRLF rows, quotes around commas/quotes/newlines, brand/product number, remnant IDs, new-roll length, production quantity, overproduction, utilization, and waste.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run src/features/export/exporters.test.ts`

Expected: FAIL because exporters do not exist.

- [ ] **Step 3: Implement minimal deterministic CSV generation**

Use an `escapeCsv` function that doubles quotes and wraps fields containing comma, quote, CR, or LF.

- [ ] **Step 4: Run CSV tests and verify GREEN**

Run the focused test. Expected: CSV tests PASS.

- [ ] **Step 5: Write failing HTML safety and content tests**

Use a brand containing `<script>` and assert it appears only as escaped text. Assert title, timestamp, dimensions, remnant usage, new-roll length, result summary, legend, and supplied SVG are present.

- [ ] **Step 6: Implement printable work-order HTML**

Escape every user-controlled string. Keep print CSS and HTML generation deterministic so tests compare stable fragments.

- [ ] **Step 7: Run exporter tests and commit**

```bash
pnpm exec vitest run src/features/export
git add src/features/export
git commit -m "feat: export cutting work orders"
```

---

### Task 5: Screen Integration and Confirmation Flow

**Files:**
- Modify: `app/(tabs)/input.tsx`
- Modify: `src/features/cutting/FilmLayoutPreview.tsx`
- Create: `src/features/library/LibraryDrawer.tsx`
- Create: `src/features/remnants/RemnantInventoryPanel.tsx`

**Interfaces:**
- Consumes: optimizer, remnant planner, repository, CSV string, printable HTML.
- Produces: user flows for presets, history, remnants, calculation, explicit inventory confirmation, and exports.

- [ ] **Step 1: Split the current oversized screen by responsibility**

Keep form/result orchestration in `input.tsx`. Move inventory CRUD to `RemnantInventoryPanel` and preset/history navigation to `LibraryDrawer`. Do not move packing or persistence rules into UI files.

- [ ] **Step 2: Add brand/product-number and continuous-roll inputs**

Replace fixed roll length with side and start/end margins. Display `원단 절약 우선` as the fixed optimization mode. Require brand and product number before remnant lookup or save.

- [ ] **Step 3: Add remnant candidate and tentative-use UI**

Show exact dimensions, possible output count, and estimated saved length. Keep a visible `재고 미반영` state after calculation.

- [ ] **Step 4: Implement explicit job confirmation**

On `작업 확정`, reload inventory, apply the timestamp-guarded delta, save the confirmed job, and show new residual remnants. On stale inventory, abort and recalculate without partial writes.

- [ ] **Step 5: Add preset/history flows**

Implement save, load, rename, and delete with accessible labels. Loading history restores inputs and recalculates using current inventory.

- [ ] **Step 6: Add CSV/PDF actions**

Web creates a Blob download for CSV and printable HTML/PDF. Native uses `expo-print` then `expo-sharing`. Disable exports until a result exists; export failures do not mutate the job or inventory.

- [ ] **Step 7: Verify accessibility and responsive states**

Check 360px, 768px, and 1280px widths. Ensure 44px controls, visible focus, labels, selected/disabled states, error announcements, and non-color direction labels.

- [ ] **Step 8: Run the full verification suite**

Run:

```bash
pnpm check
pnpm test
pnpm build:web
```

Expected: TypeScript exits 0, all tests PASS, and Expo exports all static routes to `dist`.

- [ ] **Step 9: Commit**

```bash
git add app/(tabs)/input.tsx src/features/cutting/FilmLayoutPreview.tsx src/features/library/LibraryDrawer.tsx src/features/remnants/RemnantInventoryPanel.tsx
git commit -m "feat: add continuous roll production workflow"
```

---

### Task 6: Documentation and Final Evidence

**Files:**
- Modify: `docs/IMPLEMENTATION_PROGRESS.md`

**Interfaces:**
- Consumes: final command output and delivered behavior.
- Produces: an accurate handoff record with no unverified claims.

- [ ] **Step 1: Record delivered behavior and limitations**

Document the optimization priority, rectangular-remnant rule, explicit confirmation, local-only persistence, 100,000 quantity limit, and unsupported multi-product nesting.

- [ ] **Step 2: Run final verification from a clean command sequence**

```bash
pnpm check
pnpm test
pnpm build:web
git diff --check
```

Expected: all commands exit 0 with no test failures or whitespace errors.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/IMPLEMENTATION_PROGRESS.md
git commit -m "docs: record roll and remnant improvements"
```
