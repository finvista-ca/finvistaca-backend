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

// ─── Signature verification ───────────────────────────────────────────────────
function verifyMetaSignature(
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature || !process.env.META_APP_SECRET) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", process.env.META_APP_SECRET)
      .update(rawBody, "utf8")
      .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ─── GET: Webhook verification ────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, {
      status: 200,
    });
  }

  return new NextResponse("Forbidden", {
    status: 403,
  });
}

// ─── POST: Handle incoming WhatsApp messages ──────────────────────────────────
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // ==========================================
  // 🚨 TEMPORARILY DISABLED FOR DEBUGGING 🚨
  // ==========================================
  
  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("Invalid Meta webhook signature — request rejected.");
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 1. MASSIVE LOG TO PROVE META IS TALKING TO VERCEL
  console.log("====================================");
  console.log("🚨 WEBHOOK HIT! INCOMING DATA 🚨");
  console.log(rawBody);
  console.log("====================================");

  try {
    const body = JSON.parse(rawBody);

    if (body.object !== "whatsapp_business_account") {
      return new NextResponse("Not WhatsApp", { status: 200 });
    }

    const changes = body.entry?.[0]?.changes?.[0]?.value;
    const messages = changes?.messages;
    const contacts = changes?.contacts;

    if (!messages || messages.length === 0) {
      return new NextResponse("No messages", { status: 200 });
    }

    const msg = messages[0];
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
        const welcomeMessage =
          `👋 Welcome to *Finvista Chartered Accountants*.\n\n` +
          `You can request a consultation directly through our website:\n` +
          `🌐 https://finvistaca.com\n\n` +
          `Or simply reply with *Book* to continue your consultation booking on WhatsApp.\n\n` +
          `For further assistance, call us on +91 83408 14350.`;

        await sendWhatsAppText(senderPhone, welcomeMessage);
      }
    }

    // ── Scenario A.2: User taps template button ──────────────────────────────
    if (msg.type === "button") {
      const buttonText = (msg.button?.text || "").toLowerCase();
      
      if (
        buttonText.includes("book") || 
        buttonText.includes("consultation") || 
        buttonText.includes("view slots") ||
        buttonText.includes("slots")
      ) {
        await sendBranchSelectionList(senderPhone);
      }
    }

    if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
      const buttonTitle = (msg.interactive.button_reply?.title || "").toLowerCase();
      const buttonId = (msg.interactive.button_reply?.id || "").toLowerCase();

      if (
        buttonTitle.includes("book") || 
        buttonTitle.includes("view slots") || 
        buttonTitle.includes("slots") ||
        buttonId.includes("book")
      ) {
        await sendBranchSelectionList(senderPhone);
      }
    }
    // ── Scenario B: User selects from an interactive LIST ────────────────────────
    if (msg.type === "interactive" && msg.interactive?.type === "list_reply") {
      const selectedId = msg.interactive.list_reply.id as string;
      const selectedTitle = msg.interactive.list_reply.title as string;

      // ── B.1: Branch Selected ─────────────────────────────────────────
      if (selectedId.startsWith("BRANCH_")) {
        const branch = selectedId.replace("BRANCH_", "");

        await sql`
          INSERT INTO ConversationState (
            phone,
            selected_branch
          )
          VALUES (
            ${senderPhone},
            ${branch}
          )
          ON CONFLICT (phone)
          DO UPDATE SET
            selected_branch = EXCLUDED.selected_branch,
            updated_at = CURRENT_TIMESTAMP
        `;

        await sendDateSelectionList(senderPhone);
      }

      // ── B.2: Date Selected ───────────────────────────────────────────
      else if (selectedId.startsWith("DATE_")) {
        const selectedDate = selectedId.replace("DATE_", "");

        const blocked = await isDateBlocked(selectedDate);

        if (blocked) {
          await sendWhatsAppText(
            senderPhone,
            `Sorry, ${selectedTitle} is unavailable. Please choose another date.`
          );
          await sendDateSelectionList(senderPhone);
          return new NextResponse("OK", { status: 200 }); // Exit early
        }

        await sql`
          UPDATE ConversationState
          SET
            selected_date = ${selectedDate},
            updated_at = CURRENT_TIMESTAMP
          WHERE phone = ${senderPhone}
        `;

        const state = await sql`
          SELECT selected_branch
          FROM ConversationState
          WHERE phone = ${senderPhone}
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
            await sendConsultationSlotSelection(
              senderPhone,
              slots,
              selectedDate,
              0
            );
          }
        }
      }

      // ── B.3: "View More" Slots Pagination Selected ───────────────────
      else if (selectedId.startsWith("MORE_")) {
        const parts = selectedId.split("_"); 
        const targetDate = parts[1];
        const nextIndex = parseInt(parts[2], 10);

        const state = await sql`
          SELECT selected_branch
          FROM ConversationState
          WHERE phone = ${senderPhone}
        `;

        if (state.length > 0) {
          const branch = state[0].selected_branch as string;
          const slots = await getAvailableSlots(targetDate, branch);

          await sendConsultationSlotSelection(
            senderPhone,
            slots,
            targetDate,
            nextIndex
          );
        } else {
           await sendBranchSelectionList(senderPhone);
        }
      }

      // ── B.4: Final Time Slot Selected ─────────────────────────────────
      else if (selectedId.startsWith("SLOT_")) {
        const slotId = selectedId.replace("SLOT_", "");

        // 1. Ensure the Client exists in the database
        const clientRes = await sql`
          INSERT INTO Clients (name, phone)
          VALUES (${senderName}, ${senderPhone})
          ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `;
        const clientId = clientRes[0].id;

        // 2. Fetch stored service & branch state
        const stateRes = await sql`
          SELECT selected_service, selected_branch 
          FROM ConversationState 
          WHERE phone = ${senderPhone}
        `;
        const chosenService = stateRes[0]?.selected_service || "General Consultation";

        // 3. Mark the slot as booked
        const slotRes = await sql`
          UPDATE TimeSlots
          SET is_booked = TRUE, status = 'Booked'
          WHERE id = ${slotId} AND (is_booked = FALSE OR is_booked IS NULL)
          RETURNING branch, date, time
        `;

        if (slotRes.length === 0) {
          await sendWhatsAppText(
            senderPhone,
            "⚠️ Sorry, this slot was just booked by someone else. Please choose another date or time."
          );
        } else {
          const bookedSlot = slotRes[0];

          // 4. Create the actual Consultation record WITH the correct service
          await sql`
            INSERT INTO Consultations (client_id, slot_id, branch, service, status, date, time)
            VALUES (${clientId}, ${slotId}, ${bookedSlot.branch}, ${chosenService}, 'Confirmed', ${bookedSlot.date}, ${bookedSlot.time})
          `;

          // 5. Clean up the conversation state
          await sql`
            DELETE FROM ConversationState
            WHERE phone = ${senderPhone}
          `;
          
          const formattedDate = new Date(bookedSlot.date).toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short"
          });

          await sendWhatsAppText(
            senderPhone,
            `✅ Your consultation has been successfully booked!\n\n📍 *Branch:* ${bookedSlot.branch}\n🛠️ *Service:* ${chosenService}\n📅 *Date:* ${formattedDate}\n⏰ *Time:* ${bookedSlot.time}\n\nWe will share the meeting details shortly.`
          );
        }
      }
    } 

  } catch (error) {
    console.error("🚨 Webhook processing error:", error);
  }

  return new NextResponse("OK", { status: 200 });
}