import type { SupabaseClient } from "@supabase/supabase-js";
import { isHttpsUrl } from "./validate";

export type LinkStatus = "wishlist" | "done";

export type LinkRow = {
  id: string;
  url: string;
  label: string;
  description: string | null;
  icon_preset: string | null;
  icon_url: string | null;
  category: string | null;
  sort_order: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: LinkStatus;
  priority: number;
  want_again: boolean;
  image_url: string | null;
  note: string | null;
  completed_at: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CreateLinkInput = {
  url: string;
  label: string;
  description?: string | null;
  icon_preset?: string | null;
  icon_url?: string | null;
  category?: string | null;
  sort_order: number;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status?: LinkStatus;
  priority?: number;
  want_again?: boolean;
  image_url?: string | null;
  note?: string | null;
  completed_at?: string | null;
};

export type UpdateLinkPatch = {
  url?: string;
  label?: string;
  description?: string | null;
  icon_preset?: string | null;
  icon_url?: string | null;
  category?: string | null;
  sort_order?: number;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  status?: LinkStatus;
  priority?: number;
  want_again?: boolean;
  image_url?: string | null;
  note?: string | null;
  completed_at?: string | null;
};

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
    sort_order: row.sort_order ?? 0,
    scheduled_start: row.scheduled_start ?? null,
    scheduled_end: row.scheduled_end ?? null,
    status: row.status === "done" ? "done" : "wishlist",
    priority: typeof row.priority === "number" ? row.priority : 0,
    want_again: Boolean(row.want_again),
    image_url: row.image_url ?? null,
    note: row.note ?? null,
    completed_at: row.completed_at ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateLinkFields(fields: {
  url?: string;
  label?: string;
  description?: string | null;
  icon_url?: string | null;
  image_url?: string | null;
  note?: string | null;
}): void {
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
}

export interface LinksRepo {
  listLinks(): Promise<LinkRow[]>;
  createLink(input: CreateLinkInput): Promise<LinkRow>;
  updateLink(id: string, patch: UpdateLinkPatch): Promise<void>;
  deleteLink(id: string): Promise<void>;
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

    async updateLink(id: string, patch: UpdateLinkPatch): Promise<void> {
      validateLinkFields({
        url: patch.url,
        label: patch.label,
        description: patch.description,
        icon_url: patch.icon_url,
        image_url: patch.image_url,
        note: patch.note,
      });

      const sanitized =
        patch.label !== undefined
          ? { ...patch, label: patch.label.trim() }
          : patch;

      const result = await (client
        .from("links")
        .update(sanitized)
        .eq("id", id) as unknown as Promise<{
        data: unknown;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
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
  };
}
