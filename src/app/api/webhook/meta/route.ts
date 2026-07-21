// app/api/webhook/meta/route.ts
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "@/lib/db";
import {
  sendConsultationSlotSelection,
  sendBranchSelectionList,
  sendDateSelectionList,
  sendWhatsAppText,
} from "@/lib/whatsapp";
import {
  getAvailableSlots,
  isDateBlocked,
} from "@/lib/slots";

function verifyMetaSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.META_APP_SECRET) return false;
  const expected = "sha256=" + createHmac("sha256", process.env.META_APP_SECRET).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("hub.mode") === "subscribe" && searchParams.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get("hub.challenge"), { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const body = JSON.parse(rawBody);
    if (body.object !== "whatsapp_business_account") return new NextResponse("OK", { status: 200 });

    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contacts = body.entry?.[0]?.changes?.[0]?.value?.contacts;
    if (!msg) return new NextResponse("OK", { status: 200 });

    const senderPhone = msg.from;
    const senderName = contacts?.[0]?.profile?.name || "WhatsApp User";

    // ── Scenario A: Plain text message ───────────────────────────────────────
    if (msg.type === "text") {
      const textBody = (msg.text?.body || "").toLowerCase();

      if (
        textBody.includes("consultation") || 
        textBody.includes("book") ||
        textBody.includes("view slots") ||
        textBody.includes("slots")
      ) {
        await sendBranchSelectionList(senderPhone);
      } else {
        // Only trigger if there is NO pending website form state for this phone number
        const stateCheck = await sql`SELECT selected_service FROM ConversationState WHERE phone = ${senderPhone}`;
        
        if (stateCheck.length === 0 || !stateCheck[0].selected_service) {
          const welcomeMessage =
            `👋 Welcome to *Finvista Chartered Accountants*.\n\n` +
            `You can request a consultation directly through our website:\n` +
            `🌐 https://finvistaca.com\n\n` +
            `Or simply reply with *Book* to continue your consultation booking on WhatsApp.\n\n` +
            `For further assistance, call us on +91 83408 14350.`;

          await sendWhatsAppText(senderPhone, welcomeMessage);
        }
      }
    }

    if (msg.type === "button" || (msg.type === "interactive" && msg.interactive?.type === "button_reply")) {
      await sendBranchSelectionList(senderPhone);
    }

    if (msg.type === "interactive" && msg.interactive?.type === "list_reply") {
      const selectedId = msg.interactive.list_reply.id as string;
      const selectedTitle = msg.interactive.list_reply.title as string;

      if (selectedId.startsWith("BRANCH_")) {
        const branch = selectedId.replace("BRANCH_", "");
        await sql`
          INSERT INTO ConversationState (phone, selected_branch)
          VALUES (${senderPhone}, ${branch})
          ON CONFLICT (phone) DO UPDATE SET selected_branch = EXCLUDED.selected_branch, updated_at = CURRENT_TIMESTAMP
        `;
        await sendDateSelectionList(senderPhone);
      } else if (selectedId.startsWith("DATE_")) {
        const selectedDate = selectedId.replace("DATE_", "");
        if (await isDateBlocked(selectedDate)) {
          await sendWhatsAppText(senderPhone, `Sorry, ${selectedTitle} is unavailable.`);
          await sendDateSelectionList(senderPhone);
          return new NextResponse("OK", { status: 200 });
        }
        await sql`
          UPDATE ConversationState SET selected_date = ${selectedDate}, updated_at = CURRENT_TIMESTAMP WHERE phone = ${senderPhone}
        `;
        const state = await sql`SELECT selected_branch FROM ConversationState WHERE phone = ${senderPhone}`;
        if (state.length === 0) {
          await sendBranchSelectionList(senderPhone);
        } else {
          const slots = await getAvailableSlots(selectedDate, state[0].selected_branch);
          if (slots.length === 0) {
            await sendWhatsAppText(senderPhone, `No slots available on ${selectedTitle}.`);
            await sendDateSelectionList(senderPhone);
          } else {
            await sendConsultationSlotSelection(senderPhone, slots, selectedDate, 0);
          }
        }
      } else if (selectedId.startsWith("MORE_")) {
        const [, targetDate, nextIndexStr] = selectedId.split("_");
        const state = await sql`SELECT selected_branch FROM ConversationState WHERE phone = ${senderPhone}`;
        if (state.length > 0) {
          const slots = await getAvailableSlots(targetDate, state[0].selected_branch);
          await sendConsultationSlotSelection(senderPhone, slots, targetDate, parseInt(nextIndexStr, 10));
        } else {
          await sendBranchSelectionList(senderPhone);
        }
      } else if (selectedId.startsWith("SLOT_")) {
        const slotIdFromPayload = selectedId.replace("SLOT_", "").trim();
        
        const clientRes = await sql`
          INSERT INTO Clients (name, phone) VALUES (${senderName}, ${senderPhone})
          ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id
        `;
        const clientId = clientRes[0].id;

        const stateRes = await sql`SELECT selected_branch, selected_date, selected_service FROM ConversationState WHERE phone = ${senderPhone}`;
        const state = stateRes[0] || {};
        const chosenService = state.selected_service || "General Consultation";

        let slotRes = await sql`
          UPDATE TimeSlots SET is_booked = TRUE, status = 'Booked'
          WHERE id = ${slotIdFromPayload}::integer AND (is_booked = FALSE OR is_booked IS NULL)
          RETURNING id, branch, date, time
        `;

        if (slotRes.length === 0 && state.selected_branch && state.selected_date) {
          slotRes = await sql`
            UPDATE TimeSlots SET is_booked = TRUE, status = 'Booked'
            WHERE branch = ${state.selected_branch} 
              AND date = ${state.selected_date}::date 
              AND (is_booked = FALSE OR is_booked IS NULL)
              AND (to_char(time, 'HH12:MI AM') ILIKE ${"%" + selectedTitle + "%"} OR to_char(time, 'HH24:MI') ILIKE ${"%" + selectedTitle + "%"})
            RETURNING id, branch, date, time
          `;
        }

        if (slotRes.length === 0) {
          await sendWhatsAppText(senderPhone, "⚠️ Sorry, this slot was just booked. Please choose another time.");
        } else {
          const booked = slotRes[0];

          await sql`
            INSERT INTO Consultations (client_id, slot_id, branch, service, status, date, time)
            VALUES (${clientId}, ${booked.id}, ${booked.branch}, ${chosenService}, 'Confirmed', ${booked.date}, ${booked.time})
          `;

          await sql`DELETE FROM ConversationState WHERE phone = ${senderPhone}`;
          
          const fmtDate = new Date(booked.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
          
          await sendWhatsAppText(
            senderPhone, 
            `✅ Your consultation has been successfully booked!\n\n📍 *Branch:* ${booked.branch}\n🛠️ *Service:* ${chosenService}\n📅 *Date:* ${fmtDate}\n⏰ *Time:* ${selectedTitle}\n\nWe will share the meeting details shortly.`
          );
        }
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }

  return new NextResponse("OK", { status: 200 });
}