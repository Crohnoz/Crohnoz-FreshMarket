import { formatCLP } from "../core/format.js";
import { intentLabel, interpretVoiceCommand } from "../assistant/voice-intents.js";
import { createSpeechController, speakText, speechSupport } from "../assistant/speech.js";

function ensureVoiceRoot() {
  let root = document.querySelector("#voice-copilot");
  if (root) return root;
  root = document.createElement("section");
  root.id = "voice-copilot";
  root.className = "card voice-copilot";
  root.innerHTML = `
    <div class="voice-copilot-header">
      <div>
        <p class="eyebrow">Copiloto operacional</p>
        <h2>Dime lo que pasó</h2>
        <p>Habla con tus palabras. El sistema propone una acción y solo guarda cuando tú confirmas.</p>
      </div>
      <label class="voice-readback"><input id="voice-readback" type="checkbox" checked> Leer respuesta en voz alta</label>
    </div>
    <div class="voice-controls">
      <button class="button primary voice-main-button" id="voice-start" type="button">🎙 Hablar</button>
      <button class="button secondary" id="voice-stop" type="button">Detener</button>
      <span class="voice-status" id="voice-status" role="status" aria-live="polite">Listo para escuchar.</span>
    </div>
    <label class="voice-transcript-label">Lo que entendí
      <textarea id="voice-transcript" rows="3" placeholder="Ej.: Anótale a Rosa quince mil de fiado"></textarea>
    </label>
    <div class="voice-secondary-actions">
      <button class="button secondary" id="voice-analyze" type="button">Analizar frase</button>
      <small>También puedes usar el dictado del teclado del teléfono.</small>
    </div>
    <div class="voice-suggestions">
      <strong>Prueba diciendo:</strong>
      <div id="voice-suggestions"></div>
    </div>
    <div class="voice-proposal" id="voice-proposal" hidden>
      <div>
        <p class="eyebrow">Propuesta del copiloto</p>
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
    <div class="voice-privacy">
      <strong>Privacidad:</strong> el micrófono se activa solo al presionar Hablar. El reconocimiento puede depender del servicio de voz del navegador. No uses datos reales sensibles en esta demo.
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
  const support = speechSupport();
  let currentProposal = null;

  function say(text) {
    if (speakToggle.checked && support.synthesis) speakText(text);
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
    say(`${proposalText.textContent} ${proposalMissing.textContent}`);
  }

  function process(text) {
    transcript.value = text;
    const parsed = interpretVoiceCommand(text);
    renderProposal(parsed);
    setStatus(
      parsed.intent === "unknown"
        ? "No entendí la instrucción. Puedes corregirla o usar un ejemplo."
        : "Entendido. Revisa la propuesta antes de confirmar.",
      parsed.intent === "unknown" ? "warning" : "ready",
    );
  }

  const controller = createSpeechController({
    lang: "es-CL",
    onInterim(value) {
      transcript.value = value;
      setStatus("Escuchando…", "listening");
    },
    onFinal(value) {
      process(value);
    },
    onState(state) {
      microphone.disabled = state === "listening";
      stop.disabled = state !== "listening";
      if (state === "idle" && !currentProposal) setStatus("Listo para escuchar.", "idle");
    },
    onError(message) {
      setStatus(message, "error");
      microphone.disabled = !support.recognition;
      stop.disabled = true;
    },
  });

  microphone.disabled = !controller.supported;
  stop.disabled = true;
  if (!controller.supported) {
    setStatus("Este navegador no reconoce voz. Puedes dictar con el teclado del teléfono o escribir la frase.", "warning");
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
    setStatus("Pide permiso y comienza a hablar.", "listening");
    controller.start();
  });
  stop.addEventListener("click", () => controller.stop());
  analyze.addEventListener("click", () => process(transcript.value));
  transcript.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") process(transcript.value);
  });
  correct.addEventListener("click", () => {
    transcript.focus();
    transcript.select();
    setStatus("Corrige la frase y presiona Analizar.", "idle");
  });
  cancel.addEventListener("click", () => {
    clearProposal();
    transcript.value = "";
    setStatus("Acción cancelada. No se guardó nada.", "idle");
  });
  confirm.addEventListener("click", async () => {
    if (!currentProposal) return;
    confirm.disabled = true;
    try {
      let response;
      if (currentProposal.intent.startsWith("query_") || currentProposal.intent === "read_pending_accounts") {
        response = onQuery(currentProposal.intent);
      } else {
        response = await onApply(currentProposal);
      }
      setStatus(response || "Acción aplicada.", "success");
      say(response || "Acción aplicada.");
      clearProposal();
      transcript.value = "";
    } catch (error) {
      setStatus(error.message || "No se pudo aplicar la acción.", "error");
      confirm.disabled = false;
    }
  });
}
