/*!
 * AI Prompt Outline v0.5
 * Author: Darkness
 * Contact: redchampion496@gmail.com
 * Copyright (c) 2026. All rights reserved.
 */
const ADAPTADORES = {
  chatgpt: {
    match: (host) => host.includes("chatgpt.com"),
    obtenerPrompts() {
      const oficial = document.querySelectorAll('[data-message-author-role="user"]');
      if (oficial.length > 0) return Array.from(oficial);

      return Array.from(document.querySelectorAll("main .whitespace-pre-wrap")).filter(
        (el) => !el.closest(".markdown") && !el.closest("pre")
      );
    },
    obtenerContenedorScroll() {
      return buscarScrollAncestro(this.obtenerPrompts()[0] || document.querySelector("main"));
    },
    obtenerClaveYOrden(elemento, contenedor, idxFallback) {
      const turnoEl = elemento.closest('[data-testid^="conversation-turn-"]');
      if (turnoEl) {
        const match = turnoEl.getAttribute("data-testid").match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          return { clave: `turno-${num}`, orden: num, esInicioReal: num <= 2 };
        }
      }
      const rect = elemento.getBoundingClientRect();
      return {
        clave: null,
        orden: Math.round((contenedor.scrollTop || 0) + rect.top + idxFallback),
        esInicioReal: false
      };
    }
  },

  gemini: {
    match: (host) => host.includes("gemini.google.com"),
    obtenerPrompts() {
      const textos = document.querySelectorAll("user-query .query-text");
      if (textos.length > 0) return Array.from(textos);
      return Array.from(document.querySelectorAll("user-query, .user-query-container"));
    },
    obtenerContenedorScroll() {
      const scroller = document.querySelector("infinite-scroller.chat-history, infinite-scroller");
      if (scroller) {
        if (scroller.shadowRoot) {
          const internoShadow = Array.from(scroller.shadowRoot.querySelectorAll("*")).find(
            (el) => el.scrollHeight > el.clientHeight + 20
          );
          if (internoShadow) return internoShadow;
        }
        if (scroller.scrollHeight > scroller.clientHeight + 20) {
          return scroller;
        }
      }
      return buscarScrollAncestro(this.obtenerPrompts()[0] || document.querySelector("main"));
    },
    obtenerClaveYOrden(elemento, contenedor, idxFallback) {
      const bloqueTurno = elemento.closest(".conversation-container") || elemento.closest("user-query");
      const todosBloques = Array.from(document.querySelectorAll(".conversation-container, user-query"));
      const indiceDom = bloqueTurno ? todosBloques.indexOf(bloqueTurno) : -1;

      const rect = elemento.getBoundingClientRect();
      const posVertical = Math.round((contenedor.scrollTop || 0) + rect.top);
      return {
        clave: null,
        orden: indiceDom !== -1 ? posVertical + indiceDom : posVertical + idxFallback,
        esInicioReal: false
      };
    }
  },

  claude: {
    match: (host) => host.includes("claude.ai"),
    obtenerPrompts() {
      return Array.from(document.querySelectorAll('[data-testid="user-message"]'));
    },
    obtenerContenedorScroll() {
      return buscarScrollAncestro(this.obtenerPrompts()[0] || document.querySelector("main"));
    },
    obtenerClaveYOrden(elemento, contenedor, idxFallback) {
      const rect = elemento.getBoundingClientRect();
      return {
        clave: null,
        orden: Math.round((contenedor.scrollTop || 0) + rect.top + idxFallback),
        esInicioReal: false
      };
    }
  }
};

