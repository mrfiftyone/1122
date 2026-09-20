import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/admin-verify
 *
 * Server-side verification of admin/owner role for sensitive operations.
 * Checks the user's role against the Supabase database, NOT trusting
 * what the client sends in localStorage.
 *
 * Body: { username: string, action: string }
 * Returns: { authorized: boolean, role: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();

    // Get the JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ authorized: false, error: "missing_token" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase env vars not configured for admin-verify");
      return NextResponse.json({ authorized: false, error: "server_config_error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Verify the JWT and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ authorized: false, error: "invalid_token" }, { status: 401 });
    }

    // 2. Query the profiles table for the user's role using their UUID
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { authorized: false, role: "student", note: "role_not_found_in_db" },
        { status: 200 }
      );
    }

    const role = data.role || "student";
    const isAuthorized = role === "owner" || role === "mod";

    return NextResponse.json({
      authorized: isAuthorized,
      role,
      action,
    });
  } catch (err) {
    console.error("Admin verify error:", err);
    return NextResponse.json({ authorized: false, error: "internal_error" }, { status: 500 });
  }
}
