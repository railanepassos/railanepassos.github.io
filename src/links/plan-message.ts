import { filled, planByPerson, PLAN_LISTS, readPlanItems, type PlanItem } from "./plan";
import { planShareUrl } from "./plan-share";
import { formatScheduleLabel } from "./schedule";

/**
 * Trip plan as a plain-text message (Phase 4), for sharing on WhatsApp.
 * Pure: no DOM, no network. Names only, no phone numbers (LGPD).
 */

export type PlanMessageInput = {
  label: string;
  city?: string | null;
  address?: string | null;
  itinerary?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  people?: readonly string[] | null;
  plan_items?: unknown;
  plan_share_token?: string | null;
};

const DONE = "✓";
const PENDING = "☐";

function mark(item: PlanItem): string {
  return item.done ? DONE : PENDING;
}

/** True when the place has anything worth sharing beyond its name. */
export function hasPlanToShare(link: Pick<PlanMessageInput, "people" | "plan_items">): boolean {
  return (link.people ?? []).length > 0 || readPlanItems(link.plan_items).length > 0;
}

/**
 * Message text; sections without content are left out. With a share token and an
 * origin, a final "Plano: <url>" line carries the public plan link.
 */
export function buildPlanMessage(link: PlanMessageInput, origin?: string): string {
  const sections: string[][] = [];

  const head = [link.label.trim()];
  if (link.scheduled_start && link.scheduled_end) {
    head.push(formatScheduleLabel(link.scheduled_start, link.scheduled_end));
  }
  const where = [filled(link.city), filled(link.address)].filter((s) => s !== "");
  if (where.length > 0) head.push(where.join(" · "));
  sections.push(head);

  const itinerary = filled(link.itinerary);
  if (itinerary !== "") sections.push(["Roteiro", itinerary]);

  const people = (link.people ?? []).map((p) => p.trim()).filter((p) => p !== "");
  if (people.length > 0) sections.push([`Quem vai: ${people.join(", ")}`]);

  const items = readPlanItems(link.plan_items);

  const groups = planByPerson(items);
  if (groups.length > 0) {
    sections.push([
      "Quem faz o quê",
      ...groups.map((g) => `${g.who}: ${g.items.map((i) => `${mark(i)} ${i.text}`).join(", ")}`),
    ]);
  }

  for (const { key, title } of PLAN_LISTS) {
    const own = items.filter((i) => i.list === key);
    if (own.length === 0) continue;
    sections.push([
      title,
      ...own.map((i) => `${mark(i)} ${i.text}${i.who ? ` (${i.who})` : ""}`),
    ]);
  }

  const token = filled(link.plan_share_token);
  if (token !== "" && origin) sections.push([`Plano: ${planShareUrl(origin, token)}`]);

  return sections.map((s) => s.join("\n")).join("\n\n");
}

/** wa.me link without a phone number: the user picks the chat inside WhatsApp. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
