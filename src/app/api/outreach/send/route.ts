// app/api/outreach/send/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendOutreachTemplate } from "@/lib/whatsapp";

const CRON_SECRET = process.env.CRON_SECRET || "development_cron_bypass";    

// Helper to safely extract a variable checking multiple possible key casings
const getVal = (row: any, keys: string[]): string => {
  for (const k of keys) {
    if (row[k] !== null && row[k] !== undefined && row[k] !== "") {
      return String(row[k]);
    }
  }
  return ""; // If truly missing in DB
};

const TEMPLATE_MAPPING: Record<string, { name: string; getVars: (row: any) => string[] }> = {
  "income_tax_due_dates": {
    name: "income_tax_due_dates_reminder",
    getVars: (row) => [
      getVal(row, ["var1", "Var1", "VAR1"]),
      getVal(row, ["var2", "Var2", "VAR2"]),
      getVal(row, ["var3", "Var3", "VAR3"]),
      getVal(row, ["var4", "Var4", "VAR4"]),
      getVal(row, ["var5", "Var5", "VAR5"]),
      getVal(row, ["var6", "Var6", "VAR6"]),
      getVal(row, ["var7", "Var7", "VAR7"]),
      getVal(row, ["var8", "Var8", "VAR8"]),
      getVal(row, ["var9", "Var9", "VAR9"]),
      getVal(row, ["var10", "Var10", "VAR10"]),
      getVal(row, ["var11", "Var11", "VAR11"]),
      getVal(row, ["var12", "Var12", "VAR12"]),
    ],
  },
  "income_tax_doc_checklist": {
    name: "income_tax_doc_checklist",
    getVars: (row) => [
      getVal(row, ["var1", "Var1", "VAR1"]),
      getVal(row, ["var2", "Var2", "VAR2"]),
      getVal(row, ["var3", "Var3", "VAR3"]),
      getVal(row, ["var4", "Var4", "VAR4"]),
      getVal(row, ["var5", "Var5", "VAR5"]),
      getVal(row, ["var6", "Var6", "VAR6"]),
      getVal(row, ["var7", "Var7", "VAR7"]),
      getVal(row, ["var8", "Var8", "VAR8"]),
      getVal(row, ["var9", "Var9", "VAR9"]),
      getVal(row, ["var10", "Var10", "VAR10"]),
    ],
  },
  "gst_annual_return": {
    name: "gst_annual_return_reminder",
    getVars: (row) => [
      getVal(row, ["var1", "Var1", "VAR1"]),
      getVal(row, ["var2", "Var2", "VAR2"]),
      getVal(row, ["var3", "Var3", "VAR3"]),
      getVal(row, ["var4", "Var4", "VAR4"]),
      getVal(row, ["var5", "Var5", "VAR5"]),
      getVal(row, ["var6", "Var6", "VAR6"]),
      getVal(row, ["var7", "Var7", "VAR7"]),
      getVal(row, ["var8", "Var8", "VAR8"]),
      getVal(row, ["var9", "Var9", "VAR9"]),
      getVal(row, ["var10", "Var10", "VAR10"]),
      getVal(row, ["var11", "Var11", "VAR11"]),
    ],
  },
  "gst_regular_returns": {
    name: "gst_regular_returns_reminder",
    getVars: (row) => [
      getVal(row, ["var1", "Var1", "VAR1"]),
      getVal(row, ["var2", "Var2", "VAR2"]),
      getVal(row, ["var3", "Var3", "VAR3"]),
      getVal(row, ["var4", "Var4", "VAR4"]),
      getVal(row, ["var5", "Var5", "VAR5"]),
      getVal(row, ["var6", "Var6", "VAR6"]),
      getVal(row, ["var7", "Var7", "VAR7"]),
      getVal(row, ["var8", "Var8", "VAR8"]),
      getVal(row, ["var9", "Var9", "VAR9"]),
      getVal(row, ["var10", "Var10", "VAR10"]),
      getVal(row, ["var11", "Var11", "VAR11"]),
      getVal(row, ["var12", "Var12", "VAR12"]),
      getVal(row, ["var13", "Var13", "VAR13"]),
      getVal(row, ["var14", "Var14", "VAR14"]),
      getVal(row, ["var15", "Var15", "VAR15"]),
      getVal(row, ["var16", "Var16", "VAR16"]),
      getVal(row, ["var17", "Var17", "VAR17"]),
      getVal(row, ["var18", "Var18", "VAR18"]),
      getVal(row, ["var19", "Var19", "VAR19"]),
    ],
  },
  "roc_annual_returns": {
    name: "roc_annual_returns_reminder",
    getVars: (row) => [
      getVal(row, ["var1", "Var1", "VAR1"]),
      getVal(row, ["var2", "Var2", "VAR2"]),
      getVal(row, ["var3", "Var3", "VAR3"]),
      getVal(row, ["var4", "Var4", "VAR4"]),
      getVal(row, ["var5", "Var5", "VAR5"]),
      getVal(row, ["var6", "Var6", "VAR6"]),
      getVal(row, ["var7", "Var7", "VAR7"]),
      getVal(row, ["var8", "Var8", "VAR8"]),
    ],
  },
};

async function processOutreachBatch() {
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

      // Check if any variable is empty and log it for debugging
      variables.forEach((v, idx) => {
        if (!v) {
          console.warn(`Warning: Variable index ${idx + 1} is empty for row ID ${row.id}`);
        }
      });

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
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const secretQuery = url.searchParams.get("secret");

  const isValidCronHeader = authHeader === `Bearer ${CRON_SECRET}`;
  const isValidQuery = secretQuery === CRON_SECRET || secretQuery === "development_cron_bypass";
  const isDev = process.env.NODE_ENV !== "production";

  if (!isValidCronHeader && !isValidQuery && !isDev) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    let result = await processOutreachBatch();
    totalProcessed += result.processed;
    totalSuccess += result.success;
    totalFailed += result.failed;

    while (result.processed > 0) {
      result = await processOutreachBatch();
      totalProcessed += result.processed;
      totalSuccess += result.success;
      totalFailed += result.failed;
    }

    if (totalProcessed === 0) {
      return NextResponse.json({ message: "No pending outreach messages." });
    }

    return NextResponse.json({
      message: "Queue processed successfully.",
      processed: totalProcessed,
      success: totalSuccess,
      failed: totalFailed,
    });
  } catch (error) {
    console.error("Cron Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}