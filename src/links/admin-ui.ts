import type { LinkRow, CreateLinkInput, UpdateLinkPatch } from "./links-repo";
import { resolveIconSrc, ICON_PRESET_OPTIONS } from "./icons";
import { isHttpsUrl } from "./validate";

/**
 * DOM building blocks for the authenticated admin experience:
 *   - a discreet "Entrar" button (shown when logged out)
 *   - a login modal (email/senha)
 *   - a toolbar ("Novo link" / "Sair")
 *   - admin link cards (edit / delete / drag-handle / up / down)
 *   - a create/edit modal form
 *
 * Every element is created via document.createElement + textContent. No
 * innerHTML with user data, no inline style attributes, no injected <style>
 * tags. Visibility is toggled via the `hidden` attribute / CSS classes only,
 * to satisfy the page CSP (style-src 'self', script-src 'self').
 */

// ---------------------------------------------------------------------------
// Values collected from the create/edit form.
// ---------------------------------------------------------------------------

export type LinkFormValues = {
  url: string;
  label: string;
  description: string;
  icon_preset: string;
  icon_url: string;
};

// ---------------------------------------------------------------------------
// "Entrar" button (discreet). Lives in #links-admin-root when logged out.
// ---------------------------------------------------------------------------

export function createLoginButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "links-login-button";
  btn.textContent = "Entrar";
  btn.addEventListener("click", onClick);
  return btn;
}

// ---------------------------------------------------------------------------
// Login modal.
// ---------------------------------------------------------------------------

export type LoginModalHandle = {
  element: HTMLElement;
  open: () => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};

export function createLoginModal(
  onSubmit: (email: string, password: string) => void
): LoginModalHandle {
  let previouslyFocused: HTMLElement | null = null;

  const overlay = document.createElement("div");
  overlay.className = "links-admin-modal";
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "links-admin-modal__dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "links-login-title");

  const title = document.createElement("h2");
  title.className = "links-admin-modal__title";
  title.id = "links-login-title";
  title.textContent = "Entrar";
  dialog.appendChild(title);

  const form = document.createElement("form");
  form.className = "links-admin-form";
  form.noValidate = true;

  const emailField = labelledInput("links-login-email", "E-mail", "email");
  emailField.input.autocomplete = "username";
  emailField.input.required = true;

  const passwordField = labelledInput("links-login-password", "Senha", "password");
  passwordField.input.autocomplete = "current-password";
  passwordField.input.required = true;

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "links-admin-button links-admin-button--ghost";
  cancelBtn.textContent = "Cancelar";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "links-admin-button links-admin-button--primary";
  submitBtn.textContent = "Entrar";

  actions.append(cancelBtn, submitBtn);
  form.append(emailField.wrapper, passwordField.wrapper, error, actions);
  dialog.appendChild(form);
  overlay.appendChild(dialog);

  function close(): void {
    overlay.hidden = true;
    error.hidden = true;
    error.textContent = "";
    form.reset();
    if (previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  }

  function open(): void {
    previouslyFocused = document.activeElement as HTMLElement | null;
    overlay.hidden = false;
    error.hidden = true;
    error.textContent = "";
    emailField.input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(emailField.input.value.trim(), passwordField.input.value);
  });

  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return {
    element: overlay,
    open,
    close,
    setError(message: string) {
      error.textContent = message;
      error.hidden = false;
    },
    setBusy(busy: boolean) {
      submitBtn.disabled = busy;
      cancelBtn.disabled = busy;
    },
  };
}

// ---------------------------------------------------------------------------
// Toolbar (authenticated): "Novo link" + "Sair".
// ---------------------------------------------------------------------------

export function createToolbar(onNew: () => void, onSignOut: () => void): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "links-admin-toolbar";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "links-admin-button links-admin-button--primary";
  newBtn.textContent = "Novo link";
  newBtn.addEventListener("click", onNew);

  const signOutBtn = document.createElement("button");
  signOutBtn.type = "button";
  signOutBtn.className = "links-admin-button links-admin-button--ghost";
  signOutBtn.textContent = "Sair";
  signOutBtn.addEventListener("click", onSignOut);

  toolbar.append(newBtn, signOutBtn);
  return toolbar;
}

// ---------------------------------------------------------------------------
// Admin card: public card structure + admin controls.
// ---------------------------------------------------------------------------

