import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ balance: null, authenticated: false });
    }

    const { data, error } = await supabase
      .from("credits")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (error) {
      // No credits row yet (edge case: signup trigger hasn't fired)
      if (error.code === "PGRST116") {
        return NextResponse.json({ balance: 0, authenticated: true });
      }
      console.debug("Credits fetch error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch credits" },
        { status: 500 }
      );
    }

    return NextResponse.json({ balance: data.balance, authenticated: true });
  } catch (err) {
    console.debug("Credits API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
