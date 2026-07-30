// app/api/careers/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const jobs = await sql`
      SELECT 
        id, 
        title, 
        department, 
        location, 
        job_type AS "jobType", 
        description, 
        is_active AS "isActive", 
        posted_at AS "postedDate"
      FROM CareerPostings 
      WHERE is_active = true 
      ORDER BY posted_at DESC
    `;
    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    console.error("Public Fetch Careers Error:", error);
    return NextResponse.json({ error: "Failed to fetch career openings" }, { status: 500 });
  }
}