/** Maximum usable length of one physical new film roll. */
export const MAX_NEW_ROLL_LENGTH_MM = 25_000;

export function boundedNewRollLength(requested?: number): number {
  return Math.min(requested ?? MAX_NEW_ROLL_LENGTH_MM, MAX_NEW_ROLL_LENGTH_MM);
}
