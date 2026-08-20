"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type CartProduct = { id: string; name: string; price: string; type?: string; quantity: number };
type CartContextValue = { items: CartProduct[]; count: number; add: (product: Omit<CartProduct, "quantity">) => void; remove: (id: string) => void; clear: () => void };
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartProduct[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("gruas-cares-cart");
    if (saved) setItems(JSON.parse(saved));
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem("gruas-cares-cart", JSON.stringify(items)); }, [items, hydrated]);
  const value = useMemo(() => ({
    items,
    count: items.reduce((total, item) => total + item.quantity, 0),
    add: (product: Omit<CartProduct, "quantity">) => setItems((current) => {
      const found = current.find((item) => item.id === product.id);
      return found ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }];
    }),
    remove: (id: string) => setItems((current) => current.filter((item) => item.id !== id)),
    clear: () => setItems([]),
  }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
