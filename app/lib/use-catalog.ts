"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "./catalog";
import { createProduct, deleteProduct, listAdminCatalog, listPublicCatalog, updateProduct, type NewProduct, type ProductPatch } from "./catalog-api";

/** Catálogo público (solo lectura). */
export function usePublicCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listPublicCatalog(controller.signal)
      .then(setProducts)
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { products, loading, error, reload };
}

/** Catálogo completo para el administrador, con alta, edición y baja. */
export function useAdminCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await listAdminCatalog());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(async (input: NewProduct) => {
    const created = await createProduct(input);
    setProducts((current) => [...current, created]);
  }, []);

  const patch = useCallback(async (id: string, change: ProductPatch) => {
    const updated = await updateProduct(id, change);
    setProducts((current) => current.map((item) => (item.id === id ? updated : item)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteProduct(id);
    setProducts((current) => current.filter((item) => item.id !== id));
  }, []);

  return { products, loading, error, reload, add, patch, remove };
}
