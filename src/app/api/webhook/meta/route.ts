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

    // Check if the user has an active conversation state. 
    // If they don't have an active state, check if they booked recently to ignore stale list clicks.
    const stateCheck = await sql`
      SELECT selected_service, selected_branch, selected_date 
      FROM ConversationState 
      WHERE phone = ${senderPhone}
    `;

    // ── 1. HANDLE LIST REPLIES (Interactive selection clicks) ──────────
    if (msg.type === "interactive" && msg.interactive?.type === "list_reply") {
      const selectedId = msg.interactive.list_reply.id as string;
      const selectedTitle = msg.interactive.list_reply.title as string;

      // If a user clicks an old list option after their state was deleted (booking finished), ignore it completely
      if (stateCheck.length === 0 && !selectedId.startsWith("SLOT_")) {
        return new NextResponse("OK", { status: 200 });
      }

      // B.1: Branch Selected
      if (selectedId.startsWith("BRANCH_")) {
        const branch = selectedId.replace("BRANCH_", "");

        await sql`
          INSERT INTO ConversationState (phone, selected_branch)
          VALUES (${senderPhone}, ${branch})
          ON CONFLICT (phone)
          DO UPDATE SET
            selected_branch = EXCLUDED.selected_branch,
            updated_at = CURRENT_TIMESTAMP
        `;

        await sendDateSelectionList(senderPhone);
        return new NextResponse("OK", { status: 200 });
      }

      // B.2: Date Selected
      else if (selectedId.startsWith("DATE_")) {
        const selectedDate = selectedId.replace("DATE_", "");
        const blocked = await isDateBlocked(selectedDate);

        if (blocked) {
          await sendWhatsAppText(
            senderPhone,
            `Sorry, ${selectedTitle} is unavailable. Please choose another date.`
          );
          await sendDateSelectionList(senderPhone);
          return new NextResponse("OK", { status: 200 });
        }

        await sql`
          UPDATE ConversationState
          SET selected_date = ${selectedDate}, updated_at = CURRENT_TIMESTAMP
          WHERE phone = ${senderPhone}
        `;

        const state = await sql`
          SELECT selected_branch FROM ConversationState WHERE phone = ${senderPhone}
        `;

        if (state.length === 0) {
          await sendBranchSelectionList(senderPhone);
        } else {
          const branch = state[0].selected_branch as string;
          const slots = await getAvailableSlots(selectedDate, branch);

          if (slots.length === 0) {
            await sendWhatsAppText(
              senderPhone,
              `No consultation slots are available on ${selectedTitle}. Please choose another date.`
            );
            await sendDateSelectionList(senderPhone);
          } else {
            await sendConsultationSlotSelection(senderPhone, slots, selectedDate, 0);
          }
        }
        return new NextResponse("OK", { status: 200 });
      }

      // B.3: "View More" Slots Pagination Selected
      else if (selectedId.startsWith("MORE_")) {
        const parts = selectedId.split("_"); 
        const targetDate = parts[1];
        const nextIndex = parseInt(parts[2], 10);

        const state = await sql`
          SELECT selected_branch FROM ConversationState WHERE phone = ${senderPhone}
        `;

        if (state.length > 0) {
          const branch = state[0].selected_branch as string;
          const slots = await getAvailableSlots(targetDate, branch);
          await sendConsultationSlotSelection(senderPhone, slots, targetDate, nextIndex);
        } else {
          await sendBranchSelectionList(senderPhone);
        }
        return new NextResponse("OK", { status: 200 });
      }

      // B.4: Final Time Slot Selected
      else if (selectedId.startsWith("SLOT_")) {
        // Prevent double booking if already processed
        const activeState = stateCheck[0] || {};
        const slotIdStr = selectedId.replace("SLOT_", "").trim();
        const slotIdNum = parseInt(slotIdStr, 10);

        const clientRes = await sql`
          INSERT INTO Clients (name, phone)
          VALUES (${senderName}, ${senderPhone})
          ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `;
        const clientId = clientRes[0].id;

        const chosenService = activeState.selected_service || "General Consultation";

        let bookedSlot = null;

        const slotRes = await sql`
          UPDATE TimeSlots
          SET is_booked = TRUE, status = 'Booked'
          WHERE id = ${slotIdNum} AND is_booked = FALSE
          RETURNING id, branch, date, time
        `;

        if (slotRes.length > 0) {
          bookedSlot = slotRes[0];
        } else if (activeState.selected_branch && activeState.selected_date) {
          const fallbackRes = await sql`
            UPDATE TimeSlots
            SET is_booked = TRUE, status = 'Booked'
            WHERE branch = ${activeState.selected_branch} 
              AND date = ${activeState.selected_date}::date 
              AND is_booked = FALSE
              AND (
                to_char(time, 'HH12:MI AM') ILIKE ${"%" + selectedTitle + "%"}
                OR to_char(time, 'HH24:MI') ILIKE ${"%" + selectedTitle + "%"}
              )
            RETURNING id, branch, date, time
          `;
          if (fallbackRes.length > 0) {
            bookedSlot = fallbackRes[0];
          }
        }

        if (!bookedSlot) {
          await sendWhatsAppText(
            senderPhone,
            "⚠️ Sorry, this slot was already booked or is no longer available. Please type *Book* to start a new selection."
          );
        } else {
          await sql`
            INSERT INTO Consultations (client_id, slot_id, branch, service, status, date, time)
            VALUES (${clientId}, ${bookedSlot.id}, ${bookedSlot.branch}, ${chosenService}, 'Confirmed', ${bookedSlot.date}, ${bookedSlot.time})
          `;

          const formattedDate = new Date(bookedSlot.date).toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short"
          });

          await sendWhatsAppText(
            senderPhone,
            `✅ Your consultation has been successfully booked!\n\n📍 *Branch:* ${bookedSlot.branch}\n🛠️ *Service:* ${chosenService}\n📅 *Date:* ${formattedDate}\n⏰ *Time:* ${selectedTitle}\n\nWe will share the meeting details shortly.`
          );

          // Permanently wipe out conversation state to close the session
          await sql`DELETE FROM ConversationState WHERE phone = ${senderPhone}`;
        }
        return new NextResponse("OK", { status: 200 });
      }
    }

    // ── 2. HANDLE PLAIN TEXT MESSAGES ────────────────────────────────────────
    if (msg.type === "text") {
      const textBody = (msg.text?.body || "").toLowerCase();

      if (
        textBody.includes("consultation") || 
        textBody.includes("book") ||
        textBody.includes("view slots") ||
        textBody.includes("slots")
      ) {
        await sql`DELETE FROM ConversationState WHERE phone = ${senderPhone}`;
        await sendBranchSelectionList(senderPhone);
      } else {
        // If they text something else after completing a booking, keep it closed or give a gentle guide
        if (stateCheck.length === 0) {
          await sendWhatsAppText(
            senderPhone,
            `Your consultation booking is closed. If you need to book another session, simply reply with *Book*.`
          );
        }
      }
      return new NextResponse("OK", { status: 200 });
    }

    // ── 3. HANDLE BUTTON CLICKS ──────────────────────────────────────────────
    if (msg.type === "button" || (msg.type === "interactive" && msg.interactive?.type === "button_reply")) {
      await sql`DELETE FROM ConversationState WHERE phone = ${senderPhone}`;
      await sendBranchSelectionList(senderPhone);
      return new NextResponse("OK", { status: 200 });
    }

  } catch (error) {
    console.error("🚨 Webhook processing error:", error);
  }

  return new NextResponse("OK", { status: 200 });
}