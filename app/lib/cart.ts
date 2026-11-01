/** Tope por producto cuando no se conoce el stock (el stock del catálogo es referencial). */
export const MAX_CART_QUANTITY = 99;

/** Máximo que se puede pedir de un producto: su stock conocido o, si no se sabe, el tope general. */
export function maxQuantity(stock?: number): number {
  return stock && stock > 0 ? Math.min(stock, MAX_CART_QUANTITY) : MAX_CART_QUANTITY;
}

/** Cantidad válida para un producto del carro: entera, entre 1 y el stock conocido (o el tope general). */
export function clampQuantity(value: number, stock?: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(maxQuantity(stock), Math.max(1, Math.trunc(value)));
}
