// app/api/admin/slots/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { seedSlotsIfNeeded } from '@/lib/slots';

function isAuthorized(request: Request): boolean {
  // Bypassed for demo so you don't get locked out
  return true;
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
        { error: 'Provide a valid date in YYYY-MM-DD format and a branch.' },
        { status: 400 }
      );
    }

    // Optional: Keep your seed function if you are generating slots automatically
    if (typeof seedSlotsIfNeeded === 'function') {
      await seedSlotsIfNeeded(date);
    }

    const slots = await sql`
      SELECT
        t.id,
        to_char(t.time, 'HH12:MI AM') AS time,
        COALESCE(t.status, CASE WHEN t.is_booked THEN 'Booked' ELSE 'Available' END) as status,
        cl.name AS "clientName",
        cl.phone AS "clientPhone"
      FROM TimeSlots t
      LEFT JOIN Consultations c ON c.slot_id = t.id AND c.status != 'Cancelled'
      LEFT JOIN Clients cl ON c.client_id = cl.id
      WHERE t.date = ${date}::date
        AND t.branch = ${branch}
      ORDER BY t.time ASC
    `;

    // Flattened: Return array directly for TanStack Query
    return NextResponse.json(slots);

  } catch (error) {
    console.error('Fetch slots error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

// ── POST /api/admin/slots — Generate daily slots or add custom ────────
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json();
    const { date, time, branch } = body;

    if (!date || !branch) {
      return NextResponse.json({ error: 'date and branch are required.' }, { status: 400 });
    }

    // If "time" is missing, generate standard daily slots
    if (!time) {
      const defaultTimes = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
      
      for (const t of defaultTimes) {
        await sql`
          INSERT INTO TimeSlots (date, time, branch, status)
          VALUES (${date}::date, ${t}::time, ${branch}, 'Available')
          ON CONFLICT DO NOTHING
        `;
      }
      return NextResponse.json({ success: true, message: 'Daily slots generated' });
    }

    // Add Custom Slot logic
    const result = await sql`
      INSERT INTO TimeSlots (date, time, branch, status)
      VALUES (${date}::date, ${time}::time, ${branch}, 'Available')
      ON CONFLICT DO NOTHING
      RETURNING id, date, to_char(time, 'HH12:MI AM') AS time, branch, status
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'A slot at this time already exists.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, slot: result[0] });

  } catch (error) {
    console.error('Add slot error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

// ── PATCH /api/admin/slots — Block/Unblock slot or day ───────────────
export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json();
    
    // Scenario 1: Blocking the entire day
    if (body.date && body.branch && !body.id) {
      await sql`
        UPDATE TimeSlots
        SET status = 'Blocked'
        WHERE date = ${body.date}::date 
          AND branch = ${body.branch} 
          AND (status = 'Available' OR status IS NULL)
      `;
      return NextResponse.json({ success: true, message: 'Day blocked successfully' });
    }

    // Scenario 2: Blocking/Unblocking a specific slot
    if (body.id && body.status) {
      await sql`
        UPDATE TimeSlots
        SET status = ${body.status}
        WHERE id = ${body.id}
      `;
      return NextResponse.json({ success: true, message: `Slot marked as ${body.status}` });
    }

    return NextResponse.json({ error: 'Invalid update payload provided.' }, { status: 400 });

  } catch (error) {
    console.error('Update slot status error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

// ── DELETE /api/admin/slots — remove an unbooked slot ─────────────────
export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'slot id is required.' }, { status: 400 });
    }

    // Refuse to delete a booked slot
    const slot = await sql`SELECT is_booked, status FROM TimeSlots WHERE id = ${id}`;

    if (slot.length === 0) {
      return NextResponse.json({ error: 'Slot not found.' }, { status: 404 });
    }

    if (slot[0].is_booked || slot[0].status === 'Booked') {
      return NextResponse.json(
        { error: 'Cannot delete a booked slot. Cancel the appointment first.' },
        { status: 409 }
      );
    }

    await sql`DELETE FROM TimeSlots WHERE id = ${id}`;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete slot error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}