export type AdminCardCallbacks = {
  onEdit: (link: LinkRow) => void;
  onDelete: (link: LinkRow) => void;
  onMoveUp: (link: LinkRow) => void;
  onMoveDown: (link: LinkRow) => void;
  onDragStart: (link: LinkRow, ev: DragEvent) => void;
  onDrop: (link: LinkRow, ev: DragEvent) => void;
};

export function renderAdminCard(
  link: LinkRow,
  index: number,
  total: number,
  cb: AdminCardCallbacks
): HTMLElement {
  const card = document.createElement("div");
  card.className = "link-card link-card--admin";
  card.dataset.id = link.id;
  card.draggable = true;

  card.addEventListener("dragstart", (ev) => cb.onDragStart(link, ev));
  card.addEventListener("dragover", (ev) => ev.preventDefault());
  card.addEventListener("drop", (ev) => {
    ev.preventDefault();
    cb.onDrop(link, ev);
  });

  const handle = document.createElement("span");
  handle.className = "link-card__drag-handle";
  handle.setAttribute("aria-hidden", "true");
  handle.textContent = "⠿";
  card.appendChild(handle);

  const img = document.createElement("img");
  img.src = resolveIconSrc(link);
  img.alt = "";
  img.width = 24;
  img.height = 24;
  card.appendChild(img);

  const text = document.createElement("span");
  text.className = "link-card__text";

  const label = document.createElement("span");
  label.className = "link-card__label";
  label.textContent = link.label;
  text.appendChild(label);

  if (link.description && link.description.length > 0) {
    const desc = document.createElement("span");
    desc.className = "link-card__desc";
    desc.textContent = link.description;
    text.appendChild(desc);
  }
  card.appendChild(text);

  const actions = document.createElement("div");
  actions.className = "link-card__actions";

  const upBtn = iconButton("↑", "Mover para cima");
  upBtn.disabled = index === 0;
  upBtn.addEventListener("click", () => cb.onMoveUp(link));

  const downBtn = iconButton("↓", "Mover para baixo");
  downBtn.disabled = index === total - 1;
  downBtn.addEventListener("click", () => cb.onMoveDown(link));

  const editBtn = iconButton("Editar", "Editar link");
  editBtn.addEventListener("click", () => cb.onEdit(link));

  const deleteBtn = iconButton("Excluir", "Excluir link");
  deleteBtn.addEventListener("click", () => cb.onDelete(link));

  actions.append(upBtn, downBtn, editBtn, deleteBtn);
  card.appendChild(actions);

  return card;
}

// ---------------------------------------------------------------------------
// Create / edit modal form.
// ---------------------------------------------------------------------------

export type LinkFormHandle = {
  element: HTMLElement;
  openCreate: () => void;
  openEdit: (link: LinkRow) => void;
  close: () => void;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
};

