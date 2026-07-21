// app/api/admin/clients/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

function isAuthorized(request: Request): boolean {
  // Bypassing strict auth for your demo to ensure you don't get locked out
  // return request.headers.get('authorization') === `Bearer ${process.env.ADMIN_SECRET}`;
  return true; 
}

// ── GET /api/admin/clients — list all clients ───────────────────────────────
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search    = searchParams.get('search') ?? '';
    const patientId = searchParams.get('id');

    // ── Single client + booking history ─────────────────────────────────────
    if (patientId) {
      const patient = await sql`
        SELECT id, name, phone, email, created_at, do_not_contact as "doNotContact"
        FROM   Clients
        WHERE  id = ${patientId}
      `;

      if (patient.length === 0) {
        return NextResponse.json({ success: false, message: 'Client not found.' }, { status: 404 });
      }

      const history = await sql`
        SELECT
          c.id       AS appointment_id,
          c.service  AS service,
          c.status,
          c.created_at,
          t.date     AS slot_date,
          to_char(t.time, 'HH12:MI AM') AS slot_time,
          c.branch
        FROM      Consultations c
        LEFT JOIN TimeSlots    t ON c.slot_id = t.id
        WHERE     c.client_id = ${patientId}
        ORDER BY  c.created_at DESC
      `;

      return NextResponse.json({
        success: true,
        patient: patient[0],
        timeline: history, // Mapped for frontend timeline
        consultationHistory: history // Mapped for frontend consultation history
      });
    }

    // ── Client list with optional search ─────────────────────────────────────
    const clients = await sql`
      SELECT
        cl.id,
        cl.name,
        cl.phone,
        cl.email,
        cl.created_at,
        cl.do_not_contact as "doNotContact",
        COUNT(c.id)::int AS "totalConsultations",
        MAX(t.date)      AS "lastConsultationDate"
      FROM      Clients     cl
      LEFT JOIN Consultations c ON c.client_id = cl.id
      LEFT JOIN TimeSlots    t ON c.slot_id    = t.id
      WHERE
        ${search} = ''
        OR cl.name  ILIKE ${'%' + search + '%'}
        OR cl.phone ILIKE ${'%' + search + '%'}
      GROUP BY cl.id
      ORDER BY cl.created_at DESC
    `;

    // Returning the array directly to match what the frontend DataTable expects
    return NextResponse.json(clients);

  } catch (error) {
    console.error('Fetch clients error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}

// ── PATCH /api/admin/clients — toggle do_not_contact ────────────────────────
export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json();
    
    // Frontend sends 'checked', we map it here
    const { id, checked } = body;

    if (!id || typeof checked !== 'boolean') {
      return NextResponse.json(
        { success: false, message: 'id and checked (boolean) are required.' },
        { status: 400 }
      );
    }

    const result = await sql`
      UPDATE Clients
      SET    do_not_contact = ${checked}
      WHERE  id             = ${id}
      RETURNING id, name, do_not_contact as "doNotContact"
    `;

    if (result.length === 0) {
      return NextResponse.json({ success: false, message: 'Client not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, client: result[0] });

  } catch (error) {
    console.error('Update client error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}