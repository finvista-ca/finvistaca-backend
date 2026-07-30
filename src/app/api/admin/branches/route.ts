import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const branches = await sql`SELECT id, branch_name, address, phone, email FROM Branches ORDER BY id ASC`;
    return NextResponse.json({ success: true, branches });
  } catch (error) {
    console.error("Fetch Branches Error:", error);
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { branch_name, address, phone, email } = await request.json();
    if (!branch_name || !address) {
      return NextResponse.json({ error: "Branch name and address are required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO Branches (branch_name, address, phone, email)
      VALUES (${branch_name}, ${address}, ${phone || null}, ${email || null})
      RETURNING id, branch_name, address, phone, email
    `;

    return NextResponse.json({ success: true, branch: result[0] });
  } catch (error) {
    console.error("Add Branch Error:", error);
    return NextResponse.json({ error: "Failed to add branch" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await sql`DELETE FROM Branches WHERE id = ${id}`;
    return NextResponse.json({ success: true, message: "Branch deleted" });
  } catch (error) {
    console.error("Delete Branch Error:", error);
    return NextResponse.json({ error: "Failed to delete branch" }, { status: 500 });
  }
}