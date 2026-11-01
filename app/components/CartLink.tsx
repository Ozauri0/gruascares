"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";

export default function CartLink() {
  const { count } = useCart();
  return <Link className="cart-link" href="/carro">Carro <b>{count}</b></Link>;
}
