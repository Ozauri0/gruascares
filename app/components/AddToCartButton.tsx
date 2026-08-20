"use client";

import { useState } from "react";
import { useCart } from "./CartProvider";

export default function AddToCartButton({ id, name, price, type }: { id: string; name: string; price: string; type?: string }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  function addProduct() { add({ id, name, price, type }); setAdded(true); window.setTimeout(() => setAdded(false), 1800); }
  return <button className={"cart-add " + (added ? "added" : "")} onClick={addProduct}>{added ? "Agregado al carro ✓" : "Agregar al carro +"}</button>;
}
