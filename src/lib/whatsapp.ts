const GRAPH_API_VERSION = "v19.0";

const BRANCHES = [
  "Parvathipuram",
  "Vijayawada",
  "Visakhapatnam",
  "Bobbili",
  "Peddapuram",
  "Rayagada (Odisha)",
];

const getWhatsAppUrl = () => {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!phoneId) throw new Error("WHATSAPP_PHONE_ID is not defined.");

  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`;
};

const getHeaders = () => {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("WHATSAPP_TOKEN is not defined.");

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

async function sendToMeta(body: object): Promise<{ message_id?: string }> {
  const res = await fetch(getWhatsAppUrl(), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Meta API error:", JSON.stringify(data));
    throw new Error(data?.error?.message ?? `Meta API returned ${res.status}`);
  }

  return {
    message_id: data?.messages?.[0]?.id,
  };
}

/**
 * Sends a normal WhatsApp text message.
 */
export async function sendWhatsAppText(to: string, text: string) {
  return sendToMeta({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: text,
    },
  });
}

/**
 * Generic Interactive List
 */
export async function sendToMetaList(
  to: string,
  options: {
    header: string;
    body: string;
    footer: string;
    buttonLabel: string;
    sectionTitle: string;
    rows: {
      id: string;
      title: string;
      description?: string;
    }[];
  }
) {
  return sendToMeta({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: options.header,
      },
      body: {
        text: options.body,
      },
      footer: {
        text: options.footer,
      },
      action: {
        button: options.buttonLabel,
        sections: [
          {
            title: options.sectionTitle,
            rows: options.rows,
          },
        ],
      },
    },
  });
}

/**
 * Branch Selection
 */
export async function sendBranchSelectionList(to: string) {
  const rows = BRANCHES.map((branch) => ({
    id: `BRANCH_${branch}`,
    title: branch,
    description: "Select this branch",
  }));

  return sendToMetaList(to, {
    header: "Choose Branch",
    body: "Please select the branch where you would like to book your consultation.",
    footer: "Finvista Chartered Accountants",
    buttonLabel: "Select Branch",
    sectionTitle: "Available Branches",
    rows,
  });
}

/**
 * Consultation Date Selection
 */
export async function sendDateSelectionList(to: string) {

  const dates = [];
  const today = new Date();

  let added = 0;

  while (added < 10) {

    const d = new Date(today);
    d.setDate(today.getDate() + added);

    // Skip Sundays
    if (d.getDay() === 0) {
      added++;
      continue;
    }

    const iso =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");

    dates.push({
      id: `DATE_${iso}`,
      title: d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      description: added === 0 ? "Today" : "",
    });

    added++;
  }

  return sendToMetaList(to, {
    header: "Choose Date",
    body: "Please select your preferred consultation date.",
    footer: "Finvista Chartered Accountants",
    buttonLabel: "Select Date",
    sectionTitle: "Available Dates",
    rows: dates,
  });
}

/**
 * Sends WhatsApp Template Message
 * Used after website consultation request
 * and for Bulk Reminder Campaigns.
 */
export async function sendOutreachTemplate(
  to: string,
  templateName: string,
  variables: string[]
): Promise<{ message_id?: string }> {
  return sendToMeta({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: "en",
      },
      components: [
        {
          type: "body",
          parameters: variables.map((text) => ({
            type: "text",
            text,
          })),
        },
      ],
    },
  });
}

/**
 * Consultation Slot Selection
 */
export async function sendConsultationSlotSelection(
  to: string,
  slots: {
    id: number;
    time: string;
  }[],
  date: string,
  startIndex = 0
) {
  const batch = slots.slice(startIndex, startIndex + 9);

  const rows = batch.map((slot) => ({
    id: `SLOT_${slot.id}`,
    title: slot.time,
    description: "Select this consultation slot",
  }));

  if (slots.length > startIndex + 9) {
    rows.push({
      id: `MORE_${date}_${startIndex + 9}`,
      title: "▶ View More Slots",
      description: "Show additional consultation timings",
    });
  }

  return sendToMetaList(to, {
    header: "Consultation Slots",
    body: `Please select your preferred consultation time for ${date}.`,
    footer: "Finvista Chartered Accountants",
    buttonLabel: "Select Slot",
    sectionTitle:
      startIndex === 0
        ? "Available Slots"
        : "More Available Slots",
    rows,
  });
}