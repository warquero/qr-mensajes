import { el } from "./dom.js";
import { brandHeader, card, footer } from "./components.js";
import { renderView } from "./view.js";
import { renderCreate } from "./create.js";
import { renderAdmin } from "./admin.js";

function stepCard(number, title, body) {
  return el(
    "article",
    { class: "step fade-in" },
    el("span", { class: "step__number" }, number),
    el("h3", { class: "step__title" }, title),
    el("p", { class: "step__body" }, body)
  );
}

function renderHome(app) {
  app.append(
    brandHeader(),
    card(
      el(
        "div",
        { class: "hero" },
        el("h1", { class: "hero__title" }, "Un regalo que habla."),
        el(
          "p",
          { class: "hero__lead" },
          "Convierte un texto, un audio o un video en un QR que va sublimado en el producto. ",
          el("strong", {}, "Quien lo recibe escanea y ve tu mensaje.")
        ),
        el(
          "div",
          { class: "hero__actions" },
          el("a", { class: "btn", href: "/crear" }, "Crear un mensaje")
        )
      )
    ),
    el(
      "div",
      { class: "steps" },
      stepCard("1", "Creá el mensaje", "Escribí tus palabras o grabá tu voz desde el celular. Podés combinar texto con audio o video."),
      stepCard("2", "Imprimí el QR", "Se genera un código listo para sublimar en la taza, el llavero o el regalo."),
      stepCard("3", "Se escanea y se siente", "Quien recibe el regalo escanea el QR y ve el mensaje al instante, hasta su fecha de vencimiento.")
    ),
    footer()
  );
}

const app = document.getElementById("app");
const path = location.pathname;

if (/^\/m\/[A-Za-z0-9]{12}$/.test(path)) {
  renderView(app, path.split("/")[2]);
} else if (path === "/crear") {
  renderCreate(app);
} else if (path === "/admin") {
  renderAdmin(app);
} else {
  renderHome(app);
}
