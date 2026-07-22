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

    // Parse sheet as array of arrays (header: 1) so columns are accessed positionally:
    // row[0] = Name, row[1] = Mobile, row[2] = 3rd Column Text
    const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Filter out empty rows and skip the header row (index 0)
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
      
      // Directly grabs whatever is in the 3rd column (index 2)! Falls back only if empty.
      const reminderType = String(row[2] || "").trim() || "General Reminder";

      if (!clientName || !rawPhone) continue;

      if (rawPhone.length === 12 && rawPhone.startsWith("91")) {
        rawPhone = rawPhone.substring(2);
      } else if (rawPhone.length === 11 && rawPhone.startsWith("0")) {
        rawPhone = rawPhone.substring(1);
      }

      if (rawPhone.length === 10) {
        const whatsappPhone = `91${rawPhone}`;

        await sql`
          INSERT INTO OutreachQueue (
            campaign_id,
            client_name,
            phone,
            reminder_type,
            status
          )
          VALUES (
            ${campaignId},
            ${clientName},
            ${whatsappPhone},
            ${reminderType},
            'Pending'
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