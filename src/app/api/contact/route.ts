import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendOutreachTemplate } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Destructure the exact keys matching your new frontend
    const {
      fullName,
      phoneNumber,
      emailAddress,
      preferredBranch,
      services, 
    } = body;

    // ==================================================
    // 2. Validation & Formatting
    // ==================================================
    if (!fullName || !phoneNumber) {
      return NextResponse.json(
        { error: "Name and phone number are required." },
        { status: 400 }
      );
    }

    let cleanPhone = String(phoneNumber).replace(/\D/g, "");
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
      cleanPhone = cleanPhone.substring(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.substring(1);
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: "Enter a valid 10-digit Indian mobile number." },
        { status: 400 }
      );
    }

    const whatsappPhone = `91${cleanPhone}`;

    // ==================================================
    // 3. Database: Clients Table
    // ==================================================
    const clientResult = await sql`
      INSERT INTO Clients (name, phone, email)
      VALUES (
        ${fullName.trim()},
        ${whatsappPhone},
        ${emailAddress?.trim() ?? null}
      )
      ON CONFLICT (phone)
      DO UPDATE SET
        name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, Clients.email)
      RETURNING id
    `;
    
    const clientId = clientResult[0].id;

    // ==================================================
    // 4. Database: Consultations Table
    // ==================================================
    await sql`
      INSERT INTO Consultations (client_id, service, branch, status)
      VALUES (
        ${clientId},
        ${services?.trim() ?? "General Consultation"},
        ${preferredBranch?.trim() ?? "Not Specified"},
        'Pending'
      )
    `;

    // ==================================================
    // 5. WhatsApp API Trigger
    // ==================================================
    try {
      await sendOutreachTemplate(
        whatsappPhone,
        "booking_initiation", 
        [
          fullName.trim(),
          services?.trim() ?? "General Consultation",
        ]
      );
    } catch (waError) {
      console.error(`Failed to send WhatsApp template to ${whatsappPhone}:`, waError);
    }

    // ==================================================
    // 6. Success Response
    // ==================================================
    return NextResponse.json({
      success: true,
      message: "Consultation request submitted successfully.",
    });

  } catch (error) {
    console.error("Consultation Booking Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}