"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { IconCheck, IconAlertTriangle, IconRotateCcw } from "@/utils/icons";

interface TurnstileProps {
  siteKey?: string;
  action?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (errCode?: string | number) => void;
  resetKey?: string | number;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          action?: string;
          callback?: (token: string) => void;
          "error-callback"?: (errCode?: string | number) => void;
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

const SCRIPT_ID = "cf-turnstile-script";

function Turnstile({ siteKey, action, onVerify, onExpire, onError, resetKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const isCancelledRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "verified" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep latest callbacks in refs so changing prop references do not trigger widget recreation
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Cloudflare Turnstile Site Key for 1122
  const effectiveKey = siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAE9W7TZB_raO43cA";

  const cleanupWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {}
      widgetIdRef.current = null;
    }
  }, []);

  // Safe widget rendering
  const renderTurnstileWidget = useCallback(() => {
    if (isCancelledRef.current || !containerRef.current || !window.turnstile) return;

    if (widgetIdRef.current) {
      cleanupWidget();
    }

    try {
      const id = window.turnstile.render(containerRef.current, {
        sitekey: effectiveKey,
        ...(action ? { action } : {}),
        callback: (token: string) => {
          if (!isCancelledRef.current) {
            setStatus("verified");
            setErrorMessage(null);
            onVerifyRef.current(token);
          }
        },
        "expired-callback": () => {
          if (!isCancelledRef.current) {
            setStatus("ready");
            onExpireRef.current?.();
          }
        },
        "error-callback": (errCode) => {
          console.warn("[Turnstile] Widget error code:", errCode);
          if (!isCancelledRef.current) {
            setStatus("error");
            setErrorMessage(errCode ? String(errCode) : null);
            onErrorRef.current?.(errCode);
          }
        },
        theme: "light",
        size: "flexible",
      });

      widgetIdRef.current = id;
      setStatus("ready");
      setErrorMessage(null);
    } catch (e) {
      console.warn("[Turnstile] Render error:", e);
      if (!isCancelledRef.current) {
        setStatus("error");
      }
    }
  }, [effectiveKey, action, cleanupWidget]);

  // Handle retry
  const handleRetry = useCallback(() => {
    cleanupWidget();
    setStatus("loading");
    setErrorMessage(null);
    setTimeout(() => {
      renderTurnstileWidget();
    }, 50);
  }, [cleanupWidget, renderTurnstileWidget]);

  // Handle resetKey from parent component
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== 0) {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
          setStatus("ready");
          setErrorMessage(null);
        } catch {
          handleRetry();
        }
      } else {
        handleRetry();
      }
    }
  }, [resetKey, handleRetry]);

  // Main loader effect
  useEffect(() => {
    isCancelledRef.current = false;
    let pollInterval: NodeJS.Timeout | null = null;

    const init = () => {
      if (window.turnstile) {
        renderTurnstileWidget();
        return;
      }

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
          }
        };
        document.head.appendChild(script);
      }

      let elapsed = 0;
      pollInterval = setInterval(() => {
        elapsed += 100;
        if (window.turnstile) {
          if (pollInterval) clearInterval(pollInterval);
          renderTurnstileWidget();
        } else if (elapsed > 8000) {
          if (pollInterval) clearInterval(pollInterval);
          if (!isCancelledRef.current) {
            setStatus("error");
          }
        }
      }, 100);
    };

    init();

    return () => {
      isCancelledRef.current = true;
      if (pollInterval) clearInterval(pollInterval);
      cleanupWidget();
    };
  }, [effectiveKey, action, cleanupWidget, renderTurnstileWidget]);

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[75px] bg-slate-50 border-2 border-slate-900 p-2 shadow-[2px_2px_0px_#000] relative">
      {/* Cloudflare Render Target */}
      <div
        style={{
          width: "300px",
          minHeight: "65px",
          height: status === "verified" ? "0px" : "65px",
          overflow: "hidden",
        }}
        className={`flex items-center justify-center ${
          status === "verified" ? "opacity-0 pointer-events-none absolute" : "opacity-100"
        }`}
      >
        <div ref={containerRef} className="w-[300px] h-[65px] flex items-center justify-center" />
      </div>

      {/* Loading State */}
      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-2 text-slate-700">
          <span className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold">
            جاري تحميل التحقق الأمني من Cloudflare...
          </span>
        </div>
      )}

      {/* Verified State */}
      {status === "verified" && (
        <div className="flex items-center justify-between w-full max-w-[300px] px-2 py-2 bg-emerald-50 border border-emerald-300">
          <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-black">
            <IconCheck size={16} className="text-emerald-700" />
            <span>تم التحقق الأمني بنجاح</span>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="text-[10px] text-slate-500 hover:text-slate-900 underline font-bold cursor-pointer"
          >
            إعادة
          </button>
        </div>
      )}

      {/* Error State */}
      {status === "error" && (
        <div className="w-full text-center space-y-2 py-1">
          <div className="flex items-center justify-center gap-1.5 text-amber-700 text-xs font-black">
            <IconAlertTriangle size={14} />
            <span>
              تعذر التحقق التلقائي {errorMessage ? `(${errorMessage})` : ""}
            </span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1 cursor-pointer"
            >
              <IconRotateCcw size={12} />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(Turnstile);
