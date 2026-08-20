"use client";

import { useCart } from "./CartProvider";

export default function CartLink() {
  const { count } = useCart();
  return <a className="cart-link" href="/carro">Carro <b>{count}</b></a>;
}
