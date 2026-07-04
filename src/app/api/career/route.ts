// app/api/career/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      name,
      phone,
      email,
      position,
      cover_letter,
      resume_url,
    } = body;

    // ==================================================
    // Validation
    // ==================================================

    if (!name || !phone || !email || !position) {
      return NextResponse.json(
        {
          error:
            "Name, phone, email and position are required.",
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
    // Email Validation
    // ==================================================

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

    // ==================================================
    // Resume URL Validation (Optional)
    // ==================================================

    if (
      resume_url &&
      !resume_url.startsWith("https://")
    ) {
      return NextResponse.json(
        {
          error:
            "Resume URL must be a valid https link.",
        },
        {
          status: 400,
        }
      );
    }

    // ==================================================
    // Save Application
    // ==================================================

    const application = await sql`
      INSERT INTO CareerApplications (
        name,
        phone,
        email,
        position,
        cover_letter,
        resume_url,
        status
      )

      VALUES (
        ${name.trim()},
        ${cleanPhone},
        ${email.trim()},
        ${position.trim()},
        ${cover_letter?.trim() ?? null},
        ${resume_url?.trim() ?? null},
        'New'
      )

      RETURNING
        id,
        name,
        email,
        position,
        status,
        created_at
    `;

    // ==================================================
    // Success Response
    // ==================================================

    return NextResponse.json({
      success: true,
      message:
        "Application submitted successfully.",
      application: application[0],
    });

  } catch (error) {
    console.error(
      "Career Application Error:",
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