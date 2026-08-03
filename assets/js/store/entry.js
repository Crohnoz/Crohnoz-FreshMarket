import { products } from "../data/demo-data.js";
import { expandedCatalogProducts } from "../data/expanded-catalog.js";

const knownProductIds = new Set(products.map((product) => product.id));
for (const product of expandedCatalogProducts) {
  if (!knownProductIds.has(product.id)) {
    products.push(product);
    knownProductIds.add(product.id);
  }
}

await import("./app.js");
