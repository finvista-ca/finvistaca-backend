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
      message,
    } = body;

    // ==================================================
    // Validation
    // ==================================================

    if (!name || !phone || !message) {
      return NextResponse.json(
        {
          error:
            "Name, phone and message are required.",
        },
        {
          status: 400,
        }
      );
    }

    // ==================================================
    // Phone Validation
    // ==================================================

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
    // Email Validation (Optional)
    // ==================================================

    if (email) {
      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        return NextResponse.json(
          {
            error: "Enter a valid email address.",
          },
          {
            status: 400,
          }
        );
      }
    }

    // ==================================================
    // Save / Update Client
    // ==================================================

    const client = await sql`
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
        email = COALESCE(EXCLUDED.email, Clients.email)

      RETURNING id
    `;

    const clientId = client[0].id;

    // ==================================================
    // Save Contact Enquiry
    // ==================================================

    const enquiry = await sql`
      INSERT INTO ContactEnquiries (
        name,
        phone,
        email,
        message,
        status
      )

      VALUES (
        ${name.trim()},
        ${whatsappPhone},
        ${email?.trim() ?? null},
        ${message.trim()},
        'New'
      )

      RETURNING
        id,
        name,
        phone,
        email,
        status,
        created_at
    `;

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
        'General Consultation',
        ${message.trim()},
        'Pending'
      )
    `;

    // ==================================================
    // Send WhatsApp Template
    // ==================================================

    try {
      await sendOutreachTemplate(
        whatsappPhone,
        "booking_initiation",
        [
          name.trim(),
          "General Consultation",
        ]
      );
    } catch (waError) {
      console.error(
        "Failed to send booking template:",
        waError
      );
    }

    // ==================================================
    // Response
    // ==================================================

    return NextResponse.json({
      success: true,
      message:
        "Your enquiry has been submitted successfully.",
      enquiry: enquiry[0],
    });

  } catch (error) {
    console.error(
      "Contact Enquiry Error:",
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