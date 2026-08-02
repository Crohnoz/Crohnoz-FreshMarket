import test from "node:test";
import assert from "node:assert/strict";

import { products } from "../assets/js/data/demo-data.js";

test("todos los productos demo tienen imagen HTTPS y texto alternativo", () => {
  assert.ok(products.length > 0);
  products.forEach((product) => {
    assert.match(product.image, /^https:\/\//, `${product.name} debe usar una imagen HTTPS`);
    assert.ok(product.imageAlt?.trim().length >= 12, `${product.name} necesita texto alternativo descriptivo`);
    assert.ok(product.badge?.trim(), `${product.name} necesita una etiqueta comercial`);
  });
});

test("los identificadores e imágenes del catálogo no se duplican", () => {
  assert.equal(new Set(products.map((product) => product.id)).size, products.length);
  assert.equal(new Set(products.map((product) => product.image)).size, products.length);
});
