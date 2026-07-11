// app/api/admin/slots/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { seedSlotsIfNeeded } from '@/lib/slots';

function isAuthorized(request: Request): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.ADMIN_SECRET}`;
}

// ── GET /api/admin/slots?date=YYYY-MM-DD&branch=BranchName ──────────
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const branch = searchParams.get('branch');

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !branch) {
      return NextResponse.json(
        { success: false, message: 'Provide a valid date in YYYY-MM-DD format and a branch.' },
        { status: 400 }
      );
    }

    await seedSlotsIfNeeded(date);

    const slots = await sql`
      SELECT
        t.id,
        to_char(t.time, 'HH12:MI AM') AS time,
        t.is_booked,
        cl.name  AS booked_by_name,
        cl.phone AS booked_by_phone
      FROM      TimeSlots    t
      LEFT JOIN Consultations c ON c.slot_id    = t.id AND c.status != 'Cancelled'
      LEFT JOIN Clients     cl ON c.client_id = cl.id
      WHERE t.date = ${date}::date
        AND t.branch = ${branch}
      ORDER BY t.time ASC
    `;

    return NextResponse.json({ success: true, date, branch, slots });

  } catch (error) {
    console.error('Fetch slots error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}

// ── POST /api/admin/slots — add a new slot ────────────────────────────────────
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { date, time, branch } = await request.json();

    if (!date || !time || !branch) {
      return NextResponse.json(
        { success: false, message: 'date, time, and branch are required.' },
        { status: 400 }
      );
    }

    // Validate date is not in the past
    const slotDate = new Date(date);
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    if (slotDate < today) {
      return NextResponse.json(
        { success: false, message: 'Cannot add slots for past dates.' },
        { status: 400 }
      );
    }

    const result = await sql`
      INSERT INTO TimeSlots (date, time, branch)
      VALUES (${date}::date, ${time}::time, ${branch})
      ON CONFLICT (date, time, branch) DO NOTHING
      RETURNING id, date, to_char(time, 'HH12:MI AM') AS time, branch
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { success: false, message: 'A slot at this time already exists for this date and branch.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, slot: result[0] });

  } catch (error) {
    console.error('Add slot error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}

// ── DELETE /api/admin/slots — remove an unbooked slot ────────────────────────
export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ success: false, message: 'slot id is required.' }, { status: 400 });
    }

    // Refuse to delete a booked slot
    const slot = await sql`SELECT is_booked FROM TimeSlots WHERE id = ${id}`;

    if (slot.length === 0) {
      return NextResponse.json({ success: false, message: 'Slot not found.' }, { status: 404 });
    }

    if (slot[0].is_booked) {
      return NextResponse.json(
        { success: false, message: 'Cannot delete a booked slot. Cancel the appointment first.' },
        { status: 409 }
      );
    }

    await sql`DELETE FROM TimeSlots WHERE id = ${id}`;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete slot error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}