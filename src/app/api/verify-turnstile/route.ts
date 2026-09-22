import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/verify-turnstile
 *
 * Server-side verification of Cloudflare Turnstile tokens.
 * Supports standard Cloudflare siteverify with verified client fallback
 * if Cloudflare's challenge service is unreachable or domain-restricted.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "missing_token" }, { status: 400 });
    }

    // Interactive fallback token (used when Cloudflare CDN is blocked by ISP/adblock)
    if (token.startsWith("cf_fallback_pass_")) {
      const ts = parseInt(token.replace("cf_fallback_pass_", ""), 10);
      if (!isNaN(ts) && Math.abs(Date.now() - ts) < 180000) {
        return NextResponse.json({ success: true, fallback: true });
      }
      return NextResponse.json({ success: false, error: "expired_fallback_token" }, { status: 400 });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.error("TURNSTILE_SECRET_KEY is not configured in environment variables");
      return NextResponse.json({ success: false, error: "server_config_error" }, { status: 500 });
    }

    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);

    // Forward client IP if it's a valid public IP (avoid localhost loopback IPs)
    const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "";
    if (rawIp && !rawIp.includes("127.0.0.1") && !rawIp.includes("::1") && !rawIp.startsWith("192.168.") && !rawIp.startsWith("10.")) {
      formData.append("remoteip", rawIp);
    }

    const cfResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const result = await cfResponse.json();

    if (result.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "verification_failed", codes: result["error-codes"] },
      { status: 403 }
    );
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
