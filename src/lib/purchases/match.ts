export type TrackedProduct = { id: string; name: string; code: string | null; unit: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Potrivire automată linie de factură → produs gestionat în stoc (după id, cod sau denumire). */
export function guessProduct(line: { name: string; productId: string | null }, products: TrackedProduct[]) {
  if (line.productId && products.some((p) => p.id === line.productId)) return line.productId;
  const n = norm(line.name);
  const byCode = products.find((p) => p.code && n.includes(norm(p.code)));
  if (byCode) return byCode.id;
  const byName = products.find((p) => {
    const pn = norm(p.name);
    return pn.length > 3 && (n.includes(pn) || pn.includes(n));
  });
  return byName?.id ?? null;
}
