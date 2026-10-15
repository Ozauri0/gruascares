import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { customTimeSlots } from "../db/schema.js";
import { DEFAULT_TIME_SLOTS } from "../config/constants.js";

/** Horarios de un día: los predefinidos más los que el admin creó para esa fecha, ordenados. */
export async function slotsForDate(date: string): Promise<string[]> {
  const custom = await db
    .select({ timeSlot: customTimeSlots.timeSlot })
    .from(customTimeSlots)
    .where(eq(customTimeSlots.date, date));
  return [...new Set<string>([...DEFAULT_TIME_SLOTS, ...custom.map((c) => c.timeSlot)])].sort();
}
