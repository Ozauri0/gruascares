import { describe, expect, test } from "bun:test";
import type { Product } from "./catalog";
import { categoriesOf, EMPTY_FILTERS, filterProducts, hasActiveFilters, normalize, storeCategories } from "./catalog-filter";

const make = (over: Partial<Product>): Product => ({ id: "1", name: "Producto", text: "", price: 1000, stock: 10, category: "General", tag: null, art: "oil", image: null, featured: false, active: true, ...over });

const products = [
  make({ id: "a", name: "Batería 12V 75Ah", text: "Para auto", category: "Baterías", stock: 3 }),
  make({ id: "b", name: "Aceite de motor 15W40", text: "Para camión", category: "Lubricantes", stock: 20 }),
  make({ id: "c", name: "Neumático camión 295", text: "Radial", category: "Neumáticos", stock: 0, active: false }),
];
const ids = (list: Product[]) => list.map((p) => p.id);

describe("filterProducts", () => {
  test("sin filtros devuelve todo", () => {
    expect(ids(filterProducts(products, EMPTY_FILTERS))).toEqual(["a", "b", "c"]);
  });

  test("la búsqueda ignora tildes y mayúsculas", () => {
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, query: "BATERIA" }))).toEqual(["a"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, query: "neumatico" }))).toEqual(["c"]);
  });

  test("todas las palabras deben coincidir, en nombre, descripción o categoría", () => {
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, query: "camion" }))).toEqual(["b", "c"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, query: "camion aceite" }))).toEqual(["b"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, query: "lubricantes" }))).toEqual(["b"]);
    expect(filterProducts(products, { ...EMPTY_FILTERS, query: "inexistente" })).toEqual([]);
  });

  test("filtra por categoría, stock y visibilidad", () => {
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, category: "Baterías" }))).toEqual(["a"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, stock: "bajo" }))).toEqual(["a"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, stock: "sin-stock" }))).toEqual(["c"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, stock: "con-stock" }))).toEqual(["a", "b"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, visibility: "ocultos" }))).toEqual(["c"]);
    expect(ids(filterProducts(products, { ...EMPTY_FILTERS, visibility: "visibles", query: "camion" }))).toEqual(["b"]);
  });
});

test("categoriesOf, normalize y hasActiveFilters", () => {
  expect(categoriesOf(products)).toEqual(["Baterías", "Lubricantes", "Neumáticos"]);
  expect(normalize("  Batería ")).toBe("bateria");
  expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  expect(hasActiveFilters({ ...EMPTY_FILTERS, query: " x " })).toBe(true);
  expect(hasActiveFilters({ ...EMPTY_FILTERS, stock: "bajo" })).toBe(true);
});

describe("storeCategories", () => {
  const list = [
    make({ id: "1", category: "Neumáticos", stock: 2 }),
    make({ id: "2", category: "Baterías", stock: 5 }),
    make({ id: "3", category: "Filtros", stock: 0 }), // sin stock: ya fuera de la lista de productos
  ];
  const shown = list.filter((p) => p.stock > 0);

  test("sigue el orden del servidor y omite categorías sin productos visibles", () => {
    expect(storeCategories(shown, ["Filtros", "Baterías", "Neumáticos"])).toEqual(["Baterías", "Neumáticos"]);
  });

  test("sin lista del servidor usa las categorías de los productos, alfabéticas", () => {
    expect(storeCategories(shown, null)).toEqual(["Baterías", "Neumáticos"]);
  });

  test("las categorías que el servidor no informa quedan al final", () => {
    const extra = [...shown, make({ id: "4", category: "Aceites", stock: 1 })];
    expect(storeCategories(extra, ["Neumáticos"])).toEqual(["Neumáticos", "Aceites", "Baterías"]);
  });
});
