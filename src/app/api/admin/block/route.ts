// app/api/admin/block/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

function isAuthorized(request: Request): boolean {
  return (
    request.headers.get("authorization") ===
    `Bearer ${process.env.ADMIN_SECRET}`
  );
}

// ─────────────────────────────────────────────────────────────
// GET
// /api/admin/block?date=YYYY-MM-DD&branch=Vijayawada
// ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  const { searchParams } = new URL(request.url);

  const date = searchParams.get("date");
  const branch = searchParams.get("branch");

  try {
    if (date && branch) {
      const slots = await sql`
        SELECT
          id,
          to_char(time, 'HH12:MI AM') AS time,
          reason
        FROM BlockedSlots
        WHERE
          date = ${date}::date
          AND branch = ${branch}
        ORDER BY time ASC
      `;

      const dateBlocked = await sql`
        SELECT
          id,
          reason
        FROM BlockedDates
        WHERE date = ${date}::date
        LIMIT 1
      `;

      return NextResponse.json({
        date,
        branch,
        date_blocked: dateBlocked[0] ?? null,
        blocked_slots: slots,
      });
    }

    const dates = await sql`
      SELECT
        id,
        to_char(date,'YYYY-MM-DD') AS date,
        reason
      FROM BlockedDates
      ORDER BY date ASC
    `;

    return NextResponse.json({
      blocked_dates: dates,
    });
  } catch (error) {
    console.error("Block GET error:", error);

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
// POST
// ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    const {
      type,
      date,
      time,
      branch,
      reason,
    } = await request.json();

    if (!type || !date) {
      return NextResponse.json(
        {
          error: "`type` and `date` are required.",
        },
        {
          status: 400,
        }
      );
    }

    if (type === "date") {
      const result = await sql`
        INSERT INTO BlockedDates (
          date,
          reason
        )
        VALUES (
          ${date}::date,
          ${reason ?? null}
        )
        ON CONFLICT (date)
        DO NOTHING
        RETURNING
          id,
          to_char(date,'YYYY-MM-DD') AS date,
          reason
      `;

      if (result.length === 0) {
        return NextResponse.json(
          {
            error: "This date is already blocked.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json({
        success: true,
        blocked: result[0],
      });
    }

    if (type === "slot") {
      if (!time || !branch) {
        return NextResponse.json(
          {
            error:
              "`time` and `branch` are required for slot blocking.",
          },
          {
            status: 400,
          }
        );
      }

      const result = await sql`
        INSERT INTO BlockedSlots (
          date,
          time,
          branch,
          reason
        )
        VALUES (
          ${date}::date,
          ${time}::time,
          ${branch},
          ${reason ?? null}
        )
        ON CONFLICT (date, time, branch)
        DO NOTHING
        RETURNING
          id,
          branch,
          to_char(time,'HH12:MI AM') AS time,
          reason
      `;

      if (result.length === 0) {
        return NextResponse.json(
          {
            error: "This slot is already blocked.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json({
        success: true,
        blocked: result[0],
      });
    }

    return NextResponse.json(
      {
        error: '`type` must be "date" or "slot".',
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error("Block POST error:", error);

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
// DELETE
// ─────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    const { type, id } = await request.json();

    if (!type || !id) {
      return NextResponse.json(
        {
          error: "`type` and `id` are required.",
        },
        {
          status: 400,
        }
      );
    }

    if (type === "date") {
      const result = await sql`
        DELETE FROM BlockedDates
        WHERE id = ${id}
        RETURNING id
      `;

      if (result.length === 0) {
        return NextResponse.json(
          {
            error: "Not found.",
          },
          {
            status: 404,
          }
        );
      }

      return NextResponse.json({
        success: true,
      });
    }

    if (type === "slot") {
      const result = await sql`
        DELETE FROM BlockedSlots
        WHERE id = ${id}
        RETURNING id
      `;

      if (result.length === 0) {
        return NextResponse.json(
          {
            error: "Not found.",
          },
          {
            status: 404,
          }
        );
      }

      return NextResponse.json({
        success: true,
      });
    }

    return NextResponse.json(
      {
        error: '`type` must be "date" or "slot".',
      },
      {
        status: 400,
      }
    );
  } catch (error) {
    console.error("Block DELETE error:", error);

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