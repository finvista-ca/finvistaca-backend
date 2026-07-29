// app/api/admin/outreach/download-template/route.ts

import { NextResponse } from "next/server";
import * as xlsx from "xlsx";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "income_tax_doc_checklist";

  let headers: string[] = [];
  let sampleRow: any[] = [];
  let filename = "template.xlsx";

  if (type === "income_tax_doc_checklist") {
    filename = "income_tax_doc_checklist.xlsx";
    headers = ["client_name", "phone", "reminder_type", "var1", "var2", "var3", "var4", "var5", "var6", "var7", "var8", "var9", "var10"];
    sampleRow = ["Sample Client", "919876543210", "income_tax_doc_checklist", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "2025-26", "01.04.2025", "31.03.2026", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "8340814350", "8143505094", "Irkassociatess@gmail.com"];
  } else if (type === "income_tax_due_dates") {
    filename = "income_tax_due_dates.xlsx";
    headers = ["client_name", "phone", "reminder_type", "var1", "var2", "var3", "var4", "var5", "var6", "var7", "var8", "var9", "var10", "var11", "var12"];
    sampleRow = ["Sample Client", "919876543210", "income_tax_due_dates", "2026 - 27", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "31st July 2026", "31st August 2026", "31st October 2026", "30th November 2026", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "8340814350", "8143505094", "Irkassociatess@gmail.com"];
  } else if (type === "gst_annual_return") {
    filename = "gst_annual_return.xlsx";
    headers = ["client_name", "phone", "reminder_type", "var1", "var2", "var3", "var4", "var5", "var6", "var7", "var8", "var9", "var10", "var11"];
    sampleRow = ["Sample Client", "919876543210", "gst_annual_return", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "31st December", "₹100", "₹100", "₹200", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "7993856920", "8143505094", "Irkassociatess@gmail.com"];
  } else if (type === "gst_regular_returns") {
    filename = "gst_regular_returns.xlsx";
    headers = ["client_name", "phone", "reminder_type", "var1", "var2", "var3", "var4", "var5", "var6", "var7", "var8", "var9", "var10", "var11", "var12", "var13", "var14", "var15", "var16", "var17", "var18", "var19"];
    sampleRow = ["Sample Client", "919876543210", "gst_regular_returns", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "11th", "13th", "20th", "22nd", "₹20", "₹10", "₹10", "₹50", "₹25", "₹25", "18% per annum", "7th", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "7993856920", "8143505094", "Irkassociatess@gmail.com"];
  } else if (type === "roc_annual_returns") {
    filename = "roc_annual_returns.xlsx";
    headers = ["client_name", "phone", "reminder_type", "var1", "var2", "var3", "var4", "var5", "var6", "var7", "var8"];
    sampleRow = ["Sample Client", "919876543210", "roc_annual_returns", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "₹100 per day", "I R K & ASSOCIATES", "CA Rama Kishore Itla", "+91 9908285223", "8143505094", "Irkassociatess@gmail.com"];
  }

  const wsData = [headers, sampleRow];
  const worksheet = xlsx.utils.aoa_to_sheet(wsData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Template");

  const excelBuffer = xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });

  return new NextResponse(excelBuffer, {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}