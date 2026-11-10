import { el, fmtDateLong } from "./dom.js";
import { brandHeader, card, footer } from "./components.js";

export async function renderView(app, id) {
  app.append(brandHeader());

  const box = card(el("p", { class: "loading" }, "Abriendo tu mensaje…"));
  app.append(box);

  let data;
  try {
    const res = await fetch(`/api/m/${id}`);
    const body = await res.json();
    if (!res.ok) {
      renderError(box, body.error);
      return;
    }
    data = body;
  } catch {
    renderError(box, "No hay conexión. Revisá tu internet y escaneá de nuevo.");
    return;
  }

  const parts = [
    el("div", { class: "view__deco", "aria-hidden": "true" }),
    el("p", { class: "view__eyebrow" }, "Un mensaje para ti"),
    data.text ? el("p", { class: "view__text" }, data.text) : null,
    data.text && data.mediaUrl ? el("div", { class: "view__divider", "aria-hidden": "true" }) : null,
    renderMedia(data),
    el(
      "p",
      { class: "view__meta" },
      `Vence el ${fmtDateLong(data.expiresAt)} · `,
      el("a", { href: "/", class: "view__brand" }, "con cariño, de quien te lo regaló")
    ),
  ].filter(Boolean);
  box.replaceChildren(...parts);

  // Contar la vista una sola vez por sesión del navegador.
  if (!sessionStorage.getItem(`v:${id}`)) {
    sessionStorage.setItem(`v:${id}`, "1");
    fetch(`/api/m/${id}/view`, { method: "POST" }).catch(() => {});
  }

  app.append(footer());
}

function renderMedia(data) {
  if (!data.mediaUrl) return null;
  if (data.kind === "video") {
    return el("video", {
      class: "view__media",
      controls: true,
      playsinline: true,
      preload: "metadata",
      src: data.mediaUrl,
    });
  }
  return el("audio", { class: "view__media", controls: true, preload: "metadata", src: data.mediaUrl });
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
