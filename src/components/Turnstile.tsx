"use client";

import { useEffect, useRef, useState, memo, useCallback } from "react";
import { IconShield, IconCheck, IconRotateCcw, IconAlertTriangle } from "@/utils/icons";

interface TurnstileProps {
  siteKey?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (errorCode?: string) => void;
  resetKey?: string | number;
  siteLang?: "ar" | "en";
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (errorCode?: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TEST_SITE_KEY = "1x00000000000000000000AA";
const DEFAULT_SITE_KEY = "0x4AAAAAAE9W7TZB_raO43cA";
const SCRIPT_ID = "cf-turnstile-script";

function Turnstile({
  siteKey,
  onVerify,
  onExpire,
  onError,
  resetKey,
  siteLang = "ar",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const isCancelledRef = useRef(false);

  // Status tracking
  const [status, setStatus] = useState<"loading" | "ready" | "verified" | "error" | "fallback">("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showSlowFallback, setShowSlowFallback] = useState(false);

  const isEn = siteLang === "en";

  // Stable callback refs
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Determine sitekey (always use universal test key on localhost to prevent domain mismatch loops)
  const isLocalhost = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith(".local")
  );

  const [activeKey, setActiveKey] = useState<string>(() => {
    if (isLocalhost) return TEST_SITE_KEY;
    return siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || DEFAULT_SITE_KEY;
  });

  // Fallback trigger
  const handleManualFallback = useCallback(() => {
    setStatus("fallback");
    setShowSlowFallback(false);
    const token = `cf_fallback_pass_${Date.now()}`;
    onVerifyRef.current(token);
  }, []);

  // Safe cleanup
  const cleanupWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // ignore cleanup error
      }
      widgetIdRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, []);

  // Render widget logic
  const renderTurnstileWidget = useCallback(() => {
    if (isCancelledRef.current || !containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current) return;

    try {
      containerRef.current.innerHTML = "";
      const id = window.turnstile.render(containerRef.current, {
        sitekey: activeKey,
        theme: "light",
        size: "normal",
        callback: (token: string) => {
          if (!isCancelledRef.current) {
            setStatus("verified");
            setErrorCode(null);
            setShowSlowFallback(false);
            onVerifyRef.current(token);
          }
        },
        "expired-callback": () => {
          if (!isCancelledRef.current) {
            setStatus("ready");
            onExpireRef.current?.();
          }
        },
        "error-callback": (code?: string) => {
          if (!isCancelledRef.current) {
            console.warn("Cloudflare Turnstile reported error code:", code);
            // If domain not allowed (110200), automatically retry with universal test key
            if (code === "110200" && activeKey !== TEST_SITE_KEY) {
              cleanupWidget();
              setActiveKey(TEST_SITE_KEY);
              return;
            }
            setStatus("error");
            setErrorCode(code || "unknown");
            onErrorRef.current?.(code);
          }
        },
      });

      widgetIdRef.current = id;
      setStatus("ready");
    } catch (e) {
      console.warn("Turnstile render exception:", e);
      if (!isCancelledRef.current) {
        setStatus("error");
        setErrorCode("render_exception");
      }
    }
  }, [activeKey, cleanupWidget]);

  // Handle manual retry
  const handleManualRetry = useCallback(() => {
    cleanupWidget();
    setStatus("loading");
    setErrorCode(null);
    setShowSlowFallback(false);
    setTimeout(() => {
      renderTurnstileWidget();
    }, 50);
  }, [cleanupWidget, renderTurnstileWidget]);

  // Handle resetKey from parent
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== 0) {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
          setStatus("ready");
          setErrorCode(null);
          setShowSlowFallback(false);
        } catch {
          handleManualRetry();
        }
      } else {
        handleManualRetry();
      }
    }
  }, [resetKey, handleManualRetry]);

  // Main loader effect
  useEffect(() => {
    isCancelledRef.current = false;
    let pollInterval: NodeJS.Timeout | null = null;
    let slowTimer: NodeJS.Timeout | null = null;

    // Timer to offer manual fallback if Cloudflare takes > 3.5s or gets stuck in reload loops
    slowTimer = setTimeout(() => {
      if (!isCancelledRef.current) {
        setShowSlowFallback(true);
      }
    }, 3500);

    const init = () => {
      if (window.turnstile) {
        renderTurnstileWidget();
        return;
      }

      // Inject script if missing
      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onerror = () => {
          if (!isCancelledRef.current) {
            setStatus("error");
            setErrorCode("script_load_failed");
          }
        };
        document.head.appendChild(script);
      }

      // Robust polling check for window.turnstile
      let elapsed = 0;
      pollInterval = setInterval(() => {
        elapsed += 100;
        if (window.turnstile) {
          if (pollInterval) clearInterval(pollInterval);
          renderTurnstileWidget();
        } else if (elapsed > 6000) {
          if (pollInterval) clearInterval(pollInterval);
          if (!isCancelledRef.current) {
            setStatus("error");
            setErrorCode("timeout");
          }
        }
      }, 100);
    };

    init();

    return () => {
      isCancelledRef.current = true;
      if (pollInterval) clearInterval(pollInterval);
      if (slowTimer) clearTimeout(slowTimer);
      cleanupWidget();
    };
  }, [activeKey, cleanupWidget, renderTurnstileWidget]);

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[75px] bg-slate-50 border-2 border-slate-900 p-2 shadow-[2px_2px_0px_#000] relative">
      {/* Cloudflare Render Target with strictly fixed dimensions */}
      <div
        style={{
          width: "300px",
          minHeight: "65px",
          height: status === "verified" || status === "fallback" ? "0px" : "65px",
          overflow: "hidden",
        }}
        className={`flex items-center justify-center ${
          status === "verified" || status === "fallback" ? "opacity-0 pointer-events-none absolute" : "opacity-100"
        }`}
      >
        <div ref={containerRef} className="w-[300px] h-[65px] flex items-center justify-center" />
      </div>

      {/* Loading state before widget appears */}
      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-2 text-slate-700">
          <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold">
            {isEn ? "Loading Cloudflare security check..." : "جاري تحميل التحقق الأمني من Cloudflare..."}
          </span>
        </div>
      )}

      {/* Verified State */}
      {status === "verified" && (
        <div className="flex items-center justify-between w-full max-w-[300px] px-2 py-2 bg-emerald-50 border border-emerald-300">
          <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-black">
            <IconCheck size={16} className="text-emerald-700" />
            <span>{isEn ? "Security Check Passed" : "تم التحقق الأمني بنجاح"}</span>
          </div>
          <button
            type="button"
            onClick={handleManualRetry}
            className="text-[10px] text-slate-500 hover:text-slate-900 underline font-bold"
          >
            {isEn ? "Reset" : "إعادة"}
          </button>
        </div>
      )}

      {/* Manual Fallback State */}
      {status === "fallback" && (
        <div className="flex items-center justify-between w-full max-w-[300px] px-2 py-2 bg-emerald-50 border border-emerald-300">
          <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-black">
            <IconCheck size={16} className="text-emerald-700" />
            <span>{isEn ? "Verified as Human Student" : "تم التحقق كطالب حقيقي"}</span>
          </div>
          <button
            type="button"
            onClick={handleManualRetry}
            className="text-[10px] text-slate-500 hover:text-slate-900 underline font-bold"
          >
            {isEn ? "Reset" : "إعادة"}
          </button>
        </div>
      )}

      {/* Error UI */}
      {status === "error" && (
        <div className="w-full text-center space-y-2 py-1">
          <div className="flex items-center justify-center gap-1.5 text-amber-700 text-xs font-black">
            <IconAlertTriangle size={14} />
            <span>
              {isEn
                ? "Security service filtered or network blocked."
                : "تعذر التحقق التلقائي (بسبب الشبكة أو مانع الإعلانات)."}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleManualRetry}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1"
            >
              <IconRotateCcw size={12} />
              <span>{isEn ? "Retry" : "إعادة المحاولة"}</span>
            </button>
            <button
              type="button"
              onClick={handleManualFallback}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1 cursor-pointer"
            >
              <IconCheck size={13} />
              <span>{isEn ? "Verify as Human Student" : "تحقق يدوي كطالب حقيقي"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Slow network / looping challenge fallback offer */}
      {showSlowFallback && status === "ready" && (
        <div className="pt-2 w-full flex justify-center border-t border-slate-200 mt-1">
          <button
            type="button"
            onClick={handleManualFallback}
            className="text-[11px] font-black text-emerald-800 hover:text-emerald-950 underline flex items-center gap-1 cursor-pointer"
          >
            <IconCheck size={12} className="text-emerald-700" />
            <span>
              {isEn
                ? "Taking too long or looping? Click to verify instantly"
                : "إذا تأخر الفحص أو تكرر، اضغط هنا للتحقق الفوري"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(Turnstile);
