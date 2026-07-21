import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in the environment.");
}

export const sql = neon(process.env.DATABASE_URL);

export async function initializeDatabase() {
  try {
    // ===========================
    // 1. Clients
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS Clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        do_not_contact BOOLEAN DEFAULT FALSE
      );
    `;

    // ===========================
    // 2. Time Slots
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS TimeSlots (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        branch VARCHAR(100) NOT NULL,
        is_booked BOOLEAN DEFAULT FALSE,
        UNIQUE(date, time, branch)
      );
    `;

    // ===========================
    // 3. Consultations
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS Consultations (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES Clients(id),
        slot_id INTEGER REFERENCES TimeSlots(id),
        service VARCHAR(255),
        branch VARCHAR(100),
        message TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // ===========================
    // 4. Outreach Campaigns
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS OutreachCampaigns (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        total_count INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // ===========================
    // 5. Outreach Queue
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS OutreachQueue (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES OutreachCampaigns(id),
        client_name VARCHAR(255),
        phone VARCHAR(20) NOT NULL,
        reminder_type TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        meta_message_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP
      );
    `;

    // ===========================
    // 6. Blocked Dates
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS BlockedDates (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL UNIQUE,
        reason TEXT
      );
    `;

    // ===========================
    // 7. Blocked Slots
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS BlockedSlots (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        branch VARCHAR(100) NOT NULL,
        reason TEXT,
        UNIQUE(date, time, branch)
      );
    `;

    // ===========================
    // 8. Career Applications
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS CareerApplications (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        position VARCHAR(255),
        cover_letter TEXT,
        resume_url TEXT,
        status VARCHAR(50) DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // ===========================
    // 9. Contact Enquiries
    // ===========================
    await sql`
      CREATE TABLE IF NOT EXISTS ContactEnquiries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        message TEXT,
        status VARCHAR(50) DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
  CREATE TABLE IF NOT EXISTS ConversationState (
    phone VARCHAR(20) PRIMARY KEY,
    selected_branch VARCHAR(100),
    selected_date DATE,
     selected_service VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;



    // ===========================
    // INDEXES
    // ===========================

    await sql`
      CREATE INDEX IF NOT EXISTS idx_consultations_client
      ON Consultations(client_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_consultations_status
      ON Consultations(status);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_outreach_campaign_status
      ON OutreachQueue(campaign_id, status);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_outreach_status
      ON OutreachQueue(status);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_timeslots_date_branch
      ON TimeSlots(date, branch, is_booked);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_blocked_dates
      ON BlockedDates(date);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_blocked_slots
      ON BlockedSlots(date, branch);
    `;

    console.log("Database schema initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}