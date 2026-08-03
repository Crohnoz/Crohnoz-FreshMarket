export const CATALOG_PAGE_SIZE = 12;

export function normalizeCatalogText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function productSearchText(product) {
  return normalizeCatalogText([
    product.name,
    product.description,
    product.badge,
    ...(product.searchTerms ?? []),
  ].join(" "));
}

export function filterCatalogProducts(products, { category = "all", query = "" } = {}) {
  const normalizedQuery = normalizeCatalogText(query);
  return products.filter((product) => {
    const categoryMatches = category === "all" || product.category === category;
    const queryMatches = !normalizedQuery || productSearchText(product).includes(normalizedQuery);
    return categoryMatches && queryMatches;
  });
}

export function categoryProductCounts(products, categories) {
  return Object.fromEntries(categories.map((category) => [
    category.id,
    category.id === "all"
      ? products.length
      : products.filter((product) => product.category === category.id).length,
  ]));
}

export function paginateCatalog(products, limit = CATALOG_PAGE_SIZE) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  return {
    visible: products.slice(0, safeLimit),
    total: products.length,
    remaining: Math.max(0, products.length - safeLimit),
  };
}
