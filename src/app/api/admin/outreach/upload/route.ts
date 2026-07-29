// app/api/admin/outreach/upload/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import * as xlsx from "xlsx";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Read workbook and first sheet
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert sheet rows into JSON objects using header row names automatically
    const rows: any[] = xlsx.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Excel file is empty" }, { status: 400 });
    }

    // Create Campaign Record
    const campaignResult = await sql`
      INSERT INTO OutreachCampaigns (filename, total_count)
      VALUES (${file.name}, ${rows.length})
      RETURNING id
    `;

    const campaignId = campaignResult[0].id;
    let insertedCount = 0;

    for (const row of rows) {
      // Support flexible key names (lowercase/uppercase/variations)
      const clientName = String(row.client_name || row.ClientName || row.Name || "").trim();
      let rawPhone = String(row.phone || row.Phone || row.Mobile || "").replace(/\D/g, "");
      const reminderType = String(row.reminder_type || row.ReminderType || "income_tax_doc_checklist").trim();

      if (!clientName || !rawPhone) continue;

      // Format Indian phone numbers cleanly
      if (rawPhone.length === 12 && rawPhone.startsWith("91")) {
        rawPhone = rawPhone.substring(2);
      } else if (rawPhone.length === 11 && rawPhone.startsWith("0")) {
        rawPhone = rawPhone.substring(1);
      }

      if (rawPhone.length === 10) {
        const whatsappPhone = `91${rawPhone}`;

        // Map variables dynamically from row keys
        const var1 = String(row.var1 || row.Var1 || "").trim();
        const var2 = String(row.var2 || row.Var2 || "").trim();
        const var3 = String(row.var3 || row.Var3 || "").trim();
        const var4 = String(row.var4 || row.Var4 || "").trim();
        const var5 = String(row.var5 || row.Var5 || "").trim();
        const var6 = String(row.var6 || row.Var6 || "").trim();
        const var7 = String(row.var7 || row.Var7 || "").trim();
        const var8 = String(row.var8 || row.Var8 || "").trim();
        const var9 = String(row.var9 || row.Var9 || "").trim();
        const var10 = String(row.var10 || row.Var10 || "").trim();
        const var11 = String(row.var11 || row.Var11 || "").trim();
        const var12 = String(row.var12 || row.Var12 || "").trim();
        const var13 = String(row.var13 || row.Var13 || "").trim();
        const var14 = String(row.var14 || row.Var14 || "").trim();
        const var15 = String(row.var15 || row.Var15 || "").trim();
        const var16 = String(row.var16 || row.Var16 || "").trim();
        const var17 = String(row.var17 || row.Var17 || "").trim();
        const var18 = String(row.var18 || row.Var18 || "").trim();
        const var19 = String(row.var19 || row.Var19 || "").trim();

        await sql`
          INSERT INTO OutreachQueue (
            campaign_id, client_name, phone, reminder_type, status,
            var1, var2, var3, var4, var5, var6, var7, var8, var9, var10,
            var11, var12, var13, var14, var15, var16, var17, var18, var19
          )
          VALUES (
            ${campaignId}, ${clientName}, ${whatsappPhone}, ${reminderType}, 'Pending',
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}