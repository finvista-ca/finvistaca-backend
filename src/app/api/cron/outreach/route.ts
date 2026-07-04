// app/api/cron/outreach/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendOutreachTemplate } from '@/lib/whatsapp';

export async function GET(request: Request) {
  // 1. Security: Ensure only Vercel can trigger this URL
  const authHeader = request.headers.get('authorization');
  if (
    process.env.NODE_ENV === 'production' && 
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // 2. Fetch up to 50 pending messages. We join the Patients table to check DNC.
    const pendingQueue = await sql`
      SELECT 
        q.id, q.campaign_id, q.patient_name, q.phone, q.disease, p.do_not_contact
      FROM OutreachQueue q
      LEFT JOIN Patients p ON q.phone = p.phone
      WHERE q.status = 'Pending'
      LIMIT 50
    `;

    if (pendingQueue.length === 0) {
      return NextResponse.json({ message: "Queue is empty. Nothing to process." });
    }

    let sentCount = 0;

    // 3. Process each message
    for (const job of pendingQueue) {
      // Skip if patient opted out (Do Not Contact)
      if (job.do_not_contact) {
         await sql`UPDATE OutreachQueue SET status = 'Failed' WHERE id = ${job.id}`;
         continue;
      }

      try {
         // Mark as processing so we don't accidentally double-send if cron overlaps
         await sql`UPDATE OutreachQueue SET status = 'Processing' WHERE id = ${job.id}`;

         // Variables exactly matching your Meta "marketing_followup" template:
         // {{1}} Name, {{2}} Disease, {{3}} Booking Link
         const variables = [
           job.patient_name,
           job.disease || "your dental health",
           'https://dayandnightdentalclinic.com/appointment' // Replace with your actual frontend URL if different
         ];

         // Fire the Meta API
         const response = await sendOutreachTemplate(job.phone, "marketing_followup", variables);

         // Meta returns a message ID if successful
         const messageId = response?.message_id || 'unknown';

         // Update queue as Sent
         await sql`
           UPDATE OutreachQueue
           SET status = 'Sent', sent_at = CURRENT_TIMESTAMP, meta_message_id = ${messageId}
           WHERE id = ${job.id}
         `;

         // Increment the overall campaign sent counter
         await sql`UPDATE OutreachCampaigns SET sent_count = sent_count + 1 WHERE id = ${job.campaign_id}`;
         sentCount++;

      } catch (err) {
         console.error(`Failed to send to ${job.phone}:`, err);
         await sql`UPDATE OutreachQueue SET status = 'Failed' WHERE id = ${job.id}`;
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: pendingQueue.length, 
      sent: sentCount 
    });

  } catch (error) {
    console.error("Cron processing error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}