function buscarScrollAncestro(el) {
  let actual = el;
  while (actual && actual !== document.body) {
    const style = getComputedStyle(actual);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      actual.scrollHeight > actual.clientHeight + 20
    ) {
      return actual;
    }
    actual = actual.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

const adapterActivo = Object.values(ADAPTADORES).find((a) =>
  a.match(window.location.hostname)
);

let panel = null;
let contenedorLista = null;
let mapaPrompts = new Map();
let urlActual = "";
let temporizador = null;
let pausarEscaneo = false;
let cargandoHistorial = false;

let anchoPanel = parseInt(localStorage.getItem("aipo_ancho"), 10) || 260;
let altoPanel = parseInt(localStorage.getItem("aipo_alto"), 10) || Math.round(window.innerHeight * 0.65);

function crearPanel() {
  if (document.getElementById("ai-prompt-outline")) {
    panel = document.getElementById("ai-prompt-outline");
    return;
  }

  panel = document.createElement("div");
  panel.id = "ai-prompt-outline";
  Object.assign(panel.style, {
    position: "fixed",
    top: "85px",
    right: "16px",
    width: `${anchoPanel}px`,
    height: `${altoPanel}px`,
    minWidth: "210px",
    maxWidth: "650px",
    minHeight: "160px",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#1e1e1e",
    color: "#f0f0f0",
    border: "1px solid #383838",
    borderRadius: "8px",
    padding: "10px",
    fontSize: "12px",
    zIndex: "2147483647",
    boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
    fontFamily: "sans-serif",
    boxSizing: "border-box"
  });

  document.body.appendChild(panel);
}

function activarRedimensionado(handle) {
  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panel.offsetWidth;
    const startHeight = panel.offsetHeight;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "nesw-resize";

    function onMouseMove(ev) {
      const nuevoAncho = Math.min(650, Math.max(210, startWidth + (startX - ev.clientX)));
      const nuevoAlto = Math.min(Math.round(window.innerHeight * 0.88), Math.max(160, startHeight + (ev.clientY - startY)));

      anchoPanel = nuevoAncho;
      altoPanel = nuevoAlto;
      panel.style.width = `${nuevoAncho}px`;
      panel.style.height = `${nuevoAlto}px`;
    }

    function onMouseUp() {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      localStorage.setItem("aipo_ancho", anchoPanel);
      localStorage.setItem("aipo_alto", altoPanel);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      renderizarPanel();
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });
}

function sincronizarPrompts() {
  if (pausarEscaneo || !adapterActivo) return;
  crearPanel();

  if (window.location.href !== urlActual) {
    urlActual = window.location.href;
    mapaPrompts.clear();
  }

  const contenedor = adapterActivo.obtenerContenedorScroll();
  const visibles = adapterActivo.obtenerPrompts();
  let huboCambios = false;

  visibles.forEach((el, idx) => {
    const texto = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (!texto) return;

    const info = adapterActivo.obtenerClaveYOrden(el, contenedor, idx);
    const clave = info.clave || texto;

    if (!mapaPrompts.has(clave)) {
      mapaPrompts.set(clave, {
        clave,
        orden: info.orden,
        esInicioReal: info.esInicioReal,
        texto,
        elemento: el
      });
      huboCambios = true;
    } else {
      const existente = mapaPrompts.get(clave);
      existente.elemento = el;
      existente.orden = info.orden;
    }
  });

  if (huboCambios || panel.dataset.renderizado !== "true") {
    panel.dataset.renderizado = "true";
    renderizarPanel();
  }
}

function saltarAMensaje(item) {
  pausarEscaneo = true;
  const contenedor = adapterActivo.obtenerContenedorScroll();
  contenedor.style.overflowAnchor = "none";

  let objetivo = document.body.contains(item.elemento)
    ? item.elemento
    : adapterActivo.obtenerPrompts().find(
        (el) => (el.innerText || "").trim().replace(/\s+/g, " ") === item.texto
      );

  if (objetivo) {
    item.elemento = objetivo;
    objetivo.scrollIntoView({ behavior: "auto", block: "center" });
    objetivo.style.outline = "2px solid #10a37f";
    setTimeout(() => (objetivo.style.outline = ""), 1200);
  }

  setTimeout(() => {
    pausarEscaneo = false;
  }, 400);
}

async function cargarHistorialCompleto(boton) {
  if (cargandoHistorial || !adapterActivo) return;
  cargandoHistorial = true;
  pausarEscaneo = true;

  const contenedor = adapterActivo.obtenerContenedorScroll();
  contenedor.style.overflowAnchor = "none";

  let fotogramasEnTope = 0;
  let alturaPrevia = contenedor.scrollHeight;
  let ordenMinimoPrevio = Infinity;
  let fotogramasTotales = 0;

  const VELOCIDAD_AUTOSCROLL = 320;

  await new Promise((resolve) => {
    function tickAutoscroll() {
      fotogramasTotales++;

      pausarEscaneo = false;
      sincronizarPrompts();
      pausarEscaneo = true;
      boton.textContent = `Subiendo (${mapaPrompts.size})...`;

      const items = Array.from(mapaPrompts.values());
      const ordenMinimoActual = items.length > 0 ? Math.min(...items.map((p) => p.orden)) : Infinity;
      const tocoInicioReal = items.some((p) => p.esInicioReal);

      if (tocoInicioReal && contenedor.scrollTop <= 2) {
        resolve();
        return;
      }

      if (contenedor.scrollTop > 2) {
        fotogramasEnTope = 0;
        contenedor.scrollBy(0, -VELOCIDAD_AUTOSCROLL);
        contenedor.dispatchEvent(new Event("scroll", { bubbles: true }));
        contenedor.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -VELOCIDAD_AUTOSCROLL,
            deltaMode: 0,
            bubbles: true
          })
        );
      } else {
        fotogramasEnTope++;

        if (fotogramasEnTope % 10 === 0) {
          contenedor.dispatchEvent(
            new WheelEvent("wheel", {
              deltaY: -120,
              deltaMode: 0,
              bubbles: true
            })
          );
        }

        if (
          contenedor.scrollHeight !== alturaPrevia ||
          ordenMinimoActual < ordenMinimoPrevio ||
          contenedor.scrollTop > 2
        ) {
          alturaPrevia = contenedor.scrollHeight;
          ordenMinimoPrevio = ordenMinimoActual;
          fotogramasEnTope = 0;
        }

        if (fotogramasEnTope >= 130) {
          resolve();
          return;
        }
      }

      if (fotogramasTotales > 1800) {
        resolve();
        return;
      }

      requestAnimationFrame(tickAutoscroll);
    }

    requestAnimationFrame(tickAutoscroll);
  });

  cargandoHistorial = false;
  pausarEscaneo = false;
  sincronizarPrompts();
  renderizarPanel();
}

