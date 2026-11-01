import { MAX_LEN } from "./validate.js";

/** Qué traslada una grúa. Se guarda el valor (clave) y el frontend muestra la etiqueta. */
export const CARGO_TYPES = ["auto", "camioneta", "camion", "contenedor", "maquinaria", "otro"] as const;
export type CargoType = (typeof CARGO_TYPES)[number];

export const CARGO_LABEL: Record<CargoType, string> = {
  auto: "Auto",
  camioneta: "Camioneta o SUV",
  camion: "Camión",
  contenedor: "Contenedor",
  maquinaria: "Maquinaria",
  otro: "Otro",
};

export type Transfer = { cargoType: CargoType | null; destination: string | null; cargoDetails: string | null };

const NO_TRANSFER: Transfer = { cargoType: null, destination: null, cargoDetails: null };

/**
 * Datos propios de una solicitud de grúa (#141): qué se traslada, a dónde (el origen es el lugar de la solicitud) y
 * los datos de la carga. Para servicios que no son de grúa se descartan. Devuelve el mensaje de error si falta algo.
 */
export function parseTransfer(
  isCrane: boolean,
  input: { cargoType?: unknown; destination?: unknown; cargoDetails?: unknown; location?: unknown }
): { transfer: Transfer } | { error: string } {
  if (!isCrane) return { transfer: NO_TRANSFER };
  const { cargoType, destination, cargoDetails, location } = input;
  if (typeof cargoType !== "string" || !(CARGO_TYPES as readonly string[]).includes(cargoType)) {
    return { error: "Indica qué se va a trasladar (auto, camioneta, camión, contenedor, maquinaria u otro)" };
  }
  if (typeof location !== "string" || !location.trim()) {
    return { error: "Indica dónde está lo que se traslada (lugar de retiro)" };
  }
  if (typeof destination !== "string" || !destination.trim()) {
    return { error: "Indica el destino del traslado" };
  }
  if (destination.trim().length > MAX_LEN.location) {
    return { error: `El destino no puede superar los ${MAX_LEN.location} caracteres` };
  }
  if (typeof cargoDetails !== "string" || cargoDetails.trim().length < 3) {
    return { error: "Describe lo que se traslada (medidas, peso, estado, etc.)" };
  }
  if (cargoDetails.length > MAX_LEN.notes) {
    return { error: `Los datos de la carga no pueden superar los ${MAX_LEN.notes} caracteres` };
  }
  return { transfer: { cargoType: cargoType as CargoType, destination: destination.trim(), cargoDetails: cargoDetails.trim() } };
}
