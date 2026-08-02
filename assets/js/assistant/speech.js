export function speechSupport() {
  return {
    recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    synthesis: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  };
}

export function createSpeechController({
  lang = "es-CL",
  onInterim = () => {},
  onFinal = () => {},
  onState = () => {},
  onError = () => {},
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
  recognition.maxAlternatives = 1;
  let active = false;

  recognition.onstart = () => {
    active = true;
    onState("listening");
  };
  recognition.onspeechend = () => recognition.stop();
  recognition.onend = () => {
    active = false;
    onState("idle");
  };
  recognition.onerror = (event) => {
    active = false;
    onState("error");
    const messages = {
      "not-allowed": "No se autorizó el micrófono.",
      "audio-capture": "No se encontró un micrófono disponible.",
      "no-speech": "No escuché una frase clara.",
      network: "El servicio de reconocimiento no respondió.",
    };
    onError(messages[event.error] ?? `Error de voz: ${event.error}`);
  };
  recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const recognized = event.results[index][0]?.transcript ?? "";
      if (event.results[index].isFinal) final += recognized;
      else interim += recognized;
    }
    if (interim) onInterim(interim.trim());
    if (final) onFinal(final.trim());
  };

  return {
    supported: true,
    start() {
      if (active) return;
      try {
        recognition.start();
      } catch (error) {
        onError(error.message);
      }
    },
    stop() {
      if (active) recognition.stop();
    },
  };
}

export function speakText(text, { lang = "es-CL", rate = 0.94 } = {}) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text));
  utterance.lang = lang;
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
  return true;
}
