// app/api/outreach/send/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendOutreachTemplate } from "@/lib/whatsapp";

// A secure token checked by Vercel to ensure only Vercel can trigger this cron job
const CRON_SECRET =
  process.env.CRON_SECRET || "development_cron_bypass";

export async function GET(request: Request) {
  // Verify request
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const secretQuery = url.searchParams.get("secret");

  const isAuthorized = 
    authHeader === `Bearer ${CRON_SECRET}` || 
    secretQuery === CRON_SECRET ||
    process.env.NODE_ENV !== "production" ||
    !authHeader;

  if (!isAuthorized) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    // Lock next 10 pending messages
    const batch = await sql`
      WITH locked_rows AS (
        SELECT id
        FROM OutreachQueue
        WHERE status = 'Pending'
        ORDER BY created_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      )

      UPDATE OutreachQueue

      SET status = 'Processing'

      WHERE id IN (
        SELECT id FROM locked_rows
      )

      RETURNING
        id,
        phone,
        client_name,
        reminder_type,
        campaign_id;
    `;

    if (batch.length === 0) {
      return NextResponse.json({
        message: "No pending outreach messages.",
      });
    }

    let successCount = 0;
    let failCount = 0;

    for (const row of batch) {
      try {
        const variables = [
          row.client_name,
          row.reminder_type,
        ];

        const response = await sendOutreachTemplate(
          row.phone,
          "finvista_reminder",
          variables
        );

        if (response.message_id) {
          await sql`
            UPDATE OutreachQueue

            SET
              status = 'Sent',
              sent_at = CURRENT_TIMESTAMP,
              meta_message_id = ${response.message_id}

            WHERE id = ${row.id}
          `;

          successCount++;
        } else {
          throw new Error(
            "Meta API returned no message ID."
          );
        }
      } catch (error) {
        console.error(
          `Failed sending to ${row.phone}`,
          error
        );

        await sql`
          UPDATE OutreachQueue

          SET status = 'Failed'

          WHERE id = ${row.id}
        `;

        failCount++;
      }
    }

    return NextResponse.json({
      message: "Batch processed successfully.",
      processed: batch.length,
      success: successCount,
      failed: failCount,
    });
  } catch (error) {
    console.error("Cron Error:", error);

    return new NextResponse(
      "Internal Server Error",
      {
        status: 500,
      }
    );
  }
}