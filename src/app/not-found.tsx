"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconHome, IconBook, IconArrowRight, IconShield } from "@/utils/icons";
import { Language } from "@/utils/i18n";

export default function NotFound() {
  const [siteLang, setSiteLang] = useState<Language>("ar");

  useEffect(() => {
    const saved = localStorage.getItem("iq_site_lang") as Language;
    if (saved === "en" || saved === "ar") setSiteLang(saved);
  }, []);

  const isEn = siteLang === "en";

  return (
    <div className={`min-h-screen bg-page-bg text-slate-900 selection:bg-teal-500 selection:text-white flex flex-col justify-between p-4 sm:p-6 ${isEn ? "font-sans" : "font-cairo"}`} dir={isEn ? "ltr" : "rtl"}>
      
      {/* Top Brand Bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-2 border-b-2 border-border-subtle">
        <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="w-10 h-10 border-2 border-slate-900 bg-emerald-primary flex items-center justify-center text-white shadow-[2px_2px_0px_#115e59]">
            <IconBook size={20} />
          </div>
          <div>
            <h1 className="font-black text-base tracking-tight text-slate-900">
              {isEn ? "Iraq Students Platform" : "منصة طلاب العراق"}
            </h1>
            <p className="text-[11px] text-slate-600 font-semibold">
              {isEn ? "Teacher Reviews & Community Discussions" : "تقييمات ومراجعات الأساتذة"}
            </p>
          </div>
        </Link>

        <Link
          href="/"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
        >
          <IconHome size={14} /> {isEn ? "Home" : "الرئيسية"}
        </Link>
      </header>

      {/* Main 404 Container */}
      <main className="max-w-xl w-full mx-auto my-10 space-y-6">
        <div className="bg-white border-2 border-slate-900 shadow-[6px_6px_0px_#000] p-6 sm:p-8 space-y-6 text-center">
          
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 border-2 border-red-600 text-red-900 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#dc2626]">
            <span>{isEn ? "Error 404" : "خطأ 404"}</span>
            <span>•</span>
            <span>{isEn ? "Page Not Found" : "الصفحة ما موجودة"}</span>
          </div>

          {/* Large Neo-brutalist Graphic Display */}
          <div className="relative py-2">
            <div className="font-black text-7xl sm:text-8xl tracking-tighter text-slate-900 select-none drop-shadow-[4px_4px_0px_#0d9488]">
              {isEn ? "404" : "٤٠٤"}
            </div>
            <div className="text-xs sm:text-sm font-black text-emerald-800 bg-emerald-50 border border-slate-900 px-3 py-1 inline-flex items-center gap-1.5 mt-2 shadow-[2px_2px_0px_#000]">
              <IconBook size={14} /> {isEn ? "Topic removed from syllabus!" : "درس محذوف من المنهج!"}
            </div>
          </div>

          {/* Descriptive Content */}
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              {isEn ? "Sorry, we couldn't find this page!" : "عذراً، ما كدرنا نلكى هاي الصفحة!"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed max-w-md mx-auto">
              {isEn
                ? "The link might be broken, the page was moved, or the post was removed by its author or administration."
                : "يبدو أن الرابط غير صحيح، أو تم نقل الصفحة، أو أن المنشور تم حذفه من قِبل صاحبه أو الإدارة."}
            </p>
          </div>

          {/* Interactive Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/"
              className="w-full sm:w-auto px-6 py-3 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              <IconHome size={16} /> {isEn ? "Back to Homepage" : "العودة للصفحة الرئيسية"}
            </Link>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  window.history.back();
                } else {
                  window.location.href = "/";
                }
              }}
              className="w-full sm:w-auto px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              <IconArrowRight size={16} className={isEn ? "rotate-180" : ""} /> {isEn ? "Previous Page" : "الرجوع للصفحة السابقة"}
            </button>
          </div>

          {/* Quick Help Box */}
          <div className="bg-slate-50 border-2 border-slate-200 p-4 text-start space-y-2 text-xs">
            <div className="font-black text-slate-800 flex items-center gap-1.5">
              <IconShield size={14} className="text-emerald-primary" />
              <span>{isEn ? "Looking for something specific?" : "تدور على شي معين؟"}</span>
            </div>
            <ul className="text-slate-600 space-y-1 list-disc list-inside font-semibold text-[11px]">
              <li>
                {isEn ? "Browse teachers directory and student reviews in " : "تصفح قائمة ومراجعات الأساتذة عبر "}
                <Link href="/" className="text-emerald-700 font-bold hover:underline">
                  {isEn ? "Teachers Section" : "قسم الأساتذة"}
                </Link>
                .
              </li>
              <li>
                {isEn ? "Join discussions or ask questions in " : "شارك استفساراتك أو أسئلتك بـ "}
                <Link href="/" className="text-emerald-700 font-bold hover:underline">
                  {isEn ? "Discussion Board" : "ساحة النقاش"}
                </Link>
                .
              </li>
            </ul>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 border-t border-slate-200 text-xs text-slate-500 font-semibold">
        © {new Date().getFullYear()} {isEn ? "Iraq Students Platform — All rights reserved" : "منصة طلاب العراق — جميع الحقوق محفوظة"}
      </footer>

    </div>
  );
}
