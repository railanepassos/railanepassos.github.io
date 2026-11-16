import { httpsUrlError, isHttpsUrl } from "./validate";

/** Photo-pose reference stored in links.pose_refs (jsonb array). */
export type PoseRef = { url?: string; note?: string };

/** Editable form row for one pose. */
export type PoseDraft = { url: string; note: string };

export const MAX_POSES = 30;
export const POSE_NOTE_MAX = 500;
export const POSE_URL_TERM = "Link da pose";

/** First problem found in the drafts (PT-BR, names the pose), or null. */
export function poseRefsError(drafts: readonly PoseDraft[]): string | null {
  if (drafts.length > MAX_POSES) {
    return `Use no máximo ${MAX_POSES} poses.`;
  }
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const urlError = httpsUrlError(draft.url, POSE_URL_TERM);
    if (urlError) return `Pose ${i + 1}: ${urlError}`;
    if (draft.note.trim().length > POSE_NOTE_MAX) {
      return `Pose ${i + 1}: a nota deve ter no máximo ${POSE_NOTE_MAX} caracteres.`;
    }
  }
  return null;
}

/** Drafts -> payload. Blank poses are dropped; nothing left -> null. */
export function draftsToPoseRefs(drafts: readonly PoseDraft[]): PoseRef[] | null {
  const out: PoseRef[] = [];
  for (const draft of drafts) {
    const url = draft.url.trim();
    const note = draft.note.trim();
    if (!url && !note) continue;
    const ref: PoseRef = {};
    if (url) ref.url = url;
    if (note) ref.note = note;
    out.push(ref);
  }
  return out.length > 0 ? out : null;
}

/** Defensive read of the stored jsonb: only https urls and string notes survive. */
export function readPoseRefs(raw: unknown): PoseRef[] {
  if (!Array.isArray(raw)) return [];
  const out: PoseRef[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { url, note } = item as Record<string, unknown>;
    const ref: PoseRef = {};
    if (typeof url === "string" && isHttpsUrl(url)) ref.url = url;
    if (typeof note === "string" && note.trim() !== "") ref.note = note;
    if (ref.url || ref.note) out.push(ref);
  }
  return out;
}

export function poseDraftsFromRefs(refs: readonly PoseRef[]): PoseDraft[] {
  return refs.map((r) => ({ url: r.url ?? "", note: r.note ?? "" }));
}

/** Returns a copy with the item at `from` moved to `to` (no-op when out of range). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}
