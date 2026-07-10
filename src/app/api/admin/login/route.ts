import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    if (password === process.env.ADMIN_SECRET) {
      return NextResponse.json({
        success: true,
        token: process.env.ADMIN_SECRET,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: "Invalid password",
      },
      {
        status: 401,
      }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Bad Request" },
      { status: 400 }
    );
  }
}
