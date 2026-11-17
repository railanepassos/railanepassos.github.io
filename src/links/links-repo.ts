import type { SupabaseClient } from "@supabase/supabase-js";
import { isHttpsUrl, isOptionalHttpsUrl } from "./validate";
import { MORE_TEXT_FIELDS } from "./more-fields";
import { isCategory } from "./category";
import { isDuration, readDuration } from "./duration";
import { readSources, storedSourcesError, type Source } from "./sources";
import { poseDraftsFromRefs, poseRefsError, readPoseRefs, type PoseRef } from "./poses";
import { MAX_TAGS, MAX_TAG_LENGTH } from "./tags";
import { normalizeRating, reviewColumnsError, type ReviewColumns } from "./review";
import { readPlanItems, storedPlanError, type PlanItem } from "./plan";
import { MAX_PEOPLE, MAX_PERSON_LENGTH } from "./people";
import { parsePlanFragment, PLAN_FRAGMENT_PREFIX } from "./plan-share";

export type LinkStatus = "wishlist" | "done";

export type LinkRow = {
  id: string;
  url: string;
  label: string;
  description: string | null;
  icon_preset: string | null;
  icon_url: string | null;
  category: string | null;
  /** Up to 3 extra categories; the main one stays in `category`. */
  extra_categories?: string[];
  sort_order: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: LinkStatus;
  priority: number;
  want_again: boolean;
  image_url: string | null;
  note: string | null;
  completed_at: string | null;
  cost_text?: string | null;
  /** Duração (migration 020): rapido | meio-periodo | dia-inteiro, or null. */
  duration?: string | null;
  city?: string | null;
  address?: string | null;
  dossier?: string | null;
  itinerary?: string | null;
  source_url?: string | null;
  pose_refs?: PoseRef[] | null;
  /** Fontes (migration 019): up to 10 {title, url}. */
  sources?: Source[];
  tags?: string[] | null;
  people?: string[] | null;
  plan_items?: PlanItem[] | null;
  /** Plan share link (migration 014): null = off. Only ever written by the rpc functions. */
  plan_share_token?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
} & ReviewColumns;

export type CreateLinkInput = {
  url: string;
  label: string;
  description?: string | null;
  icon_preset?: string | null;
  icon_url?: string | null;
  category?: string | null;
  extra_categories?: string[];
  sort_order: number;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status?: LinkStatus;
  priority?: number;
  want_again?: boolean;
  image_url?: string | null;
  note?: string | null;
  completed_at?: string | null;
  cost_text?: string | null;
  /** Duração (migration 020): rapido | meio-periodo | dia-inteiro, or null. */
  duration?: string | null;
  city?: string | null;
  address?: string | null;
  dossier?: string | null;
  itinerary?: string | null;
  source_url?: string | null;
  pose_refs?: PoseRef[] | null;
  /** Fontes (migration 019): up to 10 {title, url}. */
  sources?: Source[];
  tags?: string[] | null;
  people?: string[] | null;
  plan_items?: PlanItem[] | null;
} & ReviewColumns;

export type UpdateLinkPatch = {
  url?: string;
  label?: string;
  description?: string | null;
  icon_preset?: string | null;
  icon_url?: string | null;
  category?: string | null;
  extra_categories?: string[];
  sort_order?: number;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status?: LinkStatus;
  priority?: number;
  want_again?: boolean;
  image_url?: string | null;
  note?: string | null;
  completed_at?: string | null;
  cost_text?: string | null;
  /** Duração (migration 020): rapido | meio-periodo | dia-inteiro, or null. */
  duration?: string | null;
  city?: string | null;
  address?: string | null;
  dossier?: string | null;
  itinerary?: string | null;
  source_url?: string | null;
  pose_refs?: PoseRef[] | null;
  /** Fontes (migration 019): up to 10 {title, url}. */
  sources?: Source[];
  tags?: string[] | null;
  people?: string[] | null;
  plan_items?: PlanItem[] | null;
} & ReviewColumns;

