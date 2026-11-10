import { el, fmtDateShort, fmtBytes } from "./dom.js";
import { brandHeader, card } from "./components.js";

const TOKEN_KEY = "qr_mensajes_admin_token";
const KIND_ICON = { text: "✍️", audio: "🎙️", video: "🎥" };

export function renderAdmin(app) {
  app.append(brandHeader());
  const token = localStorage.getItem(TOKEN_KEY) || "";
  token ? showList(app, token) : showGate(app);
}

function showGate(app) {
  const input = el("input", {
    type: "password",
    class: "input",
    placeholder: "Token del taller",
    autocomplete: "current-password",
  });
  const err = el("p", { class: "form__hint form__hint--error" });

  const gate = card(
    el("h2", { class: "card__title" }, "Panel del taller"),
    el("p", { class: "form__hint" }, "Acceso con el token de administración."),
    input,
    err,
    el(
      "button",
      {
        class: "btn btn--block",
        type: "button",
        onclick: async () => {
          const value = input.value.trim();
          if (!value) return;
          try {
            await api(value, "/api/admin/messages");
            localStorage.setItem(TOKEN_KEY, value);
            gate.replaceWith(showList(document.getElementById("app"), value));
          } catch {
            err.textContent = "Token incorrecto.";
          }
        },
      },
      "Entrar"
    )
  );
  app.append(gate);
}

async function api(token, path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(body.error || "Error del servidor.");
  return body;
}

function showList(app, token) {
  const table = el("div", { class: "table-wrap" }, el("p", { class: "loading" }, "Cargando…"));
  const err = el("p", { class: "form__hint form__hint--error" });

  const panel = card(
    el(
      "div",
      { class: "admin-head" },
      el("h2", { class: "card__title" }, "Mensajes del taller"),
      el(
        "div",
        { class: "actions" },
        el("button", { class: "btn btn--ghost", type: "button", onclick: () => load() }, "Actualizar"),
        el(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            onclick: () => {
              localStorage.removeItem(TOKEN_KEY);
              location.reload();
            },
          },
          "Salir"
        )
      )
    ),
    table,
    err
  );
  app.append(panel);

  async function load() {
    err.textContent = "";
    try {
      const { messages } = await api(token, "/api/admin/messages");
      if (!messages.length) {
        table.replaceChildren(el("p", { class: "loading" }, "Todavía no hay mensajes. Creá el primero en /crear."));
        return;
      }
      table.replaceChildren(
        el(
          "table",
          { class: "table" },
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", {}, "ID"),
              el("th", {}, "Tipo"),
              el("th", {}, "Creado"),
              el("th", {}, "Vence"),
              el("th", {}, "Vistas"),
              el("th", {}, "Estado"),
              el("th", {}, "Acciones")
            )
          ),
          el(
            "tbody",
            {},
            ...messages.map((m) =>
              el(
                "tr",
                {},
                el("td", {}, el("a", { href: `/m/${m.id}`, target: "_blank", rel: "noopener" }, m.id)),
                el("td", {}, KIND_ICON[m.kind] || m.kind, " ", m.kind),
                el("td", { class: "tabular-nums" }, fmtDateShort(m.created_at)),
                el("td", { class: "tabular-nums" }, fmtDateShort(m.expires_at)),
                el("td", { class: "tabular-nums" }, String(m.views)),
                el("td", {}, el("span", { class: m.active ? "chip chip--ok" : "chip chip--off" }, m.active ? "Activo" : "Pausado")),
                el(
                  "td",
                  { class: "table__actions" },
                  el(
                    "button",
                    {
                      class: "btn btn--ghost btn--sm",
                      type: "button",
                      onclick: async () => {
                        await api(token, `/api/admin/messages/${m.id}/active`, {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ active: m.active ? 0 : 1 }),
                        });
                        load();
                      },
                    },
                    m.active ? "Pausar" : "Activar"
                  ),
                  el(
                    "button",
                    {
                      class: "btn btn--ghost btn--sm",
                      type: "button",
                      onclick: async () => {
                        await api(token, `/api/admin/messages/${m.id}/extend`, {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ days: 90 }),
                        });
                        load();
                      },
                    },
                    "+90 días"
                  ),
                  el(
                    "button",
                    {
                      class: "btn btn--danger btn--sm",
                      type: "button",
                      onclick: async () => {
                        if (!confirm(`¿Borrar el mensaje ${m.id} y su archivo? Esto no se puede deshacer.`)) return;
                        await api(token, `/api/admin/messages/${m.id}`, { method: "DELETE" });
                        load();
                      },
                    },
                    "Borrar"
                  )
                )
              )
            )
          )
        )
      );
    } catch (e) {
      if (e.message === "unauthorized") {
        location.reload();
        return;
      }
      err.textContent = e.message;
    }
  }
  load();
  return panel;
}

