/** Applies the group-level pattern direction setting to each piece form. */
export function applyPatternFixed<T extends { form: { allowRotation: boolean } }>(pieces: readonly T[], patternFixed: boolean): T[] {
  return pieces.map((piece) => ({
    ...piece,
    form: { ...piece.form, allowRotation: !patternFixed },
  }));
}
