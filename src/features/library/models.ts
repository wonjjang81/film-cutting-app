/** A reusable cutting specification for one branded film product. */
export type FilmPreset = {
  id: string;
  brand: string;
  productNumber: string;
  rollWidthMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
  gapMm: number;
  sideMarginMm: number;
  startEndMarginMm: number;
  allowRotation: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A physically distinct, rectangular piece of film inventory. */
export type FilmRemnant = {
  id: string;
  brand: string;
  productNumber: string;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  note?: string;
};

export type SavedContinuousRollInput = {
  rollWidthMm: number;
  pieceWidthMm: number;
  pieceLengthMm: number;
  quantity: number;
  gapMm: number;
  sideMarginMm: number;
  startEndMarginMm: number;
  allowRotation: boolean;
  maxLengthMm?: number;
};

export type SavedRemnantSummary = {
  id: string;
  widthMm: number;
  lengthMm: number;
  quantity: number;
};

export type SavedCuttingResultSummary = {
  newRollLengthMm: number;
  producedQuantity: number;
  overproduction: number;
  utilizationPercent: number;
  wastePercent: number;
  optimizationStatus: 'exact' | 'certified' | 'approximate';
};

/** A stable, storage-safe record used by history reloads and exports. */
export type SavedCuttingJob = {
  id: string;
  name: string;
  brand: string;
  productNumber: string;
  filmName?: string;
  materialCostPerM?: number;
  constructionCostPerM2?: number;
  createdAt: string;
  updatedAt: string;
  input: SavedContinuousRollInput;
  remnantIds: string[];
  remnantSummary: SavedRemnantSummary[];
  result: SavedCuttingResultSummary;
  /** Physical cutting completion is tracked separately from inventory confirmation. */
  isCuttingComplete?: boolean;
  cuttingCompletedAt?: string;
  completedPlacementIds?: number[];
};

/** One mixed-size roll layout, persisted as a single production unit. */
export type SavedMergedPlacement = {
  id: number;
  sourceId: string;
  instanceIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
};

export type SavedMergedCuttingJob = {
  id: string;
  name: string;
  mergeGroupId: string;
  groupNames: string[];
  sourceJobIds: string[];
  createdAt: string;
  updatedAt: string;
  rollWidthMm: number;
  usedLengthMm: number;
  producedQuantity: number;
  utilizationPercent: number;
  wastePercent: number;
  placements: SavedMergedPlacement[];
  isCuttingComplete?: boolean;
  cuttingCompletedAt?: string;
  completedPlacementIds?: number[];
};

export type LibraryDocument = {
  version: 1;
  presets: FilmPreset[];
  jobs: SavedCuttingJob[];
  remnants: FilmRemnant[];
  mergedJobs: SavedMergedCuttingJob[];
};

export type LibraryLoadResult = {
  document: LibraryDocument;
  warnings: string[];
};
