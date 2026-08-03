import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  chooseVoiceCandidate,
  interpretVoiceCommand,
} from "../assets/js/assistant/voice-intents.js";

test("Chilean retail variants normalize into safe operational intents", () => {
  const charge = interpretVoiceCommand("Rosa fiao quince lucas");
  assert.equal(charge.intent, "charge");
  assert.equal(charge.data.customerName, "Rosa");
  assert.equal(charge.data.amount, 15000);

  const payment = interpretVoiceCommand("Pedro pagó cinco luquitas");
  assert.equal(payment.intent, "payment");
  assert.equal(payment.data.amount, 5000);
});

test("candidate ranking prefers the alternative that forms a complete operation", () => {
  const chosen = chooseVoiceCandidate([
    { transcript: "Pedro vino cinco lucas", confidence: 0.92 },
    { transcript: "Pedro abonó cinco lucas", confidence: 0.72 },
    { transcript: "Pedro habló cinco lucas", confidence: 0.61 },
  ]);
  assert.equal(chosen.text, "Pedro abonó cinco lucas");
  assert.equal(chosen.parsed.intent, "payment");
  assert.equal(chosen.parsed.data.amount, 5000);
  assert.equal(chosen.alternatives.length, 3);
});

test("voice copilot exposes live transcript, written response and session history", async () => {
  const [speech, copilot, css, worker] = await Promise.all([
    readFile(new URL("../assets/js/assistant/speech.js", import.meta.url), "utf8"),
    readFile(new URL("../assets/js/accounts/voice-copilot.js", import.meta.url), "utf8"),
    readFile(new URL("../assets/css/voice-copilot-v2.css", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(speech, /maxAlternatives = 3/);
  assert.match(speech, /interimResults = true/);
  assert.match(speech, /speechEndDelayMs = 650/);
  assert.match(copilot, /id="voice-live-text"/);
  assert.match(copilot, /id="voice-response-text"/);
  assert.match(copilot, /id="voice-history"/);
  assert.match(copilot, /chooseVoiceCandidate/);
  assert.match(copilot, /ninguna acción se guarda sin confirmación humana/i);
  assert.match(css, /\.voice-message-user/);
  assert.match(css, /min-height:\s*56px/);
  assert.match(worker, /\/assets\/css\/voice-copilot-v2\.css/);
  assert.match(worker, /\/assets\/js\/accounts\/voice-copilot\.js/);
});

test("voice scripts pass syntax validation", () => {
  execFileSync(process.execPath, ["--check", "assets/js/assistant/speech.js"]);
  execFileSync(process.execPath, ["--check", "assets/js/assistant/voice-intents.js"]);
  execFileSync(process.execPath, ["--check", "assets/js/accounts/voice-copilot.js"]);
});
