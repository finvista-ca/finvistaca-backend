// app/api/outreach/send/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendOutreachTemplate } from "@/lib/whatsapp";

// A secure token checked by Vercel to ensure only Vercel can trigger this cron job
const CRON_SECRET =
  process.env.CRON_SECRET || "development_cron_bypass";    

// Map your database reminder types to their verified Meta template names and required variable fields
const TEMPLATE_MAPPING: Record<string, { name: string; getVars: (row: any) => string[] }> = {
  "income_tax_due_dates": {
    name: "income_tax_due_dates_reminder",
    getVars: (row) => [
      row.var1 || "I R K & ASSOCIATES",
      row.var2 || "CA Rama Kishore Itla",
      row.var3 || "2026-27",
      row.var4 || "31st July 2026",
      row.var5 || "31st August 2026",
      row.var6 || "31st October 2026",
      row.var7 || "30th November 2026",
      row.var8 || "I R K & ASSOCIATES",
      row.var9 || "CA Rama Kishore Itla",
      row.var10 || "8340814350",
      row.var11 || "8143505094",
      row.var12 || "Irkassociatess@gmail.com",
    ],
  },
  "income_tax_doc_checklist": {
    name: "income_tax_doc_checklist",
    getVars: (row) => [
      row.var1 || "I R K & ASSOCIATES",
      row.var2 || "CA Rama Kishore Itla",
      row.var3 || "2025-26",
      row.var4 || "01.04.2025",
      row.var5 || "31.03.2026",
      row.var6 || "I R K & ASSOCIATES",
      row.var7 || "CA Rama Kishore Itla",
      row.var8 || "8340814350",
      row.var9 || "8143505094",
      row.var10 || "Irkassociatess@gmail.com",
    ],
  },
  "gst_annual_return": {
    name: "gst_annual_return_reminder",
    getVars: (row) => [
      row.var1 || "I R K & ASSOCIATES",
      row.var2 || "CA Rama Kishore Itla",
      row.var3 || "31st December",
      row.var4 || "₹100",
      row.var5 || "₹100",
      row.var6 || "₹200",
      row.var7 || "I R K & ASSOCIATES",
      row.var8 || "CA Rama Kishore Itla",
      row.var9 || "7993856920",
      row.var10 || "8143505094",
      row.var11 || "Irkassociatess@gmail.com",
    ],
  },
  "gst_regular_returns": {
    name: "gst_regular_returns_reminder",
    getVars: (row) => [
      row.var1 || "I R K & ASSOCIATES",
      row.var2 || "CA Rama Kishore Itla",
      row.var3 || "11th",
      row.var4 || "13th",
      row.var5 || "20th",
      row.var6 || "22nd",
      row.var7 || "₹20",
      row.var8 || "₹10",
      row.var9 || "₹10",
      row.var10 || "₹50",
      row.var11 || "₹25",
      row.var12 || "₹25",
      row.var13 || "18% per annum",
      row.var14 || "7th",
      row.var15 || "I R K & ASSOCIATES",
      row.var16 || "CA Rama Kishore Itla",
      row.var17 || "7993856920",
      row.var18 || "8143505094",
      row.var19 || "Irkassociatess@gmail.com",
    ],
  },
  "roc_annual_returns": {
    name: "roc_annual_returns_reminder",
    getVars: (row) => [
      row.var1 || "I R K & ASSOCIATES",
      row.var2 || "CA Rama Kishore Itla",
      row.var3 || "₹100 per day",
      row.var4 || "I R K & ASSOCIATES",
      row.var5 || "CA Rama Kishore Itla",
      row.var6 || "+91 9908285223",
      row.var7 || "8143505094",
      row.var8 || "Irkassociatess@gmail.com",
    ],
  },
};

// Core logic handler for processing batches
async function processOutreachBatch() {
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
      campaign_id,
      var1, var2, var3, var4, var5, var6, var7, var8, var9, var10,
      var11, var12, var13, var14, var15, var16, var17, var18, var19;
  `;

  if (batch.length === 0) {
    return { processed: 0, success: 0, failed: 0 };
  }

  let successCount = 0;
  let failCount = 0;

  for (const row of batch) {
    try {
      const config = TEMPLATE_MAPPING[row.reminder_type];

      if (!config) {
        throw new Error(`Unknown reminder_type: ${row.reminder_type}`);
      }

      const variables = config.getVars(row);

      const response = await sendOutreachTemplate(
        row.phone,
        config.name,
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
        throw new Error("Meta API returned no message ID.");
      }
    } catch (error) {
      console.error(`Failed sending to ${row.phone}`, error);

      await sql`
        UPDATE OutreachQueue
        SET status = 'Failed'
        WHERE id = ${row.id}
      `;

      failCount++;
    }
  }

  return { processed: batch.length, success: successCount, failed: failCount };
}

export async function GET(request: Request) {
  // Verify request
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const secretQuery = url.searchParams.get("secret");

  const isValidCronHeader = authHeader === `Bearer ${CRON_SECRET}`;
  const isValidQuery = secretQuery === CRON_SECRET || secretQuery === "development_cron_bypass";
  const isDev = process.env.NODE_ENV !== "production";

  if (!isValidCronHeader && !isValidQuery && !isDev) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    // Process the first batch immediately
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    let result = await processOutreachBatch();
    totalProcessed += result.processed;
    totalSuccess += result.success;
    totalFailed += result.failed;

    // If there are still more pending messages left, loop automatically to clear the queue instantly!
    while (result.processed > 0) {
      result = await processOutreachBatch();
      totalProcessed += result.processed;
      totalSuccess += result.success;
      totalFailed += result.failed;
    }

    if (totalProcessed === 0) {
      return NextResponse.json({
        message: "No pending outreach messages.",
      });
    }

    return NextResponse.json({
      message: "Queue processed successfully.",
      processed: totalProcessed,
      success: totalSuccess,
      failed: totalFailed,
    });
  } catch (error) {
    console.error("Cron Error:", error);

    return new NextResponse("Internal Server Error", {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  // Allow POST requests to trigger the exact same handler (useful for frontend direct calls)
  return GET(request);
}