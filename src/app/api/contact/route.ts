import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

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
    // Save Enquiry
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
        ${cleanPhone},
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