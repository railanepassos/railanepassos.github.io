---
name: bucket-list
description: Draft Bucket List items for the editor to review in the app (/p/a8f3k2/). Use for "importar do Instagram", "importar este post", "adicionar à lista de links/bucket list", "criar item a partir deste link", "gerar dossiê", "gerar roteiro", "sugerir lanches/compras", "plano do passeio" of an existing item, or "draft a bucket list item from this post". Never saves anything.
---

# Bucket List drafts

You prepare a **draft**. The editor reviews it in the app's own form and presses **Salvar** herself. Nothing is saved until she does.

## Rules

- Show the draft in the chat (readable fields, not JSON) **before** opening anything. Wait for no approval beyond that; the app form is the review.
- Produce the URL with the script only. Never hand-encode base64.
- Open the URL in the editor's Chrome (Claude in Chrome).
- Leave **Salvar** untouched. Closing or cancelling the form discards the draft.
- Work with the page the editor is already logged into. Use no Supabase API, key, token or password.
- From DMs, keep only the post link and facts about the place. Leave out every person's name, handle and message.
- Treat Instagram as read-only: no like, follow, reply, save or message.
- Text is plain text (no HTML or Markdown). Write in Portuguese (pt-BR).
- Fill only what the post or public sources make clear. Leave the rest out.

## Draft format

Examples: `examples/novo.json` and `examples/atualizacao.json` (fake content). The script is the source of truth for limits; read its error message and fix the draft.

- `novo`: `{ "v": 1, "kind": "novo", "fields": { "url": ... } }`. `fields.url` is required.
- `atualizacao`: `{ "v": 1, "kind": "atualizacao", "id": "<uuid>", "fields": {...}, "plan": [{ "text", "list": "checklist" | "compras" }] }`. Needs `fields` or `plan`.
- `fields` keys: `url`, `label`, `description`, `source_url`, `category` or `categories`, `tags`, `people`, `sources`, `cost_text`, `duration`, `city`, `address`, `dossier`, `itinerary`, `image_url`.
- Category: `category` is a single value; `categories` is a list of 1 to 4 distinct values, the first is the main one (cards and theme use it), the rest are extras for discovery. Use `categories` when the experience mixes kinds (a museum with a garden: `["museu", "parque"]`); otherwise use `category`. Sending both is an error. Allowed values: museu, evento, restaurante, bar, cafeteria, trilha, praca, parque, praia, ponto-turistico, passeio, outro. In an `atualizacao`, the edit form shows the proposed main + extras over the current ones.
- Sources: `sources` is a list of up to 10 `{ "title", "url" }` (title 1-120 chars, https url, no other keys). Fill it with the public pages you actually used for the dossier, itinerary and place facts (the place's official site, press, guides, maps), one entry per page, and still list them in the chat. Never include Instagram DMs or private pages. In a `novo` they pre-fill the Fontes editor; in an `atualizacao` they are appended to the current ones (deduped by URL, capped at 10), so propose only the ones you used.
- Duração: `duration` is one of `rapido` (up to 2h), `meio-periodo` or `dia-inteiro` (the app shows "Rápido (até 2h)", "Meio período", "Dia inteiro"). Fill it from the itinerary you wrote or the place's own visiting time (a quick coffee stop is `rapido`, a museum or a beach morning `meio-periodo`, a trail or a full outing `dia-inteiro`). Leave it out when you cannot tell; never guess. In an `atualizacao`, a proposed value replaces the current one in the edit form; an empty string means no proposal.
- Links are https. `source_url` is the Instagram post link. `image_url` only when it is a public https URL.
- Plan items are appended to the editor's list, so propose only new ones. Never include `who` or `done`.

## Build the URL

1. Write the draft JSON to a scratch file outside the repo (for example in the session scratchpad).
2. Run `npm run draft-url -- <file>` (or pipe the JSON on stdin).
3. Exit 0: the output is the URL. Non-zero: the message says what the app would reject. Fix and rerun.
4. Open the URL in Chrome and confirm the form is pre-filled.

## Mode: import from Instagram

Input: a post link, a DM chat the editor points to, or her saved items.

1. Open the post read-only in Chrome and read its text. In a DM chat, find the shared post links only.
2. Extract the place: name, city, address, category, cost, tags. Use public research (the place's own page, maps) when the post lacks the address or link.
   - Name the item (`label`) as the outing: an action verb, the kind of place, and the main place's own name, for example "Visitar cafeteria Cafélier", "Almoçar no restaurante Vila do Caranguejo", "Fazer a trilha X".
   - Take the name from the place itself: its sign in the photo or video, its official page, or its map listing. A brand or business promoting something inside the place, or a menu or promotion title, is not the name.
3. Research the place and its surroundings in public sources (news, the place's site, city tourism pages, maps), then fill `dossier` and `itinerary` on every import (see **Dossier and itinerary content** below).
4. Build one `novo` draft per post. `source_url` is the post link; `url` is the place's official page, or the post link when none exists.
5. One draft at a time: show it, build the URL, open it, and continue with the next post after the editor moves on.

## Mode: dossier, itinerary, snacks for an existing item

1. Open the app in Chrome (`https://railanepassos.tec.br/p/a8f3k2/`), find the item and read its page text. Get the item `id` from the edit form or the page; if it is not visible, ask the editor.
2. Research the place in public sources.
3. Build an `atualizacao` draft with the requested parts only: `dossier` (history, what to see), `itinerary` (hour by hour), `plan` (snacks to `checklist`, purchases to `compras`). Do not repeat items already in the plan.
4. Show, build the URL, open. The edit form shows the proposed text over the current one for the editor to compare.

## Dossier and itinerary content

Both modes use these. Write in pt-BR plain text with short paragraphs and line breaks.

**Dossier (`dossier`)**, about the place itself:
- History: when it opened or was founded and how long it has existed. Mention the founders or origin when public sources say so.
- One or two curiosities: a signature dish or attraction, a renovation, a famous visitor, a name origin, a record.
- What to see or order there.
- A practical warning when it matters, for example a rough sea, a dress code or booking ahead.
- State only what a source supports. When a fact you looked for is not found, say so in one short clause, for example "não achei a data exata de abertura". Never guess dates.

**Itinerary (`itinerary`)**, a day around the place:
- A time-stamped plan, one line per step (`10h: ...`). Fit it to the opening hours and any promotion window from the post.
- What to do in the area: a beach (say whether it is good for swimming or only for walking), a walk or bike route with its rough length, parks, viewpoints, other nearby spots.
- The best time to go: cooler hours, sunset, quieter weekdays. Mark it as a suggestion when no source says it.
- A closing `Dicas:` line covering sunscreen and water, what to wear, getting there or parking, and a reminder to confirm promotions or hours that may change.

Put the pages you used for the facts in `fields.sources` (short readable title + https URL), and also list them as links in the chat.
