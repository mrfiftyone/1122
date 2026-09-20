"use client";

import { useEffect, useRef, useState } from "react";

interface TurnstileProps {
  siteKey?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
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

export default function Turnstile({ siteKey, onVerify, onExpire, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Official Cloudflare Turnstile Key for 1122
  const effectiveKey = siteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAE9W7TZB_raO43cA";

  useEffect(() => {
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
      if (window.turnstile && containerRef.current && !widgetIdRef.current) {
        try {
          const id = window.turnstile.render(containerRef.current, {
            sitekey: effectiveKey,
            callback: (token: string) => {
              onVerify(token);
            },
            "expired-callback": () => {
              onExpire?.();
            },
            "error-callback": () => {
              onError?.();
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
      return () => clearInterval(interval);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [effectiveKey, onVerify, onExpire, onError]);

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
