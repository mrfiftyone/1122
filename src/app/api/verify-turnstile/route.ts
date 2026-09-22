import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/verify-turnstile
 *
 * Canonical server-side verification of Cloudflare Turnstile tokens.
 * Validates token authenticity, single-use redemption, expected action, and allowed hostnames.
 * The secret key is never exposed to the client.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body.token || body["cf-turnstile-response"];
    const expectedAction = body.action;

    if (!token || typeof token !== "string" || token.length === 0 || token.length > 2048) {
      return NextResponse.json({ success: false, error: "invalid_or_missing_token" }, { status: 400 });
    }

    const secretKey = process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.error("[Turnstile] Neither TURNSTILE_SECRET nor TURNSTILE_SECRET_KEY is configured");
      return NextResponse.json({ success: false, error: "server_config_error" }, { status: 500 });
    }

    const expectedHostnames = new Set(
      (process.env.TURNSTILE_HOSTNAMES || "1122-green.vercel.app,localhost,127.0.0.1")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    );

    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);

    // Forward client IP if it is a valid non-loopback IP
    const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "";
    if (rawIp && !rawIp.includes("127.0.0.1") && !rawIp.includes("::1") && !rawIp.startsWith("192.168.") && !rawIp.startsWith("10.")) {
      formData.append("remoteip", rawIp);
    }

    let result: {
      success: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
      action?: string;
      cdata?: string;
    };

    try {
      const cfResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
        body: formData.toString(),
      });

      if (!cfResponse.ok) {
        console.error(`[Turnstile] siteverify HTTP status ${cfResponse.status}`);
        return NextResponse.json(
          { success: false, error: `siteverify_http_${cfResponse.status}` },
          { status: 502 }
        );
      }

      result = await cfResponse.json();
    } catch (fetchErr) {
      console.error("[Turnstile] Network error during siteverify:", fetchErr);
      return NextResponse.json({ success: false, error: "upstream_timeout_or_network_error" }, { status: 504 });
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "verification_failed", codes: result["error-codes"] },
        { status: 403 }
      );
    }

    // Hostname validation
    if (result.hostname && expectedHostnames.size > 0) {
      const resultHost = result.hostname.toLowerCase();
      if (!expectedHostnames.has(resultHost)) {
        console.warn(`[Turnstile] Hostname rejected: "${result.hostname}". Allowed:`, Array.from(expectedHostnames));
        return NextResponse.json(
          { success: false, error: "hostname_mismatch", hostname: result.hostname },
          { status: 403 }
        );
      }
    }

    // Action validation (if specified by both client and challenge response)
    if (expectedAction && result.action && result.action !== expectedAction) {
      console.warn(`[Turnstile] Action mismatch: expected "${expectedAction}", got "${result.action}"`);
      return NextResponse.json(
        { success: false, error: "action_mismatch" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      hostname: result.hostname,
      action: result.action,
    });
  } catch (err) {
    console.error("[Turnstile] Internal verification error:", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
