import { formatCLP } from "../core/format.js";
import { chooseVoiceCandidate, intentLabel, interpretVoiceCommand } from "../assistant/voice-intents.js";
import { createSpeechController, speakText, speechSupport } from "../assistant/speech.js";

function ensureVoiceStyles() {
  if (document.querySelector("link[data-voice-copilot-v2]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "assets/css/voice-copilot-v2.css";
  link.dataset.voiceCopilotV2 = "true";
  document.head.append(link);
}

function ensureVoiceRoot() {
  ensureVoiceStyles();
  let root = document.querySelector("#voice-copilot");
  if (root) return root;
  root = document.createElement("section");
  root.id = "voice-copilot";
  root.className = "card voice-copilot voice-copilot-v2";
  root.innerHTML = `
    <div class="voice-copilot-header">
      <div>
        <p class="eyebrow">Copiloto operacional</p>
        <h2>Dime lo que pasó</h2>
        <p>Habla de a una operación. Verás en pantalla lo que el sistema escucha, interpreta y responde antes de guardar.</p>
      </div>
      <label class="voice-readback"><input id="voice-readback" type="checkbox" checked> Leer también la respuesta</label>
    </div>
    <div class="voice-live" id="voice-live" data-state="idle">
      <div class="voice-live-heading"><span class="voice-pulse" aria-hidden="true"></span><strong id="voice-live-title">Micrófono listo</strong></div>
      <p id="voice-live-text">Presiona Hablar y di una frase corta.</p>
    </div>
    <div class="voice-controls">
      <button class="button primary voice-main-button" id="voice-start" type="button">Hablar</button>
      <button class="button secondary" id="voice-stop" type="button">Detener</button>
      <span class="voice-status" id="voice-status" role="status" aria-live="polite">Listo para escuchar.</span>
    </div>
    <label class="voice-transcript-label">Transcripción editable
      <textarea id="voice-transcript" rows="3" placeholder="Ej.: Anótale a Rosa quince mil de fiado"></textarea>
    </label>
    <div class="voice-alternatives" id="voice-alternatives" hidden>
      <strong>También escuché:</strong>
      <div id="voice-alternative-list"></div>
    </div>
    <div class="voice-secondary-actions">
      <button class="button secondary" id="voice-analyze" type="button">Analizar frase</button>
      <small>Puedes corregir el texto o usar el dictado del teclado del teléfono.</small>
    </div>
    <div class="voice-suggestions">
      <strong>Prueba diciendo:</strong>
      <div id="voice-suggestions"></div>
    </div>
    <div class="voice-proposal" id="voice-proposal" hidden>
      <div>
        <p class="eyebrow">Lo que interpreté</p>
        <h3 id="voice-proposal-title"></h3>
        <p id="voice-proposal-text"></p>
        <small id="voice-proposal-missing"></small>
      </div>
      <div class="voice-proposal-actions">
        <button class="button primary" id="voice-confirm" type="button">Confirmar</button>
        <button class="button secondary" id="voice-correct" type="button">Corregir</button>
        <button class="button secondary" id="voice-cancel" type="button">Cancelar</button>
      </div>
    </div>
    <section class="voice-response" id="voice-response" hidden aria-labelledby="voice-response-title">
      <p class="eyebrow">Respuesta del copiloto</p>
      <h3 id="voice-response-title">Resultado</h3>
      <p id="voice-response-text" aria-live="polite"></p>
    </section>
    <section class="voice-history-shell" aria-labelledby="voice-history-title">
      <div class="voice-history-heading"><strong id="voice-history-title">Conversación de esta sesión</strong><button class="button secondary small" id="voice-clear-history" type="button">Limpiar</button></div>
      <div class="voice-history" id="voice-history"><p class="voice-history-empty">Todavía no hay mensajes.</p></div>
    </section>
    <div class="voice-privacy">
      <strong>Privacidad:</strong> el micrófono se activa solo al presionar Hablar. No existe escucha continua y ninguna acción se guarda sin confirmación humana.
    </div>`;
  const title = document.querySelector(".section-title");
  title?.insertAdjacentElement("afterend", root);
  return root;
}

function proposalSummary(proposal) {
  const data = proposal.data ?? {};
  if (proposal.intent === "charge") {
    return `${data.customerName || "Persona por confirmar"}: nuevo fiado por ${formatCLP(data.amount ?? 0)}.`;
  }
  if (proposal.intent === "payment") {
    return `${data.customerName || "Persona por confirmar"}: abono por ${formatCLP(data.amount ?? 0)}.`;
  }
  if (proposal.intent === "transaction_line") {
    return `${data.type === "purchase" ? "Compra" : "Venta"}: ${data.quantity ?? "?"} ${data.unit || ""} de ${data.product || "producto por confirmar"} a ${formatCLP(data.unitPrice ?? 0)} por unidad.`;
  }
  return intentLabel(proposal.intent);
}

function missingLabel(field) {
  return ({
    customerName: "nombre de la persona",
    amount: "monto",
    quantity: "cantidad",
    product: "producto",
    unitPrice: "precio unitario",
    command: "una instrucción reconocible",
  })[field] ?? field;
}

function suggestionPhrases() {
  return [
    "Anótale a Rosa quince mil de fiado",
    "Pedro abonó cinco lucas",
    "Vendí cinco kilos de tomate a mil cuatrocientos noventa",
    "Cuánto me deben en total",
    "Quién me debe más",
  ];
}

export function mountVoiceCopilot({ onApply, onQuery }) {
  const root = ensureVoiceRoot();
  const transcript = root.querySelector("#voice-transcript");
  const status = root.querySelector("#voice-status");
  const microphone = root.querySelector("#voice-start");
  const stop = root.querySelector("#voice-stop");
  const analyze = root.querySelector("#voice-analyze");
  const speakToggle = root.querySelector("#voice-readback");
  const suggestions = root.querySelector("#voice-suggestions");
  const proposal = root.querySelector("#voice-proposal");
  const proposalTitle = root.querySelector("#voice-proposal-title");
  const proposalText = root.querySelector("#voice-proposal-text");
  const proposalMissing = root.querySelector("#voice-proposal-missing");
  const confirm = root.querySelector("#voice-confirm");
  const correct = root.querySelector("#voice-correct");
  const cancel = root.querySelector("#voice-cancel");
  const live = root.querySelector("#voice-live");
  const liveTitle = root.querySelector("#voice-live-title");
  const liveText = root.querySelector("#voice-live-text");
  const alternatives = root.querySelector("#voice-alternatives");
  const alternativeList = root.querySelector("#voice-alternative-list");
  const responsePanel = root.querySelector("#voice-response");
  const responseText = root.querySelector("#voice-response-text");
  const history = root.querySelector("#voice-history");
  const clearHistory = root.querySelector("#voice-clear-history");
  const support = speechSupport();
  let currentProposal = null;
  let lastFinalText = "";

  function setLive(state, title, text) {
    live.dataset.state = state;
    liveTitle.textContent = title;
    liveText.textContent = text;
  }

  function addHistory(kind, text) {
    history.querySelector(".voice-history-empty")?.remove();
    const message = document.createElement("article");
    message.className = `voice-message voice-message-${kind}`;
    const label = document.createElement("strong");
    label.textContent = kind === "user" ? "Tú" : "Copiloto";
    const content = document.createElement("p");
    content.textContent = text;
    message.append(label, content);
    history.append(message);
    history.scrollTop = history.scrollHeight;
  }

  function showResponse(text, { speak = true } = {}) {
    const value = String(text || "Acción aplicada.");
    responsePanel.hidden = false;
    responseText.textContent = value;
    addHistory("assistant", value);
    setLive("success", "Respuesta lista", value);
    if (speak && speakToggle.checked && support.synthesis) {
      speakText(value, {
        onStart: () => setLive("speaking", "Respondiendo en voz alta", value),
        onEnd: () => setLive("success", "Respuesta lista", value),
      });
    }
  }

  function setStatus(message, state = "idle") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function clearProposal() {
    currentProposal = null;
    proposal.hidden = true;
    proposalMissing.textContent = "";
  }

  function renderAlternatives(ranked = []) {
    alternativeList.replaceChildren();
    const unique = ranked
      .filter((item, index) => index > 0 && item.transcript !== ranked[0]?.transcript)
      .slice(0, 2);
    alternatives.hidden = unique.length === 0;
    unique.forEach((candidate) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "voice-alternative-chip";
      button.textContent = candidate.transcript;
      button.addEventListener("click", () => process(candidate.transcript, { fromVoice: false }));
      alternativeList.append(button);
    });
  }

  function renderProposal(parsed) {
    currentProposal = parsed;
    proposal.hidden = false;
    proposalTitle.textContent = intentLabel(parsed.intent);
    proposalText.textContent = proposalSummary(parsed);
    const missing = parsed.missing ?? [];
    proposalMissing.textContent = missing.length
      ? `Falta confirmar: ${missing.map(missingLabel).join(", ")}.`
      : parsed.confidence === "high"
        ? "Interpretación clara. Revisa antes de guardar."
        : "Interpretación aproximada. Revísala con cuidado.";
    confirm.disabled = parsed.intent === "unknown" || missing.length > 0;
  }

  function process(text, { parsed = null, ranked = [], fromVoice = false } = {}) {
    const cleanText = String(text ?? "").trim();
    transcript.value = cleanText;
    if (!cleanText) {
      clearProposal();
      setStatus("Escribe o dicta una frase antes de analizar.", "warning");
      setLive("warning", "Falta una frase", "Escribe una instrucción o vuelve a presionar Hablar.");
      return;
    }
    const interpreted = parsed ?? interpretVoiceCommand(cleanText);
    renderProposal(interpreted);
    renderAlternatives(ranked);
    addHistory("user", cleanText);
    setLive(
      interpreted.intent === "unknown" ? "warning" : "ready",
      interpreted.intent === "unknown" ? "Necesito una corrección" : "Frase interpretada",
      proposalSummary(interpreted),
    );
    setStatus(
      interpreted.intent === "unknown"
        ? "No entendí la instrucción. Puedes corregirla o elegir otra transcripción."
        : "Entendido. Revisa la propuesta antes de confirmar.",
      interpreted.intent === "unknown" ? "warning" : "ready",
    );
    if (fromVoice && interpreted.intent === "unknown") {
      responsePanel.hidden = false;
      responseText.textContent = "No pude convertir esa frase en una operación segura. Corrige la transcripción o prueba un ejemplo.";
    }
  }

  const controller = createSpeechController({
    lang: "es-CL",
    onInterim(value) {
      transcript.value = value;
      setLive("listening", "Escuchando ahora", value || "Habla con naturalidad.");
      setStatus("Escuchando… puedes ver y corregir la transcripción.", "listening");
    },
    onFinal(value, metadata = {}) {
      if (!value || value === lastFinalText) return;
      lastFinalText = value;
      const candidates = metadata.alternatives?.length ? metadata.alternatives : [{ transcript: value, confidence: metadata.confidence }];
      const chosen = chooseVoiceCandidate(candidates);
      process(chosen.text, { parsed: chosen.parsed, ranked: chosen.alternatives, fromVoice: true });
    },
    onState(state) {
      microphone.disabled = state === "requesting" || state === "listening" || state === "processing";
      stop.disabled = state !== "listening";
      if (state === "requesting") {
        setLive("requesting", "Solicitando micrófono", "Autoriza el acceso para comenzar.");
        setStatus("Solicitando permiso del micrófono…", "listening");
      }
      if (state === "processing") {
        setLive("processing", "Procesando la frase", transcript.value || "Revisando alternativas de reconocimiento.");
        setStatus("Procesando lo que escuché…", "listening");
      }
      if (state === "idle" && !currentProposal && !responsePanel.hidden) return;
      if (state === "idle" && !currentProposal) {
        setLive("idle", "Micrófono listo", "Presiona Hablar y di una frase corta.");
        setStatus("Listo para escuchar.", "idle");
      }
    },
    onError(message) {
      setLive("error", "No pude escuchar", message);
      setStatus(message, "error");
      microphone.disabled = !support.recognition;
      stop.disabled = true;
    },
  });

  microphone.disabled = !controller.supported;
  stop.disabled = true;
  if (!controller.supported) {
    setStatus("Este navegador no reconoce voz. Puedes dictar con el teclado del teléfono o escribir la frase.", "warning");
    setLive("warning", "Usa el teclado del teléfono", "El dictado del teclado y la entrada manual siguen disponibles.");
  }

  suggestionPhrases().forEach((phrase) => {
    const button = document.createElement("button");
    button.className = "voice-chip";
    button.type = "button";
    button.textContent = phrase;
    button.addEventListener("click", () => process(phrase));
    suggestions.append(button);
  });

  microphone.addEventListener("click", () => {
    clearProposal();
    responsePanel.hidden = true;
    alternatives.hidden = true;
    lastFinalText = "";
    transcript.value = "";
    controller.start();
  });
  stop.addEventListener("click", () => controller.stop());
  analyze.addEventListener("click", () => process(transcript.value));
  transcript.addEventListener("input", () => {
    if (currentProposal && transcript.value.trim() !== currentProposal.originalText?.trim()) clearProposal();
  });
  transcript.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") process(transcript.value);
  });
  correct.addEventListener("click", () => {
    transcript.focus();
    transcript.select();
    setStatus("Corrige la frase y presiona Analizar.", "idle");
    setLive("idle", "Corrige la transcripción", transcript.value);
  });
  cancel.addEventListener("click", () => {
    clearProposal();
    alternatives.hidden = true;
    transcript.value = "";
    setStatus("Acción cancelada. No se guardó nada.", "idle");
    showResponse("Acción cancelada. No se guardó ningún cambio.", { speak: false });
  });
  clearHistory.addEventListener("click", () => {
    history.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "voice-history-empty";
    empty.textContent = "Todavía no hay mensajes.";
    history.append(empty);
    responsePanel.hidden = true;
  });
  confirm.addEventListener("click", async () => {
    if (!currentProposal) return;
    confirm.disabled = true;
    setLive("processing", "Aplicando la acción", "Validando la propuesta antes de responder.");
    try {
      let response;
      if (currentProposal.intent.startsWith("query_") || currentProposal.intent === "read_pending_accounts") {
        response = onQuery(currentProposal.intent);
      } else {
        response = await onApply(currentProposal);
      }
      setStatus(response || "Acción aplicada.", "success");
      showResponse(response || "Acción aplicada.");
      clearProposal();
      alternatives.hidden = true;
      transcript.value = "";
    } catch (error) {
      const message = error.message || "No se pudo aplicar la acción.";
      setStatus(message, "error");
      showResponse(message, { speak: false });
      confirm.disabled = false;
    }
  });
}
