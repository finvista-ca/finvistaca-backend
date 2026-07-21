// app/api/cron/outreach/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendOutreachTemplate } from "@/lib/whatsapp";

export async function GET(request: Request) {
 
  try {
    // ==================================================
    // Fetch Pending Queue
    // ==================================================

    const pendingQueue = await sql`
      SELECT
        q.id,
        q.campaign_id,
        q.client_name,
        q.phone,
        q.reminder_type,
        c.do_not_contact

      FROM OutreachQueue q

      LEFT JOIN Clients c
      ON q.phone = c.phone

      WHERE q.status = 'Pending'

      LIMIT 50
    `;

    if (pendingQueue.length === 0) {
      return NextResponse.json({
        message: "Queue is empty. Nothing to process.",
      });
    }

    let sentCount = 0;

    // ==================================================
    // Process Queue
    // ==================================================

    for (const job of pendingQueue) {
      // Skip Do Not Contact clients
      if (job.do_not_contact) {
        await sql`
          UPDATE OutreachQueue
          SET status = 'Failed'
          WHERE id = ${job.id}
        `;
        continue;
      }

      try {
        // Prevent duplicate sending
        await sql`
          UPDATE OutreachQueue
          SET status = 'Processing'
          WHERE id = ${job.id}
        `;

        // WhatsApp Template Variables
        const variables = [
          job.client_name,
          job.reminder_type || "Important Reminder",
        ];

        // Send Template
        const response = await sendOutreachTemplate(
          job.phone,
          "bulk_message",
          variables
        );

        const messageId =
          response?.message_id ?? "unknown";

        // Update Queue
        await sql`
          UPDATE OutreachQueue

          SET
            status = 'Sent',
            sent_at = CURRENT_TIMESTAMP,
            meta_message_id = ${messageId}

          WHERE id = ${job.id}
        `;

        // Update Campaign Count
        await sql`
          UPDATE OutreachCampaigns

          SET sent_count = sent_count + 1

          WHERE id = ${job.campaign_id}
        `;

        sentCount++;

      } catch (err) {
        console.error(
          `Failed sending to ${job.phone}:`,
          err
        );

        await sql`
          UPDATE OutreachQueue
          SET status = 'Failed'
          WHERE id = ${job.id}
        `;
      }
    }

    // ==================================================
    // Response
    // ==================================================

    return NextResponse.json({
      success: true,
      processed: pendingQueue.length,
      sent: sentCount,
    });

  } catch (error) {
    console.error(
      "Cron Processing Error:",
      error
    );

    return NextResponse.json(
      {
        error: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}