function renderizarPanel() {
  crearPanel();

  const listaOrdenada = Array.from(mapaPrompts.values()).sort(
    (a, b) => a.orden - b.orden
  );

  const scrollListaPrevio = contenedorLista ? contenedorLista.scrollTop : 0;

  panel.replaceChildren();

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
    flexShrink: "0"
  });

  const titulo = document.createElement("strong");
  titulo.textContent = `Tus Prompts (${listaOrdenada.length})`;

  const btnCargar = document.createElement("button");
  btnCargar.textContent = cargandoHistorial ? "Subiendo..." : "↑ Cargar todo";
  Object.assign(btnCargar.style, {
    backgroundColor: "#333",
    color: "#ddd",
    border: "1px solid #444",
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "10px",
    cursor: "pointer"
  });
  btnCargar.onclick = () => cargarHistorialCompleto(btnCargar);

  header.appendChild(titulo);
  header.appendChild(btnCargar);
  panel.appendChild(header);

  contenedorLista = document.createElement("div");
  Object.assign(contenedorLista.style, {
    flex: "1",
    overflowY: "auto",
    paddingRight: "2px"
  });

  if (listaOrdenada.length === 0) {
    const vacio = document.createElement("div");
    vacio.textContent = "Aún no hay prompts visibles.";
    vacio.style.color = "#999";
    contenedorLista.appendChild(vacio);
  } else {
    const maxCaracteres = Math.max(35, Math.floor((anchoPanel - 45) / 6.2));

    listaOrdenada.forEach((data, idx) => {
      const resumen =
        data.texto.length > maxCaracteres
          ? data.texto.slice(0, maxCaracteres) + "..."
          : data.texto;

      const item = document.createElement("div");
      item.textContent = `${idx + 1}. ${resumen}`;
      Object.assign(item.style, {
        padding: "6px 8px",
        cursor: "pointer",
        borderRadius: "4px",
        marginBottom: "4px",
        backgroundColor: "#2a2a2a",
        lineHeight: "1.35"
      });

      item.onmouseenter = () => (item.style.backgroundColor = "#3a3a3a");
      item.onmouseleave = () => (item.style.backgroundColor = "#2a2a2a");
      item.onclick = () => saltarAMensaje(data);

      contenedorLista.appendChild(item);
    });
  }

  panel.appendChild(contenedorLista);
  contenedorLista.scrollTop = scrollListaPrevio;

  const resizeHandle = document.createElement("div");
  Object.assign(resizeHandle.style, {
    position: "absolute",
    left: "2px",
    bottom: "2px",
    width: "14px",
    height: "14px",
    cursor: "nesw-resize",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    opacity: "0.65"
  });

  const marca = document.createElement("div");
  Object.assign(marca.style, {
    width: "8px",
    height: "8px",
    borderLeft: "2px solid #888",
    borderBottom: "2px solid #888",
    borderBottomLeftRadius: "2px",
    margin: "2px"
  });

  resizeHandle.appendChild(marca);
  resizeHandle.onmouseenter = () => (resizeHandle.style.opacity = "1");
  resizeHandle.onmouseleave = () => (resizeHandle.style.opacity = "0.65");
  activarRedimensionado(resizeHandle);

  panel.appendChild(resizeHandle);
}

if (adapterActivo) {
  sincronizarPrompts();

  const observer = new MutationObserver(() => {
    if (pausarEscaneo || cargandoHistorial) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizarPrompts, 250);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}