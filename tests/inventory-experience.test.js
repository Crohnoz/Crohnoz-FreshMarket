import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  lotRowMatches,
  movementRowMatches,
  summarizeMovementDraft,
  summarizeReceptionDraft,
} from "../assets/js/domain/inventory-experience.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("inventory drafts show progress before remote confirmation", () => {
  const incomplete = summarizeReceptionDraft({
    productLabel: "Selecciona un producto",
    receivedAt: "2026-08-03",
    quantity: "",
    unitCost: "",
  });
  assert.equal(incomplete.completed, 1);
  assert.equal(incomplete.ready, false);

  const reception = summarizeReceptionDraft({
    productLabel: "Palta Hass · $3.990 / kg",
    receivedAt: "2026-08-03",
    bestBefore: "2026-08-08",
    quantity: "8.5",
    unitCost: "2100",
    qualityLabel: "Buena",
  });
  assert.equal(reception.ready, true);
  assert.match(reception.detail, /Palta Hass/);
  assert.match(reception.detail, /Fecha preferente/);

  const movement = summarizeMovementDraft({
    lotLabel: "Palta Hass · 8,5 kg · FEFO primero",
    movementLabel: "Merma",
    quantity: "0.5",
    reason: "Producto golpeado",
    reference: "MERMA-04",
  });
  assert.equal(movement.ready, true);
  assert.match(movement.detail, /Producto golpeado/);

  assert.equal(summarizeMovementDraft({
    lotLabel: "Lote",
    movementLabel: "Ajuste",
    quantity: "0",
    reason: "Conteo",
    adjustment: true,
  }).ready, true);
});

test("inventory filters preserve clear FEFO, risk and history semantics", () => {
  assert.equal(lotRowMatches({
    text: "Palta Buena versión 2 FEFO primero",
    riskLevel: "success",
    filter: "fefo",
  }), true);
  assert.equal(lotRowMatches({
    text: "Tomate Dañada",
    riskLevel: "danger",
    filter: "damaged",
  }), true);
  assert.equal(lotRowMatches({
    text: "Tomate crítico",
    riskLevel: "danger",
    filter: "danger",
    query: "palta",
  }), false);
  assert.equal(movementRowMatches({
    text: "Palta Merma Producto golpeado Carmelo",
    typeText: "Merma",
    filter: "waste",
    query: "carmelo",
  }), true);
  assert.equal(movementRowMatches({
    text: "Palta Consumo Pedido FM-01",
    typeText: "Consumo",
    filter: "adjustment",
  }), false);
});

test("remote inventory mounts guided tasks before operational handlers", async () => {
  const html = await text("inventario-remoto.html");
  const experience = await text("assets/js/remote-inventory/experience.js");
  for (const id of [
    "remote-lot-filter",
    "remote-movement-search",
    "remote-movement-filter",
    "remote-reception-draft-count",
    "remote-movement-draft-count",
    "remote-lot-visible-count",
    "remote-movement-visible-count",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));

  assert.match(html, /Una tarea a la vez/i);
  assert.match(html, /data-inventory-view="reception"/);
  assert.match(html, /data-inventory-view="history"/);
  assert.match(html, /Revisar y registrar recepción/);
  assert.match(html, /Revisar y registrar movimiento/);
  assert.ok(
    html.indexOf("assets/js/remote-inventory/experience.js")
      < html.indexOf("assets/js/remote-inventory/app.js"),
  );
  assert.match(experience, /confirmAction/);
  assert.match(experience, /stopImmediatePropagation/);
  assert.match(experience, /dataset\.label/);
  assert.doesNotMatch(experience, /writeStorage|localStorage\.setItem/);
});

test("guided inventory assets are valid and cached", async () => {
  for (const path of [
    "assets/js/domain/inventory-experience.js",
    "assets/js/remote-inventory/experience.js",
  ]) execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);

  const worker = await text("sw.js");
  const css = await text("assets/css/remote-inventory.css");
  assert.match(worker, /crohnoz-fresh-market-v12/);
  assert.match(worker, /assets\/js\/remote-inventory\/experience\.js/);
  assert.match(worker, /assets\/js\/domain\/inventory-experience\.js/);
  assert.match(css, /inventory-task-tabs/);
  assert.match(css, /attr\(data-label\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