export function createLinkFormModal(
  onSubmit: (values: LinkFormValues, editingId: string | null) => void
): LinkFormHandle {
  let previouslyFocused: HTMLElement | null = null;
  let editingId: string | null = null;

  const overlay = document.createElement("div");
  overlay.className = "links-admin-modal";
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "links-admin-modal__dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "links-form-title");

  const title = document.createElement("h2");
  title.className = "links-admin-modal__title";
  title.id = "links-form-title";
  title.textContent = "Novo link";
  dialog.appendChild(title);

  const form = document.createElement("form");
  form.className = "links-admin-form";
  form.noValidate = true;

  const urlField = labelledInput("links-form-url", "URL", "url");
  urlField.input.required = true;
  urlField.input.placeholder = "https://...";

  const labelField = labelledInput("links-form-label", "Título", "text");
  labelField.input.required = true;
  labelField.input.maxLength = 200;

  const descField = labelledInput("links-form-desc", "Descrição (opcional)", "text");
  descField.input.maxLength = 500;

  // Icon preset select.
  const iconWrapper = document.createElement("div");
  iconWrapper.className = "links-admin-form__field";
  const iconLabel = document.createElement("label");
  iconLabel.className = "links-admin-form__label";
  iconLabel.htmlFor = "links-form-icon";
  iconLabel.textContent = "Ícone";
  const iconSelect = document.createElement("select");
  iconSelect.className = "links-admin-form__control";
  iconSelect.id = "links-form-icon";
  for (const preset of ICON_PRESET_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = preset;
    opt.textContent = preset;
    iconSelect.appendChild(opt);
  }
  iconWrapper.append(iconLabel, iconSelect);

  const iconUrlField = labelledInput(
    "links-form-icon-url",
    "Ícone personalizado (URL https, opcional)",
    "url"
  );
  iconUrlField.input.placeholder = "https://...";

  const error = document.createElement("p");
  error.className = "links-admin-form__error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "links-admin-form__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "links-admin-button links-admin-button--ghost";
  cancelBtn.textContent = "Cancelar";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "links-admin-button links-admin-button--primary";
  submitBtn.textContent = "Salvar";

  actions.append(cancelBtn, submitBtn);
  form.append(
    urlField.wrapper,
    labelField.wrapper,
    descField.wrapper,
    iconWrapper,
    iconUrlField.wrapper,
    error,
    actions
  );
  dialog.appendChild(form);
  overlay.appendChild(dialog);

  function clearError(): void {
    error.hidden = true;
    error.textContent = "";
  }

  function close(): void {
    overlay.hidden = true;
    clearError();
    form.reset();
    editingId = null;
    if (previouslyFocused) {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
  }

  function afterOpen(): void {
    previouslyFocused = document.activeElement as HTMLElement | null;
    overlay.hidden = false;
    clearError();
    urlField.input.focus();
  }

  function openCreate(): void {
    editingId = null;
    title.textContent = "Novo link";
    form.reset();
    afterOpen();
  }

  function openEdit(link: LinkRow): void {
    editingId = link.id;
    title.textContent = "Editar link";
    urlField.input.value = link.url;
    labelField.input.value = link.label;
    descField.input.value = link.description ?? "";
    iconSelect.value = link.icon_preset ?? ICON_PRESET_OPTIONS[0];
    iconUrlField.input.value = link.icon_url ?? "";
    afterOpen();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(
      {
        url: urlField.input.value.trim(),
        label: labelField.input.value.trim(),
        description: descField.input.value.trim(),
        icon_preset: iconSelect.value,
        icon_url: iconUrlField.input.value.trim(),
      },
      editingId
    );
  });

  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  });

  return {
    element: overlay,
    openCreate,
    openEdit,
    close,
    setError(message: string) {
      error.textContent = message;
      error.hidden = false;
    },
    setBusy(busy: boolean) {
      submitBtn.disabled = busy;
      cancelBtn.disabled = busy;
    },
  };
}

// ---------------------------------------------------------------------------
// Form -> repo payload helpers. Custom https icon_url takes precedence over
// the preset. Returns validation errors as thrown Error (client-side guard;
// the repo re-validates on its side too).
// ---------------------------------------------------------------------------

export function toCreateInput(values: LinkFormValues, sortOrder: number): CreateLinkInput {
  assertFormValues(values);
  const iconUrl = values.icon_url.length > 0 ? values.icon_url : null;
  return {
    url: values.url,
    label: values.label,
    description: values.description.length > 0 ? values.description : null,
    icon_preset: iconUrl ? null : values.icon_preset,
    icon_url: iconUrl,
    sort_order: sortOrder,
  };
}

export function toUpdatePatch(values: LinkFormValues): UpdateLinkPatch {
  assertFormValues(values);
  const iconUrl = values.icon_url.length > 0 ? values.icon_url : null;
  return {
    url: values.url,
    label: values.label,
    description: values.description.length > 0 ? values.description : null,
    icon_preset: iconUrl ? null : values.icon_preset,
    icon_url: iconUrl,
  };
}

function assertFormValues(values: LinkFormValues): void {
  if (!isHttpsUrl(values.url)) {
    throw new Error("Informe uma URL https válida.");
  }
  if (values.label.length < 1) {
    throw new Error("O título é obrigatório.");
  }
  if (values.icon_url.length > 0 && !isHttpsUrl(values.icon_url)) {
    throw new Error("O ícone personalizado deve ser uma URL https válida.");
  }
}

// ---------------------------------------------------------------------------
// Small DOM helpers.
// ---------------------------------------------------------------------------

type LabelledInput = {
  wrapper: HTMLElement;
  input: HTMLInputElement;
};

function labelledInput(id: string, labelText: string, type: string): LabelledInput {
  const wrapper = document.createElement("div");
  wrapper.className = "links-admin-form__field";

  const label = document.createElement("label");
  label.className = "links-admin-form__label";
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.className = "links-admin-form__control";
  input.id = id;
  input.type = type;

  wrapper.append(label, input);
  return { wrapper, input };
}

function iconButton(text: string, ariaLabel: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link-card__action";
  btn.textContent = text;
  btn.setAttribute("aria-label", ariaLabel);
  btn.title = ariaLabel;
  return btn;
}
