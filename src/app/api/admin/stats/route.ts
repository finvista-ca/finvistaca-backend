// app/api/admin/stats/route.ts

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const campaigns = await sql`
      SELECT
        c.id,
        c.filename,
        c.total_count,
        c.created_at,

        COUNT(q.id) FILTER (
          WHERE q.status = 'Sent'
        )::int AS sent_count,

        COUNT(q.id) FILTER (
          WHERE q.status = 'Delivered'
        )::int AS delivered_count,

        COUNT(q.id) FILTER (
          WHERE q.status = 'Failed'
        )::int AS failed_count,

        COUNT(q.id) FILTER (
          WHERE q.status = 'Pending'
        )::int AS pending_count

      FROM OutreachCampaigns c

      LEFT JOIN OutreachQueue q
      ON c.id = q.campaign_id

      GROUP BY c.id

      ORDER BY c.created_at DESC
    `;

    const consultationStats = await sql`
      SELECT
        COUNT(*)::int AS total_consultations,

        COUNT(*) FILTER (
          WHERE status = 'Pending'
        )::int AS pending_consultations,

        COUNT(*) FILTER (
          WHERE status = 'Confirmed'
        )::int AS confirmed_consultations,

        COUNT(*) FILTER (
          WHERE status = 'Completed'
        )::int AS completed_consultations,

        COUNT(*) FILTER (
          WHERE status = 'Cancelled'
        )::int AS cancelled_consultations

      FROM Consultations
    `;

    const clientStats = await sql`
      SELECT
        COUNT(*)::int AS total_clients
      FROM Clients
    `;

    const careerStats = await sql`
      SELECT
        COUNT(*)::int AS total_applications,
        COUNT(*) FILTER (
          WHERE status = 'New'
        )::int AS new_applications
      FROM CareerApplications
    `;

    const enquiryStats = await sql`
      SELECT
        COUNT(*)::int AS total_enquiries,
        COUNT(*) FILTER (
          WHERE status = 'New'
        )::int AS new_enquiries
      FROM ContactEnquiries
    `;

    return NextResponse.json({
      success: true,
      campaigns,
      dashboard: {
        consultations: consultationStats[0],
        clients: clientStats[0],
        careers: careerStats[0],
        enquiries: enquiryStats[0],
      },
    });

  } catch (error) {
    console.error("Fetch Stats Error:", error);

    return NextResponse.json(
      {
        error: "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}