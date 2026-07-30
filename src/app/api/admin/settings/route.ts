import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// GET: Fetch all global settings
export async function GET() {
  try {
    const rows = await sql`SELECT key, value FROM AppSettings`;
    
    // Transform array of key-value rows into a single object { primary_phone: "...", ... }
    const settings = rows.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Fetch Settings Error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// POST: Update or insert global settings
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
    }

    for (const [key, value] of Object.entries(settings)) {
      await sql`
        INSERT INTO AppSettings (key, value, updated_at)
        VALUES (${key}, ${String(value)}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) 
        DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `;
    }

    return NextResponse.json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    console.error("Update Settings Error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}