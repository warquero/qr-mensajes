import { BRAND } from "./config.js";
import { el } from "./dom.js";

export function brandHeader() {
  return el(
    "header",
    { class: "brand" },
    el("img", { src: "/logo.svg", alt: "", width: 40, height: 40, class: "brand__logo" }),
    el(
      "div",
      { class: "brand__text" },
      el("span", { class: "brand__name" }, BRAND.name),
      el("span", { class: "brand__tagline" }, BRAND.tagline)
    )
  );
}

export function card(...children) {
  return el("section", { class: "card fade-in" }, ...children);
}

export function footer() {
  return el(
    "footer",
    { class: "footer" },
    el("span", {}, `Hecho con cariño por ${BRAND.name}`),
    el("a", { href: "/admin", class: "footer__admin" }, "Panel del taller")
  );
}
