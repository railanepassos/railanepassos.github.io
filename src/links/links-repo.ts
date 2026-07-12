import type { SupabaseClient } from "@supabase/supabase-js";
import { isHttpsUrl } from "./validate";

export type LinkRow = {
  id: string;
  url: string;
  label: string;
  description: string | null;
  icon_preset: string | null;
  icon_url: string | null;
  category: string | null;
  sort_order: number;
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
};

export type UpdateLinkPatch = {
  url?: string;
  label?: string;
  description?: string | null;
  icon_preset?: string | null;
  icon_url?: string | null;
  category?: string | null;
  sort_order?: number;
};

function validateLinkFields(fields: {
  url?: string;
  label?: string;
  description?: string | null;
  icon_url?: string | null;
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
    if (fields.description.length > 500) {
      throw new Error("description must not exceed 500 characters");
    }
  }

  if (fields.icon_url != null) {
    if (!isHttpsUrl(fields.icon_url)) {
      throw new Error("icon_url must be a valid https URL");
    }
  }
}

export interface LinksRepo {
  listLinks(): Promise<LinkRow[]>;
  createLink(input: CreateLinkInput): Promise<LinkRow>;
  updateLink(id: string, patch: UpdateLinkPatch): Promise<void>;
  deleteLink(id: string): Promise<void>;
  saveOrder(items: Array<{ id: string; sort_order: number }>): Promise<void>;
}

export function createLinksRepo(client: SupabaseClient): LinksRepo {
  return {
    async listLinks(): Promise<LinkRow[]> {
      const result = await (client
        .from("links")
        .select("*")
        .order("sort_order", { ascending: true }) as unknown as Promise<{
        data: LinkRow[] | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
      return result.data ?? [];
    },

    async createLink(input: CreateLinkInput): Promise<LinkRow> {
      validateLinkFields({
        url: input.url,
        label: input.label,
        description: input.description,
        icon_url: input.icon_url,
      });

      const trimmedLabel = input.label.trim();

      const result = await (client
        .from("links")
        .insert({ ...input, label: trimmedLabel })
        .select()
        .single() as unknown as Promise<{
        data: LinkRow | null;
        error: { message: string } | null;
      }>);

      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },

    async updateLink(id: string, patch: UpdateLinkPatch): Promise<void> {
      validateLinkFields({
        url: patch.url,
        label: patch.label,
        description: patch.description,
        icon_url: patch.icon_url,
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

    async saveOrder(items: Array<{ id: string; sort_order: number }>): Promise<void> {
      if (items.length === 0) return;

      // Phase 1: set temporary negative values to avoid UNIQUE constraint collisions
      for (let i = 0; i < items.length; i++) {
        const tempOrder = -(i + 1);
        const result = await (client
          .from("links")
          .update({ sort_order: tempOrder })
          .eq("id", items[i].id) as unknown as Promise<{
          data: unknown;
          error: { message: string } | null;
        }>);
        if (result.error) throw new Error(result.error.message);
      }

      // Phase 2: set final sort_order values
      for (const item of items) {
        const result = await (client
          .from("links")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id) as unknown as Promise<{
          data: unknown;
          error: { message: string } | null;
        }>);
        if (result.error) throw new Error(result.error.message);
      }
    },
  };
}
