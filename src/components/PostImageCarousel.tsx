"use client";

import React, { useState, useRef, useCallback } from "react";
import { IconChevronLeft, IconChevronRight, IconSearch } from "@/utils/icons";

interface PostImageCarouselProps {
  images: string[];
  altTitle?: string;
  onPreviewImage?: (img: string) => void;
  siteLang?: "ar" | "en";
}

export default function PostImageCarousel({
  images,
  altTitle = "",
  onPreviewImage,
  siteLang = "ar",
}: PostImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const isEn = siteLang === "en";

  const total = images.length;

  const goToPrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => Math.min(total - 1, prev + 1));
  }, [total]);

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    if (Math.abs(touchDeltaX.current) > 8) {
      isDragging.current = true;
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null) return;
    const delta = touchDeltaX.current;
    const threshold = 40; // minimum swipe distance in px

    if (delta > threshold) {
      // Swiped right -> previous slide
      goToPrev();
    } else if (delta < -threshold) {
      // Swiped left -> next slide
      goToNext();
    }

    touchStartX.current = null;
    touchDeltaX.current = 0;
    setTimeout(() => {
      isDragging.current = false;
    }, 50);
  };

  if (!images || images.length === 0) return null;

  // Single Image view
  if (total === 1) {
    return (
      <div className="pt-2">
        <div
          onClick={() => onPreviewImage?.(images[0])}
          className="relative group cursor-pointer border-2 border-slate-900 overflow-hidden bg-slate-950 shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000] transition-all max-h-80 sm:max-h-96 flex items-center justify-center"
        >
          <img
            src={images[0]}
            alt={altTitle || (isEn ? "Attachment" : "مرفق")}
            className="w-full max-h-80 sm:max-h-96 object-contain group-hover:scale-[1.01] transition-transform duration-200"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-900 text-xs font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000]">
              <IconSearch size={14} />
              <span>{isEn ? "View Full Size" : "عرض بالحجم الكامل"}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Multi-Image Swipe Carousel
  return (
    <div className="pt-2">
      <div
        dir="ltr"
        className="relative group overflow-hidden border-2 border-slate-900 bg-slate-950 shadow-[2px_2px_0px_#000] select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slide Counter Badge */}
        <div className="absolute top-2.5 right-2.5 z-20 bg-slate-900/85 text-white text-[11px] font-black px-2.5 py-0.5 border border-white/20 shadow-[1px_1px_0px_#000] pointer-events-none">
          {currentIndex + 1} / {total}
        </div>

        {/* Slides Track */}
        <div
          className="flex transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {images.map((img, i) => (
            <div
              key={i}
              onClick={() => {
                if (!isDragging.current) {
                  onPreviewImage?.(img);
                }
              }}
              className="min-w-full w-full h-64 sm:h-80 md:h-96 relative flex items-center justify-center bg-slate-950 cursor-pointer group/slide overflow-hidden"
            >
              <img
                src={img}
                alt={altTitle ? `${altTitle} - ${i + 1}` : (isEn ? `Attachment ${i + 1}` : `مرفق ${i + 1}`)}
                className="w-full h-full object-contain"
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
              />
              <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/slide:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-900 text-xs font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000]">
                  <IconSearch size={14} />
                  <span>{isEn ? "View Full Size" : "عرض بالحجم الكامل"}</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Previous Button */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={goToPrev}
            aria-label={isEn ? "Previous image" : "الصورة السابقة"}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-white/90 hover:bg-white text-slate-900 border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-y-[-48%] p-1.5 transition-all flex items-center justify-center"
          >
            <IconChevronLeft size={20} />
          </button>
        )}

        {/* Next Button */}
        {currentIndex < total - 1 && (
          <button
            type="button"
            onClick={goToNext}
            aria-label={isEn ? "Next image" : "الصورة التالية"}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-white/90 hover:bg-white text-slate-900 border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-y-[-48%] p-1.5 transition-all flex items-center justify-center"
          >
            <IconChevronRight size={20} />
          </button>
        )}

        {/* Dots Pagination */}
        <div className="absolute bottom-2.5 inset-x-0 z-20 flex items-center justify-center gap-1.5 pointer-events-auto">
          {images.map((_, dotIdx) => (
            <button
              key={dotIdx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(dotIdx);
              }}
              aria-label={`${isEn ? "Go to image" : "الذهاب للصورة"} ${dotIdx + 1}`}
              className={`h-2 transition-all duration-200 border border-slate-900 shadow-[1px_1px_0px_#000] ${
                dotIdx === currentIndex
                  ? "w-6 bg-amber-400"
                  : "w-2 bg-white/80 hover:bg-white"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
