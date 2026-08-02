import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("la CSP permite solo los hosts visuales aprobados", async () => {
  const netlify = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");
  assert.match(netlify, /img-src 'self' data: blob: https:\/\/images\.pexels\.com https:\/\/images\.unsplash\.com;/);
  assert.doesNotMatch(netlify, /img-src[^\n]*\*/);
});
