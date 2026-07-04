import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendOutreachTemplate } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      phone,
      email,
      service,
      message,
    } = body;

    // ==================================================
    // Validation
    // ==================================================

    if (!name || !phone) {
      return NextResponse.json(
        {
          error: "Name and phone are required.",
        },
        {
          status: 400,
        }
      );
    }

    let cleanPhone = String(phone).replace(/\D/g, "");

    if (
      cleanPhone.length === 12 &&
      cleanPhone.startsWith("91")
    ) {
      cleanPhone = cleanPhone.substring(2);
    } else if (
      cleanPhone.length === 11 &&
      cleanPhone.startsWith("0")
    ) {
      cleanPhone = cleanPhone.substring(1);
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        {
          error: "Enter a valid Indian mobile number.",
        },
        {
          status: 400,
        }
      );
    }

    const whatsappPhone = `91${cleanPhone}`;

    // ==================================================
    // Create / Update Client
    // ==================================================

    const clientResult = await sql`
      INSERT INTO Clients (
        name,
        phone,
        email
      )
      VALUES (
        ${name.trim()},
        ${whatsappPhone},
        ${email?.trim() ?? null}
      )

      ON CONFLICT (phone)

      DO UPDATE SET
        name = EXCLUDED.name,
        email = COALESCE(
          EXCLUDED.email,
          Clients.email
        )

      RETURNING id
    `;

    const clientId = clientResult[0].id;

    // ==================================================
    // Create Consultation
    // ==================================================

    await sql`
      INSERT INTO Consultations (
        client_id,
        service,
        message,
        status
      )

      VALUES (
        ${clientId},
        ${service?.trim() ?? "General Consultation"},
        ${message?.trim() ?? null},
        'Pending'
      )
    `;

    // ==================================================
    // Send WhatsApp Template (Graceful Fallback)
    // ==================================================

    try {
      await sendOutreachTemplate(
        whatsappPhone,
        "consultation_booking", // Verify this matches your approved Meta template name!
        [
          name.trim(),
          service?.trim() ?? "General Consultation",
        ]
      );
    } catch (waError) {
      // Log it so you know the bot failed, but DON'T crash the user's web request
      console.error(`Failed to send initial WhatsApp template to ${whatsappPhone}:`, waError);
    }

    // ==================================================
    // Response
    // ==================================================

    return NextResponse.json({
      success: true,
      message:
        "Consultation request submitted successfully. Our team will contact you shortly.",
    });

  } catch (error) {
    console.error(
      "Consultation Booking Error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong. Please try again later.",
      },
      {
        status: 500,
      }
    );
  }
}