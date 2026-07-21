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

// ─── Helper: Send Service Selection Interactive List (Multiple Sections) ───────
async function sendServiceSelectionList(phone: string) {
  // WhatsApp interactive lists allow up to 10 rows total across all sections.
  // Grouping all core categories so users can access every service type.
  const sections = [
    {
      title: "Business Registration",
      rows: [
        { id: "SERV_BUS_1", title: "Private Limited Co." },
        { id: "SERV_BUS_2", title: "Limited Liability Partnership" },
        { id: "SERV_BUS_3", title: "Proprietorship / Partnership" },
        { id: "SERV_BUS_4", title: "Section 8 / Trust / Society" },
      ],
    },
    {
      title: "Tax & Compliance",
      rows: [
        { id: "SERV_TAX_1", title: "Personal Tax Advisory" },
        { id: "SERV_TAX_2", title: "Corporate Tax Advisory" },
        { id: "SERV_TAX_3", title: "ROC Annual Compliance" },
        { id: "SERV_TAX_4", title: "GST Advisory & Returns" },
      ],
    },
    {
      title: "Audits, Licenses & Loans",
      rows: [
        { id: "SERV_OTH_1", title: "Statutory & Tax Audit" },
        { id: "SERV_OTH_2", title: "FSSAI, ISO & MSME Reg." },
        { id: "SERV_OTH_3", title: "Business Loan Assistance" },
        { id: "SERV_OTH_4", title: "General Consultation" },
      ],
    },
  ];

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "Select Service Category" },
      body: { text: "Please choose the primary category and service you require for your consultation." },
      footer: { text: "Finvista Chartered Accountants" },
      action: {
        button: "Choose Service",
        sections: sections,
      },
    },
  };

  const token = process.env.META_WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

  await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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

  if (!verifyMetaSignature(rawBody, signature)) {
    console.warn("Invalid Meta webhook signature — request rejected.");
    return new NextResponse("Forbidden", { status: 403 });
  }

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

        // Check if service was already provided via website frontend form submission
        const stateRes = await sql`
          SELECT selected_service FROM ConversationState WHERE phone = ${senderPhone}
        `;
        const existingService = stateRes[0]?.selected_service;

        if (!existingService) {
          // If started directly in WhatsApp, prompt for full service list selection next!
          await sendServiceSelectionList(senderPhone);
        } else {
          // If initiated from website form, skip service selection and go straight to date selection
          await sendDateSelectionList(senderPhone);
        }
      }

      // ── B.1.5: Service Selected (For direct WhatsApp users) ───────────
      else if (selectedId.startsWith("SERV_")) {
        const chosenService = selectedTitle;

        await sql`
          UPDATE ConversationState
          SET
            selected_service = ${chosenService},
            updated_at = CURRENT_TIMESTAMP
          WHERE phone = ${senderPhone}
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
          return new NextResponse("OK", { status: 200 });
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
        const slotIdFromPayload = selectedId.replace("SLOT_", "");

        // 1. Ensure the Client exists in the database
        const clientRes = await sql`
          INSERT INTO Clients (name, phone)
          VALUES (${senderName}, ${senderPhone})
          ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `;
        const clientId = clientRes[0].id;

        // 2. Fetch stored conversation state (branch, date, service) with fallback
        const stateRes = await sql`
          SELECT selected_branch, selected_date, selected_service 
          FROM ConversationState 
          WHERE phone = ${senderPhone}
        `;

        if (stateRes.length === 0) {
          await sendWhatsAppText(senderPhone, "⚠️ Session expired. Please reply with *Book* to restart.");
          return new NextResponse("OK", { status: 200 });
        }

        const { selected_branch, selected_date, selected_service } = stateRes[0];
        const chosenService = selected_service || "General Consultation";

        // 3. Fallback matching: Match by ID first, then by branch, date, and time text
        let slotRes = await sql`
          UPDATE TimeSlots
          SET is_booked = TRUE, status = 'Booked'
          WHERE id = ${slotIdFromPayload} AND (is_booked = FALSE OR is_booked IS NULL)
          RETURNING id, branch, date, time
        `;

        if (slotRes.length === 0 && selected_branch && selected_date) {
          slotRes = await sql`
            UPDATE TimeSlots
            SET is_booked = TRUE, status = 'Booked'
            WHERE branch = ${selected_branch}
              AND date = ${selected_date}::date
              AND (is_booked = FALSE OR is_booked IS NULL)
              AND (
                to_char(time, 'HH12:MI AM') ILIKE ${"%" + selectedTitle + "%"}
                OR to_char(time, 'HH24:MI') ILIKE ${"%" + selectedTitle + "%"}
              )
            RETURNING id, branch, date, time
          `;
        }

        if (slotRes.length === 0) {
          await sendWhatsAppText(
            senderPhone,
            "⚠️ Sorry, this slot was just booked by someone else or couldn't be matched. Please choose another time."
          );
        } else {
          const bookedSlot = slotRes[0];

          // 4. Create the actual Consultation record WITH the correct service
          await sql`
            INSERT INTO Consultations (client_id, slot_id, branch, service, status, date, time)
            VALUES (${clientId}, ${bookedSlot.id}, ${bookedSlot.branch}, ${chosenService}, 'Confirmed', ${bookedSlot.date}, ${bookedSlot.time})
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
            `✅ Your consultation has been successfully booked!\n\n📍 *Branch:* ${bookedSlot.branch}\n🛠️ *Service:* ${chosenService}\n📅 *Date:* ${formattedDate}\n⏰ *Time:* ${selectedTitle}\n\nWe will share the meeting details shortly.`
          );
        }
      }
    } 

  } catch (error) {
    console.error("🚨 Webhook processing error:", error);
  }

  return new NextResponse("OK", { status: 200 });
}