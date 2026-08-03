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

function catalogSearchScore(product, normalizedQuery) {
  if (!normalizedQuery) return 0;
  const name = normalizeCatalogText(product.name);
  const nameWords = name.split(/\s+/).filter(Boolean);
  const terms = (product.searchTerms ?? []).map(normalizeCatalogText);
  const fullText = productSearchText(product);

  if (name === normalizedQuery) return 120;
  if (terms.includes(normalizedQuery)) return 110;
  if (nameWords.includes(normalizedQuery)) return 100;
  if (name.startsWith(normalizedQuery)) return 90;
  if (terms.some((term) => term.startsWith(normalizedQuery))) return 80;
  if (nameWords.some((word) => word.startsWith(normalizedQuery))) return 70;
  if (name.includes(normalizedQuery)) return 40;
  if (terms.some((term) => term.includes(normalizedQuery))) return 30;
  return fullText.includes(normalizedQuery) ? 10 : -1;
}

export function filterCatalogProducts(products, { category = "all", query = "" } = {}) {
  const normalizedQuery = normalizeCatalogText(query);
  const categoryMatches = products.filter((product) => category === "all" || product.category === category);
  if (!normalizedQuery) return categoryMatches;

  return categoryMatches
    .map((product, originalIndex) => ({
      product,
      originalIndex,
      score: catalogSearchScore(product, normalizedQuery),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex)
    .map((candidate) => candidate.product);
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
