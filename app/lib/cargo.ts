// Qué traslada una grúa (#141). Las claves son las que guarda el backend (backend/src/utils/cargo.ts).

export type CargoType = "auto" | "camioneta" | "camion" | "contenedor" | "maquinaria" | "otro";

export const CARGO_OPTIONS: { value: CargoType; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "camioneta", label: "Camioneta o SUV" },
  { value: "camion", label: "Camión" },
  { value: "contenedor", label: "Contenedor" },
  { value: "maquinaria", label: "Maquinaria" },
  { value: "otro", label: "Otro" },
];

export function cargoLabel(value: string | null | undefined): string {
  return CARGO_OPTIONS.find((option) => option.value === value)?.label ?? value ?? "";
}

/** Solo los vehículos tienen patente: contenedores, maquinaria y otras cargas se piden sin vehículo registrado. */
export function cargoIsVehicle(value: string): boolean {
  return value === "auto" || value === "camioneta" || value === "camion";
}

export type TransferDraft = { cargoType: CargoType | ""; location: string; destination: string; cargoDetails: string };

export const EMPTY_TRANSFER: TransferDraft = { cargoType: "", location: "", destination: "", cargoDetails: "" };

/** Mensaje de error si falta algún dato del traslado, o "" si está completo. */
export function validateTransfer(draft: TransferDraft): string {
  if (!draft.cargoType) return "Indica qué se va a trasladar.";
  if (!draft.location.trim()) return "Indica el lugar de retiro.";
  if (!draft.destination.trim()) return "Indica el destino del traslado.";
  if (draft.cargoDetails.trim().length < 3) return "Describe lo que se traslada (medidas, peso, estado, etc.).";
  return "";
}

/** Campos que se envían a la API para una solicitud de grúa (`location` es el lugar de retiro). */
export function transferPayload(draft: TransferDraft) {
  return {
    cargoType: draft.cargoType,
    location: draft.location.trim(),
    destination: draft.destination.trim(),
    cargoDetails: draft.cargoDetails.trim(),
  };
}
