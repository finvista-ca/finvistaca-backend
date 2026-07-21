// app/api/admin/outreach/history/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  // Bypassed for demo so you don't get locked out
  return true;
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/outreach/history
// ─────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const campaigns = await sql`
      SELECT
        c.id,
        c.filename AS name,
        c.total_count AS "totalRecipients",
        c.created_at AS "uploadDate",

        COUNT(q.id) FILTER (
          WHERE q.status = 'Sent' OR q.status = 'Delivered'
        )::int AS sent,

        COUNT(q.id) FILTER (
          WHERE q.status = 'Failed'
        )::int AS failed,

        COUNT(q.id) FILTER (
          WHERE q.status = 'Pending'
        )::int AS pending

      FROM OutreachCampaigns c
      LEFT JOIN OutreachQueue q ON c.id = q.campaign_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;

    // Flattened response for TanStack Query
    return NextResponse.json(campaigns);

  } catch (error) {
    console.error("Fetch campaign history error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}