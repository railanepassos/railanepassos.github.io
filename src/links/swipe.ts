/** Width of one revealed action button (px) — edit left or delete right. */
export const ACTIONS_WIDTH_PX = 72;

/** Horizontal travel that starts swipe. */
export const SWIPE_START_PX = 3;
/** Vertical travel that aborts swipe tracking (scroll the list instead). */
export const SCROLL_CANCEL_PX = 28;
/** Max movement that still counts as a tap (opens view). */
export const TAP_MAX_MOVE_PX = 12;

const OPEN_RATIO = 0.22;
const FLICK_VELOCITY = 0.2; // px/ms

/**
 * Snap swipe offset after pointer release.
 * Negative X = content left → delete revealed.
 * Positive X = content right → edit revealed.
 * Returns -actionWidth, 0, or +actionWidth.
 */
export function snapSwipeOffset(
  offsetX: number,
  actionWidth: number,
  velocityX: number
): number {
  const clamped = Math.min(actionWidth, Math.max(-actionWidth, offsetX));
  const openThreshold = actionWidth * OPEN_RATIO;

  if (velocityX <= -FLICK_VELOCITY) {
    return clamped > 0 ? 0 : -actionWidth;
  }
  if (velocityX >= FLICK_VELOCITY) {
    return clamped < 0 ? 0 : actionWidth;
  }
  if (clamped <= -openThreshold) return -actionWidth;
  if (clamped >= openThreshold) return actionWidth;
  return 0;
}

/** Horizontal intent → reveal edit or delete. */
export function shouldStartSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SWIPE_START_PX && Math.abs(dx) > Math.abs(dy);
}

/** Vertical scroll intent while undecided → abort swipe tracking. */
export function shouldAbortForScroll(dx: number, dy: number): boolean {
  return Math.abs(dy) >= SCROLL_CANCEL_PX && Math.abs(dy) > Math.abs(dx);
}

/** Still enough to count as a tap → open view. */
export function isTapGesture(movedPx: number): boolean {
  return movedPx <= TAP_MAX_MOVE_PX;
}
