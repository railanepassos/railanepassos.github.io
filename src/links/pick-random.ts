/**
 * Pick one item at random from a list.
 * `random` is injectable for tests (defaults to Math.random).
 */
export function pickRandomItem<T>(
  items: readonly T[],
  random: () => number = Math.random
): T | null {
  if (items.length === 0) return null;
  const index = Math.min(
    items.length - 1,
    Math.floor(random() * items.length)
  );
  return items[index] ?? null;
}

/**
 * Labels for a light “reel” animation ending on the winner.
 * `count` is the total frames (last one = winner).
 */
export function buildSpinLabels(
  poolLabels: readonly string[],
  winnerLabel: string,
  count = 12,
  random: () => number = Math.random
): string[] {
  if (count < 1) return [winnerLabel];
  if (poolLabels.length === 0) return [winnerLabel];

  const reel: string[] = [];
  const filler = Math.max(0, count - 1);
  for (let i = 0; i < filler; i++) {
    const idx = Math.min(
      poolLabels.length - 1,
      Math.floor(random() * poolLabels.length)
    );
    reel.push(poolLabels[idx]!);
  }
  reel.push(winnerLabel);
  return reel;
}
