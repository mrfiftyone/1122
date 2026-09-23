import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/share-post
 *
 * Increments the global share count for a post.
 * Calls the Supabase SECURITY DEFINER RPC function 'increment_post_shares',
 * with optional service role bypass if configured.
 *
 * Body: { postId: string }
 * Returns: { success: boolean, shares_count: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const postId = body?.postId;

    if (!postId || typeof postId !== "string") {
      return NextResponse.json({ error: "missing_post_id" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vulngzfutcalxgbsdypr.supabase.co";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_e9jy5AC9STz0_rURl45mEg_QL98ndo5";

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // 1. Attempt to execute RPC function (runs as DB owner)
    const { data: rpcCount, error: rpcError } = await supabase.rpc("increment_post_shares", {
      target_post_id: postId,
    });

    if (!rpcError && typeof rpcCount === "number") {
      return NextResponse.json({ success: true, shares_count: rpcCount });
    }

    // 2. If service role key is available, execute direct admin update
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data: post } = await supabase
        .from("posts")
        .select("shares_count")
        .eq("id", postId)
        .single();

      const current = post?.shares_count || 0;
      const next = current + 1;

      const { error: updateError } = await supabase
        .from("posts")
        .update({ shares_count: next })
        .eq("id", postId);

      if (!updateError) {
        return NextResponse.json({ success: true, shares_count: next });
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: rpcError?.message || "rpc_not_found",
        note: "Run supabase-shares-bookmarks.sql in Supabase Dashboard to enable global cloud share counting",
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in /api/share-post:", err);
    return NextResponse.json({ error: err?.message || "server_error" }, { status: 500 });
  }
}
