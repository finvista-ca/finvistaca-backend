// app/api/admin/outreach/upload/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import * as xlsx from "xlsx";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Parse sheet as array of arrays (header: 1)
    // row[0] = Name, row[1] = Mobile, row[2] = Reminder Type, row[3..21] = var1..var19
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const dataRows = rows.slice(1).filter(row => row && row.length > 0);

    if (dataRows.length === 0) {
      return NextResponse.json(
        { error: "Excel file is empty" },
        { status: 400 }
      );
    }

    // Create Campaign
    const campaignResult = await sql`
      INSERT INTO OutreachCampaigns (
        filename,
        total_count
      )
      VALUES (
        ${file.name},
        ${dataRows.length}
      )
      RETURNING id
    `;

    const campaignId = campaignResult[0].id;
    let insertedCount = 0;

    for (const row of dataRows) {
      const clientName = String(row[0] || "").trim();
      let rawPhone = String(row[1] || "").replace(/\D/g, "");
      const reminderType = String(row[2] || "").trim() || "General Reminder";

      if (!clientName || !rawPhone) continue;

      if (rawPhone.length === 12 && rawPhone.startsWith("91")) {
        rawPhone = rawPhone.substring(2);
      } else if (rawPhone.length === 11 && rawPhone.startsWith("0")) {
        rawPhone = rawPhone.substring(1);
      }

      if (rawPhone.length === 10) {
        const whatsappPhone = `91${rawPhone}`;

        // Map positional Excel columns starting from index 3 to var1 through var19
        const var1 = String(row[3] || "").trim();
        const var2 = String(row[4] || "").trim();
        const var3 = String(row[5] || "").trim();
        const var4 = String(row[6] || "").trim();
        const var5 = String(row[7] || "").trim();
        const var6 = String(row[8] || "").trim();
        const var7 = String(row[9] || "").trim();
        const var8 = String(row[10] || "").trim();
        const var9 = String(row[11] || "").trim();
        const var10 = String(row[12] || "").trim();
        const var11 = String(row[13] || "").trim();
        const var12 = String(row[14] || "").trim();
        const var13 = String(row[15] || "").trim();
        const var14 = String(row[16] || "").trim();
        const var15 = String(row[17] || "").trim();
        const var16 = String(row[18] || "").trim();
        const var17 = String(row[19] || "").trim();
        const var18 = String(row[20] || "").trim();
        const var19 = String(row[21] || "").trim();

        await sql`
          INSERT INTO OutreachQueue (
            campaign_id,
            client_name,
            phone,
            reminder_type,
            status,
            var1, var2, var3, var4, var5, var6, var7, var8, var9, var10,
            var11, var12, var13, var14, var15, var16, var17, var18, var19
          )
          VALUES (
            ${campaignId},
            ${clientName},
            ${whatsappPhone},
            ${reminderType},
            'Pending',
            ${var1}, ${var2}, ${var3}, ${var4}, ${var5}, ${var6}, ${var7}, ${var8}, ${var9}, ${var10},
            ${var11}, ${var12}, ${var13}, ${var14}, ${var15}, ${var16}, ${var17}, ${var18}, ${var19}
          )
        `;

        insertedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Campaign queued successfully.",
      campaign_id: campaignId,
      total_queued: insertedCount,
    });

  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}