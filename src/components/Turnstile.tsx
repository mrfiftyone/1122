"use client";

import { useEffect, useRef, useState, memo } from "react";

interface TurnstileProps {
  siteKey?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  resetKey?: string | number;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
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

function Turnstile({ siteKey, onVerify, onExpire, onError, resetKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // When resetKey changes, explicitly reset the Cloudflare widget
  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch (e) {
        console.error("Turnstile reset error:", e);
      }
    }
  }, [resetKey]);

  // Keep latest callbacks in refs so changing prop references do NOT trigger widget destruction
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Official Cloudflare Turnstile Key for 1122
  const effectiveKey = siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAE9W7TZB_raO43cA";

  useEffect(() => {
    let isCancelled = false;

    // 1. Check if script is already present
    const SCRIPT_ID = "cf-turnstile-script";
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const initWidget = () => {
      if (isCancelled) return;
      if (window.turnstile && containerRef.current && !widgetIdRef.current) {
        try {
          const id = window.turnstile.render(containerRef.current, {
            sitekey: effectiveKey,
            callback: (token: string) => {
              onVerifyRef.current(token);
            },
            "expired-callback": () => {
              onExpireRef.current?.();
            },
            "error-callback": () => {
              onErrorRef.current?.();
            },
            theme: "light",
            size: "flexible",
          });
          widgetIdRef.current = id;
          setIsLoaded(true);
        } catch (e) {
          console.error("Turnstile render error", e);
        }
      }
    };

    if (window.turnstile) {
      initWidget();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          initWidget();
        }
      }, 100);
      return () => {
        isCancelled = true;
        clearInterval(interval);
      };
    }

    return () => {
      isCancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [effectiveKey]);

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[65px] bg-slate-50 border border-slate-300 p-2 rounded">
      <div ref={containerRef} className="w-full max-w-[300px] flex justify-center" />
      {!isLoaded && (
        <span className="text-[11px] text-slate-500 font-bold animate-pulse">
          جاري تحميل التحقق الأمني من Cloudflare...
        </span>
      )}
    </div>
  );
}

export default memo(Turnstile);
