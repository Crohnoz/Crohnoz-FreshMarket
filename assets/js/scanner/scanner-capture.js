export function analyzeSequence(timestamps, thresholdMs = 60) {
  if (!Array.isArray(timestamps) || timestamps.length < 2) {
    return { durationMs: 0, averageIntervalMs: 0, likelyScanner: false };
  }
  const intervals = timestamps.slice(1).map((time, index) => Math.max(0, time - timestamps[index]));
  const durationMs = Math.max(0, timestamps.at(-1) - timestamps[0]);
  const averageIntervalMs = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  return {
    durationMs: Math.round(durationMs),
    averageIntervalMs: Number(averageIntervalMs.toFixed(2)),
    likelyScanner: averageIntervalMs <= thresholdMs,
  };
}

export function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return target.matches("input, textarea, select, [contenteditable='true']");
}

export function createScannerCapture(options = {}) {
  let settings = {
    thresholdMs: 60,
    idleTimeoutMs: 120,
    minLength: 4,
    terminator: "Enter",
    duplicateWindowMs: 900,
    captureInInputs: false,
    ...options,
  };

  let buffer = "";
  let timestamps = [];
  let idleTimer = null;
  let active = false;
  let lastAccepted = { code: "", at: 0 };

  const clearBuffer = () => {
    buffer = "";
    timestamps = [];
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = null;
  };

  const finalize = (terminator = "timeout") => {
    if (!buffer) return;
    const code = buffer;
    const timing = analyzeSequence(timestamps, settings.thresholdMs);
    const now = Date.now();
    const duplicate = code === lastAccepted.code && now - lastAccepted.at <= settings.duplicateWindowMs;
    const accepted = code.length >= settings.minLength && timing.likelyScanner && !duplicate;
    const payload = {
      code,
      terminator,
      duplicate,
      accepted,
      ...timing,
      capturedAt: new Date().toISOString(),
    };
    if (accepted) lastAccepted = { code, at: now };
    clearBuffer();
    settings.onScan?.(payload);
  };

  const scheduleTimeout = () => {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => finalize("timeout"), settings.idleTimeoutMs);
  };

  const onKeyDown = (event) => {
    settings.onEvent?.(event);
    if (!active || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (!settings.captureInInputs && isEditableTarget(event.target)) return;

    const isConfiguredTerminator = settings.terminator !== "none" && event.key === settings.terminator;
    if (isConfiguredTerminator) {
      event.preventDefault();
      finalize(event.key);
      return;
    }

    if (event.key.length !== 1) return;
    buffer += event.key;
    timestamps.push(performance.now());
    scheduleTimeout();
  };

  return {
    start() {
      if (active) return;
      active = true;
      window.addEventListener("keydown", onKeyDown, true);
      settings.onStatus?.(true);
    },
    stop() {
      if (!active) return;
      active = false;
      window.removeEventListener("keydown", onKeyDown, true);
      clearBuffer();
      settings.onStatus?.(false);
    },
    update(next) {
      settings = { ...settings, ...next };
    },
    processManual(code) {
      const now = performance.now();
      buffer = String(code ?? "");
      timestamps = [...buffer].map((_, index) => now + index * 10);
      finalize("manual");
    },
    isActive() {
      return active;
    },
  };
}
