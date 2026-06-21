import { NextResponse } from "next/server";

/**
 * Supabase webhook receiver.
 *
 * TODO: Handle specific Supabase webhook events (auth.user.created, etc.)
 * For production, verify the webhook signature using Supabase's signing key.
 * See: https://supabase.com/docs/guides/database/webhooks
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Supabase webhook received:", body.type ?? "unknown");
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
