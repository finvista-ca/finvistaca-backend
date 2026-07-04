// app/api/admin/bookings/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  return (
    request.headers.get("authorization") ===
    `Bearer ${process.env.ADMIN_SECRET}`
  );
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/bookings
// ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");

    const consultations = await sql`
      SELECT
        c.id AS consultation_id,
        c.service,
        c.branch,
        c.message,
        c.status,
        c.created_at,

        cl.id AS client_id,
        cl.name AS client_name,
        cl.phone AS client_phone,
        cl.email AS client_email,

        t.id AS slot_id,
        t.branch AS slot_branch,
        t.date AS slot_date,
        to_char(t.time, 'HH12:MI AM') AS slot_time

      FROM Consultations c

      JOIN Clients cl
      ON c.client_id = cl.id

      LEFT JOIN TimeSlots t
      ON c.slot_id = t.id

      WHERE (
        ${status ?? null}::text IS NULL
        OR c.status = ${status ?? null}::text
      )

      ORDER BY c.created_at DESC
    `;

    return NextResponse.json({
      success: true,
      consultations,
    });
  } catch (error) {
    console.error("Fetch consultations error:", error);

    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/bookings
// ─────────────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    const { id, status } = await request.json();

    const allowed = [
      "Pending",
      "Confirmed",
      "Completed",
      "Cancelled",
    ];

    if (!id || !allowed.includes(status)) {
      return NextResponse.json(
        {
          error: `Status must be one of: ${allowed.join(", ")}`,
        },
        {
          status: 400,
        }
      );
    }

    if (status === "Cancelled") {
      await sql`
        UPDATE TimeSlots

        SET is_booked = FALSE

        WHERE id = (
          SELECT slot_id
          FROM Consultations
          WHERE id = ${id}
        )
      `;
    }

    const result = await sql`
      UPDATE Consultations

      SET status = ${status}

      WHERE id = ${id}

      RETURNING
        id,
        status
    `;

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: "Consultation not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      consultation: result[0],
    });
  } catch (error) {
    console.error("Update consultation error:", error);

    return NextResponse.json(
      {
        error: "Internal server error.",
      },
      {
        status: 500,
      }
    );
  }
}