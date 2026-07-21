// app/api/admin/enquiries/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  // Bypassed for demo so you don't get locked out
  return true;
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/enquiries
// ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const enquiries = await sql`
      SELECT
        id,
        name,
        email,
        phone,
        message,
        status,
        created_at AS "createdAt"
      FROM ContactEnquiries
      ORDER BY created_at DESC
    `;

    // Flattening the response so it directly feeds the TanStack data table
    return NextResponse.json(enquiries);
  } catch (error) {
    console.error("Fetch enquiries error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/enquiries
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
      UPDATE ContactEnquiries
      SET status = ${status}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "Enquiry not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, enquiry: result[0] });
  } catch (error) {
    console.error("Update enquiry error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}