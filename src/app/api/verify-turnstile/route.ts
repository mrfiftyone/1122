import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/verify-turnstile
 *
 * Canonical server-side verification of Cloudflare Turnstile tokens.
 * Validates token authenticity directly via Cloudflare's siteverify API.
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

    const secretKey =
      process.env.TURNSTILE_SECRET ||
      process.env.TURNSTILE_SECRET_KEY ||
      "0x4AAAAAAE9W7RCGlYp4ML6UIp8Gc4GGMVQ";

    // Build normalized hostname whitelist
    const rawHostnames = process.env.TURNSTILE_HOSTNAMES || "1122-green.vercel.app,localhost,127.0.0.1";
    const normalizeHost = (h: string) =>
      h.trim().replace(/^https?:\/\//i, "").replace(/:\d+$/, "").replace(/\/+$/, "").toLowerCase();

    const expectedHostnames = new Set(
      rawHostnames.split(",").map(normalizeHost).filter(Boolean)
    );

    const callSiteverify = async (secret: string) => {
      const formData = new URLSearchParams();
      formData.append("secret", secret);
      formData.append("response", token);

      const cfResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
        body: formData.toString(),
      });

      if (!cfResponse.ok) {
        throw new Error(`siteverify_http_${cfResponse.status}`);
      }

      return await cfResponse.json();
    };

    let result: {
      success: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
      action?: string;
      cdata?: string;
    };

    try {
      result = await callSiteverify(secretKey);
    } catch (fetchErr) {
      console.error("[Turnstile] Siteverify network error:", fetchErr);
      return NextResponse.json({ success: false, error: "upstream_timeout_or_network_error" }, { status: 504 });
    }

    if (!result.success) {
      console.warn("[Turnstile] Siteverify rejected token:", {
        codes: result["error-codes"],
        hostname: result.hostname,
        action: result.action,
      });
      return NextResponse.json(
        { success: false, error: "verification_failed", codes: result["error-codes"] },
        { status: 403 }
      );
    }

    // Hostname validation
    if (result.hostname) {
      const resultHost = normalizeHost(result.hostname);
      const reqHost = req.headers.get("host") ? normalizeHost(req.headers.get("host")!) : "";

      const isAllowed =
        expectedHostnames.has(resultHost) ||
        resultHost === reqHost ||
        resultHost.endsWith(".vercel.app") ||
        resultHost === "localhost" ||
        resultHost === "127.0.0.1";

      if (!isAllowed) {
        console.warn(`[Turnstile] Hostname rejected: "${result.hostname}". Allowed:`, Array.from(expectedHostnames));
        return NextResponse.json(
          { success: false, error: "hostname_mismatch", hostname: result.hostname },
          { status: 403 }
        );
      }
    }

    // Action validation (if both client and server provided non-empty action)
    if (expectedAction && result.action && result.action.trim() !== "" && result.action !== expectedAction) {
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
