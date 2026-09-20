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
    const { username, action } = await req.json();

    if (!username || typeof username !== "string") {
      return NextResponse.json({ authorized: false, error: "missing_username" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // If service key is available, use it for privileged reads
    // Otherwise fall back to anon key (with RLS)
    const supabaseKey = supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase env vars not configured for admin-verify");
      return NextResponse.json({ authorized: false, error: "server_config_error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query the profiles/users table for the user's role
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("username", username)
      .single();

    if (error || !data) {
      // If profiles table doesn't have role column, this is expected
      // For now, return unauthorized - will work once RLS and roles table is set up
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
