export function applyReorder<T extends { id: string; sort_order: number }>(
  items: T[],
  movedId: string,
  targetIndex: number
): T[] {
  // Create a copy and sort by sort_order ascending
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  // Find and remove the item to move
  const itemIndex = sorted.findIndex((item) => item.id === movedId);
  if (itemIndex === -1) {
    // Item not found: return sorted and reindexed copy unchanged
    return sorted.map((item, idx) => ({
      ...item,
      sort_order: idx,
    }));
  }

  const [movedItem] = sorted.splice(itemIndex, 1);

  // Clamp targetIndex to valid range [0, length-1]
  const clampedIndex = Math.max(0, Math.min(targetIndex, sorted.length));

  // Insert at clamped position
  sorted.splice(clampedIndex, 0, movedItem);

  // Reindex all sort_order values to array positions
  return sorted.map((item, idx) => ({
    ...item,
    sort_order: idx,
  }));
}