export function normalizeLinkRow(
  row: Partial<LinkRow> & Pick<LinkRow, "id" | "url" | "label">
): LinkRow {
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    description: row.description ?? null,
    icon_preset: row.icon_preset ?? null,
    icon_url: row.icon_url ?? null,
    category: row.category ?? null,
    extra_categories: Array.isArray(row.extra_categories) ? [...row.extra_categories] : [],
    sort_order: row.sort_order ?? 0,
    scheduled_start: row.scheduled_start ?? null,
    scheduled_end: row.scheduled_end ?? null,
    status: row.status === "done" ? "done" : "wishlist",
    priority: typeof row.priority === "number" ? row.priority : 0,
    want_again: Boolean(row.want_again),
    image_url: row.image_url ?? null,
    note: row.note ?? null,
    completed_at: row.completed_at ?? null,
    cost_text: row.cost_text ?? null,
    duration: readDuration(row.duration),
    city: row.city ?? null,
    address: row.address ?? null,
    dossier: row.dossier ?? null,
    itinerary: row.itinerary ?? null,
    source_url: row.source_url ?? null,
    pose_refs: row.pose_refs == null ? null : readPoseRefs(row.pose_refs),
    sources: readSources(row.sources),
    tags: row.tags ?? null,
    people: row.people ?? null,
    plan_items: row.plan_items == null ? null : readPlanItems(row.plan_items),
    plan_share_token: row.plan_share_token ?? null,
    rating: normalizeRating(row.rating),
    impressions: row.impressions ?? null,
    lessons: row.lessons ?? null,
    memory_url: row.memory_url ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const MAX_EXTRA_CATEGORIES = 3;

function validateLinkFields(fields: {
  url?: string;
  label?: string;
  description?: string | null;
  icon_url?: string | null;
  image_url?: string | null;
  note?: string | null;
  cost_text?: string | null;
  /** Duração (migration 020): rapido | meio-periodo | dia-inteiro, or null. */
  duration?: string | null;
  city?: string | null;
  address?: string | null;
  dossier?: string | null;
  itinerary?: string | null;
  source_url?: string | null;
  pose_refs?: PoseRef[] | null;
  /** Fontes (migration 019): up to 10 {title, url}. */
  sources?: Source[];
  category?: string | null;
  extra_categories?: string[] | null;
  tags?: string[] | null;
  people?: string[] | null;
  plan_items?: PlanItem[] | null;
} & ReviewColumns): void {
  if (fields.url !== undefined) {
    if (!isHttpsUrl(fields.url)) {
      throw new Error("url must be a valid https URL");
    }
  }

  if (fields.label !== undefined) {
    const trimmed = fields.label.trim();
    if (trimmed.length < 1) {
      throw new Error("label must not be empty");
    }
    if (trimmed.length > 200) {
      throw new Error("label must not exceed 200 characters");
    }
  }

  if (fields.description != null) {
    if (fields.description.length > 2000) {
      throw new Error("description must not exceed 2000 characters");
    }
  }

  if (fields.icon_url != null) {
    if (!isHttpsUrl(fields.icon_url)) {
      throw new Error("icon_url must be a valid https URL");
    }
  }

  if (fields.image_url != null) {
    if (!isHttpsUrl(fields.image_url)) {
      throw new Error("image_url must be a valid https URL");
    }
  }

  if (fields.note != null) {
    if (fields.note.length > 500) {
      throw new Error("note must not exceed 500 characters");
    }
  }

  for (const field of MORE_TEXT_FIELDS) {
    const value = fields[field.key];
    if (value != null && value.length > field.max) {
      throw new Error(`${field.key} must not exceed ${field.max} characters`);
    }
  }

  if (fields.duration != null && !isDuration(fields.duration)) {
    throw new Error("duration must be rapido, meio-periodo or dia-inteiro");
  }

  if (fields.tags != null) {
    if (fields.tags.length > MAX_TAGS) {
      throw new Error(`tags must not exceed ${MAX_TAGS} items`);
    }
    if (fields.tags.some((t) => t.length > MAX_TAG_LENGTH)) {
      throw new Error(`tags must not exceed ${MAX_TAG_LENGTH} characters each`);
    }
  }

  if (fields.people != null) {
    if (fields.people.length > MAX_PEOPLE) {
      throw new Error(`people must not exceed ${MAX_PEOPLE} items`);
    }
    if (fields.people.some((p) => p.length > MAX_PERSON_LENGTH)) {
      throw new Error(`people must not exceed ${MAX_PERSON_LENGTH} characters each`);
    }
  }

  if (fields.plan_items != null) {
    const problem = storedPlanError(fields.plan_items);
    if (problem) throw new Error(`plan_items invalid: ${problem}`);
  }

  const reviewProblem = reviewColumnsError(fields);
  if (reviewProblem) throw new Error(reviewProblem);

  if (!isOptionalHttpsUrl(fields.source_url)) {
    throw new Error("source_url must be a valid https URL");
  }

  if (fields.pose_refs != null) {
    const problem = poseRefsError(poseDraftsFromRefs(fields.pose_refs));
    if (problem) throw new Error(`pose_refs invalid: ${problem}`);
  }

  if (fields.extra_categories != null) {
    const extras = fields.extra_categories;
    if (extras.length > MAX_EXTRA_CATEGORIES) {
      throw new Error(`extra_categories invalid: use no máximo ${MAX_EXTRA_CATEGORIES} categorias extras.`);
    }
    if (extras.some((c) => !isCategory(c))) {
      throw new Error("extra_categories invalid: categoria desconhecida.");
    }
    if (new Set(extras).size !== extras.length) {
      throw new Error("extra_categories invalid: categorias repetidas.");
    }
    if (fields.category != null && extras.includes(fields.category)) {
      throw new Error("extra_categories invalid: não repita a categoria principal.");
    }
  }

  if (fields.sources != null) {
    const problem = storedSourcesError(fields.sources);
    if (problem) throw new Error(`sources invalid: ${problem}`);
  }
}

function validatePatch(patch: UpdateLinkPatch): UpdateLinkPatch {
  validateLinkFields({
    url: patch.url,
    label: patch.label,
    description: patch.description,
    icon_url: patch.icon_url,
    image_url: patch.image_url,
    note: patch.note,
    cost_text: patch.cost_text,
    duration: patch.duration,
    city: patch.city,
    address: patch.address,
    dossier: patch.dossier,
    itinerary: patch.itinerary,
    source_url: patch.source_url,
    pose_refs: patch.pose_refs,
    sources: patch.sources,
    category: patch.category,
    extra_categories: patch.extra_categories,
    tags: patch.tags,
    people: patch.people,
    plan_items: patch.plan_items,
    rating: patch.rating,
    impressions: patch.impressions,
    lessons: patch.lessons,
    memory_url: patch.memory_url,
  });

  return patch.label !== undefined ? { ...patch, label: patch.label.trim() } : patch;
}

/** An editor write lost the race: the row changed after it was loaded. `fresh` is the current row. */
export class StaleLinkError extends Error {
  constructor(readonly fresh: LinkRow | null) {
    super("link changed since it was loaded");
  }
}

export interface LinksRepo {
  listLinks(): Promise<LinkRow[]>;
  createLink(input: CreateLinkInput): Promise<LinkRow>;
  /** Resolves with the row's new updated_at (null when the server did not say). */
  updateLink(id: string, patch: UpdateLinkPatch): Promise<string | null>;
  deleteLink(id: string): Promise<void>;
  /** One row, fresh from the server (null when it no longer exists). */
  getLink(id: string): Promise<LinkRow | null>;
  /**
   * Optimistic concurrency for editor writes of the plan: updates only while the
   * row still has the `updated_at` the editor loaded. Resolves with the new
   * updated_at, or null when nothing matched (a participant or another editor
   * saved in between). With no expected value the write is unconditional.
   */
  updateLinkIfUnchanged(
    id: string,
    patch: UpdateLinkPatch,
    expectedUpdatedAt: string | null | undefined
  ): Promise<{ updated_at: string | null } | null>;
  /** Turn the plan share link on, or rotate it. Resolves with the new token. */
  enablePlanShare(id: string): Promise<string>;
  /** Turn the plan share link off (the old token stops working). */
  disablePlanShare(id: string): Promise<boolean>;
}

export function createLinksRepo(client: SupabaseClient): LinksRepo {
  return {
    async listLinks(): Promise<LinkRow[]> {
      const result = await (client
        .from("links")
        .select("*")
        .order("sort_order", { ascending: true }) as unknown as Promise<{
        data: Array<Partial<LinkRow> & Pick<LinkRow, "id" | "url" | "label">> | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []).map(normalizeLinkRow);
    },

    async createLink(input: CreateLinkInput): Promise<LinkRow> {
      validateLinkFields({
        url: input.url,
        label: input.label,
        description: input.description,
        icon_url: input.icon_url,
        image_url: input.image_url,
        note: input.note,
        cost_text: input.cost_text,
        duration: input.duration,
        city: input.city,
        address: input.address,
        dossier: input.dossier,
        itinerary: input.itinerary,
        source_url: input.source_url,
        pose_refs: input.pose_refs,
        sources: input.sources,
        category: input.category,
        extra_categories: input.extra_categories,
        tags: input.tags,
        people: input.people,
        plan_items: input.plan_items,
        rating: input.rating,
        impressions: input.impressions,
        lessons: input.lessons,
        memory_url: input.memory_url,
      });

      const trimmedLabel = input.label.trim();

      const result = await (client
        .from("links")
        .insert({ ...input, label: trimmedLabel })
        .select()
        .single() as unknown as Promise<{
        data: (Partial<LinkRow> & Pick<LinkRow, "id" | "url" | "label">) | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
      return normalizeLinkRow(result.data!);
    },

    async updateLink(id: string, patch: UpdateLinkPatch): Promise<string | null> {
      const sanitized = validatePatch(patch);

      const result = await (client
        .from("links")
        .update(sanitized)
        .eq("id", id)
        .select("updated_at") as unknown as Promise<{
        data: Array<{ updated_at?: string | null }> | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
      return result.data?.[0]?.updated_at ?? null;
    },

    async getLink(id: string): Promise<LinkRow | null> {
      const result = await (client
        .from("links")
        .select("*")
        .eq("id", id)
        .maybeSingle() as unknown as Promise<{
        data: (Partial<LinkRow> & Pick<LinkRow, "id" | "url" | "label">) | null;
        error: { message: string } | null;
      }>);
      if (result.error) throw new Error(result.error.message);
      return result.data ? normalizeLinkRow(result.data) : null;
    },

    async updateLinkIfUnchanged(id, patch, expectedUpdatedAt) {
      const sanitized = validatePatch(patch);
      let query = client.from("links").update(sanitized).eq("id", id);
      if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
      const result = await (query.select("updated_at") as unknown as Promise<{
        data: Array<{ updated_at?: string | null }> | null;
        error: { message: string } | null;
      }>);
      if (result.error) throw new Error(result.error.message);
      const row = result.data?.[0];
      return row ? { updated_at: row.updated_at ?? null } : null;
    },

    async deleteLink(id: string): Promise<void> {
      const result = await (client
        .from("links")
        .delete()
        .eq("id", id) as unknown as Promise<{
        data: unknown;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
    },

    async enablePlanShare(id: string): Promise<string> {
      const result = await client.rpc("links_plan_share_enable", { link_id: id });
      if (result.error) throw new Error(result.error.message);
      const token = typeof result.data === "string" ? result.data : "";
      if (parsePlanFragment(PLAN_FRAGMENT_PREFIX + token) === null) {
        throw new Error("invalid plan share token");
      }
      return token;
    },

    async disablePlanShare(id: string): Promise<boolean> {
      const result = await client.rpc("links_plan_share_disable", { link_id: id });
      if (result.error) throw new Error(result.error.message);
      return result.data === true;
    },
  };
}
