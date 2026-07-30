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
      ORDER BY posted_at DESC
    `;
    return NextResponse.json({ success: true, jobs });
  } catch (error) {
    console.error("Fetch Jobs Error:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { title, department, location, jobType, description } = await request.json();
    if (!title) {
      return NextResponse.json({ error: "Job title is required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO CareerPostings (title, department, location, job_type, description, is_active)
      VALUES (${title}, ${department || null}, ${location || null}, ${jobType || 'Full-time'}, ${description || null}, true)
      RETURNING id, title, department, location, job_type AS "jobType", description, is_active AS "isActive", posted_at AS "postedDate"
    `;

    return NextResponse.json({ success: true, job: result[0] });
  } catch (error) {
    console.error("Add Job Error:", error);
    return NextResponse.json({ error: "Failed to create job posting" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await sql`DELETE FROM CareerPostings WHERE id = ${id}`;
    return NextResponse.json({ success: true, message: "Job deleted" });
  } catch (error) {
    console.error("Delete Job Error:", error);
    return NextResponse.json({ error: "Failed to delete job posting" }, { status: 500 });
  }
}