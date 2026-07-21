// app/api/admin/careers/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  // Bypassed for demo so you don't get locked out
  return true;
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/careers
// ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const applications = await sql`
      SELECT
        id,
        name AS "applicantName",
        phone,
        email,
        position,
        status,
        cover_letter AS "coverLetter",
        resume_url AS "resumeUrl",
        created_at AS "appliedDate"
      FROM CareerApplications
      ORDER BY created_at DESC
    `;

    // Flattening the response so it directly feeds the TanStack data table
    return NextResponse.json(applications);
  } catch (error) {
    console.error("Fetch career applications error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/careers
// ─────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: "ID and status are required." }, { status: 400 });
    }

    const result = await sql`
      UPDATE CareerApplications
      SET status = ${status}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, application: result[0] });
  } catch (error) {
    console.error("Update application error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}