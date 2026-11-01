import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { siteContent, siteContentDraft } from "../db/schema.js";
import { config } from "../config/env.js";
import { logAudit } from "../services/audit/audit.service.js";

const KEY_REGEX = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const MAX_KEYS_PER_REQUEST = 300;
const MAX_VALUE_LENGTH = 2000;
const UPLOAD_URL_REGEX = /^\/api\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

/** Imagen de contenido: ruta local /images/… o una imagen subida por el admin (la CSP del sitio solo admite orígenes propios). */
export function isAllowedContentImage(value: string): boolean {
  if (value.length > 300 || /[\s"'<>\\]/.test(value)) return false;
  if (value.startsWith("/images/")) return !value.includes("..");
  return UPLOAD_URL_REGEX.test(value);
}

/**
 * GET /api/content (público)
 * Valores editados por el administrador; las claves que no aparecen usan el texto o imagen original del frontend.
 */
export async function getPublicContent(_req: Request, res: Response) {
  try {
    const rows = await db.select({ key: siteContent.key, value: siteContent.value }).from(siteContent);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ content: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  } catch (error) {
    console.error("Error al leer el contenido del sitio:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar el contenido del sitio" });
  }
}

type Parsed = { upserts: { key: string; value: string }[]; resets: string[] };

/** Valida el cuerpo `{ values }` de los guardados de contenido (claves, tamaños, imágenes permitidas). */
function parseValues(body: unknown): Parsed | { error: string } {
  const values = (body as { values?: unknown } | undefined)?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return { error: "El cuerpo debe incluir 'values' (objeto clave → valor)" };
  const entries = Object.entries(values as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_KEYS_PER_REQUEST) return { error: `Envía entre 1 y ${MAX_KEYS_PER_REQUEST} valores` };

  const upserts: Parsed["upserts"] = [];
  const resets: string[] = [];
  for (const [key, raw] of entries) {
    if (!KEY_REGEX.test(key)) return { error: `Clave inválida: '${key}'` };
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      resets.push(key);
      continue;
    }
    if (typeof raw !== "string") return { error: `El valor de '${key}' debe ser texto o null` };
    const value = raw.trim();
    if (value.length > MAX_VALUE_LENGTH) return { error: `El valor de '${key}' supera ${MAX_VALUE_LENGTH} caracteres` };
    if (key.endsWith(".image") && !isAllowedContentImage(value)) {
      return { error: `La imagen de '${key}' debe ser una de la galería (/images/…) o una imagen subida` };
    }
    upserts.push({ key, value });
  }
  return { upserts, resets };
}

/**
 * PUT /api/admin/content
 * Guarda varios textos o imágenes a la vez directamente en lo publicado. Un valor `null` o vacío restaura el original.
 */
export async function updateContent(req: Request, res: Response) {
  try {
    const parsed = parseValues(req.body);
    if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
    const { upserts, resets } = parsed;

    await db.transaction(async (tx) => {
      if (resets.length > 0) await tx.delete(siteContent).where(inArray(siteContent.key, resets));
      for (const item of upserts) {
        await tx
          .insert(siteContent)
          .values({ ...item, updatedBy: req.user!.userId })
          .onConflictDoUpdate({
            target: siteContent.key,
            set: { value: item.value, updatedBy: req.user!.userId, updatedAt: sql`now()` },
          });
      }
    });

    logAudit({
      action: "CONTENT_UPDATED",
      entityType: "site_content",
      details: { updated: upserts.map((u) => u.key), reset: resets },
      req,
    });
    return res.json({ message: "Contenido guardado", updated: upserts.length, reset: resets.length });
  } catch (error) {
    console.error("Error al guardar el contenido del sitio:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al guardar el contenido" });
  }
}

/**
 * GET /api/admin/content/draft
 * Lo publicado y el borrador pendiente (`draft`: clave → valor, o null si el borrador vuelve al original).
 */
export async function getDraft(_req: Request, res: Response) {
  try {
    const [published, drafts] = await Promise.all([
      db.select({ key: siteContent.key, value: siteContent.value }).from(siteContent),
      db.select({ key: siteContentDraft.key, value: siteContentDraft.value }).from(siteContentDraft),
    ]);
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      published: Object.fromEntries(published.map((r) => [r.key, r.value])),
      draft: Object.fromEntries(drafts.map((r) => [r.key, r.value])),
    });
  } catch (error) {
    console.error("Error al leer el borrador del contenido:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al consultar el borrador" });
  }
}

/**
 * PUT /api/admin/content/draft
 * Guarda cambios en el borrador (no se ven en el sitio público hasta publicar). Un valor `null` o vacío vuelve al
 * original; lo que queda igual a lo publicado se quita del borrador.
 */
