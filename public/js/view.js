import { el, fmtDateLong } from "./dom.js";
import { brandHeader, card, footer } from "./components.js";
import { SUPABASE } from "./config.js";

export async function renderView(app, id) {
  app.append(brandHeader());

  const box = card(el("p", { class: "loading" }, "Abriendo tu mensaje…"));
  app.append(box);

  let row;
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/get_message`, {
      method: "POST",
      headers: {
        apikey: SUPABASE.anonKey,
        Authorization: `Bearer ${SUPABASE.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_id: id }),
    });
    if (!res.ok) {
      renderError(box, "Intentá de nuevo en unos minutos.");
      return;
    }
    const rows = await res.json();
    if (!rows.length) {
      renderError(box, "Este mensaje no existe, expiró o fue pausado por el taller.");
      return;
    }
    row = rows[0];
  } catch {
    renderError(box, "No hay conexión. Revisá tu internet y escaneá de nuevo.");
    return;
  }

  const mediaUrl = row.media_key
    ? `${SUPABASE.url}/storage/v1/object/public/messages/${row.media_key}`
    : null;

  const parts = [
    el("div", { class: "view__deco", "aria-hidden": "true" }),
    el("p", { class: "view__eyebrow" }, "Un mensaje para ti"),
    row.message_text ? el("p", { class: "view__text" }, row.message_text) : null,
    row.message_text && mediaUrl ? el("div", { class: "view__divider", "aria-hidden": "true" }) : null,
    renderMedia(row, mediaUrl),
    el(
      "p",
      { class: "view__meta" },
      `Vence el ${fmtDateLong(row.expires_at)} · `,
      el("a", { href: "/", class: "view__brand" }, "con cariño, de quien te lo regaló")
    ),
  ].filter(Boolean);
  box.replaceChildren(...parts);

  // Contar la vista una sola vez por sesión del navegador.
  if (!sessionStorage.getItem(`v:${id}`)) {
    sessionStorage.setItem(`v:${id}`, "1");
    fetch(`${SUPABASE.url}/rest/v1/rpc/count_message_view`, {
      method: "POST",
      headers: {
        apikey: SUPABASE.anonKey,
        Authorization: `Bearer ${SUPABASE.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_id: id }),
    }).catch(() => {});
  }

  app.append(footer());
}

function renderMedia(row, mediaUrl) {
  if (!mediaUrl) return null;
  if (row.kind === "video") {
    return el("video", {
      class: "view__media",
      controls: true,
      playsinline: true,
      preload: "metadata",
      src: mediaUrl,
    });
  }
  return el("audio", { class: "view__media", controls: true, preload: "metadata", src: mediaUrl });
}

function renderError(box, message) {
  box.replaceChildren(
    el("div", { class: "error__icon", "aria-hidden": "true" }, "💌"),
    el("h1", { class: "error__title" }, "Este mensaje no está disponible"),
    el("p", { class: "error__detail" }, message || "Intentá de nuevo en unos minutos."),
    el("p", { class: "error__hint" }, "Si te regalaron un producto con QR, avisale al taller para que lo revise.")
  );
  app.append(footer());
}
