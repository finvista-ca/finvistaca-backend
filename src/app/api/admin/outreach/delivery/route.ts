// app/api/admin/outreach/delivery/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  // Bypassed for demo so you don't get locked out
  return true;
}

// GET /api/admin/outreach/delivery?campaignId=X
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId query param is required." },
        { status: 400 }
      );
    }

    const rows = await sql`
      SELECT
        id,
        client_name AS "clientName",
        phone,
        reminder_type AS "reminderType",
        status,
        sent_at AS "sentTime",
        delivered_at AS "deliveredTime",
        meta_message_id
      FROM OutreachQueue
      WHERE campaign_id = ${campaignId}
      ORDER BY created_at ASC
    `;

    // Flattening the response so it directly feeds the TanStack data table
    return NextResponse.json(rows);

  } catch (error) {
    console.error("Fetch delivery error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}