"use client";

import { useState } from "react";
import { useCart } from "./CartProvider";
import Icon from "./Icon";

export default function AddToCartButton({ id, name, price, type, image }: { id: string; name: string; price: string; type?: string; image?: string | null }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  function addProduct() { add({ id, name, price, type, image }); setAdded(true); window.setTimeout(() => setAdded(false), 1800); }
  return <button className={"cart-add " + (added ? "added" : "")} onClick={addProduct}>{added ? <>Agregado al carro <Icon name="check" bare /></> : "Agregar al carro +"}</button>;
}
