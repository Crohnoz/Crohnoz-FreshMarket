export function speechSupport() {
  return {
    recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    synthesis: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  };
}

function recognitionAlternatives(result) {
  return Array.from(result ?? [])
    .map((alternative) => ({
      transcript: String(alternative?.transcript ?? "").trim(),
      confidence: Number.isFinite(alternative?.confidence) ? alternative.confidence : null,
    }))
    .filter((alternative) => alternative.transcript);
}

export function createSpeechController({
  lang = "es-CL",
  onInterim = () => {},
  onFinal = () => {},
  onState = () => {},
  onError = () => {},
  speechEndDelayMs = 650,
} = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    return {
      supported: false,
      start() { onError("Este navegador no ofrece reconocimiento de voz."); },
      stop() {},
    };
  }

  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  let active = false;
  let committedText = "";
  let speechEndTimer = null;

  function clearSpeechEndTimer() {
    if (speechEndTimer) window.clearTimeout(speechEndTimer);
    speechEndTimer = null;
  }

  function stopAfterSpeech() {
    clearSpeechEndTimer();
    speechEndTimer = window.setTimeout(() => {
      if (active) recognition.stop();
    }, speechEndDelayMs);
  }

  recognition.onstart = () => {
    active = true;
    committedText = "";
    onState("listening");
  };
  recognition.onspeechstart = clearSpeechEndTimer;
  recognition.onspeechend = stopAfterSpeech;
  recognition.onend = () => {
    clearSpeechEndTimer();
    active = false;
    onState("idle");
  };
  recognition.onerror = (event) => {
    clearSpeechEndTimer();
    active = false;
    onState("error");
    const messages = {
      "not-allowed": "No se autorizó el micrófono.",
      "service-not-allowed": "El navegador bloqueó el servicio de reconocimiento.",
      "audio-capture": "No se encontró un micrófono disponible.",
      "no-speech": "No escuché una frase clara. Acércate al micrófono e inténtalo nuevamente.",
      network: "El servicio de reconocimiento no respondió. Puedes escribir o usar el dictado del teclado.",
      aborted: "La escucha fue detenida.",
    };
    onError(messages[event.error] ?? `Error de voz: ${event.error}`);
  };
  recognition.onresult = (event) => {
    let interim = "";
    let latestAlternatives = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternatives = recognitionAlternatives(result);
      const recognized = alternatives[0]?.transcript ?? "";
      if (result.isFinal) {
        committedText = [committedText, recognized].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        latestAlternatives = alternatives;
      } else {
        interim = [interim, recognized].filter(Boolean).join(" ");
      }
    }
    const visibleText = [committedText, interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (visibleText) onInterim(visibleText, { committedText, interimText: interim.trim() });
    if (committedText && latestAlternatives.length) {
      onState("processing");
      onFinal(committedText, {
        alternatives: latestAlternatives,
        confidence: latestAlternatives[0]?.confidence ?? null,
      });
    }
  };

  return {
    supported: true,
    start() {
      if (active) return;
      clearSpeechEndTimer();
      committedText = "";
      onState("requesting");
      try {
        recognition.start();
      } catch (error) {
        onState("error");
        onError(error.message || "No se pudo iniciar el micrófono.");
      }
    },
    stop() {
      clearSpeechEndTimer();
      if (active) recognition.stop();
    },
  };
}

export function speakText(text, {
  lang = "es-CL",
  rate = 0.94,
  onStart = () => {},
  onEnd = () => {},
} = {}) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}
