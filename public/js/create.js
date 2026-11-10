import { el, fmtBytes } from "./dom.js";
import { brandHeader, card, footer } from "./components.js";

const MAX_BYTES = 30 * 1024 * 1024;
const MAX_TEXT = 2000;

const TYPES = [
  { kind: "text", icon: "✍️", label: "Texto", hint: "Palabras escritas" },
  { kind: "audio", icon: "🎙️", label: "Audio", hint: "Tu voz o una canción" },
  { kind: "video", icon: "🎥", label: "Video", hint: "Saludo en cámara" },
];

export function renderCreate(app) {
  app.append(brandHeader());

  const state = { kind: "audio", blob: null, file: null, days: 365 };
  let contentBox = null;
  let cleanup = null;

  const submitBtn = el(
    "button",
    { class: "btn btn--block", type: "submit" },
    "Generar el QR"
  );
  const submitHint = el("p", { class: "form__hint" });

  // ---------- Paso 1: tipo ----------
  const choices = el(
    "div",
    { class: "choices", role: "radiogroup", "aria-label": "Tipo de mensaje" },
    ...TYPES.map((t) =>
      el(
        "label",
        { class: "choice" },
        el("input", {
          type: "radio",
          name: "kind",
          value: t.kind,
          checked: t.kind === state.kind ? true : null,
          onchange: () => {
            state.kind = t.kind;
            state.blob = null;
            state.file = null;
            if (cleanup) cleanup();
            contentBox.replaceWith(buildContent());
          },
        }),
        el("span", { class: "choice__icon", "aria-hidden": "true" }, t.icon),
        el("span", { class: "choice__label" }, t.label),
        el("span", { class: "choice__hint" }, t.hint)
      )
    )
  );

  // ---------- Paso 2: contenido ----------
  function buildContent() {
    state.blob = null;
    state.file = null;
    refreshValid();
    const node =
      state.kind === "text" ? buildTextEditor() : state.kind === "audio" ? buildMediaEditor("audio") : buildMediaEditor("video");
    contentBox = node;
    return node;
  }

  function buildTextEditor() {
    const counter = el("span", { class: "charcount tabular-nums" }, "0 / 2000");
    const textarea = el("textarea", {
      id: "msg-text",
      class: "textarea",
      maxlength: MAX_TEXT,
      placeholder: "Escribí acá tu mensaje… algo honesto siempre gana.",
      oninput: () => {
        counter.textContent = `${textarea.value.length} / 2000`;
        refreshValid();
      },
    });
    return el(
      "div",
      { class: "editor" },
      el("label", { class: "editor__label", for: "msg-text" }, "Tu dedicatoria"),
      textarea,
      counter
    );
  }

  function buildMediaEditor(kind) {
    let mode = "record";
    let editorBody = null;
    let stopRecorder = null;

    const recordBtn = el("button", { class: "segment__btn", type: "button" }, "Grabar ahora");
    const uploadBtn = el("button", { class: "segment__btn", type: "button" }, "Subir archivo");
    const segment = el("div", { class: "segment" }, recordBtn, uploadBtn);

    function setMode(next) {
      mode = next;
      if (stopRecorder) stopRecorder();
      recordBtn.classList.toggle("is-active", mode === "record");
      uploadBtn.classList.toggle("is-active", mode === "upload");
      const nextBody = mode === "record" ? buildRecorder() : buildUploader();
      editorBody.replaceWith(nextBody);
      editorBody = nextBody;
    }
    recordBtn.addEventListener("click", () => mode !== "record" && setMode("record"));
    uploadBtn.addEventListener("click", () => mode !== "upload" && setMode("upload"));

    function setBlob(blob) {
      state.blob = blob;
      state.file = null;
      refreshValid();
    }

    function buildRecorder() {
      return buildRecorderUI(kind, setBlob, (fn) => (stopRecorder = fn));
    }

    function buildUploader() {
      const input = el("input", {
        type: "file",
        class: "file-input",
        accept: kind === "video" ? "video/mp4,video/webm,video/quicktime" : "audio/*",
        onchange: () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const mime = (file.type || "").split(";")[0];
          const okType = kind === "video" ? mime.startsWith("video/") : mime.startsWith("audio/");
          if (!okType) {
            alert(`Ese archivo no es un ${kind === "video" ? "video" : "audio"} válido.`);
            input.value = "";
            return;
          }
          if (file.size > MAX_BYTES) {
            alert("El archivo pesa más de 30 MB. Probá con uno más corto.");
            input.value = "";
            return;
          }
          setBlob(null);
          state.file = file;
          preview.replaceChildren(
            el("p", { class: "file-chip" }, "📎 ", file.name, ` · ${fmtBytes(file.size)}`)
          );
          refreshValid();
        },
      });
      const preview = el("div", {});
      return el(
        "div",
        { class: "editor" },
        el("p", { class: "editor__label" }, "Elegí tu archivo"),
        input,
        preview
      );
    }

    editorBody = buildRecorder();
    recordBtn.classList.add("is-active");

    return el(
      "div",
      { class: "editor editor--media" },
      el("p", { class: "editor__label" }, kind === "audio" ? "Tu mensaje de voz" : "Tu video"),
      segment,
      editorBody
    );
  }

  function buildRecorderUI(kind, setBlob, registerCleanup) {
    const status = el("p", { class: "recorder__status" }, "Listo para grabar");
    const timer = el("span", { class: "recorder__timer tabular-nums" }, "00:00");
    const mainBtn = el(
      "button",
      { class: "btn btn--rec", type: "button" },
      el("span", { class: "rec-dot", "aria-hidden": "true" }),
      "Grabar"
    );
    const previewArea = el("div", { class: "recorder__preview" });
    const wrap = el("div", { class: "recorder" }, el("div", { class: "recorder__row" }, mainBtn, timer), status, previewArea);

    let stream = null;
    let recorder = null;
    let chunks = [];
    let ticking = null;
    let startedAt = 0;

    function stopTracks() {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
      }
      if (ticking) {
        clearInterval(ticking);
        ticking = null;
      }
    }
    registerCleanup(stopTracks);

    function reset() {
      stopTracks();
      recorder = null;
      chunks = [];
      previewArea.replaceChildren();
      timer.textContent = "00:00";
      mainBtn.replaceChildren(el("span", { class: "rec-dot", "aria-hidden": "true" }), "Grabar");
      status.textContent = "Listo para grabar";
      setBlob(null);
    }

    mainBtn.addEventListener("click", async () => {
      if (recorder && recorder.state === "recording") {
        recorder.stop();
        return;
      }
      reset();
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          kind === "video"
            ? { audio: true, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } } }
            : { audio: true }
        );
      } catch {
        status.textContent = "No se pudo acceder a la cámara o al micrófono. Revisá los permisos del navegador.";
        return;
      }
      const candidates =
        kind === "video"
          ? ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm"]
          : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
      const mimeType =
        typeof MediaRecorder.isTypeSupported === "function"
          ? candidates.find((m) => MediaRecorder.isTypeSupported(m))
          : "";
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        status.textContent = "Tu navegador no permite grabar. Usá la opción “Subir archivo”.";
        stopTracks();
        return;
      }
      chunks = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: (recorder.mimeType || mimeType || "").split(";")[0] });
        stopTracks();
        const url = URL.createObjectURL(blob);
        previewArea.replaceChildren(
          kind === "video"
            ? el("video", { class: "view__media", controls: true, playsinline: true, src: url })
            : el("audio", { class: "view__media", controls: true, src: url }),
          el("button", { class: "btn btn--ghost", type: "button", onclick: reset }, "Grabar de nuevo")
        );
        status.textContent = `Grabado · ${fmtBytes(blob.size)}`;
        mainBtn.replaceChildren(el("span", { class: "rec-dot", "aria-hidden": "true" }), "Grabar");
        setBlob(blob);
      };
      recorder.start();
      startedAt = Date.now();
      ticking = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        timer.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      }, 250);
      mainBtn.replaceChildren(el("span", { class: "rec-dot rec-dot--on", "aria-hidden": "true" }), "Detener");
      status.textContent = "Grabando… hablá con calma.";
    });

    return wrap;
  }

  // ---------- Paso 3: vigencia ----------
  const daysSelect = el(
    "select",
    {
      id: "msg-days",
      class: "select",
      onchange: () => (state.days = Number(daysSelect.value)),
    },
    el("option", { value: "30" }, "30 días"),
    el("option", { value: "90" }, "90 días"),
    el("option", { value: "365", selected: true }, "1 año")
  );

  // ---------- Envío ----------
  const form = el(
    "form",
    {
      class: "form",
      onsubmit: (e) => {
        e.preventDefault();
        submit();
      },
    },
    el(
      "section",
      { class: "card fade-in" },
      el("h2", { class: "card__title" }, "1 · ¿Qué querés decir?"),
      choices
    ),
    el("section", { class: "card fade-in" }, el("h2", { class: "card__title" }, "2 · Tu mensaje"), (contentBox = buildContent())),
    el(
      "section",
      { class: "card fade-in" },
      el("h2", { class: "card__title" }, "3 · ¿Cuánto vive el mensaje?"),
      el("label", { class: "editor__label", for: "msg-days" }, "Vigencia"),
      daysSelect,
      el("p", { class: "form__hint" }, "Pasado ese tiempo, el QR deja de abrir el mensaje.")
    ),
    el(
      "section",
      { class: "card fade-in form__submit" },
      submitBtn,
      submitHint
    )
  );
  app.append(form);

  function refreshValid() {
    const hasMedia = state.kind === "text" || Boolean(state.blob || state.file);
    if (state.kind === "text") {
      const text = document.getElementById("msg-text");
      submitHint.textContent = "";
      submitBtn.disabled = !text || text.value.trim().length === 0;
    } else {
      submitHint.textContent = hasMedia ? "" : "Grabá o elegí un archivo para continuar.";
      submitBtn.disabled = !hasMedia;
    }
  }
  refreshValid();

  async function submit() {
    const textEl = document.getElementById("msg-text");
    const data = new FormData();
    data.set("kind", state.kind);
    data.set("days", String(state.days));
    if (state.kind === "text") data.set("text", textEl.value.trim());
    else if (state.blob) data.set("file", state.blob, state.kind === "audio" ? "mensaje.webm" : "mensaje.webm");
    else if (state.file) data.set("file", state.file, state.file.name);

    // Reemplaza el formulario con estado de subida + progreso real.
    const progressFill = el("div", { class: "progress__fill" });
    const box = card(
      el("h2", { class: "card__title" }, "Guardando tu mensaje…"),
      el("div", { class: "progress" }, progressFill),
      el("p", { class: "form__hint" }, state.kind === "text" ? "Un momento." : "Subiendo el archivo. No cierres la página.")
    );
    form.replaceWith(box);

    try {
      const result = await upload(data, (p) => (progressFill.style.width = `${Math.round(p * 100)}%`));
      showSuccess(box, result);
    } catch (err) {
      box.replaceChildren(
        el("div", { class: "error__icon", "aria-hidden": "true" }, "😕"),
        el("h2", { class: "error__title" }, "No se pudo crear el mensaje"),
        el("p", { class: "error__detail" }, err.message || "Intentá de nuevo."),
        el("button", { class: "btn btn--ghost", type: "button", onclick: () => location.reload() }, "Volver a intentar")
      );
    }
  }
}

