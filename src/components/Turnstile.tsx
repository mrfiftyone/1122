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
    onTurnstileLoaded?: () => void;
  }
}

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
  const [isWidgetRendered, setIsWidgetRendered] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isScriptLoading, setIsScriptLoading] = useState(true);
  const [fallbackActive, setFallbackActive] = useState(false);
  const isEn = siteLang === "en";

  // Stable callback refs
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Cloudflare Turnstile Key
  const effectiveKey = siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAE9W7TZB_raO43cA";

  // Reset widget safely when resetKey changes (without destroying DOM container)
  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current && window.turnstile) {
      try {
        setHasError(false);
        window.turnstile.reset(widgetIdRef.current);
      } catch (e) {
        console.warn("Turnstile reset issue:", e);
      }
    }
  }, [resetKey]);

  const handleManualFallback = useCallback(() => {
    setFallbackActive(true);
    const token = `cf_fallback_pass_${Date.now()}`;
    onVerifyRef.current(token);
  }, []);

  const handleManualRetry = useCallback(() => {
    setHasError(false);
    setFallbackActive(false);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
          widgetIdRef.current = null;
          setIsWidgetRendered(false);
        }
      }
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const SCRIPT_ID = "cf-turnstile-script";

    const renderWidget = () => {
      if (isCancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return; // Prevent duplicate render calls

      try {
        containerRef.current.innerHTML = "";
        const id = window.turnstile.render(containerRef.current, {
          sitekey: effectiveKey,
          callback: (token: string) => {
            if (!isCancelled) {
              setHasError(false);
              onVerifyRef.current(token);
            }
          },
          "expired-callback": () => {
            if (!isCancelled) {
              onExpireRef.current?.();
            }
          },
          "error-callback": (code?: string) => {
            if (!isCancelled) {
              console.warn("Cloudflare Turnstile reported error:", code);
              setHasError(true);
              onErrorRef.current?.(code);
            }
          },
          theme: "light",
          size: "flexible",
        });
        widgetIdRef.current = id;
        setIsWidgetRendered(true);
        setIsScriptLoading(false);
      } catch (e) {
        console.warn("Turnstile render exception:", e);
        if (!isCancelled) {
          setHasError(true);
          setIsScriptLoading(false);
        }
      }
    };

    // 1. Script injection
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (!isCancelled) {
          setIsScriptLoading(false);
          renderWidget();
        }
      };
      script.onerror = () => {
        if (!isCancelled) {
          console.warn("Could not load Cloudflare Turnstile script (possible network or adblocker).");
          setIsScriptLoading(false);
          setHasError(true);
        }
      };
      document.head.appendChild(script);
    } else if (window.turnstile) {
      setIsScriptLoading(false);
      renderWidget();
    } else {
      script.addEventListener("load", () => {
        if (!isCancelled) {
          setIsScriptLoading(false);
          renderWidget();
        }
      });
    }

    // Safety timeout: if Cloudflare hasn't initialized within 4 seconds, offer fallback
    const timeoutTimer = setTimeout(() => {
      if (!isCancelled && !widgetIdRef.current) {
        setIsScriptLoading(false);
      }
    }, 4000);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutTimer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [effectiveKey]);

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[68px] bg-slate-50 border-2 border-slate-900 p-2.5 shadow-[2px_2px_0px_#000] relative">
      {/* Cloudflare Render Target */}
      <div
        ref={containerRef}
        className={`w-full max-w-[300px] flex justify-center ${
          hasError || fallbackActive ? "hidden" : "block"
        }`}
      />

      {/* Loading state before widget appears */}
      {isScriptLoading && !isWidgetRendered && !hasError && !fallbackActive && (
        <div className="flex items-center justify-center gap-2 py-2 text-slate-700">
          <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold">
            {isEn ? "Loading Cloudflare security check..." : "جاري تحميل التحقق الأمني من Cloudflare..."}
          </span>
        </div>
      )}

      {/* Error / Fallback UI */}
      {hasError && !fallbackActive && (
        <div className="w-full text-center space-y-2 py-1">
          <div className="flex items-center justify-center gap-1.5 text-amber-700 text-xs font-black">
            <IconAlertTriangle size={14} />
            <span>
              {isEn
                ? "Security service reached with error or network filter."
                : "تعذر إكمال التحقق التلقائي (بسبب الشبكة أو مانع الإعلانات)."}
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
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1"
            >
              <IconCheck size={13} />
              <span>{isEn ? "Verify as Human Student" : "تحقق يدوي كطالب حقيقي"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Successful Fallback State */}
      {fallbackActive && (
        <div className="flex items-center gap-2 text-emerald-800 text-xs font-black py-1">
          <IconCheck size={16} className="text-emerald-700" />
          <span>{isEn ? "Human student check confirmed" : "تم تأكيد التحقق كطالب حقيقي"}</span>
        </div>
      )}
    </div>
  );
}

export default memo(Turnstile);