export async function saveDraft(req: Request, res: Response) {
  try {
    const parsed = parseValues(req.body);
    if ("error" in parsed) return res.status(400).json({ error: "Bad Request", message: parsed.error });
    const { upserts, resets } = parsed;

    await db.transaction(async (tx) => {
      const keys = [...upserts.map((u) => u.key), ...resets];
      const published = new Map(
        (await tx.select({ key: siteContent.key, value: siteContent.value }).from(siteContent).where(inArray(siteContent.key, keys))).map((r) => [r.key, r.value])
      );
      const drop: string[] = [];
      for (const item of upserts) {
        if (published.get(item.key) === item.value) {
          drop.push(item.key);
          continue;
        }
        await tx
          .insert(siteContentDraft)
          .values({ ...item, updatedBy: req.user!.userId })
          .onConflictDoUpdate({ target: siteContentDraft.key, set: { value: item.value, updatedBy: req.user!.userId, updatedAt: sql`now()` } });
      }
      for (const key of resets) {
        if (!published.has(key)) {
          drop.push(key); // ya es el original
          continue;
        }
        await tx
          .insert(siteContentDraft)
          .values({ key, value: null, updatedBy: req.user!.userId })
          .onConflictDoUpdate({ target: siteContentDraft.key, set: { value: null, updatedBy: req.user!.userId, updatedAt: sql`now()` } });
      }
      if (drop.length > 0) await tx.delete(siteContentDraft).where(inArray(siteContentDraft.key, drop));
    });

    logAudit({ action: "CONTENT_DRAFT_SAVED", entityType: "site_content", details: { keys: [...upserts.map((u) => u.key), ...resets] }, req });
    return res.json({ message: "Borrador guardado" });
  } catch (error) {
    console.error("Error al guardar el borrador del contenido:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al guardar el borrador" });
  }
}

/** POST /api/admin/content/publish: pasa todo el borrador a lo publicado (visible para el público) y lo vacía. */
export async function publishDraft(req: Request, res: Response) {
  try {
    const published = await db.transaction(async (tx) => {
      const drafts = await tx.select().from(siteContentDraft);
      for (const d of drafts) {
        if (d.value === null) await tx.delete(siteContent).where(eq(siteContent.key, d.key));
        else
          await tx
            .insert(siteContent)
            .values({ key: d.key, value: d.value, updatedBy: req.user!.userId })
            .onConflictDoUpdate({ target: siteContent.key, set: { value: d.value, updatedBy: req.user!.userId, updatedAt: sql`now()` } });
      }
      await tx.delete(siteContentDraft);
      return drafts.map((d) => d.key);
    });
    logAudit({ action: "CONTENT_PUBLISHED", entityType: "site_content", details: { keys: published }, req });
    return res.json({ message: "Contenido publicado", published: published.length });
  } catch (error) {
    console.error("Error al publicar el contenido:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al publicar el contenido" });
  }
}

/** DELETE /api/admin/content/draft: descarta el borrador; el sitio público no cambia. */
export async function discardDraft(req: Request, res: Response) {
  try {
    const removed = await db.delete(siteContentDraft).returning({ key: siteContentDraft.key });
    logAudit({ action: "CONTENT_DRAFT_DISCARDED", entityType: "site_content", details: { keys: removed.map((r) => r.key) }, req });
    return res.json({ message: "Borrador descartado", discarded: removed.length });
  } catch (error) {
    console.error("Error al descartar el borrador del contenido:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al descartar el borrador" });
  }
}

const SIGNATURES: { ext: "png" | "jpg" | "webp"; matches: (b: Buffer) => boolean }[] = [
  { ext: "png", matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", matches: (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

/**
 * POST /api/admin/uploads
 * Cuerpo binario (Content-Type image/png | image/jpeg | image/webp, máx. 5 MB). Se valida el contenido real del
 * archivo (no solo el tipo declarado) y se guarda con un nombre aleatorio.
 */
export async function uploadImage(req: Request, res: Response) {
  try {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return res.status(415).json({ error: "Unsupported Media Type", message: "Sube una imagen PNG, JPG o WebP (máx. 5 MB)" });
    }
    const kind = SIGNATURES.find((s) => s.matches(body));
    if (!kind) {
      return res.status(415).json({ error: "Unsupported Media Type", message: "El archivo no es una imagen PNG, JPG o WebP válida" });
    }
    const name = `${crypto.randomUUID()}.${kind.ext}`;
    await fs.mkdir(config.uploadsDir, { recursive: true });
    await fs.writeFile(path.join(config.uploadsDir, name), body, { flag: "wx" });
    const url = `/api/uploads/${name}`;
    logAudit({ action: "IMAGE_UPLOADED", entityType: "upload", entityId: name, details: { bytes: body.length }, req });
    return res.status(201).json({ url });
  } catch (error) {
    console.error("Error al subir imagen:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Error al guardar la imagen" });
  }
}
