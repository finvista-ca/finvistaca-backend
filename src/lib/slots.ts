import { sql } from "./db";

const BRANCHES = [
  "Vijayawada",
  "Kakinada",
  "Visakhapatnam",
  "Parvathipuram",
  "Bobbili",
  "Peddapuram",
  "Hyderabad",
  "Odisha",
];

const SLOT_DURATION = 30;

export async function isDateBlocked(date: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM BlockedDates
    WHERE date = ${date}::date
    LIMIT 1
  `;

  return rows.length > 0;
}

export async function seedSlotsIfNeeded(date: string): Promise<void> {
  const existing = await sql`
    SELECT 1
    FROM TimeSlots
    WHERE date = ${date}::date
    LIMIT 1
  `;

  if (existing.length > 0) return;

  const [year, month, day] = date.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);

  const dayOfWeek = dateObj.getDay();

  // Sunday Closed
  if (dayOfWeek === 0) return;

  for (const branch of BRANCHES) {
    let hour = 10;
    let minute = 0;

    while (hour < 20 || (hour === 20 && minute === 0)) {
      // Skip Lunch Break (2:00 PM - 3:00 PM)
      if (hour === 14) {
        hour = 15;
        minute = 0;
      }

      const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

      await sql`
        INSERT INTO TimeSlots (
          date,
          time,
          branch,
          is_booked
        )
        VALUES (
          ${date}::date,
          ${timeStr}::time,
          ${branch},
          FALSE
        )
        ON CONFLICT DO NOTHING
      `;

      minute += SLOT_DURATION;

      if (minute >= 60) {
        minute = 0;
        hour++;
      }
    }
  }
}

export async function getAvailableSlots(
  date: string,
  branch: string
): Promise<{ id: number; time: string }[]> {
  await seedSlotsIfNeeded(date);

  const todayIST = getTodayIST();

  // Calculate the time right now, plus a 1-hour buffer
  // This prevents users from booking a slot that starts in 2 minutes
  const now = new Date();
  now.setHours(now.getHours() + 1); 

  const bufferIST = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows = await sql`
    SELECT
      t.id,
      to_char(t.time, 'HH12:MI AM') AS slot_time
    FROM TimeSlots t
    WHERE
      t.date = ${date}::date
      AND t.branch = ${branch}
      AND t.is_booked = FALSE
      AND (
        ${date}::date != ${todayIST}::date
        OR t.time > ${bufferIST}::time
      )
      AND NOT EXISTS (
        SELECT 1
        FROM BlockedSlots b
        WHERE
          b.date = t.date
          AND b.time = t.time
          AND b.branch = t.branch
      )
    ORDER BY t.time ASC
  `;

  return rows.map((row: any) => ({
    id: Number(row.id),
    time: String(row.slot_time),
  }));
}

export function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}