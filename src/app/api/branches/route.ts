import { NextResponse } from "next/server";
import { sql } from "@/lib/db"; // Fixed import syntax

export async function GET() {
  try {
    const branches = await sql`SELECT id, branch_name, address, phone, email FROM Branches ORDER BY id ASC`;
    return NextResponse.json({ success: true, branches });
  } catch (error) {
    console.error("Fetch Public Branches Error:", error);
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 });
  }
}