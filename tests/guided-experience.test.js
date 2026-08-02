import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("guided operator home exposes required task regions", async () => {
  const html = await text("operar.html");
  for (const id of [
    "operator-greeting",
    "operator-tasks",
    "task-search",
    "home-active-orders",
    "home-outstanding",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("guided shell is mounted globally through core assets", async () => {
  const config = await text("assets/js/core/config.js");
  const base = await text("assets/css/base.css");
  assert.match(config, /import\(["']\.\/guided-shell\.js["']\)/);
  assert.match(base, /@import url\(["']\.\/guided-shell\.css["']\)/);
});

test("Netlify exposes operator home and permits first-party voice", async () => {
  const netlify = await text("netlify.toml");
  assert.match(netlify, /from = "\/operar"\s+to = "\/operar\.html"/);
  assert.match(netlify, /microphone=\(self\)/);
  assert.doesNotMatch(netlify, /microphone=\(\)/);
});