function upload(data, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/messages");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
      else reject(new Error((xhr.response && xhr.response.error) || "Error del servidor. Intentá de nuevo."));
    };
    xhr.onerror = () => reject(new Error("Fallo de red. Revisá tu conexión."));
    xhr.send(data);
  });
}

function showSuccess(box, result) {
  const qr = window.qrcode(0, "M");
  qr.addData(result.url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 6, margin: 2 });
  const qrHost = el("div", { class: "qr" });
  qrHost.innerHTML = svg; // SVG generado localmente por la librería vendor, no por el usuario.

  const copyBtn = el("button", { class: "btn btn--ghost", type: "button" }, "Copiar enlace");
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result.url);
      copyBtn.textContent = "¡Copiado!";
      setTimeout(() => (copyBtn.textContent = "Copiar enlace"), 1600);
    } catch {
      copyBtn.textContent = result.url;
    }
  });

  box.replaceChildren(
    el("div", { class: "view__deco", "aria-hidden": "true" }),
    el("h2", { class: "card__title" }, "¡Tu mensaje está listo!"),
    qrHost,
    el("p", { class: "qr__url" }, result.url),
    el(
      "div",
      { class: "actions" },
      copyBtn,
      el(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          onclick: () => downloadPng(svg, `qr-${result.id}.png`),
        },
        "Descargar QR (PNG)"
      ),
      el("a", { class: "btn", href: result.url, target: "_blank", rel: "noopener" }, "Ver el mensaje")
    ),
    el(
      "p",
      { class: "form__hint" },
      "Imprimí o sublimá el QR en el producto. El enlace vence el ",
      el("strong", {}, new Date(result.expiresAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })),
      "."
    ),
    el("a", { class: "btn btn--ghost", href: "/crear" }, "Crear otro mensaje")
  );
}

async function downloadPng(svgSvg, filename) {
  const img = new Image();
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgSvg);
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = svgUrl;
  });
  const size = 720;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}
