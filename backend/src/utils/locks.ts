import { sql } from "drizzle-orm";

/** Cualquier transacción de la base (db.transaction) o el cliente mismo. */
type Executor = { execute: (query: ReturnType<typeof sql>) => PromiseLike<unknown> };

/**
 * Candados de agenda (se liberan solos al terminar la transacción):
 * - Reservar o mover una cita a un horario toma el candado COMPARTIDO del día y el candado del horario:
 *   dos reservas de días u horarios distintos no se esperan entre sí, y las del mismo horario se serializan.
 * - Bloquear un horario o un día toma el candado EXCLUSIVO del día: espera a que terminen las reservas en curso
 *   y las nuevas esperan al bloqueo, así ninguna cita entra dentro de un bloqueo recién creado.
 */
export async function lockSlotForBooking(tx: Executor, date: string, timeSlot: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtext(${`appointment-day:${date}`}))`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointment-slot:${date}|${timeSlot}`}))`);
}

export async function lockDaysForBlocking(tx: Executor, dates: string[]): Promise<void> {
  // En orden, para que dos bloqueos simultáneos no se esperen mutuamente.
  for (const date of [...new Set(dates)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointment-day:${date}`}))`);
  }
}
