"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { normalizeTeacherName } from "@/utils/normalization";
import {
  calculateWilsonScore,
  calculateHotScore,
  calculateWeeklyTrendingVelocity,
  calculateStudentReputation,
  matchesArabicFuzzy,
} from "@/utils/algorithms";
import {
  getBaghdadCycleInfo,
  computeStudentHonorBoard,
  BaghdadCycleInfo,
} from "@/utils/honorBoard";
import { containsProfanity, getBlockedWordsList } from "@/utils/moderation";
import { getRelativeTime, isWithinEditWindow } from "@/utils/time";
import {
  IconBook, IconPen, IconUser, IconThumbUp, IconThumbDown, IconFlag,
  IconShield, IconCrown, IconGrad, IconTag, IconInbox, IconBolt,
  IconTrash, IconX, IconPlus, IconCamera, IconComment, IconSearch,
  IconArrowRight, IconHome, IconBell, IconHistory, IconBookmark,
  IconImage, IconLink, IconAward, IconVideo, IconMonitor, IconFlame,
  IconSettings, IconPalette, IconGlobe, IconHelpCircle, IconLifeBuoy,
  IconChevronDown, IconChevronUp, IconCheck, IconSun, IconMoon, IconPin, IconPalmTree,
  IconVolumeX, IconDownload, IconActivity, IconSliders, IconAlertTriangle, IconSlash,
  IconKey, IconClock, IconStar, IconReply, IconReplies, IconInfo,
  IconUsers, IconRotateCcw,
} from "@/utils/icons";
import { Language, getT } from "@/utils/i18n";

import Link from "next/link";
import Turnstile from "@/components/Turnstile";
import PostImageCarousel from "@/components/PostImageCarousel";
import { supabase } from "@/utils/supabase";
import {
  hashPassword, verifyPassword, generateSalt,
  sanitizeText, sanitizeUsername,
  isAllowedYoutubeUrl, isAllowedTelegramUrl,
  verifySessionRole,
} from "@/utils/security";

function isValidYoutubeUrl(url: string): boolean {
  if (!url || !url.trim()) return true;
  const trimmed = url.trim();
  // Validates standard YouTube watch URLs, short youtu.be, shorts, embeds, and playlists
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|playlist\?list=)|youtu\.be\/)[\w\-?&=]+/;
  return ytRegex.test(trimmed);
}

// ─── Types ─────────────────────────────────────────────────────────
interface User { username: string; pass: string; role: "student" | "mod" | "owner"; hash?: string; salt?: string }
interface Profile {
  avatarColor: string;
  avatarUrl?: string; // Custom uploaded PFP image (DataURL or URL)
  bio: string;
  bannerUrl?: string; // Custom uploaded banner image
  bannerPattern?: "none" | "stripes" | "dots" | "grid" | "gradient";
  bannerColor?: string;
  accentColor?: string;
  role?: "student" | "mod" | "owner";
  isBanned?: boolean;
  has_honor_badge?: boolean;
}
interface Comment {
  id: string; author: string; text: string; created_at: string;
  likes: number; dislikes: number; reports: number;
  parentId?: string | null;
}
export type PostTag = "question" | "discussion" | "news" | "tips" | "booklet" | "other";

interface Post {
  id: string; author: string; teacherId?: string; teacher_id?: string;
  title: string; body: string; grade_level: string;
  tag?: PostTag;
  pinned?: boolean;
  likes: number; dislikes: number; reports: number;
  status: "active" | "hidden"; comments: Comment[];
  images?: string[]; // Multiple image DataURLs (screenshots, summaries)
  youtubeUrl?: string; // YouTube video/playlist URL
  telegramUrl?: string; // Telegram channel / booklet URL
  created_at: string;
}
interface Teacher {
  id: string; createdBy?: string; created_by?: string; name: string;
  normalizedName?: string; normalized_name?: string;
  gov: string; subject: string; grades: string; img: string;
  teachingMode?: string[]; // e.g. ["حضوري"], ["إلكتروني"], or ["حضوري", "إلكتروني"]
  teaching_mode?: string[];
  likes: number; dislikes: number; status: "active" | "pending" | "pending_custom";
}
interface BookmarkItem {
  id: string;
  targetId: string;
  type: "post" | "teacher";
  title: string;
  subtitle?: string;
  created_at: string;
}

interface SupportReply {
  id: string;
  sender: string;
  message: string;
  created_at: string;
}

interface SupportTicket {
  id: string;
  sender: string;
  category: "bug" | "teacher" | "content" | "account" | "other";
  subject: string;
  message: string;
  status: "open" | "resolved";
  created_at: string;
  replies?: SupportReply[];
  allowUserReply?: boolean;
}

function getSupportTickets(): SupportTicket[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("iq_support_tickets_v1") || "[]");
  } catch {
    return [];
  }
}

function setSupportTicketsStorage(tickets: SupportTicket[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("iq_support_tickets_v1", JSON.stringify(tickets));
  } catch {}
}

function getPinnedPostIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("iq_pinned_posts_v1") || "[]");
  } catch {
    return [];
  }
}

function setPinnedPostIdsStorage(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("iq_pinned_posts_v1", JSON.stringify(ids));
  } catch {}
}

interface NotificationItem {
  id: string;
  recipient: string; // username of recipient
  actor: string; // who triggered notification
  type: "comment" | "reply" | "like" | "teacher_approved" | "teacher_rejected" | "report_alert" | "admin_warning" | "support_reply" | "promotion";
  postId: string;
  targetTitle: string;
  commentText?: string;
  read: boolean;
  created_at: string;
}

interface ReportRecord {
  id: string;
  targetId: string;
  targetType: "post" | "comment";
  targetTitle?: string;
  reporter: string;
  reason: "inappropriate" | "wrong_info" | "other";
  note?: string;
  created_at: string;
  status?: "pending" | "dismissed" | "resolved";
}

// Vote map: "username_itemId" -> "like" | "dislike"
type VoteMap = Record<string, "like" | "dislike">;

export interface ToastNotification {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
}

export interface AuditLogItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  details?: string;
}

export interface UserMuteInfo {
  until: number;
  reason: string;
  mutedBy: string;
}

export interface UserStrikeItem {
  date: string;
  reason: string;
  by: string;
}

export interface PlatformSettings {
  maintenanceMode: boolean;
  allowRegistration: boolean;
  allowPosting: boolean;
  allowTeacherSubmissions: boolean;
  allowReviews: boolean;
}

export interface ModPermissions {
  // Standard Moderation Powers
  canApproveTeachers: boolean;
  canModeratePosts: boolean;
  canManageTickets: boolean;
  canDisciplineUsers: boolean;
  canManageWordFilter: boolean;
  // Owner Delegated Powers
  canManageAnnouncements: boolean;
  canViewAuditLog: boolean;
  canManagePlatformToggles: boolean;
  canToggleMaintenance: boolean;
  canExportData: boolean;
  canManageStaff: boolean;
}

export const DEFAULT_MOD_PERMISSIONS: ModPermissions = {
  canApproveTeachers: true,
  canModeratePosts: true,
  canManageTickets: true,
  canDisciplineUsers: true,
  canManageWordFilter: true,
  canManageAnnouncements: false,
  canViewAuditLog: false,
  canManagePlatformToggles: false,
  canToggleMaintenance: false,
  canExportData: false,
  canManageStaff: false,
};

export const FULL_OWNER_PERMISSIONS: ModPermissions = {
  canApproveTeachers: true,
  canModeratePosts: true,
  canManageTickets: true,
  canDisciplineUsers: true,
  canManageWordFilter: true,
  canManageAnnouncements: true,
  canViewAuditLog: true,
  canManagePlatformToggles: true,
  canToggleMaintenance: true,
  canExportData: true,
  canManageStaff: true,
};

export interface SiteAnnouncement {
  active: boolean;
  text: string;
  type: "ministerial" | "warning" | "info";
  linkText?: string;
  linkUrl?: string;
  expiresAt?: number | null;
  createdAt?: string;
}

const GRADES = [
  "الأول متوسط", "الثاني متوسط", "الثالث متوسط",
  "الرابع إعدادي", "الخامس إعدادي", "السادس إعدادي",
];

const GOVERNORATES = [
  "بغداد", "البصرة", "نينوى", "أربيل", "النجف", "كربلاء",
  "كركوك", "بابل", "الأنبار", "ذي قار", "ديالى", "ميسان",
  "المثنى", "القادسية", "واسط", "صلاح الدين", "دهوك", "السليمانية",
];

const SUBJECT_OPTIONS = [
  "رياضيات", "فيزياء", "كيمياء", "أحياء",
  "لغة عربية", "لغة إنجليزية", "إسلامية", "اجتماعيات",
  "حاسوب", "فرنسي", "أخرى",
];

const GRADE_OPTIONS = [
  "الأول متوسط", "الثاني متوسط", "الثالث متوسط",
  "الرابع إعدادي", "الخامس إعدادي", "السادس إعدادي",
  "كل المراحل / عام",
];

const AVATAR_COLORS = [
  "#0d9488", "#dc2626", "#2563eb", "#7c3aed",
  "#ea580c", "#0891b2", "#4f46e5", "#be185d",
];


// ─── LocalStorage Cache Helpers ─────────────────────────────────────
function initStorage() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem("users")) {
    localStorage.setItem("users", JSON.stringify([
      { username: "hh", pass: "Huss1234", role: "owner" },
      { username: "mod1", pass: "Mod12345", role: "mod" },
      { username: "student1", pass: "Stud1234", role: "student" },
    ]));
  }
  if (!localStorage.getItem("profiles")) {
    localStorage.setItem("profiles", JSON.stringify({
      hh: { avatarColor: "#0d9488", bio: "مالك المنصة الرسمي", avatarUrl: "" },
      mod1: { avatarColor: "#2563eb", bio: "مشرف عام", avatarUrl: "" },
      student1: { avatarColor: "#dc2626", bio: "طالب سادس إعدادي", avatarUrl: "" },
    }));
  }
  if (!localStorage.getItem("teachers")) localStorage.setItem("teachers", JSON.stringify([]));
  if (!localStorage.getItem("posts")) localStorage.setItem("posts", JSON.stringify([]));
  if (!localStorage.getItem("votes")) localStorage.setItem("votes", JSON.stringify({}));
  if (!localStorage.getItem("notifications")) localStorage.setItem("notifications", JSON.stringify([]));
  if (!localStorage.getItem("platform_settings")) {
    localStorage.setItem("platform_settings", JSON.stringify({
      maintenanceMode: false,
      allowRegistration: true,
      allowPosting: true,
      allowTeacherSubmissions: true,
      allowReviews: true,
    }));
  }
  if (!localStorage.getItem("site_announcement")) {
    localStorage.setItem("site_announcement", JSON.stringify({
      active: false,
      text: "",
      type: "ministerial",
    }));
  }
  if (!localStorage.getItem("audit_logs")) {
    localStorage.setItem("audit_logs", JSON.stringify([]));
  }
  if (!localStorage.getItem("muted_users")) {
    localStorage.setItem("muted_users", JSON.stringify({}));
  }
  if (!localStorage.getItem("user_strikes")) {
    localStorage.setItem("user_strikes", JSON.stringify({}));
  }
  if (!localStorage.getItem("custom_banned_words")) {
    localStorage.setItem("custom_banned_words", JSON.stringify([]));
  }
}

function getUsers(): User[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("users") || "[]"); } catch { return []; }
}
function getProfiles(): Record<string, Profile> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("profiles") || "{}"); } catch { return {}; }
}
function getTeachers(): Teacher[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("teachers") || "[]"); } catch { return []; }
}
function getPosts(): Post[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("posts") || "[]"); } catch { return []; }
}
function getVotes(): VoteMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("votes") || "{}"); } catch { return {}; }
}
function getNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("notifications") || "[]"); } catch { return []; }
}
function getBookmarks(u: string): BookmarkItem[] {
  if (typeof window === "undefined" || !u) return [];
  try { return JSON.parse(localStorage.getItem(`bookmarks_${u}`) || "[]"); } catch { return []; }
}
function setUsers(u: User[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("users", JSON.stringify(u)); } catch {}
}
function setProfiles(p: Record<string, Profile>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("profiles", JSON.stringify(p)); } catch {}
}
function setTeachers(t: Teacher[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("teachers", JSON.stringify(t)); } catch {}
}
function setPosts(p: Post[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("posts", JSON.stringify(p)); } catch {}
}
function setVotes(v: VoteMap) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("votes", JSON.stringify(v)); } catch {}
}
function setNotifications(n: NotificationItem[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("notifications", JSON.stringify(n)); } catch {}
}
function setBookmarks(u: string, b: BookmarkItem[]) {
  if (typeof window === "undefined" || !u) return;
  try { localStorage.setItem(`bookmarks_${u}`, JSON.stringify(b)); } catch {}
}

export interface FaqItem {
  id: string;
  q: { ar: string; en: string };
  a: { ar: string; en: string };
}

export interface AboutPillar {
  id: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  icon: string;
}

export interface AboutButton {
  id: string;
  labelAr: string;
  labelEn: string;
  url: string;
  variant: "primary" | "secondary" | "outline";
}

export interface AboutUsData {
  headlineAr: string;
  headlineEn: string;
  subtitleAr: string;
  subtitleEn: string;
  missionTitleAr: string;
  missionTitleEn: string;
  missionDescAr: string;
  missionDescEn: string;
  pillars: AboutPillar[];
  buttons: AboutButton[];
}

const DEFAULT_FAQS: FaqItem[] = [
  {
    id: "faq_1",
    q: {
      ar: "كيف يتم احتساب نسبة قبول المدرس وتقييماته؟",
      en: "How are teacher approval percentages and ratings calculated?",
    },
    a: {
      ar: "يتم احتساب نسبة القبول عبر معادلة ويلسون الإحصائية المعتمدة عالمياً لقياس مدى رضا الطلاب بدرجة موثوقية 95% واستبعاد العينات العشوائية الصغيرة، مما يمنع تصدر المدرسين ذوي التقييم الفردي الواحد.",
      en: "Approval is calculated using the Wilson Score confidence interval at 95% certainty, preventing small single-vote sample distortions.",
    },
  },
  {
    id: "faq_2",
    q: {
      ar: "كيف أقوم باقتراح مدرس جديد لإضافته إلى المنصة؟",
      en: "How do I propose a new teacher to be added?",
    },
    a: {
      ar: "اضغط على زر (إضافة مدرس) في قسم المدرسين، ثم املأ اسم المدرس، محافظته، المادة الدراسية، المراحل، وطريقة تدريسه (حضوري أو إلكتروني أو كلاهما). ينتقل الطلب مباشرة إلى قائمة الانتظار للمراجعة من قبل الإدارة.",
      en: "Click 'Add Teacher' in the directory tab, fill in the teacher's details, and submit. The request goes to the administration waiting list for verification.",
    },
  },
  {
    id: "faq_3",
    q: {
      ar: "ما هي شروط كتابة مراجعة وتقييم للمدرس؟",
      en: "What are the rules for writing a review on a teacher?",
    },
    a: {
      ar: "يشترط أولاً تسجيل الدخول واختيار (أنصح بيه أو ما أنصح بيه). يجب أن تكون المراجعة موضوعية ومحترمة وخالية من أي ألفاظ مسيئة أو تجريح شخصي وفق معايير مجتمع طلاب العراق.",
      en: "You must be logged in and explicitly select your recommendation verdict. Reviews must remain respectful, objective, and constructive without personal insults.",
    },
  },
  {
    id: "faq_4",
    q: {
      ar: "كيف تعمل لوحة شرف الطلاب وما هي معايير الترتيب؟",
      en: "How does the Student Honor Board work and how are ranks decided?",
    },
    a: {
      ar: "تُكرّم لوحة الشرف الطلاب المتميزين اعتماداً على نقاط السمعة متعددة العوامل: الردود المفيدة، حل الأسئلة الصعبة، المراجعات الموثوقة، ونسبة القبول الإيجابية من بقية الزملاء.",
      en: "The Honor Board recognizes top students using a multi-factor reputation score factoring in helpful answers, constructive reviews, and community approval.",
    },
  },
  {
    id: "faq_5",
    q: {
      ar: "كيف أتحكم في مظهر وثيم ولغة الموقع؟",
      en: "How do I change the website theme and language?",
    },
    a: {
      ar: "يمكنك في أي وقت الضغط على زر (الإعدادات) في الشريط العلوي للاختيار بين 5 ثيمات متنوعة ومميزة (الكلاسيكي، الوضع الليلي المريح، الطبيعة الخضراء، الوردي، والبنفسجي التقني)، بالإضافة للتبديل الفوري بين العربية والإنجليزية.",
      en: "Click on the Settings button in the top navigation at any time to switch between 5 visual Neo-brutalist themes or toggle between Arabic and English with full directional layout support.",
    },
  },
];

const DEFAULT_ABOUT_US: AboutUsData = {
  headlineAr: "منصة طلاب العراق • المنظومة الأكاديمية المستقلة الأولى",
  headlineEn: "Iraq Students Platform • Independent Academic Community",
  subtitleAr: "أكبر تجمع طلابي تفاعلي في العراق لتقييم المدرسين ومشاركة الملازم والحلول الوزارية النموذجية.",
  subtitleEn: "The premier student-led academic network in Iraq for statistical teacher reviews, discussion, and ministerial exam prep.",
  missionTitleAr: "رسالتنا ورؤيتنا للتعليم العراقي",
  missionTitleEn: "Our Academic Mission & Vision",
  missionDescAr: "منصة تعليمية طلابية غير ربحية صُممت لخدمة طلبة المراحل المنتهية (السادس إعدادي والثالث متوسط) في عموم العراق. هدفنا تمكين كل طالب من الوصول إلى تقييمات موثوقة ومحايدة للأساتذة، وساحة نقاش تفاعلية لحل الأسئلة المنهجية والوزارية، ومكتبة مفتوحة للملازم والمراجعات المركزة مجاناً.",
  missionDescEn: "A non-profit student initiative designed to empower preparatory and secondary students across all governorates of Iraq. Our mission is to provide transparent, statistical teacher ratings, peer-to-peer discussion for complex questions, and open access to verified revision booklets and ministerial materials.",
  pillars: [
    {
      id: "p1",
      titleAr: "تقييمات علمية موثوقة",
      titleEn: "Unbiased Statistical Ratings",
      descAr: "فرز المدرسين وفق معادلة ويلسون الإحصائية المعتمدة عالمياً، مما يمنع التقييمات العشوائية والتضليل التجاري.",
      descEn: "Teacher ratings calculated using the Wilson statistical confidence interval to eliminate artificial bias and commercial manipulation.",
      icon: "star",
    },
    {
      id: "p2",
      titleAr: "مجتمع طلابي تكافلي",
      titleEn: "Student-Led Community",
      descAr: "مساحة نقاش مفتوحة لتبادل الحلول النموذجية، شرح المسائل الصعبة، وتكريم الطلاب الأكثر مساعدة لزملائهم.",
      descEn: "An open space to exchange model answers, clarify complex topics, and honor students who actively help their peers.",
      icon: "users",
    },
    {
      id: "p3",
      titleAr: "بيئة أكاديمية منضبطة",
      titleEn: "Clean Academic Space",
      descAr: "رقابة نشطة وفلاتر ذكية تمنع الألفاظ المسيئة والروابط العشوائية للحفاظ على تجربة دراسية محترمة ومركزة.",
      descEn: "Strict academic moderation and automated language filters to keep study discussions productive and safe.",
      icon: "shield",
    },
    {
      id: "p4",
      titleAr: "ملازم ومصادر مجانية",
      titleEn: "Free Study Materials",
      descAr: "تجميع وتنظيم الملازم الوزارية والمراجعات المركزة وقنوات الأساتذة الرسمية دون أي اشتراكات مدفوعة.",
      descEn: "Direct access to curated ministerial revision booklets and verified teacher channels without fees or subscriptions.",
      icon: "book",
    },
  ],
  buttons: [
    {
      id: "b1",
      labelAr: "قناة التلغرام الرسمية",
      labelEn: "Official Telegram Channel",
      url: "https://t.me",
      variant: "primary",
    },
    {
      id: "b2",
      labelAr: "دليل الامتحانات الوزارية",
      labelEn: "Ministerial Exam Guide",
      url: "https://epedu.gov.iq",
      variant: "secondary",
    },
  ],
};

function getStoredFaqs(): FaqItem[] {
  if (typeof window === "undefined") return DEFAULT_FAQS;
  try {
    const saved = localStorage.getItem("iq_site_faqs_v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_FAQS;
}

function setStoredFaqs(faqs: FaqItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("iq_site_faqs_v2", JSON.stringify(faqs));
  } catch {}
}

function getStoredAboutUs(): AboutUsData {
  if (typeof window === "undefined") return DEFAULT_ABOUT_US;
  try {
    const saved = localStorage.getItem("iq_about_us_v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.headlineAr) return parsed;
    }
  } catch {}
  return DEFAULT_ABOUT_US;
}

function setStoredAboutUs(data: AboutUsData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("iq_about_us_v1", JSON.stringify(data));
  } catch {}
}

function renderPillarIcon(iconName: string, size = 18) {
  switch (iconName) {
    case "users": return <IconUsers size={size} />;
    case "shield": return <IconShield size={size} />;
    case "book": return <IconBook size={size} />;
    case "grad": return <IconGrad size={size} />;
    case "flame": return <IconFlame size={size} />;
    case "info": return <IconInfo size={size} />;
    case "star":
    default:
      return <IconStar size={size} />;
  }
}

// ─── Loading Skeletons & Empty State Components ───────────────────
function SkeletonPostCard() {
  return (
    <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-4 animate-pulse">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-200 border border-slate-300 shrink-0" />
          <div className="space-y-1.5">
            <div className="w-24 h-3.5 bg-slate-200" />
            <div className="w-16 h-2.5 bg-slate-100" />
          </div>
        </div>
        <div className="w-20 h-5 bg-slate-100 border border-slate-200" />
      </div>

      <div className="space-y-2">
        <div className="w-3/4 h-4 bg-slate-200" />
        <div className="w-full h-3 bg-slate-100" />
        <div className="w-5/6 h-3 bg-slate-100" />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-14 h-7 bg-slate-100 border border-slate-200" />
          <div className="w-14 h-7 bg-slate-100 border border-slate-200" />
        </div>
        <div className="w-16 h-7 bg-slate-100 border border-slate-200" />
      </div>
    </div>
  );
}

function SkeletonTeacherCard() {
  return (
    <div className="bg-white border-2 border-border-subtle shadow-[2px_2px_0px_#d1dcd6] p-4 flex flex-col justify-between gap-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-200 border-2 border-slate-300 shrink-0 shadow-[2px_2px_0px_#cbd5e1]" />
        <div className="space-y-2 flex-1">
          <div className="w-32 h-4 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-14 h-4 bg-slate-100" />
            <div className="w-16 h-4 bg-slate-100" />
            <div className="w-20 h-4 bg-slate-100" />
          </div>
          <div className="w-24 h-3 bg-slate-100" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="w-28 h-6 bg-slate-100" />
        <div className="w-20 h-6 bg-slate-200 border border-slate-300" />
      </div>
    </div>
  );
}

function SkeletonTrendingTeacher() {
  return (
    <div className="p-2.5 border-2 border-slate-200 bg-slate-50 flex flex-col items-center text-center space-y-2 animate-pulse">
      <div className="w-12 h-12 bg-slate-200 border border-slate-300 shrink-0" />
      <div className="w-16 h-3 bg-slate-200" />
      <div className="w-12 h-2.5 bg-slate-100" />
      <div className="w-full h-4 bg-slate-100" />
    </div>
  );
}

interface EmptyStateCardProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  compact?: boolean;
}

function EmptyStateCard({
  icon,
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  compact = false,
}: EmptyStateCardProps) {
  return (
    <div className={`bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] text-center space-y-3 mx-auto w-full ${compact ? "p-5 max-w-sm" : "p-6 sm:p-8 max-w-lg"}`}>
      {icon && (
        <div className="w-12 h-12 mx-auto bg-slate-100 border-2 border-slate-900 text-slate-900 flex items-center justify-center shadow-[2px_2px_0px_#000]">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h4 className="font-black text-sm sm:text-base text-slate-900">{title}</h4>
        {description && (
          <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-md mx-auto">
            {description}
          </p>
        )}
      </div>
      {(actionText || secondaryActionText) && (
        <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
          {actionText && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="px-4 py-2 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
            >
              {actionText}
            </button>
          )}
          {secondaryActionText && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
            >
              {secondaryActionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function getSession(): User | null {
  if (typeof window === "undefined") return null;
  try { const s = localStorage.getItem("currentUser"); return s ? JSON.parse(s) : null; } catch { return null; }
}

function getPlatformSettings(): PlatformSettings {
  if (typeof window === "undefined") return { maintenanceMode: false, allowRegistration: true, allowPosting: true, allowTeacherSubmissions: true, allowReviews: true };
  try {
    const s = localStorage.getItem("platform_settings");
    return s ? JSON.parse(s) : { maintenanceMode: false, allowRegistration: true, allowPosting: true, allowTeacherSubmissions: true, allowReviews: true };
  } catch {
    return { maintenanceMode: false, allowRegistration: true, allowPosting: true, allowTeacherSubmissions: true, allowReviews: true };
  }
}
function setPlatformSettings(s: PlatformSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem("platform_settings", JSON.stringify(s));
}

function getSiteAnnouncement(): SiteAnnouncement {
  if (typeof window === "undefined") return { active: false, text: "", type: "ministerial" };
  try {
    const a = localStorage.getItem("site_announcement");
    return a ? JSON.parse(a) : { active: false, text: "", type: "ministerial" };
  } catch {
    return { active: false, text: "", type: "ministerial" };
  }
}
function setSiteAnnouncement(a: SiteAnnouncement) {
  if (typeof window === "undefined") return;
  localStorage.setItem("site_announcement", JSON.stringify(a));
}

function getAuditLogs(): AuditLogItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("audit_logs") || "[]"); } catch { return []; }
}
function setAuditLogs(logs: AuditLogItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("audit_logs", JSON.stringify(logs.slice(0, 100)));
}

function getMutedUsers(): Record<string, UserMuteInfo> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("muted_users") || "{}"); } catch { return {}; }
}
function setMutedUsers(m: Record<string, UserMuteInfo>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("muted_users", JSON.stringify(m));
}

function getUserStrikes(): Record<string, { count: number; history: UserStrikeItem[] }> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("user_strikes") || "{}"); } catch { return {}; }
}
function setUserStrikes(s: Record<string, { count: number; history: UserStrikeItem[] }>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("user_strikes", JSON.stringify(s));
}

function getCustomBannedWords(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("custom_banned_words") || "[]"); } catch { return []; }
}
function setCustomBannedWords(w: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("custom_banned_words", JSON.stringify(w));
}

function getModPermissions(): Record<string, ModPermissions> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("mod_permissions_v1") || "{}"); } catch { return {}; }
}
function setModPermissionsStorage(perms: Record<string, ModPermissions>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("mod_permissions_v1", JSON.stringify(perms)); } catch {}
}


// ─── Main Component ───────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"feed" | "directory" | "notifications" | "profile" | "admin" | "teacher">("feed");
  const [session, setSession] = useState<User | null>(null);
  const [_, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);
  const isPopStateRef = useRef(false);

  // Live Database States
  const [posts, setPostsList] = useState<Post[]>([]);
  const [teachers, setTeachersList] = useState<Teacher[]>([]);
  const [profiles, setProfilesMap] = useState<Record<string, Profile>>({});
  const [cycleInfo, setCycleInfo] = useState<BaghdadCycleInfo>(getBaghdadCycleInfo);
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Helper to merge Supabase profiles with local legacy users so all users (old & new) are always available
  const getAllPlatformUsers = useCallback(() => {
    const localLegacyUsers = getUsers();
    const map = new Map<string, { username: string; role: "student" | "mod" | "owner" }>();

    // 1. Supabase Profiles (live registered users)
    Object.entries(profiles).forEach(([username, p]) => {
      if (username && username.trim()) {
        map.set(username, { username, role: (p.role as any) || "student" });
      }
    });

    // 2. Local legacy users
    localLegacyUsers.forEach(u => {
      if (u.username && !map.has(u.username)) {
        map.set(u.username, { username: u.username, role: (u.role as any) || "student" });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.username.localeCompare(b.username));
  }, [profiles]);

  // Modals
  const [authModal, setAuthModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [teacherModal, setTeacherModal] = useState(false);
  const [postModal, setPostModal] = useState(false);
  const [gradeModal, setGradeModal] = useState(false);
  const [profileModal, setProfileModal] = useState(false);
  const [historyModal, setHistoryModal] = useState(false);

  // Auth fields
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");

  // Post fields
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postGrade, setPostGrade] = useState("General");
  const [postTeacher, setPostTeacher] = useState("");
  const [postTeacherSearch, setPostTeacherSearch] = useState("");
  const [postImages, setPostImages] = useState<string[]>([]);
  const [isCompressingImages, setIsCompressingImages] = useState(false);
  const [postYoutube, setPostYoutube] = useState("");
  const [postTelegram, setPostTelegram] = useState("");
  const [postTag, setPostTag] = useState<PostTag>("discussion");
  const [selectedFeedTag, setSelectedFeedTag] = useState<"all" | PostTag>("all");
  const [feedSortMode, setFeedSortMode] = useState<"hot" | "new" | "top">("hot");
  const [pinnedPostIds, setPinnedPostIds] = useState<string[]>([]);

  // Comment Threading & Reply States (Reddit-style)
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyDraftText, setReplyDraftText] = useState<string>("");

  // Teacher fields (Add teacher form)
  const [tName, setTName] = useState("");
  const [tGov, setTGov] = useState("بغداد");
  const [tSubjectChoice, setTSubjectChoice] = useState("رياضيات");
  const [tCustomSubject, setTCustomSubject] = useState("");
  const [tSelectedGrades, setTSelectedGrades] = useState<string[]>([]);
  const [tTeachingModes, setTTeachingModes] = useState<string[]>(["حضوري"]);
  const [tImg, setTImg] = useState("");

  // Search, Filters & Sorting for Teachers section
  const [dirSearch, setDirSearch] = useState("");
  const [filterGov, setFilterGov] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterGrade, setFilterGrade] = useState("all");
  const [filterTeachingMode, setFilterTeachingMode] = useState<"all" | "حضوري" | "إلكتروني" | "both">("all");
  const [sortTeacherBy, setSortTeacherBy] = useState<"likes" | "rating" | "reviews" | "newest">("likes");

  // Selected Teacher Dedicated View & Review states
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewVerdict, setReviewVerdict] = useState<"like" | "dislike" | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");

  // Profile Viewing state (view self or another student)
  const [viewedUser, setViewedUser] = useState<string | null>(null);
  const [profileSubTab, setProfileSubTab] = useState<"activities" | "saved">("activities");
  const [userBookmarks, setUserBookmarks] = useState<BookmarkItem[]>([]);

  // Profile Comments Expansion State
  const [expandedProfileComments, setExpandedProfileComments] = useState<Record<string, boolean>>({});

  // Report Modal & Admin Moderation State
  const [reportTarget, setReportTarget] = useState<{ id: string; type: "post" | "comment"; title?: string; parentPostId?: string } | null>(null);
  const [reportReason, setReportReason] = useState<"inappropriate" | "wrong_info" | "other">("inappropriate");
  const [reportNote, setReportNote] = useState("");
  const [adminReportFilter, setAdminReportFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [reportRecordsList, setReportRecordsList] = useState<ReportRecord[]>([]);
  const [inspectingReport, setInspectingReport] = useState<any | null>(null);
  const [dismissedReportIds, setDismissedReportIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem("dismissed_reports_v1") || "[]"));
    } catch {
      return new Set();
    }
  });

  // Platform Administration & Owner States
  const [platformSettings, setPlatformSettingsState] = useState<PlatformSettings>({
    maintenanceMode: false,
    allowRegistration: true,
    allowPosting: true,
    allowTeacherSubmissions: true,
    allowReviews: true,
  });
  const [siteAnnouncement, setSiteAnnouncementState] = useState<SiteAnnouncement>({
    active: false,
    text: "",
    type: "ministerial",
    expiresAt: null,
  });
  const [auditLogs, setAuditLogsState] = useState<AuditLogItem[]>([]);
  const [mutedUsers, setMutedUsersState] = useState<Record<string, UserMuteInfo>>({});
  const [userStrikes, setUserStrikesState] = useState<Record<string, { count: number; history: UserStrikeItem[] }>>({});
  const [customBannedWords, setCustomBannedWordsState] = useState<string[]>([]);
  const [modPermissionsMap, setModPermissionsMap] = useState<Record<string, ModPermissions>>({});
  const [adminSubTab, setAdminSubTab] = useState<"reports" | "support" | "teachers" | "users" | "announcement" | "audit" | "filter" | "owner">("reports");

  // Admin interactive input states
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminSelectedUser, setAdminSelectedUser] = useState<string | null>(null);
  const [adminMuteDuration, setAdminMuteDuration] = useState<"24h" | "7d" | "30d" | "permanent">("24h");
  const [adminMuteReason, setAdminMuteReason] = useState("");
  const [adminWarningReason, setAdminWarningReason] = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementType, setAnnouncementType] = useState<"ministerial" | "warning" | "info">("ministerial");
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementDuration, setAnnouncementDuration] = useState<"never" | "1h" | "6h" | "12h" | "24h" | "3d" | "7d">("never");
  const [newBannedWordInput, setNewBannedWordInput] = useState("");
  const [filterTestSentence, setFilterTestSentence] = useState("");

  // Staff governance & Granular permissions state
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [staffRoleFilter, setStaffRoleFilter] = useState<"all" | "mod" | "student">("all");
  const [permModalUser, setPermModalUser] = useState<string | null>(null);
  const [permModalRole, setPermModalRole] = useState<"student" | "mod">("student");
  const [permForm, setPermForm] = useState<ModPermissions>(DEFAULT_MOD_PERMISSIONS);

  // Notifications Filter
  const [notifFilter, setNotifFilter] = useState<"all" | "unread" | "reports">("all");

  // Extra modals / views
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
  const [showHonorBoard, setShowHonorBoard] = useState(false);

  // Settings, Theme & Language
  const [settingsModal, setSettingsModal] = useState(false);
  const [siteTheme, setSiteTheme] = useState<"light" | "dark" | "pink" | "plants" | "purple">("light");
  const [siteLang, setSiteLang] = useState<Language>("ar");
  const [settingsTab, setSettingsTab] = useState<"theme" | "lang" | "about" | "faq" | "support">("theme");
  const [faqExpanded, setFaqExpanded] = useState<number | null>(null);

  // Dynamic FAQ and About Us Management
  const [faqList, setFaqList] = useState<FaqItem[]>([]);
  const [aboutUsData, setAboutUsData] = useState<AboutUsData>(DEFAULT_ABOUT_US);
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [editAboutDraft, setEditAboutDraft] = useState<AboutUsData>(DEFAULT_ABOUT_US);

  // FAQ Modal / Editing state for Owner
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqDraftQAr, setFaqDraftQAr] = useState("");
  const [faqDraftQEn, setFaqDraftQEn] = useState("");
  const [faqDraftAAr, setFaqDraftAAr] = useState("");
  const [faqDraftAEn, setFaqDraftAEn] = useState("");

  // Support Form State
  const [supportCategory, setSupportCategory] = useState<"bug" | "teacher" | "content" | "account" | "other">("bug");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [ticketReplyTexts, setTicketReplyTexts] = useState<Record<string, string>>({});

  // Profile Edit
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [editBio, setEditBio] = useState("");
  const [editColor, setEditColor] = useState("#0d9488");
  const [editPfpUrl, setEditPfpUrl] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editBannerPattern, setEditBannerPattern] = useState<"none" | "stripes" | "dots" | "grid" | "gradient">("none");
  const [editBannerColor, setEditBannerColor] = useState("#0d9488");
  const [editAccentColor, setEditAccentColor] = useState("#0d9488");


  // Turnstile & Lockout State
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileServerVerified, setTurnstileServerVerified] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileServerVerified(false);
    setTurnstileResetKey(prev => prev + 1);
  }, []);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setAuthError("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileServerVerified(false);
  }, []);

  const handleTurnstileError = useCallback((errCode?: string | number) => {
    setTurnstileToken(null);
    setTurnstileServerVerified(false);
    console.warn("[Turnstile] Widget error reported:", errCode);
  }, []);

  // Action Cooldown Guard (protects from rapid spamming across posts, reviews, comments)
  const checkActionCooldown = useCallback((actionType: "post" | "comment" | "review" | "report" | "teacher", cooldownMs: number): { allowed: boolean; remainingSec: number } => {
    if (typeof window === "undefined") return { allowed: true, remainingSec: 0 };
    const key = `iq_cooldown_${actionType}`;
    const lastTime = parseInt(localStorage.getItem(key) || "0", 10);
    const now = Date.now();
    const elapsed = now - lastTime;
    if (elapsed < cooldownMs) {
      const remainingSec = Math.ceil((cooldownMs - elapsed) / 1000);
      return { allowed: false, remainingSec };
    }
    localStorage.setItem(key, String(now));
    return { allowed: true, remainingSec: 0 };
  }, []);

  // ─── In-App Toast & Confirmation System (replaces native browser popups) ───
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    const id = "toast_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const requestConfirm = useCallback((params: {
    message: string;
    onConfirm: () => void;
    title?: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }) => {
    setConfirmDialog({
      isOpen: true,
      title: params.title || (siteLang === "en" ? "Confirm Action" : "تأكيد الإجراء"),
      message: params.message,
      confirmText: params.confirmText || (siteLang === "en" ? "Confirm" : "تأكيد"),
      cancelText: params.cancelText || (siteLang === "en" ? "Cancel" : "إلغاء"),
      isDestructive: params.isDestructive !== false,
      onConfirm: () => {
        setConfirmDialog(null);
        params.onConfirm();
      },
    });
  }, [siteLang]);

  // Intercept window.alert so all alert() calls route to in-app toasts automatically
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.alert = (msg: string) => {
      const isError = /خطأ|فشل|محظور|مكتوم|ممنوع|error|failed|banned|prohibited|wait|انتظار/i.test(msg);
      const isSuccess = /بنجاح|تم |success|added|removed|updated|نزل|سحب/i.test(msg);
      showToast(msg, isError ? "error" : isSuccess ? "success" : "info");
    };
  }, [showToast]);


  const canOwner = !!(session && (session.role === "owner" || (session.username || "").trim().toLowerCase() === "hh"));
  const canAdmin = !!(session && (session.role === "owner" || session.role === "mod" || (session.username || "").trim().toLowerCase() === "hh"));

  function hasPermission(perm: keyof ModPermissions): boolean {
    if (!session) return false;
    if (session.role === "owner") return true;
    if (session.role !== "mod") return false;
    const perms = modPermissionsMap[session.username] || DEFAULT_MOD_PERMISSIONS;
    return !!perms[perm];
  }

  // ─── URL Route Parser (Direct Route Synchronization) ──────────────
  const parseUrlRoute = useCallback((currentTeachers?: Teacher[]) => {
    if (typeof window === "undefined") return;
    try {
      const pathname = window.location.pathname.toLowerCase();
      const searchParams = new URLSearchParams(window.location.search);

      // 1. Profile route: /profile or /profile/:username or query ?profile=... / ?user=...
      if (pathname.startsWith("/profile")) {
        const parts = window.location.pathname.split("/").filter(Boolean);
        if (parts.length > 1) {
          const userFromPath = decodeURIComponent(parts[1]);
          setViewedUser(userFromPath);
        } else {
          const u = searchParams.get("profile") || searchParams.get("user");
          if (u) setViewedUser(u);
        }
        setTab("profile");
        return;
      }

      const queryProfile = searchParams.get("profile") || searchParams.get("user");
      if (queryProfile) {
        setViewedUser(queryProfile);
        setTab("profile");
        return;
      }

      // 2. Teachers / Directory route: /teachers or /directory or /teachers/:id
      if (pathname === "/teachers" || pathname === "/directory" || pathname.startsWith("/teachers/")) {
        const teacherId = searchParams.get("id") || searchParams.get("teacher");
        const parts = window.location.pathname.split("/").filter(Boolean);
        const idFromPath = parts.length > 1 && parts[0].toLowerCase() === "teachers" ? decodeURIComponent(parts[1]) : null;
        const targetId = idFromPath || teacherId;

        if (targetId) {
          const teacherList = currentTeachers || getTeachers();
          const found = teacherList.find(t => t.id === targetId || t.name === targetId);
          if (found) {
            setSelectedTeacher(found);
            setTab("teacher");
            return;
          }
        }
        setSelectedTeacher(null);
        setTab("directory");
        return;
      }

      // 3. Notifications route: /notifications
      if (pathname === "/notifications") {
        setTab("notifications");
        return;
      }

      // 4. Admin route: /admin
      if (pathname === "/admin") {
        setTab("admin");
        return;
      }

      // 5. Main / Feed route: /main or /feed or /
      if (pathname === "/main" || pathname === "/feed" || pathname === "/") {
        setTab("feed");
        return;
      }
    } catch {
      // ignore
    }
  }, []);

  // ─── Fetch from Supabase (Central Shared Database) ─────────────────
  const fetchSupabaseData = useCallback(async () => {
    try {
      const [pRes, tRes, prRes, nRes, repRes] = await Promise.all([
        supabase.from('posts').select('*, comments(*)').order('created_at', { ascending: false }).limit(40),
        supabase.from('teachers').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('profiles').select('username, role, avatar_color, bio, avatar_url, banner_url, banner_pattern, is_banned, has_honor_badge'),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(40),
      ]);

      if (pRes.data) {
        const configPost = pRes.data.find((p: any) => p.title === "SYSTEM_SITE_CONFIG");
        if (configPost && configPost.body) {
          try {
            const parsedConfig = JSON.parse(configPost.body);
            if (parsedConfig.about && parsedConfig.about.headlineAr) {
              setAboutUsData(parsedConfig.about);
              setStoredAboutUs(parsedConfig.about);
            }
            if (parsedConfig.faqs && Array.isArray(parsedConfig.faqs) && parsedConfig.faqs.length > 0) {
              setFaqList(parsedConfig.faqs);
              setStoredFaqs(parsedConfig.faqs);
            }
          } catch (e) {
            console.error("Error parsing system site config:", e);
          }
        }

        const formattedPosts: Post[] = pRes.data
          .filter((p: any) => p.title !== "SYSTEM_SITE_CONFIG")
          .map((p: any) => {
          let cleanBody = p.body || "";
          let meta: any = {};
          const metaMatch = cleanBody.match(/<!--meta:(.*?)-->/);
          if (metaMatch) {
            try {
              meta = JSON.parse(metaMatch[1]);
              cleanBody = cleanBody.replace(/<!--meta:.*?-->/, "").trim();
            } catch {}
          }
          return {
            id: p.id,
            author: p.author,
            teacherId: p.teacher_id,
            teacher_id: p.teacher_id,
            title: p.title,
            body: cleanBody,
            tag: (meta.tag || p.tag || "discussion") as PostTag,
            pinned: meta.pinned !== undefined ? meta.pinned : (p.pinned || false),
            grade_level: p.grade_level || "General",
            likes: p.likes || 0,
            dislikes: p.dislikes || 0,
            reports: p.reports || 0,
            status: p.status || "active",
            images: meta.images || [],
            youtubeUrl: meta.youtubeUrl || p.youtube_url || "",
            telegramUrl: meta.telegramUrl || p.telegram_url || "",
            comments: (p.comments || []).map((c: any) => {
              let cleanText = c.text || "";
              let parentId = c.parent_id || c.parentId || null;
              const replyMatch = cleanText.match(/<!--replyTo:(.*?)-->/);
              if (replyMatch) {
                parentId = replyMatch[1];
                cleanText = cleanText.replace(/<!--replyTo:.*?-->/, "").trim();
              }
              return {
                id: c.id,
                author: c.author,
                text: cleanText,
                parentId,
                created_at: c.created_at,
                likes: c.likes || 0,
                dislikes: c.dislikes || 0,
                reports: c.reports || 0,
              };
            }).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
            created_at: p.created_at,
          };
        });
        setPostsList(formattedPosts);
        setPosts(formattedPosts);
      }

      if (tRes.data) {
        const formattedTeachers: Teacher[] = tRes.data.map((t: any) => ({
          id: t.id,
          name: t.name,
          normalizedName: t.normalized_name || normalizeTeacherName(t.name),
          normalized_name: t.normalized_name,
          gov: t.gov,
          subject: t.subject,
          grades: t.grades || "",
          img: t.img,
          likes: t.likes || 0,
          dislikes: t.dislikes || 0,
          status: t.status || "active",
          createdBy: t.created_by,
        }));
        setTeachersList(formattedTeachers);
        setTeachers(formattedTeachers);
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/teachers")) {
          parseUrlRoute(formattedTeachers);
        }
      }

      if (prRes.data && prRes.data.length > 0) {
        const currentProfiles = getProfiles();
        prRes.data.forEach((p: any) => {
          currentProfiles[p.username] = {
            avatarColor: p.avatar_color || "#0d9488",
            avatarUrl: p.avatar_url || currentProfiles[p.username]?.avatarUrl || "",
            bannerUrl: p.banner_url || currentProfiles[p.username]?.bannerUrl || "",
            bannerPattern: p.banner_pattern || currentProfiles[p.username]?.bannerPattern || "none",
            bio: p.bio || currentProfiles[p.username]?.bio || "",
            role: p.role || "student",
            isBanned: p.is_banned ?? currentProfiles[p.username]?.isBanned ?? false,
            has_honor_badge: p.has_honor_badge ?? currentProfiles[p.username]?.has_honor_badge ?? false,
          };
        });
        setProfilesMap(currentProfiles);
        setProfiles(currentProfiles);
      }

      if (nRes && nRes.data) {
        const localNotifs = getNotifications();
        const map = new Map<string, NotificationItem>();
        nRes.data.forEach((n: any) => {
          const localItem = localNotifs.find(x => x.id === n.id);
          map.set(n.id, {
            id: n.id,
            recipient: n.recipient,
            actor: n.actor,
            type: n.type as any,
            postId: n.post_id || "",
            targetTitle: n.target_title || "",
            commentText: n.comment_text || "",
            read: !!n.read || !!localItem?.read,
            created_at: n.created_at,
          });
        });
        localNotifs.forEach(n => {
          if (!map.has(n.id) && Date.now() - new Date(n.created_at).getTime() < 30000) {
            map.set(n.id, n);
          }
        });
        const mergedNotifs = Array.from(map.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setNotifications(mergedNotifs);
        setAllNotifications(mergedNotifs);
      }

      if (repRes && repRes.data) {
        const localReps = getReportRecords();
        const repMap = new Map<string, ReportRecord>();
        repRes.data.forEach((r: any) => {
          repMap.set(r.id, {
            id: r.id,
            targetId: r.target_id,
            targetType: r.target_type as any,
            targetTitle: r.target_title,
            reporter: r.reporter,
            reason: r.reason as any,
            note: r.note,
            status: r.status as any,
            created_at: r.created_at,
          });
        });
        localReps.forEach(r => {
          if (!repMap.has(r.id) && Date.now() - new Date(r.created_at).getTime() < 30000) {
            repMap.set(r.id, r);
          }
        });
        const mergedReps = Array.from(repMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        localStorage.setItem("report_records_v1", JSON.stringify(mergedReps.slice(0, 200)));
        setReportRecordsList(mergedReps);
      }

      // Fetch support tickets from Supabase
      try {
        const { data: ticketData } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(100);
        if (ticketData) {
          const formatted: SupportTicket[] = ticketData.map((t: any) => ({
            id: t.id,
            sender: t.sender,
            category: t.category || "other",
            subject: t.subject,
            message: t.message,
            status: t.status || "open",
            created_at: t.created_at,
            replies: t.replies || [],
            allowUserReply: t.allow_user_reply || false,
          }));
          setSupportTickets(formatted);
        }
      } catch {}
    } catch (err) {
      console.error("Supabase load error:", err);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  // Fetch user's votes from Supabase
  const fetchVotesFromSupabase = useCallback(async (username: string) => {
    try {
      const { data } = await supabase.from('votes').select('*').eq('username', username);
      if (data) {
        const vMap = getVotes();
        data.forEach((v: any) => {
          vMap[`${username}_${v.target_id}`] = v.vote_type;
        });
        setVotes(vMap);
      }
    } catch (e) {
      console.error("Error loading votes:", e);
    }
  }, []);

  // Initial load & Realtime subscription
  useEffect(() => {
    initStorage();
    const currUser = getSession();
    if (currUser) {
      setSession(currUser);
    }
    // Cross-verify session asynchronously with Supabase Auth & DB profile
    supabase.auth.getSession().then(async ({ data: { session: supaSession } }) => {
      if (supaSession?.user) {
        const cleanUsername = supaSession.user.user_metadata?.username || supaSession.user.email?.split('@')[0] || "";
        let role = supaSession.user.user_metadata?.role || "student";
        try {
          const { data: profData } = await supabase.from('profiles').select('role').eq('id', supaSession.user.id).maybeSingle();
          if (profData?.role) role = profData.role;
        } catch (err) {
          console.error("Error fetching profile role on load:", err);
        }
        const sessionUser: User = { username: cleanUsername, pass: "", role: role as User["role"] };
        localStorage.setItem("currentUser", JSON.stringify(sessionUser));
        
        const curUsers = getUsers();
        const idx = curUsers.findIndex(u => u.username === cleanUsername);
        if (idx >= 0) curUsers[idx].role = role as User["role"];
        else curUsers.push(sessionUser);
        localStorage.setItem("users", JSON.stringify(curUsers));

        setSession(sessionUser);
      }
    });
    setPostsList(getPosts());
    setTeachersList(getTeachers());
    setAllNotifications(getNotifications());
    setReportRecordsList(getReportRecords());
    setSupportTickets(getSupportTickets());
    setPinnedPostIds(getPinnedPostIds());
    setFaqList(getStoredFaqs());
    setAboutUsData(getStoredAboutUs());

    const pSettings = getPlatformSettings();
    setPlatformSettingsState(pSettings);
    const ann = getSiteAnnouncement();
    setSiteAnnouncementState(ann);
    setAnnouncementText(ann.text || "");
    setAnnouncementType(ann.type || "ministerial");
    setAnnouncementActive(ann.active || false);
    setAuditLogsState(getAuditLogs());
    setMutedUsersState(getMutedUsers());
    setUserStrikesState(getUserStrikes());
    setCustomBannedWordsState(getCustomBannedWords());
    setModPermissionsMap(getModPermissions());

    const savedTheme = (localStorage.getItem("iq_site_theme") as any) || "light";
    const savedLang = (localStorage.getItem("iq_site_lang") as any) || "ar";
    setSiteTheme(savedTheme);
    setSiteLang(savedLang);

    // Fetch live data immediately
    fetchSupabaseData();
    if (currUser) fetchVotesFromSupabase(currUser.username);

    // Auto-check announcement expiration every 30 seconds
    const expireCheckInterval = setInterval(() => {
      const currentAnn = getSiteAnnouncement();
      if (currentAnn.active && currentAnn.expiresAt && currentAnn.expiresAt <= Date.now()) {
        currentAnn.active = false;
        setSiteAnnouncement(currentAnn);
        setSiteAnnouncementState({ ...currentAnn });
      }
    }, 30000);

    // Synchronize initial active tab from browser URL
    parseUrlRoute();

    // Listen to browser Back / Forward buttons
    const handlePopState = () => {
      isPopStateRef.current = true;
      parseUrlRoute();
    };
    window.addEventListener("popstate", handlePopState);

    // Listen to Supabase Realtime updates with smart debouncing (prevents flooding queries)
    let debounceTimer: any = null;
    const scheduleFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchSupabaseData();
      }, 1200);
    };

    const channel = supabase
      .channel('public-global-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, scheduleFetch)
      .subscribe();

    // Auto-poll in background every 12 seconds to guarantee sync even if realtime publications aren't active
    const livePollInterval = setInterval(() => {
      fetchSupabaseData();
    }, 12000);

    // Update Baghdad 24h cycle countdown every minute
    const cycleInterval = setInterval(() => {
      setCycleInfo(getBaghdadCycleInfo());
    }, 60000);

    const lockExpiry = parseInt(localStorage.getItem("login_lockout_until") || "0");
    const now = Date.now();
    if (lockExpiry > now) {
      setLockoutRemaining(Math.ceil((lockExpiry - now) / 1000));
    }
    setMounted(true);

    return () => {
      clearInterval(expireCheckInterval);
      clearInterval(livePollInterval);
      clearInterval(cycleInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [fetchSupabaseData, fetchVotesFromSupabase, parseUrlRoute]);

  // Synchronize browser URL with active tab
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }

    let targetPath = "/main";
    if (tab === "feed") {
      targetPath = "/main";
    } else if (tab === "directory") {
      targetPath = "/teachers";
    } else if (tab === "teacher") {
      targetPath = selectedTeacher ? `/teachers?id=${encodeURIComponent(selectedTeacher.id)}` : "/teachers";
    } else if (tab === "notifications") {
      targetPath = "/notifications";
    } else if (tab === "profile") {
      const targetUser = viewedUser || session?.username;
      targetPath = targetUser ? `/profile/${encodeURIComponent(targetUser)}` : "/profile";
    } else if (tab === "admin") {
      targetPath = "/admin";
    }

    const currentFull = window.location.pathname + window.location.search;
    if (currentFull !== targetPath) {
      if (window.location.pathname === "/" && targetPath === "/main") {
        window.history.replaceState({ tab, viewedUser, teacherId: selectedTeacher?.id }, "", targetPath);
      } else {
        window.history.pushState({ tab, viewedUser, teacherId: selectedTeacher?.id }, "", targetPath);
      }
    }
  }, [tab, viewedUser, selectedTeacher, mounted, session?.username]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          localStorage.removeItem("login_lockout_until");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  if (!mounted) return null;

  const getProfile = (u: string): Profile => profiles[u] || { avatarColor: "#94a3b8", bio: "", avatarUrl: "" };

  // ─── Auth ─────────────────────────────────────────────────────────
  async function handleAuth() {
    if (authSubmitting) return;

    setAuthError("");

    if (!isRegister && lockoutRemaining > 0) {
      setAuthError(
        siteLang === "en"
          ? `Login temporarily locked. Please wait ${lockoutRemaining}s.`
          : `تسجيل الدخول مقفول حالياً، انتظر ${lockoutRemaining} ثانية.`
      );
      return;
    }

    if (!authUser.trim() || !authPass.trim()) {
      setAuthError(siteLang === "en" ? "Fill in the required fields." : "املأ الحقول المطلوبة.");
      return;
    }

    // Require Turnstile verification token before submission
    if (!turnstileToken) {
      setAuthError(siteLang === "en" ? "Complete security verification first." : "كمّل التحقق الأمني أولاً.");
      return;
    }

    // Sanitize username input
    const cleanUsername = sanitizeUsername(authUser.trim());
    if (!cleanUsername) {
      setAuthError(siteLang === "en" ? "Invalid username." : "اسم المستخدم غير صالح.");
      return;
    }

    setAuthSubmitting(true);

    // Canonical Server-Side Turnstile Verification
    try {
      const verifyRes = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: turnstileToken,
          action: "auth",
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        resetTurnstile();
        setAuthSubmitting(false);
        setAuthError(
          siteLang === "en"
            ? "Cloudflare security verification failed. Please try again."
            : "فشل التحقق الأمني من Cloudflare. يرجى إعادة المحاولة."
        );
        return;
      }
      setTurnstileServerVerified(true);
    } catch (err) {
      resetTurnstile();
      setAuthSubmitting(false);
      console.error("[Turnstile] Server verification request failed:", err);
      setAuthError(
        siteLang === "en"
          ? "Unable to reach security service. Please try again."
          : "تعذر الاتصال بخدمة التحقق الأمني. يرجى إعادة المحاولة."
      );
      return;
    }

    try {
      // Generate a pseudo-email for Supabase Auth since we only collect usernames
      const pseudoEmail = `${cleanUsername.toLowerCase()}@iq-academy.local`;

      if (isRegister) {
        if (!platformSettings.allowRegistration) {
          setAuthError(siteLang === "en" ? "Account registration is temporarily paused by platform administration." : "إنشاء الحسابات معطل حالياً من إدارة المنصة.");
          resetTurnstile();
          setAuthSubmitting(false);
          return;
        }
        if (authPass.length < 8 || !/[0-9]/.test(authPass) || !/[A-Z]/.test(authPass)) {
          setAuthError(
            siteLang === "en"
              ? "Password must be at least 8 characters with a number and uppercase letter."
              : "الرمز قصير أو ما بي رقم وحرف كبير."
          );
          resetTurnstile();
          setAuthSubmitting(false);
          return;
        }

        // 1. Sign up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: pseudoEmail,
          password: authPass,
          options: {
            data: {
              username: cleanUsername,
              role: "student"
            }
          }
        });

        if (error) {
          setAuthError(error.message);
          resetTurnstile();
          setAuthSubmitting(false);
          return;
        }

        // Legacy fallback for UI state
        const p = getProfiles();
        if (!p[cleanUsername]) {
          p[cleanUsername] = { avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)], bio: "", avatarUrl: "" };
          setProfiles(p);
          setProfilesMap(p);
        }

        const sessionUser: User = { username: cleanUsername, pass: "", role: "student" };
        localStorage.setItem("currentUser", JSON.stringify(sessionUser));
        
        const currentUsers = getUsers();
        if (!currentUsers.some(u => u.username === cleanUsername)) {
          currentUsers.push(sessionUser);
          localStorage.setItem("users", JSON.stringify(currentUsers));
        }

        setSession(sessionUser);
        setAuthModal(false);
        setAuthUser(""); setAuthPass(""); resetTurnstile();
        setSelectedGrades([]);
        setGradeModal(true);
      } else {
        // Login: Use Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email: pseudoEmail,
          password: authPass,
        });

        if (error) {
          resetTurnstile();
          setAuthSubmitting(false);
          const nextFails = failedAttempts + 1;
          setFailedAttempts(nextFails);
          if (nextFails >= 5) {
            const lockUntil = Date.now() + 60 * 1000;
            localStorage.setItem("login_lockout_until", lockUntil.toString());
            setLockoutRemaining(60);
            setFailedAttempts(0);
            setAuthError(
              siteLang === "en"
                ? "Login locked for 1 minute after 5 failed attempts."
                : "انقفل تسجيل الدخول لمدة دقيقة بعد 5 محاولات غلط."
            );
          } else {
            setAuthError(
              siteLang === "en"
                ? (error.message === "Invalid login credentials"
                    ? `Incorrect username or password. Attempt ${nextFails} of 5 before lock.`
                    : `${error.message}. Attempt ${nextFails} of 5.`)
                : (error.message === "Invalid login credentials"
                    ? `اسم المستخدم أو الرمز غلط. محاولة ${nextFails} من 5 قبل القفل.`
                    : `${error.message}. محاولة ${nextFails} من 5.`)
            );
          }
          return;
        }

        setFailedAttempts(0);
        localStorage.removeItem("login_lockout_until");
        
        // Extract role from profiles table (source of truth), fallback to metadata
        let role = data.user?.user_metadata?.role || "student";
        try {
          const { data: profData } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
          if (profData?.role) role = profData.role;
        } catch (err) {
          console.error("Error fetching profile role:", err);
        }

        const sessionUser: User = { username: cleanUsername, pass: "", role };
        
        // Sync local users cache
        const currentUsers = getUsers();
        const existingIdx = currentUsers.findIndex(u => u.username === cleanUsername);
        if (existingIdx >= 0) {
          currentUsers[existingIdx].role = role;
        } else {
          currentUsers.push(sessionUser);
        }
        localStorage.setItem("users", JSON.stringify(currentUsers));

        // Store UI session
        localStorage.setItem("currentUser", JSON.stringify(sessionUser));
        setSession(sessionUser);
        fetchVotesFromSupabase(cleanUsername);
        setAuthModal(false); setAuthUser(""); setAuthPass(""); resetTurnstile();
      }
    } finally {
      setAuthSubmitting(false);
    }
    rerender();
  }

  function logout() {
    localStorage.removeItem("currentUser");
    supabase.auth.signOut().catch(() => {});
    setSession(null);
    if (tab === "admin" || tab === "profile" || tab === "notifications") setTab("feed");
    rerender();
  }

  async function castVote(itemKey: string, type: "like" | "dislike", updateFn: (delta: { likes: number; dislikes: number }) => void) {
    if (!session) { setAuthModal(true); return; }
    if (profiles[session.username]?.isBanned) {
      alert(siteLang === "en" ? "Your account is banned." : "حسابك محظور نهائياً.");
      return;
    }

    // 1. Query the real 'votes' table in Supabase to check if the user already voted on this item
    let existing: "like" | "dislike" | null = null;
    try {
      const { data: voteData, error: voteErr } = await supabase
        .from('votes')
        .select('vote_type')
        .eq('username', session.username)
        .eq('target_id', itemKey)
        .maybeSingle();

      if (!voteErr && voteData?.vote_type) {
        existing = voteData.vote_type as "like" | "dislike";
      }
    } catch (err) {
      console.error("Error checking existing vote in Supabase:", err);
    }

    // Fallback to local storage if network query did not return a vote
    if (!existing) {
      const votesMap = getVotes();
      existing = votesMap[`${session.username}_${itemKey}`] || null;
    }

    let delta = { likes: 0, dislikes: 0 };

    if (session.role === "owner") {
      const val = prompt(siteLang === "en" ? "Owner vote override: enter number of votes:" : "أنت المالك، اكتب عدد الأصوات:", "1");
      if (val === null) return;
      const amount = parseInt(val || "1") || 1;
      delta = { likes: type === "like" ? amount : 0, dislikes: type === "dislike" ? amount : 0 };
    } else {
      if (existing === type) return;

      if (existing) {
        if (existing === "like") delta.likes -= 1; else delta.dislikes -= 1;
      }
      if (type === "like") delta.likes += 1; else delta.dislikes += 1;
    }

    // Update local cache and UI
    const votesMap = getVotes();
    const voteKey = `${session.username}_${itemKey}`;
    votesMap[voteKey] = type;
    setVotes(votesMap);
    updateFn(delta);

    // Save to Supabase Central Database (persists for both regular users and owner)
    try {
      await supabase.from('votes').upsert([
        { username: session.username, target_id: itemKey, vote_type: type }
      ], { onConflict: 'username,target_id' });

      if (itemKey.startsWith("post_")) {
        const pid = itemKey.replace("post_", "");
        const target = posts.find(p => p.id === pid);
        if (target) {
          await supabase.from('posts').update({
            likes: Math.max(0, target.likes + delta.likes),
            dislikes: Math.max(0, target.dislikes + delta.dislikes),
          }).eq('id', pid);
        }
      } else if (itemKey.startsWith("teacher_")) {
        const tid = itemKey.replace("teacher_", "");
        const target = teachers.find(t => t.id === tid);
        if (target) {
          await supabase.from('teachers').update({
            likes: Math.max(0, target.likes + delta.likes),
            dislikes: Math.max(0, target.dislikes + delta.dislikes),
          }).eq('id', tid);
        }
      } else if (itemKey.startsWith("comment_")) {
        const cid = itemKey.replace("comment_", "");
        let targetComment: any = null;
        for (const p of posts) {
          const c = p.comments?.find(x => x.id === cid);
          if (c) { targetComment = c; break; }
        }
        if (targetComment) {
          await supabase.from('comments').update({
            likes: Math.max(0, targetComment.likes + delta.likes),
            dislikes: Math.max(0, targetComment.dislikes + delta.dislikes),
          }).eq('id', cid);
        }
      }
    } catch (e) {
      console.error("Error persisting vote to Supabase:", e);
    }

    rerender();
  }

  function getUserVote(itemKey: string): "like" | "dislike" | null {
    if (!session) return null;
    return getVotes()[`${session.username}_${itemKey}`] || null;
  }

  // ─── Post Handlers (Persisted to Supabase) ─────────────────────────
  async function submitPost() {
    if (!session || !postTitle.trim() || !postBody.trim()) return;

    const cooldown = checkActionCooldown("post", 30000);
    if (!cooldown.allowed) {
      alert(siteLang === "en"
        ? `Please wait ${cooldown.remainingSec}s before publishing another post.`
        : `يرجى الانتظار ${cooldown.remainingSec} ثانية قبل نشر منشور جديد.`);
      return;
    }

    if (profiles[session.username]?.isBanned) {
      alert(siteLang === "en" ? "Your account is banned." : "حسابك محظور نهائياً، ما تكدر تنشر بالمنصة.");
      return;
    }
    if (postTitle.length > 100 || postBody.length > 1500) return;

    // Phase 5: Sanitize post inputs
    const cleanTitle = sanitizeText(postTitle.trim(), 100);
    const cleanBody = sanitizeText(postBody.trim(), 1500);
    if (!cleanTitle || !cleanBody) return;

    const muteCheck = isUserCurrentlyMuted(session.username);
    if (muteCheck.muted) {
      alert(siteLang === "en"
        ? `Your account is temporarily muted until ${muteCheck.remainingText}. Reason: ${muteCheck.reason}`
        : `حسابك مكتوم مؤقتاً لحد ${muteCheck.remainingText}. السبب: ${muteCheck.reason}`);
      return;
    }

    if (!platformSettings.allowPosting && session.role === "student") {
      alert(siteLang === "en"
        ? "Post publishing is temporarily paused by platform administration."
        : "نشر المنشورات معطل حالياً من إدارة المنصة.");
      return;
    }

    if (containsProfanity(cleanTitle, customBannedWords) || containsProfanity(cleanBody, customBannedWords)) {
      alert(siteLang === "en"
        ? "Post content contains prohibited words."
        : "المحتوى بي كلمات مو مسموحة حسب معايير المجتمع.");
      return;
    }

    // Phase 5: Strict YouTube & Telegram URL whitelisting
    if (postYoutube.trim() && !isAllowedYoutubeUrl(postYoutube.trim())) {
      alert(siteLang === "en"
        ? "Please enter a valid YouTube link from youtube.com or youtu.be"
        : "رابط اليوتيوب مو صحيح، لازم يكون من youtube.com أو youtu.be");
      return;
    }
    if (postTelegram.trim() && !isAllowedTelegramUrl(postTelegram.trim())) {
      alert(siteLang === "en"
        ? "Please enter a valid Telegram link starting with https://t.me/"
        : "رابط التلغرام مو صحيح، لازم يبدي بـ https://t.me/");
      return;
    }

    const meta: any = {};
    if (postTag) meta.tag = postTag;
    if (postImages.length > 0) meta.images = postImages;
    if (postYoutube.trim()) meta.youtubeUrl = postYoutube.trim();
    const hasMeta = Object.keys(meta).length > 0;
    const metaSuffix = hasMeta ? `\n\n<!--meta:${JSON.stringify(meta)}-->` : "";

    const newPostPayload = {
      author: session.username,
      teacher_id: postTeacher.trim() || undefined,
      title: cleanTitle,
      body: cleanBody + metaSuffix,
      grade_level: postGrade,
      likes: 0,
      dislikes: 0,
      reports: 0,
      status: "active",
    };

    // Optimistic UI update
    const tempPost: Post = {
      id: "temp_" + Date.now(),
      author: session.username,
      teacherId: postTeacher.trim() || undefined,
      teacher_id: postTeacher.trim() || undefined,
      title: cleanTitle,
      body: cleanBody,
      grade_level: postGrade,
      tag: postTag,
      pinned: false,
      likes: 0,
      dislikes: 0,
      reports: 0,
      status: "active",
      images: postImages,
      youtubeUrl: postYoutube.trim(),
      telegramUrl: "",
      comments: [],
      created_at: new Date().toISOString(),
    };
    setPostsList(prev => [tempPost, ...prev]);

    // Close modal instantly for better UX
    setPostTitle(""); setPostBody(""); setPostGrade("General"); setPostTeacher("");
    setPostTeacherSearch("");
    setPostImages([]); setPostYoutube(""); setPostTelegram(""); setPostTag("discussion");
    setPostModal(false); rerender();

    // Send to Supabase in background
    try {
      const { data, error } = await supabase.from('posts').insert([newPostPayload]).select('id').single();
      if (!error && data) {
        setPostsList(prev => prev.map(p => p.id === tempPost.id ? { ...p, id: data.id } : p));
      }
    } catch (e) {
      console.error("Error creating post in Supabase:", e);
    }
  }

  function togglePinPost(postId: string) {
    if (!canAdmin) return;
    const current = getPinnedPostIds();
    const isCurrentlyPinned = current.includes(postId);
    let updated: string[];
    if (isCurrentlyPinned) {
      updated = current.filter(id => id !== postId);
    } else {
      updated = [postId, ...current];
    }
    setPinnedPostIdsStorage(updated);
    setPinnedPostIds(updated);
    setPostsList(prev => prev.map(p => p.id === postId ? { ...p, pinned: !isCurrentlyPinned } : p));
    rerender();
  }

  async function handlePostImagesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (postImages.length + files.length > 4) {
      showToast(siteLang === "en" ? "You can only upload up to 4 images." : "يمكنك رفع 4 صور كحد أقصى.", "warning");
      e.target.value = "";
      return;
    }
    const fileList = Array.from(files);
    setIsCompressingImages(true);
    try {
      for (const file of fileList) {
        const compressed = await compressImage(file, 900, 900, 0.72);
        if (compressed) {
          setPostImages(prev => [...prev, compressed]);
        }
      }
    } catch (err) {
      console.error("Image compression error:", err);
      showToast(siteLang === "en" ? "Failed to process some images." : "فشل في معالجة بعض الصور.", "error");
    } finally {
      setIsCompressingImages(false);
      e.target.value = "";
    }
  }

  function removePostImage(idx: number) {
    setPostImages(prev => prev.filter((_, i) => i !== idx));
  }


  function votePost(postId: string, type: "like" | "dislike") {
    castVote(`post_${postId}`, type, (delta) => {
      setPostsList(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + delta.likes, dislikes: p.dislikes + delta.dislikes } : p));
      if (type === "like" && delta.likes > 0 && session) {
        const p = posts.find(item => item.id === postId);
        if (p && p.author !== session.username) {
          const notifs = getNotifications();
          notifs.unshift({
            id: "notif_like_" + Date.now(),
            recipient: p.author,
            actor: session.username,
            type: "like",
            postId: p.id,
            targetTitle: p.title,
            read: false,
            created_at: new Date().toISOString(),
          });
          setNotifications(notifs);
          setAllNotifications(notifs);
        }
      }
    });
  }

  // ─── Report Records & Moderation Functions ─────────────────────────
  function getReportRecords(): ReportRecord[] {
    if (typeof window === "undefined") return [];
    try {
      const s = localStorage.getItem("report_records_v1");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }

  async function saveReportRecord(r: ReportRecord) {
    if (typeof window === "undefined") return;
    try {
      const list = getReportRecords();
      list.unshift(r);
      localStorage.setItem("report_records_v1", JSON.stringify(list.slice(0, 200)));
      setReportRecordsList(list);

      // Persist to Supabase reports table
      const { error } = await supabase.from('reports').insert([{
        id: r.id,
        target_id: r.targetId,
        target_type: r.targetType,
        target_title: r.targetTitle || "",
        reporter: r.reporter,
        reason: r.reason,
        note: r.note || "",
        status: r.status || "pending",
      }]);
      if (error) {
        console.error("Error inserting report to Supabase:", error);
      }
    } catch (err) {
      console.error("Error saving report record:", err);
    }
  }

  async function dismissReport(targetId: string) {
    const list = getReportRecords().map(r => r.targetId === targetId ? { ...r, status: "dismissed" as const } : r);
    localStorage.setItem("report_records_v1", JSON.stringify(list));
    setReportRecordsList(list);

    setDismissedReportIds(prev => {
      const next = new Set(prev).add(targetId);
      try { localStorage.setItem("dismissed_reports_v1", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });

    try {
      await supabase.from('reports').update({ status: 'dismissed' }).eq('target_id', targetId);
    } catch(e) {}

    setPostsList(prev => prev.map(p => {
      if (p.id === targetId) return { ...p, reports: 0, status: "active" };
      if (p.comments?.some(c => c.id === targetId)) {
        return {
          ...p,
          comments: p.comments.map(c => c.id === targetId ? { ...c, reports: 0 } : c)
        };
      }
      return p;
    }));

    try {
      await supabase.from('posts').update({ reports: 0, status: "active" }).eq('id', targetId);
      await supabase.from('comments').update({ reports: 0 }).eq('id', targetId);
      await supabase.from('notifications').delete().eq('post_id', targetId).eq('type', 'report_alert');
    } catch (e) {
      console.error("Error dismissing report in Supabase:", e);
    }
    rerender();
  }

  async function deleteReportRecordOnly(targetId: string, targetType: "post" | "comment") {
    requestConfirm({
      title: siteLang === "en" ? "Clear Reports" : "تصفير البلاغات",
      message: siteLang === "en" ? "Delete report records and reset counter?" : "متأكد تريد تمسح سجل البلاغات وتصفّر العداد؟",
      confirmText: siteLang === "en" ? "Clear" : "تصفير",
      isDestructive: true,
      onConfirm: async () => {
        // Remove from report records
        const list = getReportRecords().filter(r => r.targetId !== targetId);
        localStorage.setItem("report_records_v1", JSON.stringify(list));
        setReportRecordsList(list);

        setDismissedReportIds(prev => {
          const next = new Set(prev).add(targetId);
          try { localStorage.setItem("dismissed_reports_v1", JSON.stringify(Array.from(next))); } catch {}
          return next;
        });

        try {
          await supabase.from('reports').delete().eq('target_id', targetId);
          await supabase.from('notifications').delete().eq('post_id', targetId).eq('type', 'report_alert');
        } catch (e) {}

        if (targetType === "post") {
          setPostsList(prev => prev.map(p => p.id === targetId ? { ...p, reports: 0, status: "active" } : p));
          try {
            await supabase.from('posts').update({ reports: 0, status: "active" }).eq('id', targetId);
          } catch (e) {
            console.error("Error resetting post reports in Supabase:", e);
          }
        } else {
          setPostsList(prev => prev.map(p => ({
            ...p,
            comments: (p.comments || []).map(c => c.id === targetId ? { ...c, reports: 0 } : c)
          })));
          try {
            await supabase.from('comments').update({ reports: 0 }).eq('id', targetId);
          } catch (e) {
            console.error("Error resetting comment reports in Supabase:", e);
          }
        }
        rerender();
        showToast(siteLang === "en" ? "Report removed and counter reset." : "انمسح البلاغ وتصفّر العداد بنجاح.", "success");
      },
    });
  }

  async function adminDeleteReportedItem(targetId: string, targetType: "post" | "comment", reportId?: string) {
    requestConfirm({
      title: siteLang === "en" ? "Delete Content" : "حذف المحتوى",
      message: siteLang === "en" ? "Permanently delete this content from the platform?" : "متأكد تريد تحذف هذا المحتوى نهائياً من المنصة؟",
      confirmText: siteLang === "en" ? "Delete" : "حذف",
      isDestructive: true,
      onConfirm: async () => {
        if (targetType === "post") {
          setPostsList(prev => prev.filter(item => item.id !== targetId));
          try {
            await supabase.from('posts').delete().eq('id', targetId);
          } catch (e) {
            console.error("Error deleting post from Supabase:", e);
          }
        } else {
          const parentPost = posts.find(p => p.comments?.some(c => c.id === targetId));
          if (parentPost) {
            setPostsList(prev => prev.map(p => {
              if (p.id === parentPost.id) {
                return {
                  ...p,
                  comments: p.comments.filter(c => c.id !== targetId),
                };
              }
              return p;
            }));
            try {
              await supabase.from('comments').delete().eq('id', targetId);
            } catch (e) {
              console.error("Error deleting comment from Supabase:", e);
            }
          }
        }
        // Remove from reports
        const list = getReportRecords().filter(r => r.targetId !== targetId);
        localStorage.setItem("report_records_v1", JSON.stringify(list));
        setReportRecordsList(list);
        setDismissedReportIds(prev => {
          const next = new Set(prev).add(targetId);
          try { localStorage.setItem("dismissed_reports_v1", JSON.stringify(Array.from(next))); } catch {}
          return next;
        });

        try {
          await supabase.from('reports').delete().eq('target_id', targetId);
          await supabase.from('notifications').delete().eq('post_id', targetId).eq('type', 'report_alert');
        } catch (e) {}

        rerender();
        showToast(siteLang === "en" ? "Reported content deleted." : "انحذف المحتوى المخالف بنجاح.", "success");
      },
    });
  }

  function warnAuthor(authorUsername: string, targetTitle: string) {
    const notifs = getNotifications();
    notifs.unshift({
      id: "notif_" + Date.now(),
      recipient: authorUsername,
      actor: session?.username || "الإدارة",
      type: "admin_warning",
      postId: "",
      targetTitle,
      commentText: siteLang === "en"
        ? `Warning: Your post "${targetTitle}" was reported and flagged by administration.`
        : `تنبيه إداري: تم الإبلاغ عن منشورك "${targetTitle}" لمخالفته تعليمات النشر.`,
      read: false,
      created_at: new Date().toISOString(),
    });
    setNotifications(notifs);
    setAllNotifications(notifs);
    alert(siteLang === "en" ? `Official warning sent to ${authorUsername}` : `تم إرسال إنذار إداري للمستخدم: ${authorUsername}`);
  }

  function getWordCount(str: string): number {
    const trimmed = str.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function openReportModal(target: { id: string; type: "post" | "comment"; title?: string; parentPostId?: string }) {
    if (!session) { setAuthModal(true); return; }
    setReportTarget(target);
    setReportReason("inappropriate");
    setReportNote("");
  }

  function toggleProfileComments(postId: string) {
    setExpandedProfileComments(prev => ({ ...prev, [postId]: !prev[postId] }));
  }

  function reportPost(postId: string) {
    if (!session) { setAuthModal(true); return; }
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    openReportModal({ id: postId, type: "post", title: p.title });
  }

  async function submitReport() {
    if (!session) { setAuthModal(true); return; }

    const cooldown = checkActionCooldown("report", 15000);
    if (!cooldown.allowed) {
      alert(siteLang === "en"
        ? `Please wait ${cooldown.remainingSec}s before submitting another report.`
        : `يرجى الانتظار ${cooldown.remainingSec} ثانية قبل إرسال بلاغ آخر.`);
      return;
    }

    if (profiles[session.username]?.isBanned) {
      alert(siteLang === "en" ? "Your account is banned." : "حسابك محظور نهائياً.");
      return;
    }
    if (!reportTarget) return;
    if (getWordCount(reportNote) > 50) {
      alert(siteLang === "en" ? "Note must not exceed 50 words." : "الملاحظة لازم ما تعبر 50 كلمة.");
      return;
    }

    if (reportTarget.type === "post") {
      const p = posts.find(x => x.id === reportTarget.id);
      if (p) {
        const newReports = (p.reports || 0) + 1;
        const newStatus = newReports >= 20 ? "hidden" : p.status;
        setPostsList(prev => prev.map(item => item.id === reportTarget.id ? { ...item, reports: newReports, status: newStatus as any } : item));
        try {
          await supabase.from('posts').update({ reports: newReports, status: newStatus }).eq('id', reportTarget.id);
        } catch (e) {
          console.error("Error updating report in Supabase:", e);
        }
      }
    } else {
      const parentPostId = reportTarget.parentPostId;
      if (parentPostId) {
        setPostsList(prev => prev.map(p => {
          if (p.id === parentPostId) {
            return {
              ...p,
              comments: p.comments.map(c => c.id === reportTarget.id ? { ...c, reports: (c.reports || 0) + 1 } : c),
            };
          }
          return p;
        }));
        try {
          const targetPost = posts.find(p => p.id === parentPostId);
          const targetComment = targetPost?.comments.find(c => c.id === reportTarget.id);
          if (targetComment) {
            await supabase.from('comments').update({ reports: (targetComment.reports || 0) + 1 }).eq('id', reportTarget.id);
          }
        } catch (e) {
          console.error("Error updating comment report in Supabase:", e);
        }
      }
    }

    const record: ReportRecord = {
      id: "rep_" + Date.now(),
      targetId: reportTarget.id,
      targetType: reportTarget.type,
      targetTitle: reportTarget.title || "",
      reporter: session.username,
      reason: reportReason,
      note: reportNote.trim(),
      created_at: new Date().toISOString(),
      status: "pending",
    };
    await saveReportRecord(record);

    setDismissedReportIds(prev => {
      const next = new Set(prev);
      next.delete(record.targetId);
      try { localStorage.setItem("dismissed_reports_v1", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });

    // Notify all moderators and owners of this incoming report
    let adminUsernames: string[] = ["hh"];
    try {
      const { data: dbAdmins } = await supabase.from('profiles').select('username').in('role', ['owner', 'mod']);
      if (dbAdmins && dbAdmins.length > 0) {
        dbAdmins.forEach((a: any) => {
          if (a.username) adminUsernames.push(a.username);
        });
      }
    } catch {}

    const profilesAdmins = Object.entries(profiles)
      .filter(([_, p]) => (p as Profile).role === "owner" || (p as Profile).role === "mod")
      .map(([uname]) => uname);
    const localAdmins = getUsers().filter(u => u.role === "owner" || u.role === "mod").map(u => u.username);
    adminUsernames = Array.from(new Set([...adminUsernames, ...profilesAdmins, ...localAdmins]));

    const reasonText = reportReason === "inappropriate"
      ? (siteLang === "en" ? "Inappropriate Content" : "محتوى غير لائق")
      : reportReason === "wrong_info"
      ? (siteLang === "en" ? "Misleading Information" : "معلومات مضللة")
      : (siteLang === "en" ? "Other Reason" : "سبب آخر");
    
    await Promise.all(adminUsernames.map(admName =>
      sendNotificationToUser(admName, {
        type: "report_alert",
        postId: reportTarget.id,
        title: siteLang === "en" ? `Report on: "${reportTarget.title || "Content"}"` : `بلاغ عن: "${reportTarget.title || "محتوى"}"`,
        message: siteLang === "en"
          ? `New report [${reasonText}]: ${reportNote.trim() || "No extra note"} • from: ${session.username}`
          : `بلاغ جديد [${reasonText}]: ${reportNote.trim() || "بدون ملاحظة إضافية"} • من: ${session.username}`,
      })
    ));

    setReportTarget(null);
    setReportNote("");
    setReportReason("inappropriate");
    rerender();
    setTimeout(() => {
      alert(siteLang === "en" ? "Report submitted for admin review." : "وصل البلاغ وراح تراجعه الإدارة.");
    }, 10);
  }


  async function addComment(postId: string, textOverride?: string, parentId?: string | null) {
    if (!session) { setAuthModal(true); return; }
    if (profiles[session.username]?.isBanned) {
      alert(siteLang === "en" ? "Your account is banned." : "حسابك محظور نهائياً، ما تكدر تشارك بالمنصة.");
      return;
    }

    const muteCheck = isUserCurrentlyMuted(session.username);
    if (muteCheck.muted) {
      alert(siteLang === "en"
        ? `Your account is temporarily muted until ${muteCheck.remainingText}. Reason: ${muteCheck.reason}`
        : `حسابك مكتوم مؤقتاً لحد ${muteCheck.remainingText}. السبب: ${muteCheck.reason}`);
      return;
    }

    const input = (document.getElementById(`comment-${postId}`) || document.getElementById(`profile-comment-${postId}`)) as HTMLInputElement;
    const rawText = textOverride || input?.value || "";
    if (!rawText.trim()) return;

    const cooldown = checkActionCooldown("comment", 10000);
    if (!cooldown.allowed) {
      alert(siteLang === "en"
        ? `Please wait ${cooldown.remainingSec}s before adding another comment.`
        : `يرجى الانتظار ${cooldown.remainingSec} ثانية قبل إضافة تعليق آخر.`);
      return;
    }

    // Phase 5: Sanitize comment text
    const commentText = sanitizeText(rawText.trim(), 1000);
    if (!commentText) return;

    if (containsProfanity(commentText, customBannedWords)) {
      alert(siteLang === "en" ? "Comment contains prohibited words." : "التعليق يحتوي على كلمات غير مسموح بها وفق معايير المجتمع.");
      return;
    }

    // Optimistic UI update
    const tempComment: Comment = {
      id: "temp_c_" + Date.now(),
      author: session.username,
      text: commentText,
      parentId: parentId || null,
      created_at: new Date().toISOString(),
      likes: 0,
      dislikes: 0,
      reports: 0,
    };

    setPostsList(prev => prev.map(p => {
      if (p.id === postId) {
        return { ...p, comments: [...(p.comments || []), tempComment] };
      }
      return p;
    }));

    // If it's a reply to a comment, expand the parent so the user immediately sees it
    if (parentId) {
      setExpandedComments(prev => ({ ...prev, [parentId]: true }));
    }

    // Trigger notification
    if (parentId) {
      let parentAuthor: string | null = null;
      for (const p of posts) {
        const c = p.comments?.find(x => x.id === parentId);
        if (c) { parentAuthor = c.author; break; }
      }
      if (parentAuthor && parentAuthor !== session.username) {
        sendNotificationToUser(parentAuthor, {
          type: "comment",
          postId: postId,
          title: `رد جديد على تعليقك`,
          message: `${session.username}: "${commentText}"`,
        });
      }
    } else {
      const targetPost = posts.find(p => p.id === postId);
      if (targetPost && targetPost.author !== session.username) {
        sendNotificationToUser(targetPost.author, {
          type: "comment",
          postId: targetPost.id,
          title: targetPost.title,
          message: commentText,
        });
      }
    }

    if (!textOverride && input) input.value = "";

    // Send to Supabase Central Database
    try {
      const payloadText = parentId ? `<!--replyTo:${parentId}-->${commentText}` : commentText;
      await supabase.from('comments').insert([{
        post_id: postId,
        author: session.username,
        text: payloadText,
        likes: 0,
        dislikes: 0,
        reports: 0,
      }]);
    } catch (e) {
      console.error("Error creating comment in Supabase:", e);
    }

    rerender();
  }

  function voteComment(postId: string, commentId: string, type: "like" | "dislike") {
    castVote(`comment_${commentId}`, type, (delta) => {
      setPostsList(prev => prev.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            comments: p.comments.map(c => c.id === commentId ? { ...c, likes: c.likes + delta.likes, dislikes: c.dislikes + delta.dislikes } : c),
          };
        }
        return p;
      }));
    });
  }

  function reportComment(postId: string, commentId: string) {
    if (!session) { setAuthModal(true); return; }
    const targetPost = posts.find(p => p.id === postId);
    const targetComment = targetPost?.comments.find(c => c.id === commentId);
    openReportModal({ id: commentId, type: "comment", title: targetComment?.text || "تعليق", parentPostId: postId });
  }

  async function deletePost(postId: string) {
    if (!session) return;
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    const isAuthor = session.username === p.author;
    const isPrivileged = session.role === "owner" || session.role === "mod";
    if (!isAuthor && !isPrivileged) return;

    requestConfirm({
      title: siteLang === "en" ? "Delete Post" : "حذف المنشور",
      message: siteLang === "en" ? "Are you sure you want to delete this post or review?" : "متأكد تريد تحذف هذا المنشور أو التقييم؟",
      confirmText: siteLang === "en" ? "Delete" : "حذف",
      isDestructive: true,
      onConfirm: async () => {
        setPostsList(prev => prev.filter(item => item.id !== postId));
        try {
          await supabase.from('posts').delete().eq('id', postId);
          fetchSupabaseData();
        } catch (e) {
          console.error("Error deleting post from Supabase:", e);
        }
        rerender();
        showToast(siteLang === "en" ? "Post deleted successfully." : "تم حذف المنشور بنجاح.", "success");
      },
    });
  }

  // Delete Teacher (Owner / Mod only)
  async function deleteTeacher(teacherId: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) {
      showToast(siteLang === "en" ? "This action is restricted to staff." : "هالصلاحية بس للمالك والمشرفين.", "error");
      return;
    }
    const target = teachers.find(t => t.id === teacherId);
    if (!target) return;

    requestConfirm({
      title: siteLang === "en" ? "Delete Teacher" : "حذف الأستاذ",
      message: siteLang === "en" ? `Permanently delete teacher ${target.name}?` : `متأكد تريد تحذف الأستاذ "${target.name}" نهائياً؟`,
      confirmText: siteLang === "en" ? "Delete" : "حذف",
      isDestructive: true,
      onConfirm: async () => {
        setTeachersList(prev => prev.filter(t => t.id !== teacherId));
        if (selectedTeacher?.id === teacherId) {
          setSelectedTeacher(null);
          setTab("directory");
        }

        try {
          await supabase.from('teachers').delete().eq('id', teacherId);
          fetchSupabaseData();
        } catch (e) {
          console.error("Error deleting teacher from Supabase:", e);
        }
        rerender();
        showToast(siteLang === "en" ? "Teacher profile removed." : "تم حذف الأستاذ بنجاح.", "success");
      },
    });
  }

  // ─── Image Compression Helper ────────────────────────────────────
  function compressImage(file: File, maxWidth = 400, maxHeight = 400, quality = 0.82): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            try {
              let dataUrl = canvas.toDataURL("image/webp", quality);
              if (!dataUrl.startsWith("data:image/webp")) {
                dataUrl = canvas.toDataURL("image/jpeg", quality);
              }
              resolve(dataUrl);
            } catch {
              resolve(canvas.toDataURL("image/jpeg", quality));
            }
          } else {
            resolve(e.target?.result as string || "");
          }
        };
        img.onerror = () => resolve(e.target?.result as string || "");
        img.src = e.target?.result as string || "";
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  // Teacher Image File Upload Handler (No URLs)
  async function handleTeacherImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    if (compressed) setTImg(compressed);
  }

  // ─── Teacher Handlers (Persisted to Supabase) ──────────────────────
  async function submitTeacher() {
    if (!session) { setAuthModal(true); return; }

    const cooldown = checkActionCooldown("teacher", 45000);
    if (!cooldown.allowed) {
      alert(siteLang === "en"
        ? `Please wait ${cooldown.remainingSec}s before submitting another teacher suggestion.`
        : `يرجى الانتظار ${cooldown.remainingSec} ثانية قبل اقتراح أستاذ آخر.`);
      return;
    }

    if (!platformSettings.allowTeacherSubmissions && session.role === "student") {
      alert(siteLang === "en" ? "New teacher suggestions are temporarily paused by platform administration." : "اقتراح الأساتذة معطل حالياً من إدارة المنصة.");
      return;
    }

    const finalSubject = tSubjectChoice === "أخرى" ? tCustomSubject.trim() : tSubjectChoice.trim();
    if (!tName.trim()) {
      alert(siteLang === "en" ? "Enter teacher name." : "اكتب اسم الأستاذ.");
      return;
    }
    if (!finalSubject) {
      alert(siteLang === "en" ? "Select or enter subject." : "اختار أو اكتب المادة.");
      return;
    }
    if (tSelectedGrades.length === 0) {
      alert(siteLang === "en" ? "Select at least one grade." : "اختار مرحلة دراسية وحدة على الأقل.");
      return;
    }
    if (tTeachingModes.length === 0) {
      alert(siteLang === "en" ? "Select at least one teaching mode." : "حدد طريقة تدريس وحدة على الأقل.");
      return;
    }
    if (!tImg.trim()) {
      alert(siteLang === "en" ? "Upload a teacher photo file." : "ارفع صورة للأستاذ.");
      return;
    }

    const normalized = normalizeTeacherName(tName.trim());
    const isDupe = teachers.some(t =>
      (t.normalizedName === normalized || t.normalized_name === normalized) &&
      t.subject === finalSubject &&
      t.gov === tGov
    );
    if (isDupe) {
      alert(siteLang === "en" ? "This teacher already exists in the directory." : "هذا الأستاذ موجود مسبقاً بقسم الأساتذة!");
      return;
    }

    const finalGrades = tSelectedGrades.join("، ");

    const teacherPayload = {
      name: tName.trim(),
      normalized_name: normalized,
      gov: tGov,
      subject: finalSubject,
      grades: finalGrades,
      img: tImg.trim(),
      status: "pending", // Waiting list for mod/owner review
      likes: 0,
      dislikes: 0,
      created_by: session.username,
    };

    // Optimistic UI update
    const tempTeacher: Teacher = {
      id: "temp_t_" + Date.now(),
      createdBy: session.username,
      name: tName.trim(),
      normalizedName: normalized,
      gov: tGov,
      subject: finalSubject,
      grades: finalGrades,
      img: tImg.trim(),
      teachingMode: tTeachingModes,
      teaching_mode: tTeachingModes,
      likes: 0,
      dislikes: 0,
      status: "pending" as any,
    };
    setTeachersList(prev => [tempTeacher, ...prev]);

    // Send to Supabase
    try {
      await supabase.from('teachers').insert([teacherPayload]);
      fetchSupabaseData();
    } catch (e) {
      console.error("Error creating teacher in Supabase:", e);
    }

    setTName("");
    setTSubjectChoice("رياضيات");
    setTCustomSubject("");
    setTSelectedGrades([]);
    setTTeachingModes(["حضوري"]);
    setTImg("");
    setTeacherModal(false);
    rerender();
    setTimeout(() => {
      alert(siteLang === "en" ? "Teacher submitted. Staff will review before publishing." : "تم إرسال الأستاذ، راح تراجعه الإدارة قبل لا يظهر للكل.");
    }, 10);
  }

  function voteTeacher(teacherId: string, type: "like" | "dislike") {
    castVote(`teacher_${teacherId}`, type, (delta) => {
      setTeachersList(prev => prev.map(t => t.id === teacherId ? { ...t, likes: t.likes + delta.likes, dislikes: t.dislikes + delta.dislikes } : t));
      if (selectedTeacher && selectedTeacher.id === teacherId) {
        setSelectedTeacher(prev => prev ? { ...prev, likes: prev.likes + delta.likes, dislikes: prev.dislikes + delta.dislikes } : null);
      }
    });
  }

  // ─── Teacher Review Handler (Requires Like or Dislike, No stars) ──
  async function submitTeacherReview() {
    if (!session) { setAuthModal(true); return; }
    if (!selectedTeacher) return;

    const cooldown = checkActionCooldown("review", 20000);
    if (!cooldown.allowed) {
      alert(siteLang === "en"
        ? `Please wait ${cooldown.remainingSec}s before submitting another review.`
        : `يرجى الانتظار ${cooldown.remainingSec} ثانية قبل كتابة تقييم جديد.`);
      return;
    }

    const muteCheck = isUserCurrentlyMuted(session.username);
    if (muteCheck.muted) {
      alert(siteLang === "en"
        ? `Your account is temporarily muted until ${muteCheck.remainingText}. Reason: ${muteCheck.reason}`
        : `حسابك مكتوم مؤقتاً لحد ${muteCheck.remainingText}. السبب: ${muteCheck.reason}`);
      return;
    }

    if (!platformSettings.allowReviews && session.role === "student") {
      alert(siteLang === "en" ? "Review submissions are temporarily paused by platform administration." : "إضافة التقييمات معطلة حالياً من إدارة المنصة.");
      return;
    }

    if (!reviewVerdict) {
      alert(siteLang === "en" ? "Please indicate whether you recommend this teacher." : "حدد إذا تنصح بيه أو ما تنصح بيه أولاً.");
      return;
    }
    if (!reviewBody.trim()) {
      alert(siteLang === "en" ? "Write your review text." : "اكتب رأيك أو تقييمك بالأستاذ.");
      return;
    }
    if (containsProfanity(reviewTitle, customBannedWords) || containsProfanity(reviewBody, customBannedWords)) {
      alert(siteLang === "en" ? "Review contains prohibited words." : "التقييم بي كلمات مو مسموحة حسب معايير المجتمع.");
      return;
    }

    const titleText = reviewTitle.trim() || (siteLang === "en" ? `Review for ${selectedTeacher.name}` : `تقييم للأستاذ ${selectedTeacher.name}`);
    const verdictText = reviewVerdict === "like" ? "[أعجبني]" : "[لم يعجبني]";
    const fullBody = `${verdictText}\n\n${reviewBody.trim()}`;
    const gradeLevel = reviewVerdict === "like" ? "تقييم أستاذ: أعجبني" : "تقييم أستاذ: لم يعجبني";

    const reviewPayload = {
      author: session.username,
      teacher_id: selectedTeacher.id,
      title: titleText,
      body: fullBody,
      grade_level: gradeLevel,
      likes: 0,
      dislikes: 0,
      reports: 0,
      status: "active",
    };

    // Auto-vote on teacher if not voted that way yet
    const currVote = getUserVote(`teacher_${selectedTeacher.id}`);
    if (currVote !== reviewVerdict) {
      voteTeacher(selectedTeacher.id, reviewVerdict);
    }

    const tempPost: Post = {
      id: "temp_rev_" + Date.now(),
      author: session.username,
      teacherId: selectedTeacher.id,
      teacher_id: selectedTeacher.id,
      title: titleText,
      body: fullBody,
      grade_level: gradeLevel,
      likes: 0,
      dislikes: 0,
      reports: 0,
      status: "active",
      comments: [],
      created_at: new Date().toISOString(),
    };
    setPostsList(prev => [tempPost, ...prev]);

    try {
      await supabase.from('posts').insert([reviewPayload]);
      fetchSupabaseData();
    } catch (e) {
      console.error("Error submitting teacher review:", e);
    }

    setReviewTitle("");
    setReviewBody("");
    setReviewVerdict(null);
    setShowReviewForm(false);
    rerender();
    setTimeout(() => {
      alert(siteLang === "en" ? "Review published successfully." : "نزل تقييمك للأستاذ بنجاح!");
    }, 10);
  }


  // ─── Admin Handlers ───────────────────────────────────────────────
  async function approveTeacher(id: string) {
    const target = teachers.find(t => t.id === id);
    setTeachersList(prev => prev.map(t => t.id === id ? { ...t, status: "active" } : t));
    try {
      await supabase.from('teachers').update({ status: 'active' }).eq('id', id);
      fetchSupabaseData();
    } catch (e) {
      console.error("Error approving teacher:", e);
    }

    // Send notification to the submitter
    const submitter = target?.createdBy || target?.created_by;
    if (submitter) {
      const notifs = getNotifications();
      notifs.unshift({
        id: "notif_" + Date.now(),
        recipient: submitter,
        actor: session?.username || "الإدارة",
        type: "teacher_approved",
        postId: target?.id || "",
        targetTitle: target?.name || "المدرس",
        commentText: siteLang === "en"
          ? `Your suggestion for teacher "${target?.name}" has been approved and published.`
          : `تمت الموافقة على اقتراحك لإضافة الأستاذ "${target?.name}". صار معروض للطلاب.`,
        read: false,
        created_at: new Date().toISOString(),
      });
      setNotifications(notifs);
      setAllNotifications(notifs);
    }
    addAuditLog("قبول مدرس", target?.name || id, "الموافقة على نشر المدرس في دليل المدرسين");
    rerender();
    alert(siteLang === "en" ? "Teacher approved and requester notified." : "تمت الموافقة على الأستاذ وإشعار الطالب.");
  }

  async function rejectTeacher(id: string) {
    const target = teachers.find(t => t.id === id);
    if (!target) return;

    requestConfirm({
      title: siteLang === "en" ? "Reject Teacher" : "رفض الأستاذ",
      message: siteLang === "en" ? `Reject and remove suggestion for ${target.name}?` : `متأكد تريد ترفض وتحذف طلب الأستاذ "${target.name}"؟`,
      confirmText: siteLang === "en" ? "Reject" : "رفض وحذف",
      isDestructive: true,
      onConfirm: async () => {
        setTeachersList(prev => prev.filter(t => t.id !== id));
        try {
          await supabase.from('teachers').delete().eq('id', id);
          fetchSupabaseData();
        } catch (e) {}

        const submitter = target.createdBy || target.created_by;
        if (submitter) {
          const notifs = getNotifications();
          notifs.unshift({
            id: "notif_" + Date.now(),
            recipient: submitter,
            actor: session?.username || "الإدارة",
            type: "teacher_rejected",
            postId: "",
            targetTitle: target.name,
            commentText: siteLang === "en"
              ? `Your suggestion for teacher "${target.name}" was reviewed and declined.`
              : `نعتذر، ما تمت الموافقة على طلب إضافة الأستاذ "${target.name}".`,
            read: false,
            created_at: new Date().toISOString(),
          });
          setNotifications(notifs);
          setAllNotifications(notifs);
        }
        addAuditLog("رفض مدرس", target.name, "رفض وحذف طلب إضافة المدرس من قائمة الانتظار");
        rerender();
        showToast(siteLang === "en" ? "Teacher suggestion declined." : "تم رفض وحذف اقتراح الأستاذ.", "info");
      },
    });
  }


  async function restorePost(id: string) {
    setPostsList(prev => prev.map(p => p.id === id ? { ...p, status: "active", reports: 0 } : p));
    try {
      await supabase.from('posts').update({ status: 'active', reports: 0 }).eq('id', id);
      fetchSupabaseData();
    } catch (e) {}
    addAuditLog("إظهار منشور", `منشور #${id}`, "إلغاء إخفاء المنشور وتصفير البلاغات");
    rerender();
  }

  async function hidePost(id: string) {
    setPostsList(prev => prev.map(p => p.id === id ? { ...p, status: "hidden" } : p));
    try {
      await supabase.from('posts').update({ status: 'hidden' }).eq('id', id);
      fetchSupabaseData();
    } catch (e) {}
    addAuditLog("إخفاء منشور", `منشور #${id}`, "إخفاء المنشور عن الطلاب بعد مراجعته");
    rerender();
  }

  // ─── Profile Handlers ─────────────────────────────────────────────
  async function saveProfile() {
    if (!session) return;
    
    // Auth Check: Ensure user has a real Supabase session, not just legacy localStorage
    const { data: { session: supaSession } } = await supabase.auth.getSession();
    if (!supaSession?.user) {
      alert(siteLang === "en" 
        ? "Your account is using legacy login! Please log out and sign up again using this exact same username to secure your account before saving." 
        : "حسابك يستخدم نظام تسجيل الدخول القديم! يرجى تسجيل الخروج وإنشاء حساب جديد بنفس اسم المستخدم بالضبط لتأمين حسابك قبل الحفظ.");
      return;
    }

    const p = getProfiles();
    p[session.username] = {
      avatarColor: editColor,
      bio: editBio,
      avatarUrl: editPfpUrl,
      bannerUrl: editBannerUrl,
      bannerPattern: editBannerPattern,
      bannerColor: editBannerColor,
      accentColor: editAccentColor,
    };
    setProfiles(p);
    setProfilesMap(p);
    
    // Save to Supabase Central Database
    try {
      await supabase.from('profiles').update({
        avatar_color: editColor,
        bio: editBio,
        avatar_url: editPfpUrl,
        banner_url: editBannerUrl,
        banner_pattern: editBannerPattern
      }).eq('username', session.username);
    } catch (e) {
      console.error("Error saving profile to Supabase:", e);
    }

    setProfileModal(false); rerender();
  }

  function openProfileEditor() {
    if (!session) return;
    const p = getProfile(session.username);
    setEditBio(p.bio || "");
    setEditColor(p.avatarColor || "#0d9488");
    setEditPfpUrl(p.avatarUrl || "");
    setEditBannerUrl(p.bannerUrl || "");
    setEditBannerPattern(p.bannerPattern || "none");
    setEditBannerColor(p.bannerColor || "#0d9488");
    setEditAccentColor(p.accentColor || "#0d9488");
    setProfileModal(true);
  }

  async function handlePfpUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 250, 250, 0.7);
    if (compressed) setEditPfpUrl(compressed);
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 1000, 300, 0.7);
    if (compressed) setEditBannerUrl(compressed);
  }

  // ─── Support Inquiries Handlers ──────────────────────────────────
  async function submitSupportTicket() {
    if (session && profiles[session.username]?.isBanned) {
      alert(siteLang === "en" ? "Your account is banned." : "حسابك محظور نهائياً، ما تكدر ترسل تذاكر.");
      return;
    }
    if (!supportSubject.trim() || !supportMessage.trim()) {
      alert(siteLang === "en" ? "Please fill in the subject and message." : "اكتب عنوان ورسالة الاستفسار.");
      return;
    }
    const newTicket: SupportTicket = {
      id: "ticket_" + Date.now(),
      sender: session ? session.username : (siteLang === "en" ? "Guest Student" : "طالب ضيف"),
      category: supportCategory,
      subject: supportSubject.trim(),
      message: supportMessage.trim(),
      status: "open",
      created_at: new Date().toISOString(),
      replies: [],
      allowUserReply: false,
    };

    // Optimistic UI
    setSupportTickets(prev => [newTicket, ...prev]);

    setSupportSubject("");
    setSupportMessage("");
    setSettingsModal(false);

    alert(siteLang === "en" ? "Message sent. We will respond shortly." : "وصلت رسالتك، نجاوبك قريباً.");

    // Persist to Supabase
    try {
      await supabase.from('support_tickets').insert([{
        id: newTicket.id,
        sender: newTicket.sender,
        category: newTicket.category,
        subject: newTicket.subject,
        message: newTicket.message,
        status: newTicket.status,
        replies: [],
        allow_user_reply: false,
      }]);
    } catch (e) {
      console.error("Error inserting support ticket:", e);
    }
  }

  async function resolveSupportTicket(id: string) {
    const ticket = supportTickets.find(t => t.id === id);
    const newStatus = ticket?.status === "open" ? "resolved" : "open";
    setSupportTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as any } : t));
    try {
      await supabase.from('support_tickets').update({ status: newStatus }).eq('id', id);
    } catch (e) {
      console.error("Error updating ticket status:", e);
    }
  }

  async function toggleAllowUserReply(id: string) {
    const ticket = supportTickets.find(t => t.id === id);
    const newVal = !ticket?.allowUserReply;
    setSupportTickets(prev => prev.map(t => t.id === id ? { ...t, allowUserReply: newVal } : t));
    try {
      await supabase.from('support_tickets').update({ allow_user_reply: newVal }).eq('id', id);
    } catch (e) {
      console.error("Error toggling allow_user_reply:", e);
    }
  }

  async function submitSupportReply(id: string) {
    const replyText = ticketReplyTexts[id];
    if (!replyText || !replyText.trim() || !session) return;
    
    const targetTicket = supportTickets.find(t => t.id === id);

    const newReply: SupportReply = {
      id: "rep_" + Date.now(),
      sender: session.username,
      message: replyText.trim(),
      created_at: new Date().toISOString(),
    };

    // Optimistic UI
    setSupportTickets(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, replies: [...(t.replies || []), newReply] };
      }
      return t;
    }));

    // Send notification to the user or admins
    if (targetTicket) {
      if (targetTicket.sender !== session.username) {
        // Admin is replying to student
        sendNotificationToUser(targetTicket.sender, {
          type: "support_reply",
          title: `رد جديد على استفسارك: "${targetTicket.subject}"`,
          message: replyText.trim(),
        });
      } else {
        // Student replied back -> notify all admins
        const adminUsers = getUsers().filter(u => u.role === "owner" || u.role === "mod");
        adminUsers.forEach(adm => {
          sendNotificationToUser(adm.username, {
            type: "support_reply",
            title: `رد من الطالب (${session.username}) على تذكرة: "${targetTicket.subject}"`,
            message: replyText.trim(),
          });
        });
      }
    }
    
    setTicketReplyTexts(prev => ({ ...prev, [id]: "" }));

    // Persist updated replies to Supabase
    try {
      const updatedReplies = [...(targetTicket?.replies || []), newReply];
      await supabase.from('support_tickets').update({ replies: updatedReplies }).eq('id', id);
    } catch (e) {
      console.error("Error updating ticket replies:", e);
    }
  }

  async function deleteSupportTicket(id: string) {
    requestConfirm({
      title: siteLang === "en" ? "Delete Ticket" : "حذف التذكرة",
      message: siteLang === "en" ? "Delete this support ticket?" : "هل أنت متأكد من حذف تذكرة الدعم هذه؟",
      confirmText: siteLang === "en" ? "Delete" : "حذف",
      isDestructive: true,
      onConfirm: async () => {
        setSupportTickets(prev => prev.filter(t => t.id !== id));
        addAuditLog("حذف تذكرة دعم", `تذكرة #${id}`, "حذف تذكرة الدعم الفني");
        rerender();
        try {
          await supabase.from('support_tickets').delete().eq('id', id);
        } catch (e) {
          console.error("Error deleting support ticket:", e);
        }
        showToast(siteLang === "en" ? "Support ticket deleted." : "تم حذف تذكرة الدعم بنجاح.", "info");
      },
    });
  }

  // ─── Platform Administration & Moderation Actions ─────────────────
  function addAuditLog(action: string, target: string, details?: string) {
    if (!session) return;
    const item: AuditLogItem = {
      id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      actor: session.username,
      action,
      target,
      details,
      timestamp: new Date().toISOString(),
    };
    const updated = [item, ...getAuditLogs()].slice(0, 100);
    setAuditLogs(updated);
    setAuditLogsState(updated);
  }

  async function sendNotificationToUser(username: string, payload: { type: string; message: string; title?: string; postId?: string }) {
    const cleanRecipient = (username || "").trim();
    if (!cleanRecipient) return;

    const newNotif: NotificationItem = {
      id: "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      recipient: cleanRecipient,
      actor: session?.username || "الإدارة",
      type: payload.type as any,
      postId: payload.postId || "",
      targetTitle: payload.title || "تنبيه إداري",
      commentText: payload.message,
      read: false,
      created_at: new Date().toISOString(),
    };

    // If recipient is the current logged-in user, update local state immediately
    if (session && cleanRecipient.toLowerCase() === session.username.trim().toLowerCase()) {
      const notifs = getNotifications();
      notifs.unshift(newNotif);
      setNotifications(notifs);
      setAllNotifications(notifs);
    }

    try {
      const { error } = await supabase.from('notifications').insert([{
        id: newNotif.id,
        recipient: newNotif.recipient,
        actor: newNotif.actor,
        type: newNotif.type,
        post_id: newNotif.postId || "",
        target_title: newNotif.targetTitle,
        comment_text: newNotif.commentText,
        read: false
      }]);
      if (error) {
        console.error("Error inserting notification to Supabase:", error);
      }
    } catch (e) {
      console.error("Error sending notification:", e);
    }
  }

  function isUserCurrentlyMuted(username: string): { muted: boolean; remainingText?: string; reason?: string } {
    if (!username) return { muted: false };
    if (profiles[username]?.isBanned) {
      return {
        muted: true,
        remainingText: "حظر دائم",
        reason: "تم حظر الحساب نهائياً من قبل الإدارة",
      };
    }
    const mutedMap = getMutedUsers();
    const info = mutedMap[username];
    if (!info) return { muted: false };

    if (info.until <= Date.now()) {
      delete mutedMap[username];
      setMutedUsers(mutedMap);
      setMutedUsersState({ ...mutedMap });
      return { muted: false };
    }

    const diffMs = info.until - Date.now();
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    const remainingText = diffHours > 48
      ? `${Math.ceil(diffHours / 24)} يوم`
      : `${diffHours} ساعة`;

    return {
      muted: true,
      remainingText,
      reason: info.reason || "مخالفة معايير المجتمع",
    };
  }

  async function handleMuteUser(username: string, duration: "24h" | "7d" | "30d" | "permanent", reason: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) return;
    if (username === session.username) {
      alert(siteLang === "en" ? "You cannot ban your own account." : "ما تكدر تحظر حسابك الشخصي!");
      return;
    }
    const targetProf = profiles[username];
    if (targetProf?.role === "owner") {
      alert(siteLang === "en" ? "The platform owner cannot be banned." : "ما تكدر تحظر مالك المنصة!");
      return;
    }
    if (session.role === "mod" && targetProf?.role === "mod") {
      alert(siteLang === "en" ? "Moderators cannot ban each other." : "المشرفين ما يكدرون يحظرون بعض!");
      return;
    }

    const finalReason = reason.trim() || (siteLang === "en" ? "Violation of community standards" : "مخالفة معايير المجتمع وقواعد النشر");

    // Optimistic UI update
    setProfilesMap(prev => ({
      ...prev,
      [username]: { ...(prev[username] || { avatarColor: "#0d9488", bio: "", avatarUrl: "" }), isBanned: true }
    }));
    
    // Save to Supabase
    try {
      await supabase.from('profiles').update({ is_banned: true }).eq('username', username);
    } catch (e) {
      console.error("Error banning user in Supabase:", e);
    }

    const strikesMap = getUserStrikes();
    const current = strikesMap[username] || { count: 0, history: [] };
    current.count += 1;
    current.history.unshift({
      date: new Date().toISOString(),
      reason: `حظر نهائي: ${finalReason}`,
      by: session.username,
    });
    strikesMap[username] = current;
    setUserStrikes(strikesMap);
    setUserStrikesState({ ...strikesMap });

    sendNotificationToUser(username, {
      type: "report",
      message: siteLang === "en" ? `Your account was banned by administration. Reason: ${finalReason}` : `تم حظر حسابك نهائياً من قبل الإدارة. السبب: ${finalReason}`,
      title: siteLang === "en" ? "Account Banned" : "حظر الحساب",
    });

    addAuditLog("حظر طالب", username, `حظر رقم #${current.count}: ${finalReason}`);
    setAdminMuteReason("");
    rerender();
    alert(siteLang === "en" ? `User ${username} has been permanently banned.` : `تم حظر حساب الطالب ${username} ومنعه من النشر.`);
  }

  async function handleUnmuteUser(username: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) return;
    const mutedMap = getMutedUsers();
    delete mutedMap[username];
    setMutedUsers(mutedMap);
    setMutedUsersState({ ...mutedMap });

    // Remove ban from profiles state and Supabase
    setProfilesMap(prev => ({
      ...prev,
      [username]: { ...(prev[username] || { avatarColor: "#0d9488", bio: "", avatarUrl: "" }), isBanned: false }
    }));
    try {
      await supabase.from('profiles').update({ is_banned: false }).eq('username', username);
    } catch (e) {
      console.error("Error unbanning user in Supabase:", e);
    }

    sendNotificationToUser(username, {
      type: "report",
      message: siteLang === "en" ? "Ban lifted from your account by administration." : "تم رفع الحظر عن حسابك بواسطة إدارة المنصة. نتمنى الالتزام بالقواعد.",
    });

    addAuditLog("رفع الحظر عن مستخدم", username, "تم إلغاء الحظر اليدوي");
    rerender();
    alert(siteLang === "en" ? `Ban lifted for ${username}.` : `تم رفع الحظر عن ${username}.`);
  }

  async function handleToggleHonorBadge(targetUsername: string) {
    if (!session || session.role !== "owner") {
      alert(siteLang === "en" ? "Only the platform owner can grant or revoke honor badges." : "فقط مالك المنصة مخول بمنح أو سحب وسام الشرف.");
      return;
    }

    const currentBadgeState = Boolean(profiles[targetUsername]?.has_honor_badge);
    const newBadgeState = !currentBadgeState;

    // Optimistic local update
    const updatedProfiles = {
      ...profiles,
      [targetUsername]: {
        ...(profiles[targetUsername] || { avatarColor: "#0d9488", bio: "" }),
        has_honor_badge: newBadgeState,
      },
    };
    setProfilesMap(updatedProfiles);
    setProfiles(updatedProfiles);

    // Persist to Supabase Central Database (enforced by PostgreSQL RLS)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ has_honor_badge: newBadgeState })
        .eq('username', targetUsername);

      if (error) {
        console.error("Error updating honor badge in Supabase:", error);
        setProfilesMap(profiles);
        setProfiles(profiles);
        alert(siteLang === "en" ? `Failed to update badge: ${error.message}` : `فشل تحديث الوسام: ${error.message}`);
        return;
      }
    } catch (e: any) {
      console.error("Error toggling honor badge:", e);
      setProfilesMap(profiles);
      setProfiles(profiles);
      alert(siteLang === "en" ? "Network error while updating badge." : "حدث خطأ في الاتصال أثناء تحديث الوسام.");
      return;
    }

    sendNotificationToUser(targetUsername, {
      type: "report",
      message: newBadgeState
        ? (siteLang === "en" ? "The platform owner granted you the Student Honor Badge." : "قام مالك المنصة بمنحك وسام الشرف تقديراً لجهودك ومشاركاتك المتميزة.")
        : (siteLang === "en" ? "Your honor badge was revoked by the platform owner." : "قام مالك المنصة بسحب وسام الشرف من حسابك."),
      title: siteLang === "en" ? "Student Honor Badge" : "وسام الشرف الطلابي",
    });

    addAuditLog(
      newBadgeState ? "منح وسام الشرف" : "سحب وسام الشرف",
      targetUsername,
      newBadgeState ? "تم منح وسام الشرف بواسطة المالك" : "تم سحب وسام الشرف بواسطة المالك"
    );

    rerender();
  }

  function handleIssueWarning(username: string, reason: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) return;
    const finalReason = reason.trim() || (siteLang === "en" ? "Official warning for policy violation" : "تنبيه إداري رسمي لمخالفة القواعد");
    const strikesMap = getUserStrikes();
    const current = strikesMap[username] || { count: 0, history: [] };
    current.count += 1;
    current.history.unshift({
      date: new Date().toISOString(),
      reason: finalReason,
      by: session.username,
    });
    strikesMap[username] = current;
    setUserStrikes(strikesMap);
    setUserStrikesState({ ...strikesMap });

    sendNotificationToUser(username, {
      type: "report",
      message: siteLang === "en" ? `Official Warning: ${finalReason} • Total warnings: ${current.count}` : `إنذار إداري رسمي: ${finalReason} • عدد الإنذارات: ${current.count}`,
    });

    addAuditLog("توجيه إنذار رسمي", username, `إنذار #${current.count}: ${finalReason}`);
    setAdminWarningReason("");
    rerender();
    alert(siteLang === "en" ? `Official warning sent to ${username}.` : `تم توجيه الإنذار للمستخدم ${username}.`);
  }

  function openModPermissionModal(username: string) {
    if (!session || (!canOwner && !hasPermission("canManageStaff"))) {
      alert(siteLang === "en" ? "Only owner or authorized staff can manage moderators." : "تعيين المشرفين مقتصر على المالك أو الإداري المفوض!");
      return;
    }
    let target = profiles[username];
    if (!target) {
      const allLocal = getUsers();
      const localTarget = allLocal.find(u => u.username === username);
      if (localTarget) {
        target = { avatarColor: "#0d9488", bio: "", role: localTarget.role || "student" };
      } else {
        return;
      }
    }
    if (target.role === "owner") {
      alert(siteLang === "en" ? "Owner permissions cannot be altered." : "ما تكدر تعدل صلاحيات مالك المنصة!");
      return;
    }

    const currentRole = target.role as "student" | "mod";
    const existingPerms = modPermissionsMap[username] || (currentRole === "mod" ? DEFAULT_MOD_PERMISSIONS : DEFAULT_MOD_PERMISSIONS);

    setPermModalUser(username);
    setPermModalRole(currentRole);
    setPermForm({ ...existingPerms });
  }

  function handleSaveModPermissions() {
    if (!session || (!canOwner && !hasPermission("canManageStaff"))) return;
    if (!permModalUser) return;

    const target = profiles[permModalUser];
    if (!target || target.role === "owner") return;

    const wasStudent = target.role === "student";
    
    // Update local React state optimistically
    setProfilesMap(prev => ({
      ...prev,
      [permModalUser]: { ...(prev[permModalUser] || { avatarColor: "#0d9488", bio: "", avatarUrl: "" }), role: "mod" }
    }));

    // Persist role update to Supabase
    try {
      supabase.from('profiles').update({ role: "mod" }).eq('username', permModalUser).then(() => {});
    } catch (e) {
      console.error("Error updating profile role in Supabase:", e);
    }

    const updatedPermsMap = { ...getModPermissions(), [permModalUser]: permForm };
    setModPermissionsStorage(updatedPermsMap);
    setModPermissionsMap(updatedPermsMap);

    const totalGranted = Object.values(permForm).filter(Boolean).length;
    const hasOwnerPowers = permForm.canManageAnnouncements || permForm.canViewAuditLog || permForm.canManagePlatformToggles || permForm.canToggleMaintenance || permForm.canExportData || permForm.canManageStaff;

    addAuditLog(
      wasStudent ? "ترقية لرتبة مشرف مع تخصيص الصلاحيات" : "تعديل صلاحيات مشرف",
      permModalUser,
      `تم منح ${totalGranted} من 11 صلاحية ${hasOwnerPowers ? "شاملة صلاحيات إدارية للمالك" : "إشرافية"}`
    );

    sendNotificationToUser(permModalUser, {
      type: "promotion",
      title: wasStudent
        ? (siteLang === "en" ? "Promotion to Moderator" : "ترقية إلى رتبة مشرف")
        : (siteLang === "en" ? "Updated Staff Permissions" : "تحديث صلاحيات الإشراف"),
      message: wasStudent
        ? (siteLang === "en"
            ? `Congratulations! ${session.username} promoted you to moderator with ${totalGranted} permissions.`
            : `مبروك! قام ${session.username} بترقيتك إلى مشرف ومنحك ${totalGranted} صلاحية.`)
        : (siteLang === "en"
            ? `Your moderation permissions were updated with ${totalGranted} active permissions.`
            : `تم تحديث صلاحياتك الإشرافية إلى ${totalGranted} صلاحية مفعلة.`),
    });

    setPermModalUser(null);
    rerender();
    alert(siteLang === "en" ? `Permissions saved for ${permModalUser}.` : `تم حفظ وتطبيق صلاحيات المشرف ${permModalUser} بنجاح!`);
  }

  function handleDemoteToStudent(username: string) {
    if (!session || (!canOwner && !hasPermission("canManageStaff"))) {
      showToast(siteLang === "en" ? "Role editing is restricted to owner or authorized staff." : "تعديل الرتب مقتصر على المالك أو الإداري المفوض!", "error");
      return;
    }
    const target = profiles[username];
    if (!target) return;
    if (target.role === "owner") {
      showToast(siteLang === "en" ? "Owner cannot be demoted." : "ما تكدر تخفض رتبة مالك المنصة!", "error");
      return;
    }

    requestConfirm({
      title: siteLang === "en" ? "Demote Moderator" : "سحب صلاحيات المشرف",
      message: siteLang === "en" ? `Demote ${username} from moderator to regular student?` : `متأكد تريد تسحب الإشراف من ${username} وترجعه طالب عادي؟`,
      confirmText: siteLang === "en" ? "Demote" : "سحب الصلاحية",
      isDestructive: true,
      onConfirm: () => {
        // Update local React state optimistically
        setProfilesMap(prev => ({
          ...prev,
          [username]: { ...(prev[username] || { avatarColor: "#0d9488", bio: "", avatarUrl: "" }), role: "student" }
        }));

        // Persist role update to Supabase
        try {
          supabase.from('profiles').update({ role: "student" }).eq('username', username).then(() => {});
        } catch (e) {
          console.error("Error demoting profile role in Supabase:", e);
        }

        const updatedPermsMap = { ...getModPermissions() };
        delete updatedPermsMap[username];
        setModPermissionsStorage(updatedPermsMap);
        setModPermissionsMap(updatedPermsMap);

        addAuditLog("تخفيض لرتبة طالب", username, "تم سحب صلاحيات الإشراف بالكامل");
        sendNotificationToUser(username, {
          type: "admin_warning",
          title: siteLang === "en" ? "Role Updated" : "تعديل رتبة الحساب",
          message: siteLang === "en" ? "Your account was set to regular student." : "تم تعديل رتبة حسابك إلى طالب عادي وإلغاء صلاحيات الإشراف.",
        });
        rerender();
        showToast(siteLang === "en" ? `Moderation privileges removed from ${username}.` : `تم سحب صلاحيات الإشراف من ${username}.`, "success");
      },
    });
  }

  function handleSavePlatformSettings(updates: Partial<PlatformSettings>) {
    if (!session || (!canOwner && !hasPermission("canManagePlatformToggles") && !hasPermission("canToggleMaintenance"))) return;
    const current = getPlatformSettings();
    const merged: PlatformSettings = { ...current, ...updates };
    setPlatformSettings(merged);
    setPlatformSettingsState(merged);
    addAuditLog("تعديل إعدادات المنصة", "مفاتيح النظام", Object.keys(updates).map(k => `${k}: ${String((updates as any)[k])}`).join("، "));
    rerender();
  }

  function handleSaveAnnouncement(
    text: string,
    type: "ministerial" | "warning" | "info",
    active: boolean,
    duration: "never" | "1h" | "6h" | "12h" | "24h" | "3d" | "7d"
  ) {
    if (!session || (!canOwner && !hasPermission("canManageAnnouncements"))) {
      alert(siteLang === "en" ? "Only owner or authorized staff can manage announcements." : "شريط الإعلانات للمالك والمشرفين المفوضين بس.");
      return;
    }
    if (!text.trim() && active) {
      alert(siteLang === "en" ? "Enter announcement text before publishing." : "اكتب نص الإعلان أولاً قبل النشر.");
      return;
    }

    let expiresAt: number | null = null;
    if (duration === "1h") expiresAt = Date.now() + 60 * 60 * 1000;
    else if (duration === "6h") expiresAt = Date.now() + 6 * 60 * 60 * 1000;
    else if (duration === "12h") expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    else if (duration === "24h") expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    else if (duration === "3d") expiresAt = Date.now() + 3 * 24 * 60 * 60 * 1000;
    else if (duration === "7d") expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const ann: SiteAnnouncement = {
      active,
      text: text.trim(),
      type,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    setSiteAnnouncement(ann);
    setSiteAnnouncementState(ann);
    addAuditLog(
      "تحديث شريط التنبيهات",
      "إعلان الموقع",
      active
        ? `تفعيل إعلان [${type}]: ${text.slice(0, 35)}... ${expiresAt ? `ينتهي بعد ${duration}` : "بدون انتهاء تلقائي"}`
        : "إلغاء تفعيل الإعلان"
    );
    rerender();
    alert(active 
      ? (siteLang === "en" ? "Announcement published." : "تم نشر الإعلان العام أعلى الموقع.") 
      : (siteLang === "en" ? "Announcement disabled." : "تم إيقاف الإعلان العام."));
  }

  function handleDeleteAnnouncement() {
    if (!session || (!canOwner && !hasPermission("canManageAnnouncements"))) {
      showToast(siteLang === "en" ? "Only owner or authorized staff can delete announcements." : "حذف الإعلان للمالك والمشرفين المفوضين بس.", "error");
      return;
    }

    requestConfirm({
      title: siteLang === "en" ? "Delete Announcement" : "حذف الإعلان",
      message: siteLang === "en" ? "Permanently delete this announcement?" : "متأكد تريد تحذف الإعلان العام نهائياً؟",
      confirmText: siteLang === "en" ? "Delete" : "حذف",
      isDestructive: true,
      onConfirm: () => {
        const emptyAnn: SiteAnnouncement = {
          active: false,
          text: "",
          type: "ministerial",
          expiresAt: null,
        };
        setSiteAnnouncement(emptyAnn);
        setSiteAnnouncementState(emptyAnn);
        setAnnouncementText("");
        setAnnouncementActive(false);
        setAnnouncementDuration("never");
        addAuditLog("حذف شريط التنبيهات", "إعلان الموقع", "تم حذف التنبيه العام نهائياً");
        rerender();
        showToast(siteLang === "en" ? "Announcement deleted." : "انحذف الإعلان نهائياً.", "info");
      },
    });
  }

  function handleAddBannedWord(word: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod") || !word.trim()) return;
    const clean = word.trim();
    const current = getCustomBannedWords();
    if (current.includes(clean)) return;
    const updated = [...current, clean];
    setCustomBannedWords(updated);
    setCustomBannedWordsState(updated);
    addAuditLog("إضافة كلمة محظورة", clean, "إضافة كلمة إلى الفلتر التلقائي");
    setNewBannedWordInput("");
    rerender();
  }

  function handleRemoveBannedWord(word: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) return;
    const current = getCustomBannedWords();
    const updated = current.filter(w => w !== word);
    setCustomBannedWords(updated);
    setCustomBannedWordsState(updated);
    addAuditLog("حذف كلمة محظورة", word, "إزالة كلمة من الفلتر التلقائي");
    rerender();
  }

  function exportPlatformBackup() {
    if (!session || session.role !== "owner") {
      alert(siteLang === "en" ? "Data backup is restricted to the platform owner." : "النسخ الاحتياطي متاح لمالك المنصة بس.");
      return;
    }
    const backupData = {
      platform: "Iraq Teachers & Students Review Platform",
      exportDate: new Date().toISOString(),
      exportedBy: session.username,
      platformSettings: getPlatformSettings(),
      siteAnnouncement: getSiteAnnouncement(),
      teachers: getTeachers(),
      posts: getPosts(),
      users: getUsers().map(u => ({ username: u.username, role: u.role })),
      profiles: getProfiles(),
      auditLogs: getAuditLogs(),
      userStrikes: getUserStrikes(),
      mutedUsers: getMutedUsers(),
      customBannedWords: getCustomBannedWords(),
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iraq_students_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addAuditLog("تصدير نسخة احتياطية", "قاعدة البيانات", "تحميل ملف JSON كامل للمنصة");
  }

  // ─── System Config (About Us & FAQs) Handlers ─────────────────────
  async function syncSystemConfig(newAbout?: AboutUsData, newFaqs?: FaqItem[]) {
    const currentAbout = newAbout || aboutUsData;
    const currentFaqs = newFaqs || faqList;
    const payload = {
      about: currentAbout,
      faqs: currentFaqs,
      updated_at: new Date().toISOString(),
    };

    try {
      const { data: existing } = await supabase
        .from('posts')
        .select('id')
        .eq('title', 'SYSTEM_SITE_CONFIG')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('posts')
          .update({
            body: JSON.stringify(payload),
            status: 'hidden',
            author: session?.username || 'owner',
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('posts')
          .insert([{
            title: 'SYSTEM_SITE_CONFIG',
            body: JSON.stringify(payload),
            status: 'hidden',
            author: session?.username || 'owner',
            grade_level: 'General',
            likes: 0,
            dislikes: 0,
            reports: 0,
          }]);
      }
    } catch (e) {
      console.error("Error syncing system config to Supabase:", e);
    }
  }

  // FAQ Handlers (Owner only)
  function handleOpenAddFaq() {
    if (!canOwner) return;
    setEditingFaqId(null);
    setFaqDraftQAr("");
    setFaqDraftQEn("");
    setFaqDraftAAr("");
    setFaqDraftAEn("");
    setFaqModalOpen(true);
  }

  function handleOpenEditFaq(item: FaqItem) {
    if (!canOwner) return;
    setEditingFaqId(item.id);
    setFaqDraftQAr(item.q.ar || "");
    setFaqDraftQEn(item.q.en || "");
    setFaqDraftAAr(item.a.ar || "");
    setFaqDraftAEn(item.a.en || "");
    setFaqModalOpen(true);
  }

  function handleSaveFaq() {
    if (!canOwner) return;
    const qAr = faqDraftQAr.trim();
    const aAr = faqDraftAAr.trim();
    const qEn = faqDraftQEn.trim() || qAr;
    const aEn = faqDraftAEn.trim() || aAr;

    if (!qAr || !aAr) {
      alert(siteLang === "en" ? "Question and answer in Arabic are required." : "يرجى كتابة السؤال والجواب بالعربية.");
      return;
    }

    let updated: FaqItem[];
    if (editingFaqId) {
      updated = faqList.map(item => item.id === editingFaqId ? { ...item, q: { ar: qAr, en: qEn }, a: { ar: aAr, en: aEn } } : item);
    } else {
      const newItem: FaqItem = {
        id: "faq_" + Date.now(),
        q: { ar: qAr, en: qEn },
        a: { ar: aAr, en: aEn },
      };
      updated = [...faqList, newItem];
    }

    setFaqList(updated);
    setStoredFaqs(updated);
    syncSystemConfig(undefined, updated);
    setFaqModalOpen(false);
  }

  function handleDeleteFaq(faqId: string) {
    if (!canOwner) return;
    requestConfirm({
      title: siteLang === "en" ? "Delete FAQ" : "حذف سؤال",
      message: siteLang === "en" ? "Are you sure you want to delete this FAQ question?" : "هل أنت متأكد من رغبتك في حذف هذا السؤال؟",
      confirmText: siteLang === "en" ? "Delete" : "حذف",
      isDestructive: true,
      onConfirm: () => {
        const updated = faqList.filter(item => item.id !== faqId);
        setFaqList(updated);
        setStoredFaqs(updated);
        syncSystemConfig(undefined, updated);
        showToast(siteLang === "en" ? "FAQ question deleted." : "تم حذف السؤال بنجاح.", "info");
      },
    });
  }

  // About Us Handlers (Owner only)
  function handleStartEditAbout() {
    if (!canOwner) return;
    setEditAboutDraft(JSON.parse(JSON.stringify(aboutUsData)));
    setIsEditingAbout(true);
  }

  function handleSaveAbout() {
    if (!canOwner) return;
    setAboutUsData(editAboutDraft);
    setStoredAboutUs(editAboutDraft);
    syncSystemConfig(editAboutDraft, undefined);
    setIsEditingAbout(false);
  }

  function handleCancelEditAbout() {
    setIsEditingAbout(false);
  }

  function handleResetAboutDefault() {
    if (!canOwner) return;
    requestConfirm({
      title: siteLang === "en" ? "Reset About Us" : "استعادة الافتراضي",
      message: siteLang === "en" ? "Reset About Us content to platform default?" : "استعادة المحتوى الافتراضي لصفحة عن المنصة؟",
      confirmText: siteLang === "en" ? "Reset" : "استعادة",
      isDestructive: true,
      onConfirm: () => {
        setEditAboutDraft(DEFAULT_ABOUT_US);
        showToast(siteLang === "en" ? "About Us reset to default." : "تمت استعادة المحتوى الافتراضي لصفحة عن المنصة.", "success");
      },
    });
  }

  function handleAddPillar() {
    const newP: AboutPillar = {
      id: "p_" + Date.now(),
      titleAr: "عنوان جديد",
      titleEn: "New Box Title",
      descAr: "اكتب وصف هذه الميزة أو الركيزة هنا...",
      descEn: "Write the description of this feature or value here...",
      icon: "star",
    };
    setEditAboutDraft(prev => ({ ...prev, pillars: [...prev.pillars, newP] }));
  }

  function handleRemovePillar(id: string) {
    setEditAboutDraft(prev => ({ ...prev, pillars: prev.pillars.filter(p => p.id !== id) }));
  }

  function handleAddButton() {
    const newB: AboutButton = {
      id: "b_" + Date.now(),
      labelAr: "زر جديد",
      labelEn: "New Link Button",
      url: "https://",
      variant: "primary",
    };
    setEditAboutDraft(prev => ({ ...prev, buttons: [...prev.buttons, newB] }));
  }

  function handleRemoveButton(id: string) {
    setEditAboutDraft(prev => ({ ...prev, buttons: prev.buttons.filter(b => b.id !== id) }));
  }

  // ─── Grade onboarding ─────────────────────────────────────────────
  function completeGrades() { localStorage.setItem("gradesDone", JSON.stringify(selectedGrades)); setGradeModal(false); }

  // ─── Data Views ───────────────────────────────────────────────────
  const myNotifications = session
    ? allNotifications.filter(n => (n.recipient || "").trim().toLowerCase() === session.username.trim().toLowerCase())
    : [];
  const unreadCount = myNotifications.filter(n => !n.read).length;

  function markAllNotifsRead() {
    if (!session) return;
    const myUname = session.username.trim().toLowerCase();
    const updated = allNotifications.map(n => (n.recipient || "").trim().toLowerCase() === myUname ? { ...n, read: true } : n);
    setNotifications(updated);
    setAllNotifications(updated);
    rerender();

    const myIds = allNotifications.filter(n => (n.recipient || "").trim().toLowerCase() === myUname && !n.read).map(n => n.id);
    if (myIds.length > 0) {
      try {
        supabase.from('notifications').update({ read: true }).in('id', myIds).then(() => {});
      } catch (e) {
        console.error("Error updating notifications in Supabase:", e);
      }
    }
  }

  const activePosts = posts.filter(p => p.status === "active");
  const activeTeachers = teachers.filter(t => t.status === "active");
  const filteredTeachers = activeTeachers.filter(t => {
    const matchesSearch = !dirSearch.trim() || matchesArabicFuzzy(
      dirSearch,
      t.name,
      t.normalizedName,
      t.normalized_name,
      t.subject,
      t.gov,
      t.grades
    );
    const matchesGov = filterGov === "all" || t.gov === filterGov;
    const matchesSubject = filterSubject === "all" || t.subject === filterSubject;
    const matchesGrade = filterGrade === "all" || (t.grades && t.grades.includes(filterGrade));
    const tModes = t.teachingMode || t.teaching_mode || ["حضوري"];
    const matchesTeachingMode =
      filterTeachingMode === "all" ||
      (filterTeachingMode === "both" && tModes.includes("حضوري") && tModes.includes("إلكتروني")) ||
      (filterTeachingMode === "حضوري" && tModes.includes("حضوري")) ||
      (filterTeachingMode === "إلكتروني" && tModes.includes("إلكتروني"));

    return matchesSearch && matchesGov && matchesSubject && matchesGrade && matchesTeachingMode;
  }).sort((a, b) => {
    if (sortTeacherBy === "likes") {
      return (b.likes - b.dislikes) - (a.likes - a.dislikes);
    }
    if (sortTeacherBy === "rating") {
      const aScore = calculateWilsonScore(a.likes, a.dislikes);
      const bScore = calculateWilsonScore(b.likes, b.dislikes);
      if (Math.abs(bScore - aScore) > 0.0001) {
        return bScore - aScore;
      }
      return (b.likes - b.dislikes) - (a.likes - a.dislikes);
    }
    if (sortTeacherBy === "reviews") {
      const aReviews = posts.filter(p => p.teacher_id === a.id || p.teacherId === a.id).length;
      const bReviews = posts.filter(p => p.teacher_id === b.id || p.teacherId === b.id).length;
      return bReviews - aReviews;
    }
    return 0; // newest / default order
  });

  // Top trending teachers this week based on 7-day velocity
  const trendingTeachers = [...activeTeachers]
    .map(t => {
      const reviewCount = posts.filter(p => p.teacher_id === t.id || p.teacherId === t.id).length;
      const trendScore = calculateWeeklyTrendingVelocity(t.id, t.likes, t.dislikes, posts);
      return { ...t, trendScore, reviewCount };
    })
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 5);

  // Top students ranked by multi-factor reputation (24h Baghdad cycle & monthly reset)
  const allStudentUsernames = Array.from(
    new Set([
      ...Object.keys(profiles),
      ...posts.map(p => p.author).filter(Boolean),
      ...getUsers().map((u: User) => u.username).filter(Boolean),
    ])
  );

  const { rankedStudents: topHonorStudents, badgeMap: honorBadgesMap } = computeStudentHonorBoard(
    allStudentUsernames,
    posts,
    profiles,
    cycleInfo
  );

  // Teacher Badges & Milestones Helper
  function getTeacherBadges(t: Teacher): { label: string; cls: string; type: "favorite" | "top_subject" | "active" }[] {
    const badges: { label: string; cls: string; type: "favorite" | "top_subject" | "active" }[] = [];
    const totalVotes = t.likes + t.dislikes;
    const approvalRate = totalVotes > 0 ? (t.likes / totalVotes) * 100 : 0;
    const reviewCount = posts.filter(p => p.teacher_id === t.id || p.teacherId === t.id).length;

    if (totalVotes >= 5 && approvalRate >= 85) {
      badges.push({
        label: siteLang === "en" ? "Student Favorite" : "مفضل عند الطلاب",
        cls: "bg-emerald-100 text-emerald-950 border-emerald-600",
        type: "favorite"
      });
    }

    if (reviewCount >= 3) {
      badges.push({
        label: siteLang === "en" ? "Most Reviewed & Active" : "الأكثر مراجعات ونشاطاً",
        cls: "bg-blue-100 text-blue-950 border-blue-600",
        type: "active"
      });
    }

    const sameSubjectTeachers = activeTeachers.filter(other => other.subject === t.subject && (other.likes + other.dislikes) >= 3);
    if (sameSubjectTeachers.length > 1) {
      const topTeacher = sameSubjectTeachers.reduce(
        (max, curr) => calculateWilsonScore(curr.likes, curr.dislikes) > calculateWilsonScore(max.likes, max.dislikes) ? curr : max,
        sameSubjectTeachers[0]
      );
      if (topTeacher.id === t.id && (t.likes - t.dislikes) > 0) {
        badges.push({
          label: siteLang === "en" ? `Top Rated in ${t.subject}` : `الأعلى تقييماً في ${t.subject}`,
          cls: "bg-amber-100 text-amber-950 border-amber-600",
          type: "top_subject"
        });
      }
    }

    return badges;
  }

  // Bookmarks Helper
  function toggleBookmark(targetId: string, type: "post" | "teacher", title: string, subtitle?: string) {
    if (!session) { setAuthModal(true); return; }
    const current = getBookmarks(session.username);
    const exists = current.some(b => b.targetId === targetId);
    let updated: BookmarkItem[];
    if (exists) {
      updated = current.filter(b => b.targetId !== targetId);
    } else {
      updated = [{
        id: "bm_" + Date.now(),
        targetId,
        type,
        title,
        subtitle,
        created_at: new Date().toISOString(),
      }, ...current];
    }
    setBookmarks(session.username, updated);
    setUserBookmarks(updated);
    rerender();
  }

  function isBookmarked(targetId: string): boolean {
    if (!session) return false;
    return userBookmarks.some(b => b.targetId === targetId);
  }

  const pendingTeachers = teachers.filter(t => t.status === "pending" || t.status === "pending_custom");
  const reportedPosts = posts.filter(p => p.status === "hidden" || (p.reports && p.reports > 0));


  // Helper: render avatar
  const Avatar = ({ username, size = "w-8 h-8 text-sm" }: { username: string; size?: string }) => {
    const p = getProfile(username);
    if (p.avatarUrl) {
      return (
        <div className={`${size} border-2 border-slate-900 overflow-hidden shrink-0 bg-white`}>
          <img src={p.avatarUrl} alt={username} className="w-full h-full object-cover" />
        </div>
      );
    }
    return (
      <div className={`${size} border-2 border-slate-900 flex items-center justify-center font-black text-white shrink-0`} style={{ backgroundColor: p.avatarColor }}>
        {username.substring(0, 1).toUpperCase()}
      </div>
    );
  };

  // Helper: vote button style
  const vbtn = (active: boolean, type: "like" | "dislike") =>
    `px-2.5 py-1 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1 active:translate-x-px active:translate-y-px active:shadow-none transition-all ${
      active
        ? type === "like" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
        : "bg-white text-slate-700 hover:bg-slate-50"
    }`;

  // Helper: Get user role (consistently resolved across Supabase, sessions, and local cache)
  function getUserRole(username?: string | null): "student" | "mod" | "owner" {
    if (!username) return "student";
    const uTrim = username.trim();
    const uLower = uTrim.toLowerCase();
    if (uLower === "hh") return "owner";

    // 1. Live Supabase profiles dictionary (available globally to all visitors)
    const prof = profiles[uTrim] || Object.entries(profiles).find(([k]) => k.toLowerCase() === uLower)?.[1];
    if (prof?.role === "owner" || prof?.role === "mod") return prof.role;

    // 2. Active browser session
    if (session && session.username && session.username.toLowerCase() === uLower && session.role) {
      return session.role;
    }

    // 3. Local users storage fallback
    const localUser = getUsers().find(u => u.username && u.username.toLowerCase() === uLower);
    if (localUser?.role === "owner" || localUser?.role === "mod") return localUser.role;

    return "student";
  }

  // Helper: role icon (Owner crown, Moderator shield)
  const RoleIcon = ({ role, username, showStudent = false }: { role?: string; username?: string; showStudent?: boolean }) => {
    const effectiveRole = role || (username ? getUserRole(username) : "student");
    if (effectiveRole === "owner") {
      return (
        <span
          title={siteLang === "en" ? "Platform Owner" : "مالك المنصة"}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-200 text-amber-900 border border-amber-600 text-[9px] font-black shadow-[1px_1px_0px_#000]"
        >
          <IconCrown size={10} /> {siteLang === "en" ? "Owner" : "مالك"}
        </span>
      );
    }
    if (effectiveRole === "mod") {
      return (
        <span
          title={siteLang === "en" ? "Platform Moderator" : "مشرف المنصة"}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-600 text-[9px] font-black shadow-[1px_1px_0px_#000]"
        >
          <IconShield size={10} /> {siteLang === "en" ? "Moderator" : "مشرف"}
        </span>
      );
    }
    if (showStudent) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-400 text-[9px] font-black">
          <IconGrad size={10} /> {siteLang === "en" ? "Student" : "طالب"}
        </span>
      );
    }
    return null;
  };

  // Helper: Student Honor Badge
  const HonorBadge = ({ username, showText = false }: { username: string; showText?: boolean }) => {
    const badge = honorBadgesMap[username];
    if (!badge || (!badge.isTop10 && !badge.isOwnerGranted)) return null;

    const isOwner = badge.isOwnerGranted;

    const badgeLabel = isOwner
      ? (siteLang === "en" ? "Honor Badge" : "وسام شرف")
      : (siteLang === "en" ? "Top 10 Winner" : "فائز الشهر");

    const tooltip = isOwner
      ? (siteLang === "en" ? "Honor Badge: Granted by Platform Administration" : "وسام الشرف: مُنح بتقدير من إدارة المنصة")
      : (siteLang === "en" ? "Honor Badge: Top 10 Student Winner" : "وسام الشرف: من الفائزين بالعشرة الأوائل");

    return (
      <span
        title={tooltip}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black border border-slate-900 shadow-[1px_1px_0px_#000] cursor-help shrink-0 bg-amber-300 text-slate-950"
      >
        <IconAward size={10} className="text-amber-950" />
        {showText ? (
          <span>{badgeLabel}</span>
        ) : (
          <span className="hidden sm:inline">{badgeLabel}</span>
        )}
      </span>
    );
  };

  // Helper: Comment Threading Helpers (Reddit-style)
  function toggleCommentReplies(commentId: string) {
    setExpandedComments(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }));
  }

  function countDescendantReplies(commentId: string, comments: Comment[]): number {
    const direct = comments.filter(c => c.parentId === commentId);
    return direct.reduce((sum, child) => sum + 1 + countDescendantReplies(child.id, comments), 0);
  }

  const renderCommentNode = (c: Comment, postId: string, allComments: Comment[], depth = 0): React.ReactNode => {
    const commentVote = getUserVote(`comment_${c.id}`);
    const directReplies = allComments.filter(item => item.parentId === c.id);
    const totalReplies = countDescendantReplies(c.id, allComments);
    const isExpanded = !!expandedComments[c.id];
    const isReplying = replyingToCommentId === c.id;
    const parentComment = c.parentId ? allComments.find(x => x.id === c.parentId) : null;

    return (
      <div key={c.id} className="space-y-1.5">
        <div className={`p-2.5 border transition-all ${depth > 0 ? "bg-slate-50/90 border-slate-200" : "bg-white border-slate-200 shadow-[1px_1px_0px_#000]"}`}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setViewedUser(c.author); setTab("profile"); }}
              className="flex items-center gap-1.5 hover:opacity-80 text-right flex-wrap"
            >
              <Avatar username={c.author} size="w-5 h-5 text-[10px]" />
              <span className="font-bold text-teal-800">{c.author}</span>
              <RoleIcon username={c.author} />
              <HonorBadge username={c.author} />
              {parentComment && (
                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-0.5">
                  <IconReply size={10} className="inline opacity-70" />
                  <span>{siteLang === "en" ? "Replying to" : "رد على"} @{parentComment.author}</span>
                </span>
              )}
            </button>
            <span className="text-[9px] text-slate-400 font-bold shrink-0">{getRelativeTime(c.created_at, siteLang)}</span>
          </div>

          <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap mt-0.5">{c.text}</p>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
            <button
              onClick={() => voteComment(postId, c.id, "like")}
              className={`${vbtn(commentVote === "like", "like")} py-0.5 px-1.5 text-[10px]`}
              title={siteLang === "en" ? "Like" : "إعجاب"}
            >
              <IconThumbUp size={10} /> {c.likes}
            </button>
            <button
              onClick={() => voteComment(postId, c.id, "dislike")}
              className={`${vbtn(commentVote === "dislike", "dislike")} py-0.5 px-1.5 text-[10px]`}
              title={siteLang === "en" ? "Dislike" : "عدم إعجاب"}
            >
              <IconThumbDown size={10} /> {c.dislikes}
            </button>

            {/* Reply Button */}
            <button
              type="button"
              onClick={() => {
                if (!session) { setAuthModal(true); return; }
                setReplyingToCommentId(isReplying ? null : c.id);
                setReplyDraftText("");
              }}
              className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                isReplying ? "bg-teal-100 text-teal-900 border border-teal-300" : "text-slate-600 hover:text-teal-700 hover:bg-slate-100"
              }`}
            >
              <IconReply size={10} />
              <span>{isReplying ? (siteLang === "en" ? "Cancel" : "إلغاء") : (siteLang === "en" ? "Reply" : "رد")}</span>
            </button>

            <button
              onClick={() => openReportModal({ id: c.id, type: "comment", title: c.text, parentPostId: postId })}
              className="text-[10px] text-slate-400 hover:text-red-500 font-bold flex items-center gap-0.5 ms-auto"
              title={siteLang === "en" ? "Report" : "بلاغ"}
            >
              <IconFlag size={9} /> ({c.reports || 0})
            </button>
          </div>

          {/* Inline Reply Input Box */}
          {isReplying && (
            <div className="mt-2 pt-2 border-t border-slate-200 bg-slate-100/80 p-2 space-y-1.5 rounded-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-600 font-bold">
                <span>{siteLang === "en" ? "Replying to:" : "الرد على:"} <strong className="text-teal-800">@{c.author}</strong></span>
                <button
                  type="button"
                  onClick={() => setReplyingToCommentId(null)}
                  className="text-slate-400 hover:text-slate-700 p-0.5"
                  title={siteLang === "en" ? "Cancel" : "إلغاء"}
                >
                  <IconX size={12} />
                </button>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={replyDraftText}
                  onChange={e => setReplyDraftText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && replyDraftText.trim()) {
                      addComment(postId, replyDraftText, c.id);
                      setReplyingToCommentId(null);
                      setReplyDraftText("");
                    }
                  }}
                  placeholder={siteLang === "en" ? `Write your reply to ${c.author}...` : `اكتب ردك على ${c.author}...`}
                  className="flex-1 p-1.5 bg-white border border-slate-900 text-xs font-semibold focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!replyDraftText.trim()) return;
                    addComment(postId, replyDraftText, c.id);
                    setReplyingToCommentId(null);
                    setReplyDraftText("");
                  }}
                  className="px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs border border-slate-900 shadow-[1px_1px_0px_#000] shrink-0"
                >
                  {siteLang === "en" ? "Send Reply" : "إرسال الرد"}
                </button>
              </div>
            </div>
          )}

          {/* Collapsed/Expanded Toggle Button for Replies */}
          {totalReplies > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => toggleCommentReplies(c.id)}
                className="text-[11px] font-black text-teal-700 hover:text-teal-900 flex items-center gap-1.5 py-0.5 px-2 bg-teal-50/80 hover:bg-teal-100 border border-teal-200 transition-all rounded-xs"
              >
                <IconReplies size={13} className="text-teal-700 shrink-0" />
                <span>
                  {isExpanded
                    ? (siteLang === "en" ? "Hide replies" : "إخفاء الردود")
                    : `${totalReplies} ${siteLang === "en" ? (totalReplies === 1 ? "reply" : "replies") : (totalReplies === 1 ? "رد" : totalReplies === 2 ? "ردان" : "ردود")}`}
                </span>
                <IconChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          )}
        </div>

        {/* Nested Replies with Reddit-Style Thread Line */}
        {isExpanded && directReplies.length > 0 && (
          <div className="ms-2.5 sm:ms-3.5 ps-2 sm:ps-2.5 border-s-2 border-slate-300 hover:border-teal-500 space-y-2 transition-colors">
            {directReplies.map(child => renderCommentNode(child, postId, allComments, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Active viewed user profile (defaults to logged-in user)
  const targetProfileUser = viewedUser || session?.username || "";
  const isOwnProfile = !!session && targetProfileUser === session.username;

  // Profile data calculations for targetProfileUser
  const userRegularPosts = targetProfileUser ? posts.filter(p => p.author === targetProfileUser && (!p.grade_level || !p.grade_level.includes("تقييم أستاذ"))) : [];
  const userTeacherReviews = targetProfileUser ? posts.filter(p => p.author === targetProfileUser && (p.grade_level && p.grade_level.includes("تقييم أستاذ"))) : [];
  const userComments: { postTitle: string; postId: string; comment: Comment }[] = [];
  if (targetProfileUser) {
    posts.forEach(p => {
      p.comments.forEach(c => {
        if (c.author === targetProfileUser) {
          userComments.push({ postTitle: p.title, postId: p.id, comment: c });
        }
      });
    });
  }

  const totalLikesReceived = userRegularPosts.reduce((acc, p) => acc + p.likes, 0) +
    userTeacherReviews.reduce((acc, r) => acc + r.likes, 0) +
    userComments.reduce((acc, c) => acc + c.comment.likes, 0);

  const totalDislikesReceived = userRegularPosts.reduce((acc, p) => acc + p.dislikes, 0) +
    userTeacherReviews.reduce((acc, r) => acc + r.dislikes, 0) +
    userComments.reduce((acc, c) => acc + c.comment.dislikes, 0);

  // Combined mixed activity feed (posts, reviews, comments) sorted by created_at descending
  const combinedActivities = [
    ...userRegularPosts.map(p => ({
      id: p.id,
      kind: "post" as const,
      postId: p.id,
      grade_level: p.grade_level,
      teacherId: p.teacher_id || p.teacherId,
      title: p.title,
      content: p.body,
      created_at: p.created_at,
      likes: p.likes,
      dislikes: p.dislikes,
      reports: p.reports || 0,
    })),
    ...userTeacherReviews.map(r => ({
      id: r.id,
      kind: "review" as const,
      postId: r.id,
      grade_level: r.grade_level,
      teacherId: r.teacher_id || r.teacherId,
      title: r.title,
      content: r.body,
      created_at: r.created_at,
      likes: r.likes,
      dislikes: r.dislikes,
      reports: r.reports || 0,
    })),
    ...userComments.map(c => ({
      id: c.comment.id,
      kind: "comment" as const,
      postId: c.postId,
      grade_level: undefined,
      teacherId: undefined,
      title: `رد على: "${c.postTitle}"`,
      content: c.comment.text,
      created_at: c.comment.created_at,
      likes: c.comment.likes,
      dislikes: c.comment.dislikes,
      reports: c.comment.reports || 0,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());


  // Voting history list for session user
  const votes = getVotes();
  const userVoteHistory = session ? Object.entries(votes).filter(([k]) => k.startsWith(`${session.username}_`)).map(([key, voteType]) => {
    const rawKey = key.replace(`${session.username}_`, "");
    let label = "عنصر مجهول";
    let sub = "";
    if (rawKey.startsWith("post_")) {
      const pid = rawKey.replace("post_", "");
      const foundPost = posts.find(p => p.id === pid);
      label = foundPost ? `منشور: ${foundPost.title}` : `منشور (#${pid})`;
      sub = foundPost ? foundPost.body.substring(0, 50) + "..." : "";
    } else if (rawKey.startsWith("comment_")) {
      const cid = rawKey.replace("comment_", "");
      let foundText = "";
      posts.forEach(p => {
        const found = p.comments.find(c => c.id === cid);
        if (found) foundText = found.text;
      });
      label = `تعليق: "${foundText || cid}"`;
    } else if (rawKey.startsWith("teacher_")) {
      const tid = rawKey.replace("teacher_", "");
      const foundTeacher = teachers.find(t => t.id === tid);
      label = foundTeacher ? `مدرس: ${foundTeacher.name}` : `مدرس (#${tid})`;
    }
    return { key, voteType, label, sub };
  }) : [];

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  const t = getT(siteLang);

  return (
    <div data-theme={siteTheme} dir={siteLang === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-page-bg text-slate-900 selection:bg-teal-500 selection:text-white pb-20 md:pb-0">

      {/* ═══════ TOP NAV (DESKTOP) ═══════ */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-border-subtle shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setTab("feed")}>
            <div className="w-10 h-10 border-2 border-slate-900 bg-emerald-primary flex items-center justify-center text-white shadow-[2px_2px_0px_#115e59]">
              <IconBook size={20} />
            </div>
            <div>
              <h1 className="font-black text-base tracking-tight text-slate-900">{t("appName")}</h1>
              <p className="text-[11px] text-slate-600 font-semibold">{t("appTagline")}</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <button onClick={() => setTab("feed")}
              className={`px-3 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 ${tab === "feed" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
              <IconHome size={14} /> {t("navHome")}
            </button>
            <button onClick={() => setTab("directory")}
              className={`px-3 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 ${tab === "directory" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
              <IconBook size={14} /> {t("navTeachers")}
            </button>
            {session && (
              <button onClick={() => { setTab("notifications"); fetchSupabaseData(); }}
                className={`px-3 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 relative ${tab === "notifications" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
                <IconBell size={14} /> {t("navNotifications")}
                {unreadCount > 0 && (
                  <span className="bg-red-600 text-white font-black text-[9px] px-1.5 py-0.2 rounded-full border border-slate-900">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            {session && (
              <button onClick={() => { setViewedUser(session.username); setTab("profile"); }}
                className={`px-3 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 ${tab === "profile" && targetProfileUser === session.username ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
                <IconUser size={14} /> {t("navProfile")}
              </button>
            )}
            {canAdmin && (
              <button onClick={() => { setTab("admin"); fetchSupabaseData(); }}
                className={`px-3 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1 ${tab === "admin" ? "border-slate-900 bg-red-600 text-white shadow-[2px_2px_0px_#7f1d1d]" : "border-red-600 bg-red-50 text-red-700"}`}>
                {t("navAdmin")} <IconBolt size={12} />
              </button>
            )}
          </nav>

          {/* Header Action: Settings & User Auth */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsModal(true)}
              className="px-2.5 py-1.5 text-xs font-black border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 text-slate-900 active:translate-x-px active:translate-y-px transition-all"
              title={t("navSettings")}
            >
              <IconSettings size={15} />
              <span className="font-black hidden sm:inline">{t("navSettings")}</span>
            </button>

            {!session ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setIsRegister(false); setAuthModal(true); setAuthError(""); resetTurnstile(); }}
                  className="px-3 py-1.5 text-xs font-black border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
                >
                  {t("login")}
                </button>
                <button
                  onClick={() => { setIsRegister(true); setAuthModal(true); setAuthError(""); resetTurnstile(); }}
                  className="px-3 py-1.5 text-xs font-black border-2 border-slate-900 bg-emerald-primary hover:bg-emerald-dark text-white shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
                >
                  {t("register")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-white border-2 border-slate-900 px-2.5 py-1 shadow-[2px_2px_0px_#000]">
                <button onClick={() => { setViewedUser(session.username); setTab("profile"); }} className="hover:opacity-70">
                  <Avatar username={session.username} size="w-6 h-6 text-[10px]" />
                </button>
                <div className="text-right">
                  <button onClick={() => { setViewedUser(session.username); setTab("profile"); }} className="text-xs font-black hover:underline block leading-tight">
                    {session.username}
                  </button>
                  <div className="text-[9px]">
                    <RoleIcon username={session.username} />
                  </div>
                </div>
                <button
                  onClick={logout}
                  title={t("logout")}
                  className="text-red-600 mr-1 p-1 hover:bg-red-50 rounded"
                >
                  <IconX size={14} />
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ═══════ MAIN CONTENT AREA ═══════ */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Site-Wide Urgent Announcement Banner */}
        {(() => {
          const isExpired = !!(siteAnnouncement.expiresAt && siteAnnouncement.expiresAt <= Date.now());
          if (!siteAnnouncement.active || !siteAnnouncement.text || isExpired) return null;

          return (
            <div className={`p-4 border-2 border-slate-900 shadow-[4px_4px_0px_#000] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
              siteAnnouncement.type === "ministerial"
                ? "bg-blue-900 text-white"
                : siteAnnouncement.type === "warning"
                ? "bg-amber-400 text-slate-950"
                : "bg-emerald-600 text-white"
            }`}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`p-2 border-2 border-slate-900 shrink-0 shadow-[2px_2px_0px_#000] ${
                  siteAnnouncement.type === "ministerial"
                    ? "bg-blue-950 text-white"
                    : siteAnnouncement.type === "warning"
                    ? "bg-amber-500 text-slate-950"
                    : "bg-emerald-700 text-white"
                }`}>
                  {siteAnnouncement.type === "ministerial" ? <IconPalmTree size={20} /> : siteAnnouncement.type === "warning" ? <IconAlertTriangle size={20} /> : <IconCheck size={20} />}
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border border-slate-900 bg-white/20">
                      {siteAnnouncement.type === "ministerial"
                        ? (siteLang === "en" ? "Official Ministerial Notice" : "بيان وزاري رسمي")
                        : siteAnnouncement.type === "warning"
                        ? (siteLang === "en" ? "Urgent Student Alert" : "تنبيه دراسي عاجل")
                        : (siteLang === "en" ? "Platform Announcement" : "إعلان المنصة")}
                    </span>
                    {siteAnnouncement.expiresAt && (
                      <span className="text-[9px] font-bold opacity-80 flex items-center gap-1">
                        <IconClock size={11} />
                        <span>ينتهي خلال {Math.max(1, Math.ceil((siteAnnouncement.expiresAt - Date.now()) / (1000 * 60 * 60)))} ساعة</span>
                      </span>
                    )}
                  </div>
                  <p className="font-black text-xs sm:text-sm leading-relaxed">{siteAnnouncement.text}</p>
                </div>
              </div>
              {(canOwner || hasPermission("canManageAnnouncements")) && (
                <button
                  onClick={() => { setTab("admin"); setAdminSubTab("announcement"); }}
                  className="text-xs font-black underline opacity-85 hover:opacity-100 shrink-0 self-end sm:self-center"
                >
                  {siteLang === "en" ? "Manage Announcement" : "إدارة التنبيه"}
                </button>
              )}
            </div>
          );
        })()}

        {/* Maintenance Mode Screen for Non-Staff */}
        {platformSettings.maintenanceMode && (!session || (session.role !== "owner" && session.role !== "mod")) ? (
          <section className="bg-white border-4 border-slate-900 shadow-[8px_8px_0px_#000] p-8 md:p-14 text-center space-y-6 my-6">
            <div className="w-20 h-20 bg-amber-400 border-2 border-slate-900 shadow-[4px_4px_0px_#000] mx-auto flex items-center justify-center text-slate-950">
              <IconAlertTriangle size={42} />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 bg-red-600 text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] inline-block uppercase tracking-wider">
                {siteLang === "en" ? "Scheduled Maintenance" : "أعمال صيانة وتحديث مجدولة"}
              </span>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900">
                {siteLang === "en" ? "Platform is Under Maintenance" : "المنصة في وضع الصيانة المجدولة حالياً"}
              </h1>
              <p className="text-xs md:text-sm text-slate-600 font-bold max-w-xl mx-auto leading-relaxed">
                {siteLang === "en"
                  ? "We are currently applying scheduled updates and database optimizations to provide Iraqi students with the fastest, most reliable experience. We will be back shortly!"
                  : "نقوم حالياً بإجراء تحديثات وتحسينات تقنية دورية لقواعد البيانات لضمان أفضل تجربة لجميع طلابنا في عموم محافظات العراق. سنعود للعمل بكامل طاقتنا في أقرب وقت!"}
              </p>
            </div>
            <div className="pt-4 border-t-2 border-slate-200 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setAuthModal(true)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2"
              >
                <IconShield size={16} />
                <span>{siteLang === "en" ? "Staff Login" : "تسجيل دخول الكادر الإداري"}</span>
              </button>
            </div>
          </section>
        ) : (
          <>
        {/* ──── TAB 1: FEED (الرئيسية) ──── */}
        {tab === "feed" && (
          <section className="space-y-6">
            {/* 1. Trending Teachers This Week */}
            {isInitialLoading ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-4 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-slate-200 border border-slate-300 animate-pulse" />
                    <div className="space-y-1">
                      <div className="w-36 h-3 bg-slate-200 animate-pulse" />
                      <div className="w-24 h-2 bg-slate-100 animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <SkeletonTrendingTeacher key={i} />
                  ))}
                </div>
              </div>
            ) : trendingTeachers.length > 0 ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-4 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-amber-100 border border-amber-500 text-amber-700 flex items-center justify-center font-bold">
                      <IconFlame size={16} />
                    </div>
                    <div>
                      <h3 className="font-black text-xs sm:text-sm text-slate-900">{siteLang === "en" ? "Trending Teachers This Week" : "المدرسين الأكثر رواجاً هذا الأسبوع"}</h3>
                      <p className="text-[10px] text-slate-500 font-semibold">{siteLang === "en" ? "Based on student interactions and active reviews" : "بناءً على تفاعلات الطلاب والمراجعات النشطة"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTab("directory")}
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
                  >
                    {siteLang === "en" ? "View all teachers →" : "عرض كل المدرسين ←"}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                  {trendingTeachers.map((t, idx) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTeacher(t);
                        setTab("teacher");
                        setShowReviewForm(false);
                        setReviewVerdict(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="group p-2.5 border-2 border-slate-900 bg-slate-50 hover:bg-white shadow-[2px_2px_0px_#000] cursor-pointer transition-all flex flex-col items-center text-center space-y-1.5"
                    >
                      <div className="relative">
                        <img
                          src={t.img}
                          alt={t.name}
                          className="w-12 h-12 border border-slate-900 object-cover shadow-[1px_1px_0px_#000] bg-white"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M20 21a8 8 0 1 0-16 0'/%3E%3C/svg%3E";
                          }}
                        />
                        <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 font-black text-[9px] px-1 border border-slate-900 shadow-[1px_1px_0px_#000]">
                          #{idx + 1}
                        </span>
                      </div>
                      <div className="w-full">
                        <h4 className="font-black text-xs text-slate-900 truncate group-hover:text-emerald-700">{t.name}</h4>
                        <p className="text-[10px] text-slate-600 font-bold truncate">{t.subject} - {t.gov}</p>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-black text-emerald-800 bg-emerald-50 px-1.5 py-0.5 border border-emerald-300 w-full justify-center">
                        <IconThumbUp size={9} /> {t.likes} • {t.reviewCount} {siteLang === "en" ? "reviews" : "تقييم"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 2. Student Honor Board (لوحة شرف الطلاب) */}
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-amber-400 border border-slate-900 text-slate-900 flex items-center justify-center font-bold shadow-[1px_1px_0px_#000]">
                    <IconAward size={16} />
                  </div>
                  <div>
                    <h3 className="font-black text-xs sm:text-sm text-slate-900">{siteLang === "en" ? "Student Honor Board" : "لوحة شرف الطلاب الأكثر تفاعلاً ومساعدة"}</h3>
                    <p className="text-[10px] text-slate-500 font-semibold">{siteLang === "en" ? "Honoring top students who share verified reviews and helpful advice" : "تكريم أفضل الطلاب الذين ينشرون المراجعات الموثوقة والإجابات المفيدة"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHonorBoard(!showHonorBoard)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-900 shadow-[1px_1px_0px_#000] transition-all"
                >
                  {showHonorBoard ? (siteLang === "en" ? "Hide Honor Board" : "إخفاء لوحة الشرف") : (siteLang === "en" ? `Top Students • ${topHonorStudents.length}` : `عرض الطلاب المتميزين • ${topHonorStudents.length}`)}
                </button>
              </div>

              {showHonorBoard && (
                <div className="pt-2.5 border-t border-slate-200 space-y-3">
                  {/* 24h Baghdad Cycle & Monthly Reset Timer Info Bar */}
                  <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 border border-slate-300 text-[11px] font-bold">
                    <div className="px-2 py-1 bg-amber-100 text-amber-950 border border-amber-400 flex items-center gap-1.5">
                      <IconClock size={12} className="text-amber-800" />
                      <span>
                        {siteLang === "en"
                          ? `Daily Cycle (4:00 PM Baghdad): ${cycleInfo.hoursUntilUpdate}h ${cycleInfo.minutesUntilUpdate}m left`
                          : `التحديث اليومي (4:00 م بتوقيت بغداد): متبقي ${cycleInfo.hoursUntilUpdate} س و ${cycleInfo.minutesUntilUpdate} د`}
                      </span>
                    </div>
                    <div className="px-2 py-1 bg-teal-100 text-teal-950 border border-teal-400 flex items-center gap-1.5">
                      <IconRotateCcw size={12} className="text-teal-800" />
                      <span>
                        {siteLang === "en"
                          ? `Cycle: ${cycleInfo.monthNameEn} (${cycleInfo.daysLeftInMonth} days left)`
                          : `دورة شهر ${cycleInfo.monthNameAr} (متبقي ${cycleInfo.daysLeftInMonth} يوم)`}
                      </span>
                    </div>
                    <div className="px-2 py-1 bg-white text-slate-800 border border-slate-300 flex items-center gap-1.5">
                      <IconAward size={12} className="text-amber-600" />
                      <span>
                        {siteLang === "en" ? "Top 10 students receive the Honor Badge" : "العشرة الأوائل ينالون وسام الشرف"}
                      </span>
                    </div>
                  </div>

                  {topHonorStudents.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-bold">{siteLang === "en" ? "No active students in this cycle yet" : "لا يوجد طلاب متفاعلون في هذه الدورة حتى الآن"}</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[460px] overflow-y-auto pr-1">
                      {topHonorStudents.map((s, idx) => (
                        <div
                          key={s.username}
                          onClick={() => { setViewedUser(s.username); setTab("profile"); }}
                          className={`p-2 border border-slate-900 shadow-[1px_1px_0px_#000] cursor-pointer transition-all flex items-center gap-2 ${
                            idx < 3 ? "bg-amber-50/90 hover:bg-amber-100/90" : idx < 10 ? "bg-slate-50 hover:bg-amber-50/60" : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className={`font-black text-[10px] px-1.5 py-0.5 border border-slate-900 shrink-0 ${
                            idx === 0 ? "bg-amber-300 text-slate-950 font-black shadow-[1px_1px_0px_#000]" : 
                            idx === 1 ? "bg-slate-300 text-slate-900 font-black shadow-[1px_1px_0px_#000]" : 
                            idx === 2 ? "bg-amber-700 text-white font-black shadow-[1px_1px_0px_#000]" : 
                            idx < 10 ? "bg-amber-100 text-amber-950 font-bold" :
                            "bg-white text-slate-700"
                          }`}>
                            #{idx + 1}
                          </div>
                          <Avatar username={s.username} size="w-7 h-7 text-xs" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="font-black text-xs text-slate-900 truncate">{s.username}</span>
                                <RoleIcon username={s.username} />
                                {s.isTop10 && (
                                  <span title={siteLang === "en" ? "Top 10 Honor Student" : "وسام الشرف - من العشرة الأوائل"} className="shrink-0 text-amber-600">
                                    <IconAward size={11} />
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-500 rounded flex items-center gap-0.5 shrink-0">
                                <IconStar size={9} fill="currentColor" className="text-amber-600" />
                                {s.approvalRate}%
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-500 font-bold flex items-center gap-1.5 mt-0.5">
                              <span className="text-emerald-700 flex items-center gap-0.5"><IconThumbUp size={9} /> {s.totalLikes}</span>
                              <span>•</span>
                              <span>{s.postsCount} {siteLang === "en" ? "posts" : "مشاركة"}</span>
                              <span>•</span>
                              <span className="text-slate-900 font-black">{s.reputationScore} {siteLang === "en" ? "pts" : "نقطة"}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* General Discussion Header */}
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <IconPen size={24} className="text-emerald-primary" />
                <div>
                  <h2 className="font-black text-base text-slate-900">{siteLang === "en" ? "Student Discussion Forum" : "ساحة النقاش العامة"}</h2>
                  <p className="text-xs text-slate-600">{siteLang === "en" ? "Ask questions and share your experience with students across Iraq" : "اطرح سؤالك أو شارك تجربتك مع بقية الطلاب في عموم العراق"}</p>
                </div>
              </div>
              <button onClick={() => { if (!session) { setAuthModal(true); return; } setPostModal(true); }}
                className="w-full md:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2">
                <IconPlus size={14} /> {siteLang === "en" ? "Add New Post" : "أضف منشوراً جديداً"}
              </button>
            </div>

            {/* Feed Tag Filter Bar & Ranking Controls */}
            <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <IconTag size={13} className="text-emerald-primary" /> {t("filterByTag")}
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  {selectedFeedTag === "all" ? `${activePosts.length} ${siteLang === "en" ? "posts" : "منشور"}` : `${activePosts.filter(p => (selectedFeedTag === "discussion" ? (p.tag === "discussion" || !p.tag) : p.tag === selectedFeedTag)).length} ${siteLang === "en" ? "posts" : "منشور"}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
                {[
                  { id: "all", label: t("tagAll"), icon: null, count: activePosts.length },
                  { id: "question", label: t("tagQuestion"), icon: <IconHelpCircle size={12} />, count: activePosts.filter(p => p.tag === "question").length },
                  { id: "news", label: t("tagNews"), icon: <IconPalmTree size={12} />, count: activePosts.filter(p => p.tag === "news").length },
                  { id: "discussion", label: t("tagDiscussion"), icon: <IconPen size={12} />, count: activePosts.filter(p => p.tag === "discussion" || !p.tag).length },
                  { id: "tips", label: t("tagTips"), icon: <IconCheck size={12} />, count: activePosts.filter(p => p.tag === "tips").length },
                  { id: "booklet", label: t("tagBooklet"), icon: <IconBookmark size={12} />, count: activePosts.filter(p => p.tag === "booklet").length },
                  { id: "other", label: t("tagOther"), icon: <IconTag size={12} />, count: activePosts.filter(p => p.tag === "other").length },
                ].map(filterBtn => {
                  const isSelected = selectedFeedTag === filterBtn.id;
                  return (
                    <button
                      key={filterBtn.id}
                      onClick={() => setSelectedFeedTag(filterBtn.id as any)}
                      className={`px-3 py-1.5 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                        isSelected
                          ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                          : "border-slate-300 bg-slate-50 hover:bg-white text-slate-700 hover:border-slate-900"
                      }`}
                    >
                      {filterBtn.icon}
                      <span>{filterBtn.label}</span>
                      <span className={`text-[10px] px-1 py-0.2 rounded-full font-bold ${
                        isSelected ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-700"
                      }`}>
                        {filterBtn.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Feed Ranking Order: Hot, New, Top */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-500 text-[11px] ml-1">{siteLang === "en" ? "Feed Order:" : "ترتيب المنشورات:"}</span>
                  <button
                    onClick={() => setFeedSortMode("hot")}
                    className={`px-2.5 py-1 text-[11px] font-black border flex items-center gap-1.5 transition-all ${
                      feedSortMode === "hot"
                        ? "border-slate-900 bg-amber-400 text-slate-950 shadow-[1px_1px_0px_#000]"
                        : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"
                    }`}
                  >
                    <IconFlame size={12} className={feedSortMode === "hot" ? "text-slate-950" : "text-amber-600"} />
                    <span>{siteLang === "en" ? "Hot" : "الأنشط"}</span>
                  </button>
                  <button
                    onClick={() => setFeedSortMode("new")}
                    className={`px-2.5 py-1 text-[11px] font-black border flex items-center gap-1.5 transition-all ${
                      feedSortMode === "new"
                        ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]"
                        : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"
                    }`}
                  >
                    <IconClock size={12} />
                    <span>{siteLang === "en" ? "Newest" : "الأحدث"}</span>
                  </button>
                  <button
                    onClick={() => setFeedSortMode("top")}
                    className={`px-2.5 py-1 text-[11px] font-black border flex items-center gap-1.5 transition-all ${
                      feedSortMode === "top"
                        ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]"
                        : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"
                    }`}
                  >
                    <IconStar size={12} fill={feedSortMode === "top" ? "currentColor" : "none"} />
                    <span>{siteLang === "en" ? "Top Votes" : "الأعلى تصويتاً"}</span>
                  </button>
                </div>
              </div>
            </div>

            {(() => {
              const filteredFeedPosts = activePosts.filter(p => {
                if (selectedFeedTag === "all") return true;
                if (selectedFeedTag === "discussion") return p.tag === "discussion" || !p.tag;
                return p.tag === selectedFeedTag;
              });

              const sortedFeedPosts = [...filteredFeedPosts].sort((a, b) => {
                const aPin = pinnedPostIds.includes(a.id) || a.pinned;
                const bPin = pinnedPostIds.includes(b.id) || b.pinned;
                if (aPin && !bPin) return -1;
                if (!aPin && bPin) return 1;

                if (feedSortMode === "hot") {
                  const aComments = Array.isArray(a.comments) ? a.comments.length : 0;
                  const bComments = Array.isArray(b.comments) ? b.comments.length : 0;
                  const aHot = calculateHotScore(a.likes, a.dislikes, aComments, a.created_at);
                  const bHot = calculateHotScore(b.likes, b.dislikes, bComments, b.created_at);
                  if (Math.abs(bHot - aHot) > 0.001) return bHot - aHot;
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                }

                if (feedSortMode === "top") {
                  const aNet = (a.likes || 0) - (a.dislikes || 0);
                  const bNet = (b.likes || 0) - (b.dislikes || 0);
                  if (bNet !== aNet) return bNet - aNet;
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                }

                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              });

              if (isInitialLoading) {
                return (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <SkeletonPostCard key={i} />
                    ))}
                  </div>
                );
              }

              if (sortedFeedPosts.length === 0) {
                return (
                  <EmptyStateCard
                    icon={<IconInbox size={24} />}
                    title={selectedFeedTag === "all"
                      ? (siteLang === "en" ? "No posts published yet" : "لا توجد منشورات منشورة حتى الآن")
                      : (siteLang === "en" ? "No posts in this category" : "لا توجد منشورات في هذا التصنيف")}
                    description={selectedFeedTag === "all"
                      ? (siteLang === "en"
                          ? "Be the first student to start a discussion, ask a ministerial question, or share study notes with your peers!"
                          : "كن أول طالب يشارك ملزمة، يطرح سؤالاً وزارياً، أو يبدأ نقاشاً مفيداً لزملائه!")
                      : (siteLang === "en"
                          ? "Try switching back to 'All' or exploring other discussion tags."
                          : "جرّب التبديل إلى تصنيف (الكل) أو استعراض أقسام أخرى.")}
                    actionText={selectedFeedTag !== "all"
                      ? (siteLang === "en" ? "View All Posts" : "عرض كل المنشورات")
                      : undefined}
                    onAction={selectedFeedTag !== "all" ? () => setSelectedFeedTag("all") : undefined}
                  />
                );
              }

              return (
                <div className="space-y-5">
                  {sortedFeedPosts.map(p => {
                    const isPinned = pinnedPostIds.includes(p.id) || p.pinned;
                    const teacher = teachers.find(t => t.id === p.teacherId || t.id === p.teacher_id);
                    const canDeletePost = session && (session.username === p.author || session.role === "owner" || session.role === "mod");
                    const postVote = getUserVote(`post_${p.id}`);
                    const postTagVal = p.tag || "discussion";

                    return (
                      <div
                        key={p.id}
                        className={`bg-white border-2 space-y-3 transition-all ${
                          isPinned
                            ? "border-amber-500 shadow-[4px_4px_0px_#d97706] ring-2 ring-amber-400 p-5"
                            : postTagVal === "news"
                            ? "border-blue-900 shadow-[4px_4px_0px_#1e3a8a] p-5"
                            : "border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5"
                        }`}
                      >
                        {/* Pinned Top Banner */}
                        {isPinned && (
                          <div className="bg-amber-100 border border-amber-600 px-3 py-1 text-[11px] font-black text-amber-950 flex items-center justify-between shadow-[1px_1px_0px_#d97706] -mt-1 mb-2">
                            <span className="flex items-center gap-1.5">
                              <IconPin size={13} className="text-amber-800 rotate-45" /> {t("pinnedBadge")}
                            </span>
                            {canAdmin && (
                              <button
                                onClick={() => togglePinPost(p.id)}
                                className="text-[10px] text-amber-900 underline hover:text-red-700 font-bold"
                              >
                                {t("unpinPost")}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Post Header with Tag Badge */}
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => { setViewedUser(p.author); setTab("profile"); }} className="flex items-center gap-2 hover:opacity-80">
                              <Avatar username={p.author} />
                              <span className="text-xs font-black text-slate-700">{p.author}</span>
                              <RoleIcon username={p.author} />
                              <HonorBadge username={p.author} />
                            </button>

                            {/* Post Tag Badge */}
                            {postTagVal === "news" && (
                              <span className="px-2 py-0.5 bg-blue-900 text-white font-black text-[10px] border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                <IconPalmTree size={11} /> {t("tagNews")}
                              </span>
                            )}
                            {postTagVal === "question" && (
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 font-black text-[10px] border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                <IconHelpCircle size={11} /> {t("tagQuestion")}
                              </span>
                            )}
                            {postTagVal === "tips" && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-black text-[10px] border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                <IconCheck size={11} /> {t("tagTips")}
                              </span>
                            )}
                            {postTagVal === "booklet" && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-900 font-black text-[10px] border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                <IconBookmark size={11} /> {t("tagBooklet")}
                              </span>
                            )}
                            {postTagVal === "discussion" && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-bold text-[10px] border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                <IconPen size={11} /> {t("tagDiscussion")}
                              </span>
                            )}
                            {postTagVal === "other" && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                <IconTag size={11} /> {t("tagOther")}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {teacher && (
                              <button
                                onClick={() => {
                                  setSelectedTeacher(teacher);
                                  setTab("teacher");
                                  setShowReviewForm(false);
                                  setReviewVerdict(null);
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                className="px-2.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 border border-slate-900 text-[10px] font-black text-emerald-900 flex items-center gap-1 transition-colors"
                              >
                                <IconTag size={10} /> {teacher.name} • {teacher.subject}
                              </button>
                            )}
                            <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(p.created_at, siteLang)}</span>
                          </div>
                        </div>

                        {/* Post Body */}
                        <div>
                          <h3 className="font-black text-sm text-slate-900">{p.title}</h3>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{p.body}</p>
                        </div>

                        {/* Multi-Image Gallery / Swipe Carousel */}
                        {p.images && p.images.length > 0 && (
                          <PostImageCarousel
                            images={p.images}
                            altTitle={p.title}
                            onPreviewImage={setPreviewImageModal}
                            siteLang={siteLang}
                          />
                        )}

                        {/* External Study Links (YouTube & Telegram) */}
                        {(p.youtubeUrl || p.telegramUrl) && (
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            {p.youtubeUrl && (
                              <a
                                href={p.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 border border-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000] transition-all"
                              >
                                <IconVideo size={13} className="text-red-700" />
                                <span>{t("watchYoutube")}</span>
                              </a>
                            )}
                            {p.telegramUrl && (
                              <a
                                href={p.telegramUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000] transition-all"
                              >
                                <IconLink size={13} className="text-blue-700" />
                                <span>{t("openTelegram")}</span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Post Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => votePost(p.id, "like")} className={vbtn(postVote === "like", "like")}>
                              <IconThumbUp size={13} /> {p.likes}
                            </button>
                            <button onClick={() => votePost(p.id, "dislike")} className={vbtn(postVote === "dislike", "dislike")}>
                              <IconThumbDown size={13} /> {p.dislikes}
                            </button>
                            <button
                              onClick={() => toggleBookmark(p.id, "post", p.title, p.author)}
                              className={`px-2.5 py-1 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1 active:translate-x-px active:translate-y-px active:shadow-none transition-all ${
                                isBookmarked(p.id) ? "bg-amber-300 text-slate-900" : "bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                              title={isBookmarked(p.id) ? "إزالة من المحفوظات" : "حفظ المنشور في المحفوظات"}
                            >
                              <IconBookmark size={12} fill={isBookmarked(p.id) ? "currentColor" : "none"} />
                              <span>{isBookmarked(p.id) ? t("bookmarked") : t("bookmark")}</span>
                            </button>

                            {/* Admin Pin / Unpin Button */}
                            {canAdmin && (
                              <button
                                onClick={() => togglePinPost(p.id)}
                                className={`px-2.5 py-1 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1 active:translate-x-px active:translate-y-px active:shadow-none transition-all ${
                                  isPinned ? "bg-amber-300 text-slate-950" : "bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                                title={isPinned ? t("unpinPost") : t("pinPost")}
                              >
                                <IconPin size={12} className={isPinned ? "rotate-45 text-amber-900" : "text-slate-600"} />
                                <span>{isPinned ? t("unpinPost") : t("pinPost")}</span>
                              </button>
                            )}

                            <button onClick={() => reportPost(p.id)} className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1">
                              <IconFlag size={12} /> {t("report")} ({p.reports || 0}/20)
                            </button>
                          </div>
                          {canDeletePost && (
                            <button onClick={() => deletePost(p.id)} className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1">
                              <IconTrash size={12} /> {session?.username === p.author ? t("delete") : t("deleteAdmin")}
                            </button>
                          )}
                        </div>

                        {/* Comments Section */}
                        <div className="bg-slate-50 p-3 border border-slate-200 space-y-2 text-xs">
                          <div className="font-bold text-[11px] text-slate-500 flex items-center gap-1">
                            <IconComment size={12} /> {t("commentsCount")} ({p.comments?.length || 0}):
                          </div>
                          {(() => {
                            const topComments = (p.comments || []).filter(c => !c.parentId);
                            return topComments.length === 0 ? (
                              <div className="text-[11px] text-slate-400 py-1 font-semibold">
                                {t("noCommentsYet") || "لا توجد تعليقات حتى الآن. كن أول من يكتب تعليقاً!"}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {topComments.map(c => renderCommentNode(c, p.id, p.comments || []))}
                              </div>
                            );
                          })()}
                          <div className="flex gap-2 pt-1">
                            <input
                              type="text"
                              id={`comment-${p.id}`}
                              placeholder={t("writeComment")}
                              className="flex-1 p-1.5 bg-white border border-slate-900 text-xs focus:outline-none font-semibold"
                              onKeyDown={e => {
                                if (e.key === "Enter") addComment(p.id);
                              }}
                            />
                            <button onClick={() => addComment(p.id)} className="px-3 bg-slate-900 text-white font-bold text-xs active:bg-slate-700">{t("send")}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        )}

        {/* ──── TAB 2: TEACHERS (المدرسين) ──── */}
        {tab === "directory" && (
          <section className="space-y-6">
            {/* Top Bar: Title & Add Teacher Button */}
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <IconBook size={24} className="text-emerald-primary" />
                <div>
                  <h2 className="font-black text-base text-slate-900">{siteLang === "en" ? "Teachers Directory" : "المدرسين"}</h2>
                  <p className="text-xs text-slate-600">{siteLang === "en" ? "Directory, reviews, and ratings for teachers across all Iraqi governorates" : "دليل ومراجعات وتقييمات المدرسين في جميع محافظات العراق"}</p>
                </div>
              </div>
              <button onClick={() => { if (!session) { setAuthModal(true); return; } setTeacherModal(true); }}
                className="w-full md:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2 shrink-0">
                <IconPlus size={14} /> {siteLang === "en" ? "Add Teacher" : "إضافة مدرس"}
              </button>
            </div>

            {/* Search & Filters Bar */}
            <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 space-y-3">
              {/* Row 1: Search, Governorate, Subject, Grade, Teaching Mode */}
              <div className="flex flex-col md:flex-row items-center gap-3">
                {/* Search text */}
                <div className="w-full md:flex-1 relative">
                  <IconSearch size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={dirSearch}
                    onChange={e => setDirSearch(e.target.value)}
                    placeholder={siteLang === "en" ? "Search by teacher name, subject, or governorate..." : "ابحث باسم المدرس، المادة، أو المحافظة..."}
                    className="w-full pr-9 pl-4 py-2 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none focus:bg-white"
                  />
                </div>

                {/* Filter by Governorate */}
                <div className="w-full md:w-32">
                  <select
                    value={filterGov}
                    onChange={e => setFilterGov(e.target.value)}
                    className="w-full py-2 px-2 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">{siteLang === "en" ? "All Governorates" : "كل المحافظات"}</option>
                    {GOVERNORATES.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Filter by Subject */}
                <div className="w-full md:w-32">
                  <select
                    value={filterSubject}
                    onChange={e => setFilterSubject(e.target.value)}
                    className="w-full py-2 px-2 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">{siteLang === "en" ? "All Subjects" : "كل المواد"}</option>
                    {SUBJECT_OPTIONS.filter(s => s !== "أخرى").map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Filter by Grade */}
                <div className="w-full md:w-32">
                  <select
                    value={filterGrade}
                    onChange={e => setFilterGrade(e.target.value)}
                    className="w-full py-2 px-2 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">{siteLang === "en" ? "All Grades" : "كل المراحل"}</option>
                    {GRADES.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Filter by Teaching Mode (حضوري / إلكتروني / كلاهما) */}
                <div className="w-full md:w-36">
                  <select
                    value={filterTeachingMode}
                    onChange={e => setFilterTeachingMode(e.target.value as any)}
                    className="w-full py-2 px-2 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="all">{siteLang === "en" ? "Teaching Modes: All" : "طرق التدريس: الكل"}</option>
                    <option value="both">{siteLang === "en" ? "In-Person & Online" : "حضوري وإلكتروني"}</option>
                    <option value="حضوري">{siteLang === "en" ? "In-Person Only" : "حضوري فقط"}</option>
                    <option value="إلكتروني">{siteLang === "en" ? "Online Only" : "إلكتروني فقط"}</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Sort Buttons & Clear Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-500 text-[11px] ml-1">{siteLang === "en" ? "Sort by:" : "ترتيب حسب:"}</span>
                  <button
                    onClick={() => setSortTeacherBy("likes")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "likes" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    {siteLang === "en" ? "Most Liked" : "الأكثر إعجاباً"}
                  </button>
                  <button
                    onClick={() => setSortTeacherBy("rating")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "rating" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    {siteLang === "en" ? "Top Rated" : "الأعلى تقييماً"}
                  </button>
                  <button
                    onClick={() => setSortTeacherBy("reviews")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "reviews" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    {siteLang === "en" ? "Most Reviews" : "الأكثر مراجعات"}
                  </button>
                  <button
                    onClick={() => setSortTeacherBy("newest")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "newest" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    {siteLang === "en" ? "Newest" : "الأحدث"}
                  </button>
                </div>

                {(dirSearch || filterGov !== "all" || filterSubject !== "all" || filterGrade !== "all" || filterTeachingMode !== "all" || sortTeacherBy !== "likes") && (
                  <button
                    onClick={() => { setDirSearch(""); setFilterGov("all"); setFilterSubject("all"); setFilterGrade("all"); setFilterTeachingMode("all"); setSortTeacherBy("likes"); }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-900"
                  >
                    {siteLang === "en" ? "Reset Filters" : "إعادة ضبط الفلاتر"}
                  </button>
                )}
              </div>
            </div>


            {/* Results Count & Grid */}
            {isInitialLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <SkeletonTeacherCard key={i} />
                ))}
              </div>
            ) : filteredTeachers.length === 0 ? (
              <EmptyStateCard
                icon={<IconSearch size={24} />}
                title={siteLang === "en" ? "No teachers match your search or filters" : "لا يوجد مدرسون مطابقون لبحثك أو الفلاتر"}
                description={siteLang === "en"
                  ? "Try adjusting your search terms, changing the subject or governorate, or suggest a new teacher to add to the platform."
                  : "جرّب تغيير كلمات البحث، اختيار مادة أو محافظة أخرى، أو اقترح إضافة مدرس جديد إلى المنصة."}
                actionText={(dirSearch || filterGov !== "all" || filterSubject !== "all" || filterGrade !== "all" || filterTeachingMode !== "all" || sortTeacherBy !== "likes")
                  ? (siteLang === "en" ? "Reset All Filters" : "إعادة ضبط الفلاتر")
                  : undefined}
                onAction={() => { setDirSearch(""); setFilterGov("all"); setFilterSubject("all"); setFilterGrade("all"); setFilterTeachingMode("all"); setSortTeacherBy("likes"); }}
                secondaryActionText={siteLang === "en" ? "Propose a Teacher" : "اقتراح مدرس جديد"}
                onSecondaryAction={() => { if (!session) { setAuthModal(true); } else { setTeacherModal(true); } }}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTeachers.map(t => {
                  const tVote = getUserVote(`teacher_${t.id}`);
                  const teacherPostsCount = posts.filter(p => p.teacher_id === t.id || p.teacherId === t.id).length;
                  const badges = getTeacherBadges(t);
                  const modes = t.teachingMode || t.teaching_mode || ["حضوري"];
                  const isBoth = modes.includes("حضوري") && modes.includes("إلكتروني");

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTeacher(t);
                        setTab("teacher");
                        setShowReviewForm(false);
                        setReviewVerdict(null);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="group bg-white border-2 border-border-subtle hover:border-slate-900 shadow-[2px_2px_0px_#d1dcd6] hover:shadow-[4px_4px_0px_#000] p-4 flex flex-col justify-between gap-3 cursor-pointer transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {/* Medium sized teacher image */}
                          <img
                            src={t.img}
                            alt={t.name}
                            className="w-16 h-16 sm:w-20 sm:h-20 border-2 border-slate-900 object-cover shrink-0 shadow-[2px_2px_0px_#000] bg-slate-100"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M20 21a8 8 0 1 0-16 0'/%3E%3C/svg%3E";
                            }}
                          />
                          <div className="space-y-1.5">
                            <h3 className="font-black text-sm sm:text-base text-slate-900 group-hover:text-emerald-700 transition-colors">
                              {t.name}
                            </h3>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 bg-emerald-100 border border-slate-900 text-[10px] font-black text-emerald-900">
                                {t.subject}
                              </span>
                              <span className="px-2 py-0.5 bg-blue-100 border border-slate-900 text-[10px] font-black text-blue-900">
                                {t.gov}
                              </span>
                              <span className="px-2 py-0.5 bg-purple-100 border border-slate-900 text-[10px] font-black text-purple-900 flex items-center gap-1">
                                <IconMonitor size={10} />
                                {isBoth ? (siteLang === "en" ? "In-Person & Online" : "حضوري وإلكتروني") : modes.includes("إلكتروني") ? (siteLang === "en" ? "Online" : "إلكتروني") : (siteLang === "en" ? "In-Person" : "حضوري")}
                              </span>
                              {t.likes + t.dislikes > 0 && (
                                <span className={`px-2 py-0.5 border border-slate-900 text-[10px] font-black ${
                                  Math.round((t.likes / (t.likes + t.dislikes)) * 100) >= 70
                                    ? "bg-emerald-200 text-emerald-950"
                                    : Math.round((t.likes / (t.likes + t.dislikes)) * 100) >= 50
                                    ? "bg-amber-100 text-amber-950"
                                    : "bg-red-100 text-red-950"
                                }`}>
                                  {Math.round((t.likes / (t.likes + t.dislikes)) * 100)}% {siteLang === "en" ? "Approval" : "قبول"}
                                </span>
                              )}
                            </div>

                            {/* Dynamic Badges */}
                            {badges.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                {badges.map((b, bi) => (
                                  <span key={bi} className={`px-1.5 py-0.2 border text-[9px] font-black flex items-center gap-1 ${b.cls}`}>
                                    <IconAward size={10} /> {b.label}
                                  </span>
                                ))}
                              </div>
                            )}

                            {t.grades && <p className="text-[11px] text-slate-600 font-semibold">{t.grades}</p>}
                          </div>
                        </div>

                        {/* Votes, Bookmark, and Admin Controls */}
                        <div className="flex flex-col items-end gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => toggleBookmark(t.id, "teacher", t.name, `${t.subject} - ${t.gov}`)}
                              className={`p-1.5 border border-slate-900 text-xs transition-all ${
                                isBookmarked(t.id) ? "bg-amber-300 text-slate-900 shadow-[1px_1px_0px_#000]" : "bg-white text-slate-500 hover:bg-slate-100"
                              }`}
                              title={isBookmarked(t.id) ? (siteLang === "en" ? "Remove from bookmarks" : "إزالة من المحفوظات") : (siteLang === "en" ? "Save teacher" : "حفظ الأستاذ")}
                            >
                              <IconBookmark size={13} fill={isBookmarked(t.id) ? "currentColor" : "none"} />
                            </button>
                            <button onClick={() => voteTeacher(t.id, "like")} className={vbtn(tVote === "like", "like")} title={siteLang === "en" ? "Like" : "إعجاب"}>
                              <IconThumbUp size={12} /> {t.likes}
                            </button>
                            <button onClick={() => voteTeacher(t.id, "dislike")} className={vbtn(tVote === "dislike", "dislike")} title={siteLang === "en" ? "Dislike" : "عدم إعجاب"}>
                              <IconThumbDown size={12} /> {t.dislikes}
                            </button>
                          </div>
                          {session && (session.role === "owner" || session.role === "mod") && (
                            <button
                              onClick={() => deleteTeacher(t.id)}
                              className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold border border-red-500 flex items-center gap-0.5 shadow-[1px_1px_0px_#dc2626]"
                              title={siteLang === "en" ? "Delete Teacher" : "حذف الأستاذ"}
                            >
                              <IconTrash size={10} /> {siteLang === "en" ? "Delete" : "حذف إداري"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Card Footer: Posts & Reviews Count & Open Button */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 flex items-center gap-1 bg-slate-100 px-2 py-0.5 border border-slate-300">
                          <IconBook size={12} className="text-slate-600" />
                          <span>{teacherPostsCount} {siteLang === "en" ? "posts & reviews" : "منشور وتقييم"}</span>
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700 group-hover:underline flex items-center gap-0.5">
                          {siteLang === "en" ? "View teacher profile & posts →" : "عرض صفحة المدرس وكل المنشورات ←"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ──── TAB: DEDICATED TEACHER PAGE (صفحة المدرس وكل ما نُشر عنه) ──── */}
        {tab === "teacher" && (
          <section className="space-y-6">
            {!selectedTeacher ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center space-y-4">
                <p className="text-sm font-black text-slate-700">{siteLang === "en" ? "No teacher selected." : "لم يتم تحديد أي مدرس لعرض صفحته."}</p>
                <button
                  onClick={() => setTab("directory")}
                  className="px-5 py-2.5 bg-emerald-primary text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000]"
                >
                  {siteLang === "en" ? "← Back to Teachers Directory" : "← العودة إلى قائمة المدرسين"}
                </button>
              </div>
            ) : (
              <>
                {/* Navigation Bar & Admin Delete Teacher */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setTab("directory")}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                  >
                    {siteLang === "en" ? "← Back to Teachers Directory" : "← العودة إلى قائمة المدرسين"}
                  </button>

                  {session && (session.role === "owner" || session.role === "mod") && (
                    <button
                      onClick={() => deleteTeacher(selectedTeacher.id)}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs border-2 border-red-600 shadow-[2px_2px_0px_#dc2626] flex items-center gap-1.5 transition-all"
                    >
                      <IconTrash size={14} /> {siteLang === "en" ? "Admin Delete" : "حذف إداري للأستاذ"}
                    </button>
                  )}
                </div>

                {/* Teacher Hero Profile Card */}
                <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                    <div className="flex items-start sm:items-center gap-4">
                      <img
                        src={selectedTeacher.img}
                        alt={selectedTeacher.name}
                        className="w-24 h-24 sm:w-28 sm:h-28 border-2 border-slate-900 object-cover shadow-[3px_3px_0px_#000] bg-slate-100 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M20 21a8 8 0 1 0-16 0'/%3E%3C/svg%3E";
                        }}
                      />
                      <div className="space-y-2">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">{selectedTeacher.name}</h2>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-3 py-1 bg-emerald-100 border border-slate-900 text-xs font-black text-emerald-900">
                            {selectedTeacher.subject}
                          </span>
                          <span className="px-3 py-1 bg-blue-100 border border-slate-900 text-xs font-black text-blue-900">
                            {siteLang === "en" ? selectedTeacher.gov : `محافظة ${selectedTeacher.gov}`}
                          </span>
                          {(() => {
                            const modes = selectedTeacher.teachingMode || selectedTeacher.teaching_mode || ["حضوري"];
                            const isBoth = modes.includes("حضوري") && modes.includes("إلكتروني");
                            return (
                              <span className="px-3 py-1 bg-purple-100 border border-slate-900 text-xs font-black text-purple-900 flex items-center gap-1.5">
                                <IconMonitor size={12} />
                                {isBoth ? (siteLang === "en" ? "In-Person & Online" : "حضوري وإلكتروني") : modes.includes("إلكتروني") ? (siteLang === "en" ? "Online" : "إلكتروني") : (siteLang === "en" ? "In-Person" : "حضوري")}
                              </span>
                            );
                          })()}
                        </div>

                        {/* Dynamic Badges */}
                        {getTeacherBadges(selectedTeacher).length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            {getTeacherBadges(selectedTeacher).map((b, bi) => (
                              <span key={bi} className={`px-2 py-0.5 border text-[10px] font-black flex items-center gap-1 ${b.cls}`}>
                                <IconAward size={11} /> {b.label}
                              </span>
                            ))}
                          </div>
                        )}

                        {selectedTeacher.grades && (
                          <p className="text-xs text-slate-600 font-bold">
                            {siteLang === "en" ? "Grades: " : "المراحل الدراسية: "}<span className="text-slate-900 font-semibold">{selectedTeacher.grades}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Teacher Rating & Bookmark Card */}
                    <div className="bg-slate-50 border-2 border-slate-900 p-4 shadow-[3px_3px_0px_#000] flex flex-col items-center gap-2.5 w-full sm:w-auto shrink-0">
                      <span className="text-xs font-black text-slate-800">{siteLang === "en" ? "Student Rating:" : "تقييم الطلاب للمدرس:"}</span>
                      <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
                        <button
                          onClick={() => voteTeacher(selectedTeacher.id, "like")}
                          className={`px-4 py-2 border-2 border-slate-900 font-black text-xs flex items-center gap-2 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                            getUserVote(`teacher_${selectedTeacher.id}`) === "like"
                              ? "bg-emerald-600 text-white"
                              : "bg-white hover:bg-emerald-50 text-emerald-800"
                          }`}
                          title={siteLang === "en" ? "Like" : "أعجبني"}
                        >
                          <IconThumbUp size={16} /> {selectedTeacher.likes} {siteLang === "en" ? "Like" : "أعجبني"}
                        </button>
                        <button
                          onClick={() => voteTeacher(selectedTeacher.id, "dislike")}
                          className={`px-4 py-2 border-2 border-slate-900 font-black text-xs flex items-center gap-2 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                            getUserVote(`teacher_${selectedTeacher.id}`) === "dislike"
                              ? "bg-red-600 text-white"
                              : "bg-white hover:bg-red-50 text-red-800"
                          }`}
                          title={siteLang === "en" ? "Dislike" : "لم يعجبني"}
                        >
                          <IconThumbDown size={16} /> {selectedTeacher.dislikes} {siteLang === "en" ? "Dislike" : "لم يعجبني"}
                        </button>
                      </div>

                      <button
                        onClick={() => toggleBookmark(selectedTeacher.id, "teacher", selectedTeacher.name, `${selectedTeacher.subject} - ${selectedTeacher.gov}`)}
                        className={`w-full py-2 px-3 border-2 border-slate-900 text-xs font-black flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all ${
                          isBookmarked(selectedTeacher.id) ? "bg-amber-300 text-slate-900" : "bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                        title={isBookmarked(selectedTeacher.id) ? (siteLang === "en" ? "Remove from bookmarks" : "إزالة من المحفوظات") : (siteLang === "en" ? "Save teacher" : "حفظ المدرس في المحفوظات")}
                      >
                        <IconBookmark size={13} fill={isBookmarked(selectedTeacher.id) ? "currentColor" : "none"} />
                        <span>{isBookmarked(selectedTeacher.id) ? (siteLang === "en" ? "Saved in Bookmarks" : "محفوظ في المحفوظات") : (siteLang === "en" ? "Save Teacher" : "حفظ المدرس في المحفوظات")}</span>
                      </button>
                    </div>
                  </div>

                  {/* Toggle Review Form */}
                  <div className="pt-4 border-t-2 border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 font-bold">
                      {siteLang === "en" ? `Studied with ${selectedTeacher.name}? Share your review to help other students!` : `هل درست عند الأستاذ ${selectedTeacher.name}؟ شارك رأيك وتقييمك لمساعدة بقية الطلاب!`}
                    </div>
                    <button
                      onClick={() => {
                        if (!session) { setAuthModal(true); return; }
                        setShowReviewForm(!showReviewForm);
                      }}
                      className="w-full sm:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2 transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
                    >
                      <IconPen size={14} />
                      {showReviewForm ? (siteLang === "en" ? "Close Review Form" : "إغلاق استمارة التقييم") : (siteLang === "en" ? "Write a Review" : "اكتب مراجعة وتقييم للمدرس")}
                    </button>
                  </div>

                  {/* Review Form: Mandatory Like or Dislike selection (NO stars) */}
                  {showReviewForm && (
                    <div className="bg-slate-50 border-2 border-slate-900 p-5 space-y-4 shadow-[3px_3px_0px_#000]">
                      <div className="border-b border-slate-300 pb-2">
                        <h4 className="font-black text-sm text-slate-900">{siteLang === "en" ? `Review Form for ${selectedTeacher.name}` : `استمارة تقييم الأستاذ ${selectedTeacher.name}`}</h4>
                        <p className="text-[11px] text-slate-600 font-semibold mt-0.5">
                          {siteLang === "en" ? "Select whether you recommend this teacher before submitting your review." : "يجب تحديد ما إذا كان المدرس قد أعجبك أم لا كشرط أساسي لكتابة ونشر التقييم."}
                        </p>
                      </div>

                      {/* Prerequisite: Mandatory Like or Dislike Choice */}
                      <div>
                        <label className="block text-xs font-black text-slate-800 mb-2">
                          {siteLang === "en" ? "Do you recommend this teacher?" : "تنصح بهذا الأستاذ؟"} <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setReviewVerdict("like")}
                            className={`py-3 px-4 text-xs font-black border-2 flex items-center justify-center gap-2 transition-all ${
                              reviewVerdict === "like"
                                ? "border-slate-900 bg-emerald-600 text-white shadow-[3px_3px_0px_#000]"
                                : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
                            }`}
                          >
                            <IconThumbUp size={16} />
                            <span>{siteLang === "en" ? "Recommend" : "أنصح بيه"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewVerdict("dislike")}
                            className={`py-3 px-4 text-xs font-black border-2 flex items-center justify-center gap-2 transition-all ${
                              reviewVerdict === "dislike"
                                ? "border-slate-900 bg-red-600 text-white shadow-[3px_3px_0px_#000]"
                                : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
                            }`}
                          >
                            <IconThumbDown size={16} />
                            <span>{siteLang === "en" ? "Don't Recommend" : "ما أنصح بيه"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Review Title */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">{siteLang === "en" ? "Review Title" : "عنوان التقييم"}</label>
                        <input
                          type="text"
                          value={reviewTitle}
                          onChange={e => setReviewTitle(e.target.value)}
                          placeholder={siteLang === "en" ? "e.g. My experience with this teacher..." : "مثال: تجربتي وي الأستاذ بمادة الرياضيات..."}
                          className="w-full p-2.5 bg-white border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                        />
                      </div>

                      {/* Review Body */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          {siteLang === "en" ? "Review Details & Experience" : "تفاصيل رأيك وتجربتك"} <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={reviewBody}
                          onChange={e => setReviewBody(e.target.value)}
                          placeholder={siteLang === "en" ? "Describe in detail: teaching style, assignments, exam preparation, and your key takeaways..." : "اكتب بالتفصيل: طريقة الشرح، الواجبات، أسلوب التدريس، ومستوى الاستفادة..."}
                          className="w-full p-2.5 bg-white border-2 border-slate-900 text-xs font-semibold min-h-[90px] resize-none focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowReviewForm(false); setReviewVerdict(null); }}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 font-bold text-xs border border-slate-900"
                        >
                          {siteLang === "en" ? "Cancel" : "إلغاء"}
                        </button>
                        <button
                          type="button"
                          onClick={submitTeacherReview}
                          disabled={!reviewVerdict || !reviewBody.trim()}
                          className="px-6 py-2 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:border-slate-400 disabled:shadow-none"
                        >
                          {siteLang === "en" ? "Publish Review" : "نشر التقييم الآن"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Everything posted about this teacher */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                    <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                      <IconBook size={18} />
                      {siteLang === "en" ? `All posts & reviews about ${selectedTeacher.name}` : `كل ما نُشر عن الأستاذ ${selectedTeacher.name}`}
                    </h3>
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 border border-slate-300">
                      {posts.filter(p => p.teacher_id === selectedTeacher.id || p.teacherId === selectedTeacher.id).length} {siteLang === "en" ? "posts & reviews" : "منشور وتقييم"}
                    </span>
                  </div>

                  {posts.filter(p => p.teacher_id === selectedTeacher.id || p.teacherId === selectedTeacher.id).length === 0 ? (
                    <EmptyStateCard
                      icon={<IconPen size={24} />}
                      title={siteLang === "en" ? `No reviews for ${selectedTeacher.name} yet` : `لا توجد مراجعات أو تقييمات للأستاذ ${selectedTeacher.name} حتى الآن`}
                      description={siteLang === "en"
                        ? "Did you study with this teacher? Be the first to share your honest review to help fellow students."
                        : "هل درست مع هذا الأستاذ؟ كن أول من يكتب مراجعته وتجربته الصادقة لإفادة زملائك الطلبة."}
                      actionText={siteLang === "en" ? "Write a Review" : "اكتب تقييماً الآن"}
                      onAction={() => {
                        if (!session) { setAuthModal(true); return; }
                        setShowReviewForm(true);
                      }}
                    />
                  ) : (
                    <div className="space-y-4">
                      {posts
                        .filter(p => p.teacher_id === selectedTeacher.id || p.teacherId === selectedTeacher.id)
                        .map(postItem => {
                          const postVote = getUserVote(`post_${postItem.id}`);
                          const canDelete = session && (session.username === postItem.author || session.role === "owner" || session.role === "mod");
                          const isReview = postItem.grade_level?.includes("تقييم أستاذ");
                          const isLikeReview = postItem.grade_level?.includes("أعجبني") || postItem.body?.startsWith("[أعجبني");
                          const isDislikeReview = postItem.grade_level?.includes("لم يعجبني") || postItem.body?.startsWith("[لم يعجبني");

                          return (
                            <div key={postItem.id} className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                              {/* Post / Review Header */}
                              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <button
                                  onClick={() => { setViewedUser(postItem.author); setTab("profile"); }}
                                  className="flex items-center gap-2 hover:opacity-80"
                                >
                                  <Avatar username={postItem.author} />
                                  <span className="text-xs font-black text-slate-800">{postItem.author}</span>
                                  <RoleIcon username={postItem.author} />
                                  <HonorBadge username={postItem.author} />
                                  {isReview ? (
                                    isDislikeReview ? (
                                      <span className="px-2 py-0.5 bg-red-100 border border-red-500 text-[10px] font-black text-red-900 flex items-center gap-1">
                                        <IconThumbDown size={10} /> {siteLang === "en" ? "Don't Recommend" : "ما أنصح بيه"}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-600 text-[10px] font-black text-emerald-900 flex items-center gap-1">
                                        <IconThumbUp size={10} /> {siteLang === "en" ? "Recommend" : "أنصح بيه"}
                                      </span>
                                    )
                                  ) : (
                                    <span className="px-2 py-0.5 bg-blue-100 border border-blue-600 text-[10px] font-black text-blue-900 flex items-center gap-1">
                                      <IconComment size={10} /> {siteLang === "en" ? "Discussion" : "سالفة ونقاش"}
                                    </span>
                                  )}
                                </button>
                                <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(postItem.created_at, siteLang)}</span>
                              </div>

                              {/* Content */}
                              <div>
                                <h4 className="font-black text-sm text-slate-900">{postItem.title}</h4>
                                <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{postItem.body}</p>
                              </div>

                              {/* Multi-Image Gallery / Swipe Carousel */}
                              {postItem.images && postItem.images.length > 0 && (
                                <PostImageCarousel
                                  images={postItem.images}
                                  altTitle={postItem.title}
                                  onPreviewImage={setPreviewImageModal}
                                  siteLang={siteLang}
                                />
                              )}

                              {/* External Study Links (YouTube & Telegram) */}
                              {(postItem.youtubeUrl || postItem.telegramUrl) && (
                                <div className="flex items-center gap-2 flex-wrap pt-1">
                                  {postItem.youtubeUrl && (
                                    <a
                                      href={postItem.youtubeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-900 border border-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000] transition-all"
                                    >
                                      <IconVideo size={13} className="text-red-700" />
                                      <span>{siteLang === "en" ? "YouTube Lesson" : "شرح يوتيوب"}</span>
                                    </a>
                                  )}
                                  {postItem.telegramUrl && (
                                    <a
                                      href={postItem.telegramUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000] transition-all"
                                    >
                                      <IconLink size={13} className="text-blue-700" />
                                      <span>{siteLang === "en" ? "Booklet / File" : "ملزمة / ملف"}</span>
                                    </a>
                                  )}
                                </div>
                              )}

                              {/* Actions: Likes, Dislikes, Bookmark, Reports, Delete */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => votePost(postItem.id, "like")} className={vbtn(postVote === "like", "like")}>
                                    <IconThumbUp size={12} /> {postItem.likes}
                                  </button>
                                  <button onClick={() => votePost(postItem.id, "dislike")} className={vbtn(postVote === "dislike", "dislike")}>
                                    <IconThumbDown size={12} /> {postItem.dislikes}
                                  </button>
                                  <button
                                    onClick={() => toggleBookmark(postItem.id, "post", postItem.title, postItem.author)}
                                    className={`px-2.5 py-1 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1 active:translate-x-px active:translate-y-px active:shadow-none transition-all ${
                                      isBookmarked(postItem.id) ? "bg-amber-300 text-slate-900" : "bg-white text-slate-700 hover:bg-slate-50"
                                    }`}
                                    title={isBookmarked(postItem.id) ? (siteLang === "en" ? "Remove from bookmarks" : "إزالة من المحفوظات") : (siteLang === "en" ? "Save to bookmarks" : "حفظ في المحفوظات")}
                                  >
                                    <IconBookmark size={12} fill={isBookmarked(postItem.id) ? "currentColor" : "none"} />
                                    <span>{isBookmarked(postItem.id) ? (siteLang === "en" ? "Saved" : "محفوظ") : (siteLang === "en" ? "Save" : "حفظ")}</span>
                                  </button>
                                  <button onClick={() => reportPost(postItem.id)} className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1">
                                    <IconFlag size={12} /> {siteLang === "en" ? "Report" : "بلاغ"} • {postItem.reports || 0}/20
                                  </button>
                                </div>
                                {canDelete && (
                                  <button onClick={() => deletePost(postItem.id)} className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1">
                                    <IconTrash size={12} /> {session?.username === postItem.author ? (siteLang === "en" ? "Delete" : "حذف") : (siteLang === "en" ? "Admin Delete" : "حذف إداري")}
                                  </button>
                                )}
                              </div>

                              {/* Comments Section */}
                              <div className="bg-slate-50 p-3 border border-slate-200 space-y-2 text-xs">
                                <div className="font-bold text-[11px] text-slate-500 flex items-center gap-1">
                                  <IconComment size={12} /> {siteLang === "en" ? "Comments & Replies" : "التعليقات والردود"} • {postItem.comments?.length || 0}
                                </div>
                                {(() => {
                                  const topComments = (postItem.comments || []).filter(c => !c.parentId);
                                  return topComments.length === 0 ? (
                                    <div className="text-[11px] text-slate-400 py-1 font-semibold">
                                      {siteLang === "en" ? "No comments yet. Be the first to write a comment!" : "لا توجد تعليقات حتى الآن. كن أول من يكتب تعليقاً!"}
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {topComments.map(c => renderCommentNode(c, postItem.id, postItem.comments || []))}
                                    </div>
                                  );
                                })()}
                                <div className="flex gap-2 pt-1">
                                  <input
                                    type="text"
                                    id={`comment-${postItem.id}`}
                                    placeholder={siteLang === "en" ? "Write a comment or reply..." : "اكتب رداً أو تعليقاً..."}
                                    className="flex-1 p-1.5 bg-white border border-slate-900 text-xs focus:outline-none font-semibold"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") addComment(postItem.id);
                                    }}
                                  />
                                  <button
                                    onClick={() => addComment(postItem.id)}
                                    className="px-3 bg-slate-900 text-white font-bold text-xs active:bg-slate-700"
                                  >
                                    {siteLang === "en" ? "Send" : "إرسال"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}


        {/* ──── TAB 3: NOTIFICATIONS (الإشعارات) ──── */}
        {tab === "notifications" && (
          <section className="space-y-6">
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconBell size={24} className="text-emerald-primary" />
                <div>
                  <h2 className="font-black text-base text-slate-900">{siteLang === "en" ? "Notifications" : "صندوق الإشعارات"}</h2>
                  <p className="text-xs text-slate-600">{siteLang === "en" ? "Interactions, replies, and moderation alerts for your account" : "التفاعلات، الردود، والتقارير الإدارية الخاصة بحسابك"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {myNotifications.length > 0 && (
                  <button onClick={markAllNotifsRead} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-900 flex items-center gap-1.5 shadow-[1px_1px_0px_#000]">
                    <IconCheck size={12} className="text-emerald-700" />
                    <span>{siteLang === "en" ? "Mark all as read" : "تحديد الكل كمقروء"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <button
                onClick={() => setNotifFilter("all")}
                className={`px-3 py-1 font-bold border transition-all ${notifFilter === "all" ? "bg-slate-900 text-white border-slate-900 shadow-[1px_1px_0px_#000]" : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"}`}
              >
                {siteLang === "en" ? "All" : "الكل"} • {myNotifications.length}
              </button>
              <button
                onClick={() => setNotifFilter("unread")}
                className={`px-3 py-1 font-bold border transition-all ${notifFilter === "unread" ? "bg-slate-900 text-white border-slate-900 shadow-[1px_1px_0px_#000]" : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"}`}
              >
                {siteLang === "en" ? "Unread" : "غير مقروءة"} • {unreadCount}
              </button>
              {canAdmin && (
                <button
                  onClick={() => setNotifFilter("reports")}
                  className={`px-3 py-1 font-bold border transition-all ${notifFilter === "reports" ? "bg-red-700 text-white border-red-900 shadow-[1px_1px_0px_#000]" : "bg-white text-red-700 border-red-300 hover:border-red-600"}`}
                >
                  {siteLang === "en" ? "Staff Reports" : "بلاغات الإشراف"} • {myNotifications.filter(n => n.type === "report_alert").length}
                </button>
              )}
            </div>

            {(() => {
              const filteredNotifs = myNotifications.filter(n => {
                if (notifFilter === "unread") return !n.read;
                if (notifFilter === "reports") return n.type === "report_alert";
                return true;
              });

              if (myNotifications.length === 0) {
                return (
                  <EmptyStateCard
                    icon={<IconBell size={24} />}
                    title={siteLang === "en" ? "No notifications yet" : "لا توجد إشعارات حتى الآن"}
                    description={siteLang === "en"
                      ? "You'll see updates here when students reply to your discussions, upvote your reviews, or when staff answers your inquiries."
                      : "ستصلك التنبيهات هنا عندما يعلّق زملاؤك على منشوراتك، أو يُعجبون بمراجعاتك، أو عند رد الإدارة على استفساراتك."}
                    actionText={siteLang === "en" ? "Explore Discussions" : "تصفح ساحة النقاشات"}
                    onAction={() => setTab("feed")}
                  />
                );
              }

              if (filteredNotifs.length === 0) {
                return (
                  <EmptyStateCard
                    icon={<IconCheck size={24} />}
                    title={siteLang === "en" ? "All caught up!" : "أنت على اطلاع بكل جديد!"}
                    description={siteLang === "en"
                      ? "No notifications found matching this filter."
                      : "لا توجد إشعارات تطابق هذا الفلتر حالياً."}
                    actionText={siteLang === "en" ? "View All Notifications" : "عرض كل الإشعارات"}
                    onAction={() => setNotifFilter("all")}
                  />
                );
              }

              return (
                <div className="space-y-3">
                  {filteredNotifs.map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        const updated = allNotifications.map(item => item.id === n.id ? { ...item, read: true } : item);
                        setNotifications(updated);
                        setAllNotifications(updated);
                        try {
                          supabase.from('notifications').update({ read: true }).eq('id', n.id).then(() => {});
                        } catch (e) {}
                        if (n.type === "report_alert") {
                          setTab("admin");
                        } else if (n.type === "support_reply") {
                          setSettingsModal(true);
                          setSettingsTab("support");
                        } else if (n.type === "promotion" || (n.type as string) === "badge") {
                          setTab("admin");
                        } else if (n.type === "teacher_approved" || n.type === "teacher_rejected") {
                          setTab("directory");
                        } else {
                          setTab("feed");
                        }
                      }}
                      className={`p-4 border-2 transition-all cursor-pointer shadow-[2px_2px_0px_#d1dcd6] ${
                        n.read
                          ? "bg-white border-border-subtle"
                          : n.type === "report_alert"
                          ? "bg-red-50 border-red-500"
                          : n.type === "admin_warning"
                          ? "bg-amber-50 border-amber-500"
                          : n.type === "promotion" || (n.type as string) === "badge"
                          ? "bg-blue-50 border-blue-600"
                          : n.type === "support_reply"
                          ? "bg-purple-50 border-purple-600"
                          : "bg-emerald-50 border-emerald-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {n.type === "teacher_approved" ? (
                            <div className="w-7 h-7 bg-emerald-600 border border-slate-900 flex items-center justify-center text-white text-xs shrink-0">
                              <IconBook size={14} />
                            </div>
                          ) : n.type === "report_alert" ? (
                            <div className="w-7 h-7 bg-red-600 border border-slate-900 flex items-center justify-center text-white text-xs shrink-0">
                              <IconFlag size={14} />
                            </div>
                          ) : n.type === "like" ? (
                            <div className="w-7 h-7 bg-emerald-100 border border-emerald-600 flex items-center justify-center text-emerald-800 text-xs shrink-0">
                              <IconThumbUp size={14} />
                            </div>
                          ) : n.type === "admin_warning" ? (
                            <div className="w-7 h-7 bg-amber-500 border border-slate-900 flex items-center justify-center text-white text-xs shrink-0">
                              <IconAlertTriangle size={14} />
                            </div>
                          ) : n.type === "promotion" || (n.type as string) === "badge" ? (
                            <div className="w-7 h-7 bg-blue-600 border border-slate-900 flex items-center justify-center text-white text-xs shrink-0">
                              <IconAward size={14} />
                            </div>
                          ) : n.type === "support_reply" ? (
                            <div className="w-7 h-7 bg-purple-600 border border-slate-900 flex items-center justify-center text-white text-xs shrink-0">
                              <IconLifeBuoy size={14} />
                            </div>
                          ) : (
                            <Avatar username={n.actor} size="w-7 h-7 text-xs" />
                          )}

                          <span className="font-black text-xs text-slate-800">{n.actor}</span>
                          <span className="text-xs text-slate-600">
                            {n.type === "teacher_approved"
                              ? (siteLang === "en" ? "Teacher addition approved:" : "تمت الموافقة على الأستاذ:")
                              : n.type === "teacher_rejected"
                              ? (siteLang === "en" ? "Teacher suggestion declined:" : "ما تمت الموافقة على الأستاذ:")
                              : n.type === "like"
                              ? (siteLang === "en" ? "Liked your post:" : "عجبه منشورك:")
                              : n.type === "report_alert"
                              ? (siteLang === "en" ? "Admin notice - report on:" : "تنبيه إداري - وصل بلاغ عن:")
                              : n.type === "admin_warning"
                              ? (siteLang === "en" ? "Official admin warning:" : "إنذار إداري رسمي:")
                              : n.type === "promotion" || (n.type as string) === "badge"
                              ? (siteLang === "en" ? "Staff promotion:" : "ترقية إدارية:")
                              : n.type === "support_reply"
                              ? (siteLang === "en" ? "Support reply:" : "رد الدعم الفني:")
                              : (siteLang === "en" ? "Commented on your post:" : "علّق على منشورك:")}
                          </span>
                          <span className="text-xs font-bold text-emerald-800">"{n.targetTitle}"</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">{getRelativeTime(n.created_at, siteLang)}</span>
                      </div>
                      {n.commentText && (
                        <p className="text-xs font-medium text-slate-700 mt-2 pr-9 bg-white/80 p-2.5 border border-slate-200 leading-relaxed">
                          {n.commentText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        )}


        {/* ──── TAB 4: PROFILE (الملف الشخصي) ──── */}
        {tab === "profile" && (
          <section className="space-y-6">
            {!targetProfileUser ? (
              <EmptyStateCard
                icon={<IconUser size={24} />}
                title={siteLang === "en" ? "Student Account Menu" : "قائمة الحساب الطلابي"}
                description={siteLang === "en"
                  ? "Log in or create a student account to customize your profile, track your reviews, and participate in discussions."
                  : "سجّل الدخول أو أنشئ حساباً جديداً للوصول إلى ملفك وتخصيصه، وتقييم الأساتذة والمشاركة بالنقاشات."}
                actionText={siteLang === "en" ? "Sign In" : "تسجيل الدخول"}
                onAction={() => { setIsRegister(false); setAuthModal(true); setAuthError(""); resetTurnstile(); }}
                secondaryActionText={siteLang === "en" ? "Create Account" : "إنشاء حساب جديد"}
                onSecondaryAction={() => { setIsRegister(true); setAuthModal(true); setAuthError(""); resetTurnstile(); }}
              />
            ) : (
              <>
                {/* Profile Header & Top Logout Bar */}
                <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-6 space-y-5">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                    <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <IconUser size={18} /> {isOwnProfile ? t("myProfile") : `${t("studentProfile")} ${targetProfileUser}`}
                    </h2>
                    {isOwnProfile ? (
                      <button
                        onClick={logout}
                        className="px-4 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs border-2 border-red-600 shadow-[2px_2px_0px_#dc2626] flex items-center gap-1.5 transition-all"
                      >
                        <IconX size={14} /> {t("logout")}
                      </button>
                    ) : session ? (
                      <button
                        onClick={() => setViewedUser(session.username)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border-2 border-slate-900 flex items-center gap-1"
                      >
                        {siteLang === "ar" ? "← العودة إلى ملفي الشخصي" : "← Back to My Profile"}
                      </button>
                    ) : (
                      <button
                        onClick={() => { setIsRegister(false); setAuthModal(true); setAuthError(""); resetTurnstile(); }}
                        className="px-3.5 py-1.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 transition-all"
                      >
                        <IconUser size={13} /> {t("login")}
                      </button>
                    )}
                  </div>

                  {/* Profile Banner */}
                  {(() => {
                    const prof = getProfile(targetProfileUser);
                    const bColor = prof.bannerColor || "#0d9488";
                    const bPattern = prof.bannerPattern || "none";
                    let bStyle: React.CSSProperties = { backgroundColor: bColor };

                    if (prof.bannerUrl) {
                      bStyle = {
                        backgroundImage: `url(${prof.bannerUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      };
                    } else if (bPattern === "stripes") {
                      bStyle = {
                        backgroundColor: bColor,
                        backgroundImage: `repeating-linear-gradient(45deg, rgba(0,0,0,0.15) 0, rgba(0,0,0,0.15) 12px, transparent 12px, transparent 24px)`,
                      };
                    } else if (bPattern === "dots") {
                      bStyle = {
                        backgroundColor: bColor,
                        backgroundImage: `radial-gradient(rgba(0,0,0,0.2) 2px, transparent 2px)`,
                        backgroundSize: "16px 16px",
                      };
                    } else if (bPattern === "grid") {
                      bStyle = {
                        backgroundColor: bColor,
                        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.15) 1px, transparent 1px)`,
                        backgroundSize: "20px 20px",
                      };
                    } else if (bPattern === "gradient") {
                      bStyle = {
                        background: `linear-gradient(135deg, ${bColor} 0%, #0f172a 100%)`,
                      };
                    }

                    return (
                      <div
                        className="w-full h-28 sm:h-40 border-2 border-slate-900 shadow-[3px_3px_0px_#000] relative overflow-hidden flex items-end justify-between p-3"
                        style={bStyle}
                      >
                        <div className="bg-white/90 backdrop-blur-xs border border-slate-900 px-2.5 py-1 text-[11px] font-black text-slate-900 shadow-[1px_1px_0px_#000]">
                          @{targetProfileUser}
                        </div>
                        {isOwnProfile && (
                          <button
                            onClick={openProfileEditor}
                            className="bg-white hover:bg-slate-100 text-slate-900 border-2 border-slate-900 px-3 py-1 text-xs font-black shadow-[2px_2px_0px_#000] flex items-center gap-1.5 active:translate-x-px active:translate-y-px transition-all"
                          >
                            <IconPalette size={13} /> {t("customizeProfile")}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Profile Info Row */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className={`relative ${isOwnProfile ? "group cursor-pointer" : ""}`} onClick={isOwnProfile ? openProfileEditor : undefined}>
                        <Avatar username={targetProfileUser} size="w-20 h-20 text-2xl" />
                        {isOwnProfile && (
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
                            {siteLang === "en" ? "Change" : "تغيير"}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-black text-slate-900">{targetProfileUser}</h3>
                          <RoleIcon username={targetProfileUser} showStudent={true} />
                          <HonorBadge username={targetProfileUser} showText={true} />
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-1 max-w-md">
                          {getProfile(targetProfileUser).bio || (siteLang === "en" ? "No bio yet." : "لا توجد نبذة تعريفية بعد.")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      {isOwnProfile && (
                        <>
                          <button
                            onClick={openProfileEditor}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 font-bold text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5"
                          >
                            <IconPalette size={14} /> {t("editProfile")}
                          </button>

                          {/* History Button (Only for user or owner) */}
                          <button
                            onClick={() => setHistoryModal(true)}
                            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 font-black text-xs border-2 border-amber-600 shadow-[2px_2px_0px_#d97706] flex items-center gap-1.5"
                            title={t("interactionHistory")}
                          >
                            <IconHistory size={14} /> {t("interactionHistory")}
                          </button>
                        </>
                      )}

                      {/* Owner Honor Badge Management Button */}
                      {session?.role === "owner" && targetProfileUser && targetProfileUser !== session.username && (
                        <button
                          onClick={() => handleToggleHonorBadge(targetProfileUser)}
                          className={`px-4 py-2 font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 transition-all ${
                            profiles[targetProfileUser]?.has_honor_badge
                              ? "bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-800"
                              : "bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-800"
                          }`}
                        >
                          <IconAward size={14} className={profiles[targetProfileUser]?.has_honor_badge ? "text-amber-700" : "text-emerald-700"} />
                          <span>
                            {profiles[targetProfileUser]?.has_honor_badge
                              ? (siteLang === "en" ? "Revoke Honor Badge" : "سحب وسام الشرف")
                              : (siteLang === "en" ? "Grant Honor Badge" : "منح وسام الشرف")}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats Grid (No emojis, SVG icons only) */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-t-2 border-slate-100 pt-4 text-center">
                    <div className="bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-lg font-black text-slate-900">{userRegularPosts.length}</div>
                      <div className="text-[10px] font-bold text-slate-500">{t("posts")}</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 p-2.5">
                      <div className="text-lg font-black text-amber-900">{userTeacherReviews.length}</div>
                      <div className="text-[10px] font-bold text-amber-700">{t("teacherReviews")}</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-lg font-black text-slate-900">{userComments.length}</div>
                      <div className="text-[10px] font-bold text-slate-500">{t("comments")}</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5">
                      <div className="text-lg font-black text-emerald-800 flex items-center justify-center gap-1">
                        <IconThumbUp size={15} /> {totalLikesReceived}
                      </div>
                      <div className="text-[10px] font-bold text-emerald-700">{t("likesReceived")}</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 p-2.5">
                      <div className="text-lg font-black text-red-700 flex items-center justify-center gap-1">
                        <IconThumbDown size={15} /> {totalDislikesReceived}
                      </div>
                      <div className="text-[10px] font-bold text-red-600">{t("dislikesReceived")}</div>
                    </div>
                  </div>
                </div>

                {/* Profile Sub-Tabs: Activity vs Bookmarks (المحفوظات) */}
                <div className="flex items-center gap-2 border-b-2 border-slate-200 pb-2">
                  <button
                    onClick={() => setProfileSubTab("activities")}
                    className={`px-4 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all ${
                      profileSubTab === "activities"
                        ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
                    }`}
                  >
                    <IconPen size={13} />
                    <span>{isOwnProfile ? t("tabActivities") : (siteLang === "ar" ? "مشاركات الطالب" : "Student Posts")}</span>
                  </button>
                  {isOwnProfile && (
                    <button
                      onClick={() => setProfileSubTab("saved")}
                      className={`px-4 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all ${
                        profileSubTab === "saved"
                          ? "border-slate-900 bg-amber-400 text-slate-950 shadow-[2px_2px_0px_#000]"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-900"
                      }`}
                    >
                      <IconBookmark size={13} />
                      <span>{t("tabBookmarks")} • {userBookmarks.length}</span>
                    </button>
                  )}
                </div>

                {profileSubTab === "saved" && isOwnProfile ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h3 className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                        <IconBookmark size={16} className="text-amber-500" />
                        <span>{siteLang === "en" ? "Saved Items" : "العناصر المحفوظة للرجوع السريع"} • {userBookmarks.length}</span>
                      </h3>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Saved to your account for quick access anytime" : "تُحفظ بحسابك للرجوع إليها في أي وقت"}</span>
                    </div>

                    {userBookmarks.length === 0 ? (
                      <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center space-y-2">
                        <div className="text-amber-500 flex justify-center"><IconBookmark size={28} /></div>
                        <p className="text-xs font-bold text-slate-600">{t("noBookmarks")}</p>
                        <p className="text-[11px] text-slate-400 font-semibold">{siteLang === "en" ? "Click the bookmark icon on any teacher or post to save it here." : "اضغط زر الحفظ يم أي أستاذ أو منشور حتى تحفظه هنا."}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {userBookmarks.map(b => {
                          const isTeacher = b.type === "teacher";
                          const teacher = isTeacher ? teachers.find(t => t.id === b.targetId) : null;
                          const post = !isTeacher ? posts.find(p => p.id === b.targetId) : null;

                          return (
                            <div
                              key={b.id}
                              className="bg-white border-2 border-slate-900 shadow-[3px_3px_0px_#000] p-4 flex flex-col justify-between gap-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-2 py-0.5 text-[9px] font-black border ${
                                      isTeacher ? "bg-amber-100 text-amber-900 border-amber-600" : "bg-emerald-100 text-emerald-900 border-emerald-600"
                                    }`}>
                                      {isTeacher ? (siteLang === "en" ? "Saved Teacher" : "أستاذ محفوظ") : (siteLang === "en" ? "Saved Post" : "منشور محفوظ")}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold">{getRelativeTime(b.created_at, siteLang)}</span>
                                  </div>
                                  <h4 className="font-black text-sm text-slate-900">{b.title}</h4>
                                  {b.subtitle && <p className="text-xs text-slate-600 font-semibold">{b.subtitle}</p>}
                                  {post && <p className="text-xs text-slate-500 line-clamp-2 mt-1">{post.body}</p>}
                                </div>

                                <button
                                  onClick={() => toggleBookmark(b.targetId, b.type, b.title)}
                                  className="p-1.5 border border-slate-300 hover:border-red-600 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                                  title={siteLang === "en" ? "Remove from bookmarks" : "إزالة من المحفوظات"}
                                >
                                  <IconTrash size={13} />
                                </button>
                              </div>

                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                {isTeacher && teacher ? (
                                  <button
                                    onClick={() => {
                                      setSelectedTeacher(teacher);
                                      setTab("teacher");
                                      window.scrollTo({ top: 0, behavior: "smooth" });
                                    }}
                                    className="text-xs font-black text-emerald-800 hover:underline flex items-center gap-1"
                                  >
                                    {siteLang === "en" ? "Go to teacher profile" : "الانتقال لصفحة الأستاذ"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setTab("feed");
                                      window.scrollTo({ top: 0, behavior: "smooth" });
                                    }}
                                    className="text-xs font-black text-emerald-800 hover:underline flex items-center gap-1"
                                  >
                                    {siteLang === "en" ? "View in feed" : "عرض بساحة النقاش"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                /* Mixed Activity Feed (Posts, Teacher Reviews, Comments) */
                <div className="space-y-4">
                  <h3 className="font-black text-sm text-slate-800 border-b-2 border-slate-200 pb-2">
                    {isOwnProfile
                      ? (siteLang === "en" ? "My Activities & Contributions:" : "سجل نشاطاتي ومشاركاتي:")
                      : (siteLang === "en" ? `Activities of @${targetProfileUser}:` : `نشاطات ومشاركات الطالب @${targetProfileUser}:`)}
                  </h3>

                  {combinedActivities.length === 0 ? (
                    <EmptyStateCard
                      icon={<IconPen size={24} />}
                      title={siteLang === "en" ? "No activities published yet" : "لا توجد نشاطات منشورة بعد"}
                      description={isOwnProfile
                        ? (siteLang === "en" ? "You haven't written any posts, reviews, or comments yet. Join the conversation!" : "لم تنشر أي تقييم أو منشور أو رد بعد. شارك في النقاشات الآن!")
                        : (siteLang === "en" ? "This student has not shared any reviews, questions, or comments yet." : "لم يقم هذا الطالب بنشر أي مراجعات أو أسئلة أو تعليقات حتى الآن.")}
                      actionText={isOwnProfile ? (siteLang === "en" ? "Write a Post" : "اكتب منشوراً جديداً") : undefined}
                      onAction={isOwnProfile ? () => { setTab("feed"); window.scrollTo({ top: 350, behavior: "smooth" }); } : undefined}
                    />
                  ) : (
                    combinedActivities.map(item => {
                      const teacher = item.teacherId ? teachers.find(t => t.id === item.teacherId) : null;
                      const isDislikeReview = item.kind === "review" && (item.grade_level?.includes("لم يعجبني") || item.content?.startsWith("[لم يعجبني"));
                      const isLikeReview = item.kind === "review" && (item.grade_level?.includes("أعجبني") || item.content?.startsWith("[أعجبني"));
                      const isPostOrReview = item.kind === "post" || item.kind === "review";
                      const fullPost = isPostOrReview ? posts.find(p => p.id === item.id) : null;
                      const isCommentsOpen = !!expandedProfileComments[item.id];
                      const postVote = isPostOrReview ? getUserVote(`post_${item.id}`) : null;
                      const commentVote = item.kind === "comment" ? getUserVote(`comment_${item.id}`) : null;

                      return (
                        <div key={item.id} className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-4 space-y-3">
                          {/* Item Header */}
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-0.5 text-[10px] font-black border uppercase tracking-widest flex items-center gap-1 ${
                                item.kind === "post"
                                  ? "border-slate-900 bg-emerald-100 text-emerald-900"
                                  : item.kind === "review"
                                  ? (isDislikeReview ? "border-red-600 bg-red-100 text-red-900" : "border-emerald-600 bg-emerald-100 text-emerald-900")
                                  : "border-blue-600 bg-blue-100 text-blue-900"
                              }`}>
                                {item.kind === "post" ? (
                                  <>
                                    <IconPen size={10} /> {siteLang === "en" ? "Post" : "منشور"}
                                  </>
                                ) : item.kind === "review" ? (
                                  isDislikeReview ? (
                                    <>
                                      <IconThumbDown size={10} /> {siteLang === "en" ? "Don't Recommend" : "ما أنصح بيه"}
                                    </>
                                  ) : (
                                    <>
                                      <IconThumbUp size={10} /> {siteLang === "en" ? "Recommend" : "أنصح بيه"}
                                    </>
                                  )
                                ) : (
                                  <>
                                    <IconComment size={10} /> {siteLang === "en" ? "Comment" : "تعليق"}
                                  </>
                                )}
                              </span>
                              {teacher && (
                                <button
                                  onClick={() => { setSelectedTeacher(teacher); setTab("teacher"); }}
                                  className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
                                >
                                  {siteLang === "en" ? "Teacher:" : "الأستاذ:"} {teacher.name} • {teacher.subject}
                                </button>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(item.created_at, siteLang)}</span>
                          </div>

                          {/* Content */}
                          <div>
                            <h4 className="font-black text-sm text-slate-900">{item.title}</h4>
                            <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                          </div>

                          {/* Interactive Actions Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                            <div className="flex items-center gap-2">
                              {isPostOrReview ? (
                                <>
                                  <button
                                    onClick={() => votePost(item.id, "like")}
                                    className={vbtn(postVote === "like", "like")}
                                    title={siteLang === "en" ? "Like" : "إعجاب"}
                                  >
                                    <IconThumbUp size={12} /> {item.likes}
                                  </button>
                                  <button
                                    onClick={() => votePost(item.id, "dislike")}
                                    className={vbtn(postVote === "dislike", "dislike")}
                                    title={siteLang === "en" ? "Dislike" : "عدم إعجاب"}
                                  >
                                    <IconThumbDown size={12} /> {item.dislikes}
                                  </button>
                                  <button
                                    onClick={() => toggleProfileComments(item.id)}
                                    className={`px-2.5 py-1 border text-xs font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000] active:translate-x-px active:translate-y-px transition-all ${
                                      isCommentsOpen
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-900 bg-white hover:bg-slate-100 text-slate-800"
                                    }`}
                                  >
                                    <IconComment size={12} />
                                    <span>{siteLang === "en" ? "Comments" : "التعليقات"} • {fullPost?.comments?.length || 0}</span>
                                  </button>
                                  <button
                                    onClick={() => openReportModal({ id: item.id, type: "post", title: item.title })}
                                    className="text-[11px] text-slate-500 hover:text-red-600 font-bold flex items-center gap-1 px-1.5 py-1"
                                    title={siteLang === "en" ? "Report content" : "إبلاغ عن محتوى"}
                                  >
                                    <IconFlag size={12} />
                                    <span>{siteLang === "en" ? "Report" : "بلاغ"} • {item.reports || 0}</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => item.postId && voteComment(item.postId, item.id, "like")}
                                    className={`${vbtn(commentVote === "like", "like")} py-0.5 px-2 text-[10px]`}
                                    title={siteLang === "en" ? "Like" : "إعجاب"}
                                  >
                                    <IconThumbUp size={10} /> {item.likes}
                                  </button>
                                  <button
                                    onClick={() => item.postId && voteComment(item.postId, item.id, "dislike")}
                                    className={`${vbtn(commentVote === "dislike", "dislike")} py-0.5 px-2 text-[10px]`}
                                    title={siteLang === "en" ? "Dislike" : "عدم إعجاب"}
                                  >
                                    <IconThumbDown size={10} /> {item.dislikes}
                                  </button>
                                  <button
                                    onClick={() => item.postId && openReportModal({ id: item.id, type: "comment", title: item.content, parentPostId: item.postId })}
                                    className="text-[10px] text-slate-500 hover:text-red-600 font-bold flex items-center gap-0.5 px-1.5 py-1"
                                    title={siteLang === "en" ? "Report this comment" : "إبلاغ عن هذا التعليق"}
                                  >
                                    <IconFlag size={10} />
                                    <span>{siteLang === "en" ? "Report" : "بلاغ"} • {item.reports || 0}</span>
                                  </button>
                                </>
                              )}
                            </div>

                            {(item.kind === "post" || item.kind === "review") && session && (session.username === targetProfileUser || session.role === "owner" || session.role === "mod") && (
                              <button
                                onClick={() => deletePost(item.id)}
                                className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                              >
                                <IconTrash size={12} /> {session.username === targetProfileUser ? (siteLang === "en" ? "Delete" : "حذف") : (siteLang === "en" ? "Admin Delete" : "حذف إداري")}
                              </button>
                            )}
                          </div>

                          {/* Expandable Comments Section for Posts / Reviews in Profile */}
                          {isPostOrReview && isCommentsOpen && (
                            <div className="bg-slate-50 p-3 border-2 border-slate-900 space-y-2.5 text-xs mt-2">
                              <div className="font-bold text-[11px] text-slate-600 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                <IconComment size={12} className="text-emerald-primary" />
                                <span>{siteLang === "en" ? "Comments & Replies" : "الردود والتعليقات"} • {fullPost?.comments?.length || 0}</span>
                              </div>

                              {(() => {
                                const topComments = (fullPost?.comments || []).filter(c => !c.parentId);
                                return topComments.length === 0 ? (
                                  <div className="text-[11px] text-slate-400 py-1 font-semibold">
                                    {siteLang === "en" ? "No comments yet. Be the first to write a comment!" : "لا توجد تعليقات حتى الآن. كن أول من يكتب تعليقاً!"}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {topComments.map(c => renderCommentNode(c, item.id, fullPost?.comments || []))}
                                  </div>
                                );
                              })()}

                              {/* Comment Input */}
                              <div className="flex gap-2 pt-1">
                                <input
                                  type="text"
                                  id={`profile-comment-${item.id}`}
                                  placeholder={siteLang === "en" ? "Write your comment here..." : "اكتب تعليقك هنا..."}
                                  className="flex-1 p-2 bg-white border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                                  onKeyDown={e => {
                                    if (e.key === "Enter") addComment(item.id);
                                  }}
                                />
                                <button
                                  onClick={() => addComment(item.id)}
                                  className="px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all shrink-0"
                                >
                                  {siteLang === "en" ? "Send" : "إرسال"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              </>
            )}
          </section>
        )}


        {/* ──── TAB 5: ADMIN & OWNER CONTROLS (لوحة الإدارة والتحكم) ──── */}
        {tab === "admin" && (
          !canAdmin ? (
            <section className="bg-white border-2 border-red-600 shadow-[4px_4px_0px_#dc2626] p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-red-100 border-2 border-red-600 text-red-700 flex items-center justify-center mx-auto shadow-[2px_2px_0px_#dc2626]">
                <IconShield size={24} />
              </div>
              <h3 className="text-base font-black text-slate-900">{siteLang === "en" ? "Access Restricted" : "الوصول محظور"}</h3>
              <p className="text-xs text-slate-600 font-semibold max-w-sm mx-auto">
                {siteLang === "en" ? "This control center is restricted to platform staff and administrators." : "لوحة التحكم مخصصة فقط للمشرفين وإدارة المنصة."}
              </p>
              <button
                onClick={() => setTab("feed")}
                className="px-5 py-2 bg-slate-900 text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] hover:bg-slate-800"
              >
                {siteLang === "en" ? "Return to Discussions" : "الرجوع لساحة النقاشات"}
              </button>
            </section>
          ) : (
          <section className="space-y-6">
            {/* Header with Role & Authority Info */}
            <div className={`border-2 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
              canOwner
                ? "bg-amber-100 border-slate-900 shadow-[4px_4px_0px_#d97706]"
                : "bg-red-50 border-red-600 shadow-[4px_4px_0px_#dc2626]"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center justify-center font-bold ${
                  canOwner ? "bg-amber-400 text-slate-950" : "bg-red-600 text-white"
                }`}>
                  {canOwner ? <IconCrown size={22} /> : <IconShield size={22} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-black text-base text-slate-900">
                      {siteLang === "en" ? "Administration & Moderation Center" : "لوحة التحكم والإشراف المركزية"}
                    </h2>
                    {canOwner && (
                      <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black text-[10px] border border-slate-900 shadow-[1px_1px_0px_#000]">
                        {siteLang === "en" ? "Owner Authority" : "صلاحيات المالك الكاملة"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                    {canOwner
                      ? (siteLang === "en" ? "Complete governance, staff roles, emergency toggles, audit logs, and maintenance mode." : "إدارة المشرفين، مفاتيح الطوارئ، الصيانة، البلاغات وسجل العمليات الكامل.")
                      : (siteLang === "en" ? "Moderation queue, user discipline, announcements, and content review." : "مراجعة المحتوى والبلاغات، إدارة تنبيهات الموقع، وانضباط الطلاب.")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="px-3 py-1 bg-slate-900 text-white font-black text-xs border border-slate-900">
                  {session?.username} ({session?.role})
                </span>
              </div>
            </div>

            {/* Admin Sub-Tabs Navigation */}
            <div className="bg-white border-2 border-slate-900 shadow-[3px_3px_0px_#000] p-1.5 flex items-center gap-1.5 overflow-x-auto">
              {(canOwner || hasPermission("canModeratePosts")) && (
                <button
                  onClick={() => setAdminSubTab("reports")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "reports"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconShield size={14} />
                  <span>{siteLang === "en" ? "Reports" : "البلاغات"}</span>
                  {reportedPosts.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black rounded-full">
                      {reportedPosts.length}
                    </span>
                  )}
                </button>
              )}
              
              {(canOwner || hasPermission("canManageTickets")) && (
                <button
                  onClick={() => setAdminSubTab("support")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "support"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconLifeBuoy size={14} />
                  <span>{siteLang === "en" ? "Support Tickets" : "تذاكر الدعم"}</span>
                  {supportTickets.filter(t => t.status === "open").length > 0 && (
                    <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-black rounded-full">
                      {supportTickets.filter(t => t.status === "open").length}
                    </span>
                  )}
                </button>
              )}

              {(canOwner || hasPermission("canApproveTeachers")) && (
                <button
                  onClick={() => setAdminSubTab("teachers")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "teachers"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconBook size={14} />
                  <span>{siteLang === "en" ? "Teacher Requests" : "طلبات المعلمين"}</span>
                  {pendingTeachers.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-600 text-white text-[9px] font-black rounded-full">
                      {pendingTeachers.length}
                    </span>
                  )}
                </button>
              )}

              {(canOwner || hasPermission("canDisciplineUsers")) && (
                <button
                  onClick={() => setAdminSubTab("users")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "users"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconUser size={14} />
                  <span>{siteLang === "en" ? "Users & Sanctions" : "المستخدمين"}</span>
                </button>
              )}

              {/* Subtab 2: Announcement - Owner & Authorized Staff Only */}
              {(canOwner || hasPermission("canManageAnnouncements")) && (
                <button
                  onClick={() => setAdminSubTab("announcement")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "announcement"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconPalmTree size={14} />
                  <span>{t("adminSubBanner")}</span>
                  {siteAnnouncement.active && (!siteAnnouncement.expiresAt || siteAnnouncement.expiresAt > Date.now()) && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  )}
                </button>
              )}

              {/* Subtab 3: Audit Log - Owner & Authorized Staff Only */}
              {(canOwner || hasPermission("canViewAuditLog")) && (
                <button
                  onClick={() => setAdminSubTab("audit")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "audit"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconActivity size={14} />
                  <span>{t("adminSubAudit")}</span>
                  <span className="text-[10px] text-slate-400 font-bold">• {auditLogs.length}</span>
                </button>
              )}

              {/* Subtab 4: Word Blacklist Filter */}
              {(canOwner || hasPermission("canManageWordFilter")) && (
                <button
                  onClick={() => setAdminSubTab("filter")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "filter"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconSlash size={14} />
                  <span>{t("adminSubFilter")}</span>
                  <span className="text-[10px] text-slate-400 font-bold">• {customBannedWords.length}</span>
                </button>
              )}

              {/* Subtab 5: Owner & Delegated Authority */}
              {(canOwner || hasPermission("canManageStaff") || hasPermission("canManagePlatformToggles") || hasPermission("canToggleMaintenance") || hasPermission("canExportData")) && (
                <button
                  onClick={() => setAdminSubTab("owner")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "owner"
                      ? "border-slate-900 bg-amber-400 text-slate-950 shadow-[2px_2px_0px_#000]"
                      : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  }`}
                >
                  <IconCrown size={14} />
                  <span>{t("adminSubOwner")}</span>
                </button>
              )}
            </div>

            {adminSubTab === "teachers" && (
              <div className="space-y-6">
                <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                    <h3 className="font-black text-sm flex items-center gap-1.5 text-slate-900">
                      <IconInbox size={16} className="text-emerald-primary" />
                      <span>{siteLang === "en" ? "Teacher Addition Requests" : "طلبات إضافة المدرسين"}</span>
                    </h3>
                    <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold text-xs border border-slate-900">
                        {pendingTeachers.length} {siteLang === "en" ? "pending" : "معلق"}
                      </span>
                    </div>

                    {pendingTeachers.length === 0 ? (
                      <EmptyStateCard
                        icon={<IconBook size={24} />}
                        title={siteLang === "en" ? "No pending teacher requests" : "لا توجد طلبات معلقة"}
                        description={siteLang === "en"
                          ? "All submitted teacher suggestions have been reviewed and resolved."
                          : "تمت مراجعة جميع طلبات اقتراح المدرسين واتخاذ الإجراء اللازم بشأنها."}
                        compact
                      />
                    ) : (
                      <div className="space-y-3">
                        {pendingTeachers.map(t => (
                          <div key={t.id} className="bg-slate-50 p-3 border-2 border-slate-900 shadow-[2px_2px_0px_#000] space-y-2">
                            <div className="flex items-start gap-3">
                              <img src={t.img} alt={t.name} className="w-14 h-14 border-2 border-slate-900 object-cover shrink-0 bg-white" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-black text-sm text-slate-900">{t.name}</h4>
                                <p className="text-xs text-emerald-800 font-bold">{t.subject} • {t.gov}</p>
                                {t.grades && <p className="text-[11px] text-slate-600 font-semibold">{t.grades}</p>}
                                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  {siteLang === "en" ? "Submitted by:" : "مُرسل الطلب:"} <span className="font-bold text-slate-800">{t.createdBy || t.created_by || (siteLang === "en" ? "User" : "مستخدم")}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                              <button onClick={() => approveTeacher(t.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border border-slate-900 flex items-center gap-1 shadow-[1px_1px_0px_#000] active:translate-x-px active:translate-y-px transition-all">
                                <IconCheck size={12} />
                                <span>{siteLang === "en" ? "Approve & Publish" : "قبول ونشر"}</span>
                              </button>
                              <button onClick={() => rejectTeacher(t.id)} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs border border-red-400 flex items-center gap-1 active:translate-x-px active:translate-y-px transition-all">
                                <IconX size={12} />
                                <span>{siteLang === "en" ? "Reject" : "رفض"}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            )}

            {adminSubTab === "reports" && (
              <div className="space-y-6">
                <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                      <h3 className="font-black text-sm flex items-center gap-1 text-slate-900">
                        <IconFlag size={14} className="text-red-600" />
                        <span>{siteLang === "en" ? "Reports & Review Center" : "مركز مراجعة البلاغات والملاحظات"}</span>
                      </h3>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          onClick={() => setAdminReportFilter("pending")}
                          className={`px-2 py-0.5 font-bold border transition-all ${adminReportFilter === "pending" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"}`}
                        >
                          {siteLang === "en" ? "Pending" : "معلقة"}
                        </button>
                        <button
                          onClick={() => setAdminReportFilter("all")}
                          className={`px-2 py-0.5 font-bold border transition-all ${adminReportFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"}`}
                        >
                          {siteLang === "en" ? "All" : "الكل"}
                        </button>
                      </div>
                    </div>

                    {(() => {
                      // Unified report aggregation: ensures all reports and reported posts are combined with zero duplicates
                      const groupsMap: Record<string, any> = {};

                      // 1. Group from reportRecordsList
                      reportRecordsList
                        .filter(r => adminReportFilter === "all" || (r.status || "pending") === adminReportFilter)
                        .forEach(r => {
                          if (dismissedReportIds.has(r.targetId) && r.status === "dismissed") return;
                          if (!groupsMap[r.targetId]) {
                            groupsMap[r.targetId] = {
                              targetId: r.targetId,
                              targetType: r.targetType || "post",
                              targetTitle: r.targetTitle,
                              reportCount: 1,
                              reportsList: [r],
                              allReporters: [r.reporter],
                              allNotes: r.note ? [r.note] : [],
                              reason: r.reason,
                              status: r.status || "pending",
                              created_at: r.created_at,
                            };
                          } else {
                            groupsMap[r.targetId].reportCount++;
                            groupsMap[r.targetId].reportsList.push(r);
                            if (!groupsMap[r.targetId].allReporters.includes(r.reporter)) groupsMap[r.targetId].allReporters.push(r.reporter);
                            if (r.note && !groupsMap[r.targetId].allNotes.includes(r.note)) groupsMap[r.targetId].allNotes.push(r.note);
                          }
                        });

                      // 2. Add posts that have reports > 0 if not already tracked and not dismissed
                      posts.forEach(p => {
                        if (p.reports && p.reports > 0 && !dismissedReportIds.has(p.id) && !groupsMap[p.id]) {
                          if (adminReportFilter === "all" || adminReportFilter === "pending") {
                            groupsMap[p.id] = {
                              targetId: p.id,
                              targetType: "post",
                              targetTitle: p.title,
                              reportCount: p.reports,
                              reportsList: [{
                                id: "rep_post_" + p.id,
                                targetId: p.id,
                                targetType: "post",
                                targetTitle: p.title,
                                reporter: siteLang === "en" ? "Student community users" : "مستخدمين من مجتمع الطلاب",
                                reason: "inappropriate",
                                note: siteLang === "en" ? `${p.reports} reports submitted on this post.` : `تم تقديم ${p.reports} بلاغ على هذا المنشور عبر التطبيق.`,
                                created_at: p.created_at,
                                status: "pending",
                              }],
                              allReporters: [siteLang === "en" ? "Student Community" : "مجتمع الطلاب"],
                              allNotes: [siteLang === "en" ? `${p.reports} reports recorded` : `${p.reports} بلاغات مسجلة`],
                              reason: "inappropriate",
                              status: "pending",
                              created_at: p.created_at,
                            };
                          }
                        }
                      });

                      const aggregatedList = Object.values(groupsMap);

                      if (aggregatedList.length === 0) {
                        return (
                          <EmptyStateCard
                            icon={<IconShield size={24} />}
                            title={siteLang === "en" ? "Reports queue is clear" : "لا توجد بلاغات معلقة"}
                            description={siteLang === "en"
                              ? "There is no reported content pending staff review at the moment."
                              : "تمت مراجعة جميع البلاغات ولا يوجد محتوى مخالف معلق حالياً."}
                            compact
                          />
                        );
                      }

                      return (
                        <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
                          {aggregatedList.map(r => {
                            const targetPost = posts.find(p => p.id === r.targetId);
                            const reasonLabel =
                              r.reason === "inappropriate"
                                ? (siteLang === "en" ? "Inappropriate Content" : "محتوى غير لائق ومسيء")
                                : r.reason === "wrong_info"
                                ? (siteLang === "en" ? "Misleading Information" : "معلومات خاطئة ومضللة")
                                : (siteLang === "en" ? "Policy Violation" : "مخالفة معايير");
                            const isResolved = r.status === "resolved" || r.status === "dismissed";

                            return (
                              <div
                                key={r.targetId}
                                className={`p-4 border-2 space-y-3 transition-all ${isResolved ? "bg-slate-50/70 border-slate-200 opacity-75" : "bg-white border-slate-900 shadow-[3px_3px_0px_#000]"}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-2.5 py-0.5 text-xs font-black border uppercase tracking-wider bg-red-600 text-white border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                      <IconAlertTriangle size={12} className="shrink-0" />
                                      <span>{r.reportCount} {siteLang === "en" ? (r.reportCount > 1 ? "reports" : "report") : (r.reportCount > 1 ? "بلاغات" : "بلاغ")}</span>
                                    </span>
                                    <span className={`px-2 py-0.5 text-[10px] font-black border ${
                                      r.reason === "inappropriate"
                                        ? "bg-red-100 text-red-900 border-red-300"
                                        : "bg-amber-100 text-amber-900 border-amber-300"
                                    }`}>
                                      {reasonLabel}
                                    </span>
                                    <span className="text-[11px] text-slate-600 font-bold">
                                      {siteLang === "en" ? "Reported by:" : "من قِبل:"} <span className="text-slate-900 font-black">{r.allReporters.slice(0, 3).join(", ")}{r.allReporters.length > 3 ? (siteLang === "en" ? ` and ${r.allReporters.length - 3} others` : ` و ${r.allReporters.length - 3} آخرين`) : ""}</span>
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-bold shrink-0">{getRelativeTime(r.created_at, siteLang)}</span>
                                </div>

                                <div className="bg-slate-50 p-2.5 border border-slate-200 text-xs space-y-1">
                                  <div className="font-black text-slate-900 text-sm">{r.targetTitle || targetPost?.title || (siteLang === "en" ? "Target Content" : "محتوى محدد")}</div>
                                  {targetPost?.body && (
                                    <p className="text-[11px] text-slate-600 line-clamp-2">{targetPost.body}</p>
                                  )}
                                  {targetPost && (
                                    <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200 flex items-center justify-between">
                                      <span>{siteLang === "en" ? "Author:" : "الكاتب:"} <strong className="text-slate-900 font-bold">{targetPost.author}</strong></span>
                                      <span>{siteLang === "en" ? "Status:" : "الحالة:"} <strong className={targetPost.status === "hidden" ? "text-red-600 font-bold" : "text-emerald-700 font-bold"}>{targetPost.status === "hidden" ? (siteLang === "en" ? "Hidden" : "مخفي") : (siteLang === "en" ? "Active" : "نشط")}</strong></span>
                                    </div>
                                  )}
                                </div>

                                {/* Click to Inspect Detailed Reports Button */}
                                <button
                                  type="button"
                                  onClick={() => setInspectingReport(r)}
                                  className="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-950 border border-blue-300 text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-[1px_1px_0px_#93c5fd]"
                                >
                                  <IconSearch size={14} className="text-blue-700" />
                                  <span>{siteLang === "en" ? "View reporters and detailed reasons" : "عرض تفاصيل المُبلّغين وأسباب البلاغات"} • {r.reportsList?.length || r.reportCount}</span>
                                </button>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {targetPost && (
                                      targetPost.status === "hidden" ? (
                                        <button
                                          onClick={() => restorePost(targetPost.id)}
                                          className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] border border-emerald-500"
                                        >
                                          {siteLang === "en" ? "Restore" : "إعادة إظهار"}
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => hidePost(targetPost.id)}
                                          className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] border border-amber-500"
                                        >
                                          {siteLang === "en" ? "Hide Content" : "إخفاء المحتوى"}
                                        </button>
                                      )
                                    )}
                                    <button
                                      onClick={() => deleteReportRecordOnly(r.targetId, r.targetType)}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] border border-slate-900 flex items-center gap-1"
                                      title={siteLang === "en" ? "Delete all reports and reset counter" : "حذف جميع البلاغات وتصفير العداد"}
                                    >
                                      <IconTrash size={11} /> {siteLang === "en" ? "Clear Reports" : "حذف البلاغات وتصفير العداد"}
                                    </button>
                                    <button
                                      onClick={() => adminDeleteReportedItem(r.targetId, r.targetType, r.id)}
                                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[11px] border border-red-500 flex items-center gap-1"
                                      title={siteLang === "en" ? "Permanently delete content from platform" : "حذف المنشور أو التعليق نفسه نهائياً من الموقع"}
                                    >
                                      <IconTrash size={11} /> {siteLang === "en" ? "Delete Content" : "حذف المحتوى نهائياً"}
                                    </button>
                                    {targetPost && targetPost.author && (
                                      <button
                                        onClick={() => {
                                          setAdminSelectedUser(targetPost.author);
                                          setAdminWarningReason(siteLang === "en" ? `Community guidelines violation in "${r.targetTitle || targetPost.title}"` : `مخالفة معايير المجتمع في المنشور "${r.targetTitle || targetPost.title}"`);
                                        }}
                                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] border border-slate-400"
                                      >
                                        {siteLang === "en" ? "Warn Author" : "إدارة/إنذار الكاتب"}
                                      </button>
                                    )}
                                  </div>

                                  {!isResolved && (
                                    <button
                                      onClick={() => dismissReport(r.targetId)}
                                      className="text-[10px] font-bold text-slate-500 hover:text-slate-900 underline"
                                    >
                                      {siteLang === "en" ? "Dismiss & Clear" : "تجاهل وتبرئة"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
            )}

            {adminSubTab === "users" && (
              <div className="space-y-6">
                {/* User Disciplinary & Strike Management Center */}
                <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                    <h3 className="font-black text-sm flex items-center gap-1.5 text-slate-900">
                      <IconVolumeX size={16} className="text-red-600" />
                      <span>{siteLang === "en" ? "User Disciplinary Center" : "مركز انضباط وحظر الحسابات"}</span>
                    </h3>
                    <span className="text-[11px] text-slate-500 font-bold">{siteLang === "en" ? "Temporary bans and warnings" : "حظر مؤقت أو إنذارات"}</span>
                  </div>

                  {/* Search user */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 relative">
                      <input
                        type="text"
                        value={adminUserSearch}
                        onChange={e => setAdminUserSearch(e.target.value)}
                        placeholder={siteLang === "en" ? "Search username to manage or penalize..." : "ابحث عن اسم المستخدم لإدارته أو توجيه عقوبة..."}
                        className="w-full p-2.5 ps-8 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                      />
                      <span className="absolute start-2.5 top-3 text-slate-400">
                        <IconSearch size={14} />
                      </span>
                      {adminUserSearch && (
                        <button onClick={() => setAdminUserSearch("")} className="absolute end-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-700" title={siteLang === "en" ? "Clear" : "مسح"}>
                          <IconX size={12} />
                        </button>
                      )}
                    </div>
                    <div>
                      <select
                        value={adminSelectedUser || ""}
                        onChange={e => setAdminSelectedUser(e.target.value || null)}
                        className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none"
                      >
                        <option value="">{siteLang === "en" ? `-- Select a user (${getAllPlatformUsers().length}) --` : `-- اختر طالب من القائمة (${getAllPlatformUsers().length}) --`}</option>
                        {getAllPlatformUsers()
                          .filter(u => !adminUserSearch.trim() || u.username.toLowerCase().includes(adminUserSearch.toLowerCase()))
                          .map(u => (
                            <option key={u.username} value={u.username}>
                              {u.username} - {u.role} {isUserCurrentlyMuted(u.username).muted ? (siteLang === "en" ? "[Banned]" : "[محظور]") : ""}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Selected User Management Card */}
                  {adminSelectedUser ? (() => {
                    const targetUser = getAllPlatformUsers().find(u => u.username === adminSelectedUser);
                    if (!targetUser) return null;
                    const muteStatus = isUserCurrentlyMuted(targetUser.username);
                    const strikes = userStrikes[targetUser.username] || { count: 0, history: [] };

                    return (
                      <div className="bg-slate-50 border-2 border-slate-900 p-4 space-y-4 shadow-[2px_2px_0px_#000]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar username={targetUser.username} size="w-10 h-10 text-base" />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-sm text-slate-900">{targetUser.username}</h4>
                                <span className={`px-2 py-0.5 text-[9px] font-black border border-slate-900 ${
                                  targetUser.role === "owner" ? "bg-amber-400 text-slate-950" : targetUser.role === "mod" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-800"
                                }`}>
                                  {targetUser.role}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                {siteLang === "en" ? "Total recorded warnings:" : "إجمالي الإنذارات المسجلة:"} <strong className="text-red-600">{strikes.count}</strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {muteStatus.muted ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 bg-red-100 border border-red-600 text-red-800 font-black text-xs">
                                  {siteLang === "en" ? `Temporarily Banned • ${muteStatus.remainingText}` : `محظور مؤقتاً • ${muteStatus.remainingText}`}
                                </span>
                                <button
                                  onClick={() => handleUnmuteUser(targetUser.username)}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs border border-slate-900 shadow-[1px_1px_0px_#000]"
                                >
                                  {siteLang === "en" ? "Unban Immediately" : "رفع الحظر فوراً"}
                                </button>
                              </div>
                            ) : (
                              <span className="px-2.5 py-1 bg-emerald-100 border border-emerald-600 text-emerald-800 font-black text-xs">
                                {siteLang === "en" ? "Account is active and not banned" : "الحساب نشط وغير محظور"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Mute controls */}
                        {!muteStatus.muted && targetUser.role !== "owner" && (
                          <div className="bg-white p-3 border border-slate-300 space-y-2.5">
                            <h5 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                              <IconVolumeX size={14} className="text-red-600" />
                              <span>{siteLang === "en" ? "Apply temporary ban on this account:" : "تطبيق حظر مؤقت على هذا الحساب:"}</span>
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{siteLang === "en" ? "Ban Duration" : "مدة الحظر"}</label>
                                <select
                                  value={adminMuteDuration}
                                  onChange={e => setAdminMuteDuration(e.target.value as any)}
                                  className="w-full p-2 bg-slate-50 border border-slate-900 text-xs font-bold"
                                >
                                   <option value="24h">{siteLang === "en" ? "24 Hours" : "٢٤ ساعة"}</option>
                                   <option value="7d">{siteLang === "en" ? "7 Days" : "٧ أيام"}</option>
                                   <option value="30d">{siteLang === "en" ? "30 Days" : "٣٠ يوم"}</option>
                                   <option value="permanent">{siteLang === "en" ? "Permanent Ban" : "حظر دائم"}</option>
                                 </select>
                               </div>
                               <div className="sm:col-span-2">
                                 <label className="block text-[10px] font-bold text-slate-600 mb-0.5">{siteLang === "en" ? "Ban Reason" : "سبب الحظر"}</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={adminMuteReason}
                                    onChange={e => setAdminMuteReason(e.target.value)}
                                    placeholder={siteLang === "en" ? "e.g. Inappropriate language in comments..." : "مثال: ألفاظ غير لائقة في التعليقات..."}
                                    className="flex-1 p-2 bg-slate-50 border border-slate-900 text-xs font-semibold"
                                  />
                                  <button
                                    onClick={() => handleMuteUser(targetUser.username, adminMuteDuration, adminMuteReason)}
                                    className="px-4 bg-red-600 hover:bg-red-700 text-white font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] shrink-0"
                                  >
                                    {siteLang === "en" ? "Apply Ban" : "تطبيق الحظر"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Issue warning controls */}
                        <div className="bg-white p-3 border border-slate-300 space-y-2">
                          <h5 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                            <IconAlertTriangle size={14} className="text-amber-600" />
                            <span>{siteLang === "en" ? "Issue official warning without ban:" : "توجيه إنذار رسمي دون حظر:"}</span>
                          </h5>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={adminWarningReason}
                              onChange={e => setAdminWarningReason(e.target.value)}
                              placeholder={siteLang === "en" ? "Warning notice reason..." : "سبب الإنذار والتنبيه..."}
                              className="flex-1 p-2 bg-slate-50 border border-slate-900 text-xs font-semibold"
                            />
                            <button
                              onClick={() => handleIssueWarning(targetUser.username, adminWarningReason)}
                              className="px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] shrink-0"
                            >
                              {siteLang === "en" ? "Send Warning" : "إرسال الإنذار"}
                            </button>
                          </div>
                        </div>

                        {/* Strike History */}
                        {strikes.history.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-bold text-slate-700 block">
                              {siteLang === "en" ? "Disciplinary and warning history for this student:" : "سجل العقوبات والإنذارات السابقة لهذا الطالب:"}
                            </span>
                            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                              {strikes.history.map((h, idx) => (
                                <div key={idx} className="p-1.5 bg-white border border-slate-200 text-[10px] flex items-center justify-between">
                                  <span className="text-red-700 font-semibold">{h.reason}</span>
                                  <span className="text-slate-400 font-bold shrink-0">{getRelativeTime(h.date, siteLang)} • {siteLang === "en" ? "By" : "بواسطة"}: {h.by}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-300 font-semibold">
                      {siteLang === "en" ? "Select or search for a user above to manage disciplinary actions." : "اختار أو ابحث عن مستخدم أعلاه لإدارة عقوباته أو مراجعة سجله."}
                    </div>
                  )}
                </div>
              </div>
            )}

            {adminSubTab === "support" && (
              <div className="space-y-6">
                <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                    <h3 className="font-black text-sm flex items-center gap-1.5 text-slate-900">
                      <IconLifeBuoy size={16} className="text-blue-600" />
                      <span>{siteLang === "en" ? "Technical Support & Student Inquiries" : "تذاكر الدعم الفني واستفسارات الطلاب"}</span>
                    </h3>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-900 font-bold text-xs border border-slate-900">
                      {supportTickets.length} {siteLang === "en" ? "tickets" : "تذكرة"}
                    </span>
                  </div>

                  {supportTickets.length === 0 ? (
                    <div className="text-xs text-slate-400 py-6 text-center font-semibold border-2 border-dashed border-slate-200">
                      {siteLang === "en" ? "No incoming support tickets currently." : "لا توجد تذاكر دعم فني واردة حالياً."}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {supportTickets.map(ticket => (
                        <div key={ticket.id} className="p-3 border-2 border-slate-900 bg-slate-50 space-y-2 shadow-[2px_2px_0px_#000]">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-xs text-slate-900">{ticket.subject}</span>
                                <span className={`px-2 py-0.5 text-[9px] font-black border border-slate-900 ${ticket.status === "resolved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                                  {ticket.status === "resolved" ? (siteLang === "en" ? "Resolved" : "تمت المعالجة") : (siteLang === "en" ? "Under Review" : "قيد المتابعة")}
                                </span>
                                <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700 border border-slate-400">
                                  {ticket.category}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-semibold mt-1">
                                {siteLang === "en" ? "Sender:" : "المرسل:"} <strong className="text-slate-800">{ticket.sender}</strong> • {new Date(ticket.created_at).toLocaleDateString(siteLang === "en" ? "en-US" : "ar-IQ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 self-end sm:self-start">
                              <button
                                onClick={() => resolveSupportTicket(ticket.id)}
                                className={`px-2.5 py-1 text-xs font-bold border border-slate-900 transition-all ${ticket.status === "resolved" ? "bg-slate-200 text-slate-700" : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[1px_1px_0px_#000]"}`}
                              >
                                {ticket.status === "resolved" ? (siteLang === "en" ? "Reopen" : "إعادة الفتح") : (siteLang === "en" ? "Resolve Ticket" : "معالجة التذكرة")}
                              </button>
                              <button
                                onClick={() => toggleAllowUserReply(ticket.id)}
                                className={`px-2.5 py-1 text-xs font-bold border border-slate-900 transition-all ${ticket.allowUserReply ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}
                              >
                                {ticket.allowUserReply ? (siteLang === "en" ? "Disable User Reply" : "تعطيل رد الطالب") : (siteLang === "en" ? "Enable User Reply" : "تفعيل رد الطالب")}
                              </button>
                              <button
                                onClick={() => deleteSupportTicket(ticket.id)}
                                className="px-2 py-1 text-xs font-bold border border-red-600 bg-red-100 text-red-700 hover:bg-red-200"
                              >
                                {siteLang === "en" ? "Delete" : "حذف"}
                              </button>
                            </div>
                          </div>
                          <div className="bg-white p-2.5 border border-slate-300 text-xs text-slate-700 font-medium whitespace-pre-wrap">
                            {ticket.message}
                          </div>
                          
                          {/* Replies Section */}
                          {ticket.replies && ticket.replies.length > 0 && (
                            <div className="mt-2 space-y-2 border-t border-slate-300 pt-2">
                              {ticket.replies.map(reply => (
                                <div key={reply.id} className="bg-slate-100 p-2 border border-slate-200 text-xs text-slate-700">
                                  <div className="flex justify-between items-center mb-1">
                                    <strong className="text-slate-900">{reply.sender}</strong>
                                    <span className="text-[9px] text-slate-500">{new Date(reply.created_at).toLocaleTimeString(siteLang === "en" ? "en-US" : "ar-IQ")}</span>
                                  </div>
                                  <div className="whitespace-pre-wrap">{reply.message}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reply Input for Admins */}
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={ticketReplyTexts[ticket.id] || ""}
                              onChange={e => setTicketReplyTexts(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                              placeholder={siteLang === "en" ? "Write a reply..." : "اكتب رداً..."}
                              className="flex-1 p-1.5 text-xs border border-slate-300 focus:outline-none focus:border-slate-900"
                            />
                            <button
                              onClick={() => submitSupportReply(ticket.id)}
                              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold border-2 border-slate-900 hover:bg-slate-800"
                            >
                              {siteLang === "en" ? "Send" : "إرسال"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════ SUB-TAB 2: SITE ANNOUNCEMENT BANNER ═══════ */}
            {adminSubTab === "announcement" && (
              <div className="space-y-5">
                <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                    <div>
                      <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                        <IconPalmTree size={18} className="text-blue-900" />
                        <span>{siteLang === "en" ? "Site-Wide Banner" : "شريط التنبيهات العام"}</span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">{siteLang === "en" ? "Shown to all students and visitors upon entering" : "يطلع لكل الطلاب والزوار أول ما يدخلون المنصة"}</p>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-xs font-black text-slate-800">{siteLang === "en" ? "Enable Banner:" : "تفعيل الشريط:"}</span>
                      <input
                        type="checkbox"
                        checked={announcementActive}
                        onChange={e => setAnnouncementActive(e.target.checked)}
                        className="w-5 h-5 accent-emerald-600 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* Preset Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">{siteLang === "en" ? "Select banner style:" : "اختر نوع وطابع التنبيه:"}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setAnnouncementType("ministerial")}
                        className={`p-3 border-2 text-xs font-black flex items-center justify-center gap-2 transition-all ${
                          announcementType === "ministerial"
                            ? "border-slate-900 bg-blue-900 text-white shadow-[2px_2px_0px_#000]"
                            : "border-slate-300 bg-blue-50 text-blue-950 hover:border-slate-900"
                        }`}
                      >
                        <IconPalmTree size={16} />
                        <span>{siteLang === "en" ? "Ministerial Notice" : "بيان وزاري"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAnnouncementType("warning")}
                        className={`p-3 border-2 text-xs font-black flex items-center justify-center gap-2 transition-all ${
                          announcementType === "warning"
                            ? "border-slate-900 bg-amber-400 text-slate-950 shadow-[2px_2px_0px_#000]"
                            : "border-slate-300 bg-amber-50 text-amber-950 hover:border-slate-900"
                        }`}
                      >
                        <IconAlertTriangle size={16} />
                        <span>{siteLang === "en" ? "Urgent Alert" : "تنبيه عاجل"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAnnouncementType("info")}
                        className={`p-3 border-2 text-xs font-black flex items-center justify-center gap-2 transition-all ${
                          announcementType === "info"
                            ? "border-slate-900 bg-emerald-600 text-white shadow-[2px_2px_0px_#000]"
                            : "border-slate-300 bg-emerald-50 text-emerald-950 hover:border-slate-900"
                        }`}
                      >
                        <IconCheck size={16} />
                        <span>{siteLang === "en" ? "Platform Announcement" : "إعلان المنصة"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Auto-Expiration Duration Selector */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <IconClock size={14} className="text-slate-700" />
                        <span>{siteLang === "en" ? "Banner Expiry Duration:" : "مدة ظهور الإعلان قبل التوقف:"}</span>
                      </label>
                      {siteAnnouncement.expiresAt && (
                        <span className={`text-[10px] font-black px-2 py-0.5 border border-slate-900 ${
                          siteAnnouncement.expiresAt <= Date.now()
                            ? "bg-red-200 text-red-950"
                            : "bg-amber-200 text-amber-950"
                        }`}>
                          {siteAnnouncement.expiresAt <= Date.now()
                            ? (siteLang === "en" ? "Banner expired" : "خلص وقت الإعلان")
                            : (siteLang === "en" ? `Expires in: ${Math.max(1, Math.ceil((siteAnnouncement.expiresAt - Date.now()) / (1000 * 60 * 60)))}h` : `ينتهي خلال: ${Math.max(1, Math.ceil((siteAnnouncement.expiresAt - Date.now()) / (1000 * 60 * 60)))} ساعة`)}
                        </span>
                      )}
                    </div>
                    <select
                      value={announcementDuration}
                      onChange={e => setAnnouncementDuration(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:bg-white"
                    >
                      <option value="never">{siteLang === "en" ? "Permanent" : "دائمي"}</option>
                      <option value="1h">{siteLang === "en" ? "1 Hour" : "ساعة واحدة"}</option>
                      <option value="6h">{siteLang === "en" ? "6 Hours" : "٦ ساعات"}</option>
                      <option value="12h">{siteLang === "en" ? "12 Hours" : "١٢ ساعة"}</option>
                      <option value="24h">{siteLang === "en" ? "24 Hours" : "٢٤ ساعة"}</option>
                      <option value="3d">{siteLang === "en" ? "3 Days" : "٣ أيام"}</option>
                      <option value="7d">{siteLang === "en" ? "7 Days" : "٧ أيام"}</option>
                    </select>
                  </div>

                  {/* Text input */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-800">{siteLang === "en" ? "Announcement Text:" : "نص التنبيه أو القرار:"}</label>
                    <textarea
                      value={announcementText}
                      onChange={e => setAnnouncementText(e.target.value)}
                      maxLength={200}
                      rows={3}
                      placeholder={siteLang === "en" ? "Write announcement text here..." : "اكتب هنا الإعلان الوزاري أو التنبيه العام للطلاب..."}
                      className="w-full p-3 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none focus:bg-white resize-none"
                    />
                    <div className="flex justify-end text-[10px] font-bold text-slate-400">
                      {announcementText.length}/200 {siteLang === "en" ? "chars" : "حرف"}
                    </div>
                  </div>

                  {/* Live Preview Box */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <span className="text-xs font-black text-slate-700 block">{siteLang === "en" ? "Live preview for students:" : "معاينة حية للي راح يشوفه الطلاب:"}</span>
                    <div className={`p-4 border-2 border-slate-900 shadow-[3px_3px_0px_#000] flex items-center gap-3 ${
                      announcementType === "ministerial"
                        ? "bg-blue-900 text-white"
                        : announcementType === "warning"
                        ? "bg-amber-400 text-slate-950"
                        : "bg-emerald-600 text-white"
                    }`}>
                      <div className={`p-2 border-2 border-slate-900 shrink-0 ${
                        announcementType === "ministerial" ? "bg-blue-950 text-white" : announcementType === "warning" ? "bg-amber-500 text-slate-950" : "bg-emerald-700 text-white"
                      }`}>
                        {announcementType === "ministerial" ? <IconPalmTree size={18} /> : announcementType === "warning" ? <IconAlertTriangle size={18} /> : <IconCheck size={18} />}
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.2 border border-slate-900 bg-white/20">
                          {announcementType === "ministerial" ? (siteLang === "en" ? "Ministerial Notice" : "بيان وزاري") : announcementType === "warning" ? (siteLang === "en" ? "Urgent Alert" : "تنبيه دراسي عاجل") : (siteLang === "en" ? "Announcement" : "إعلان المنصة")}
                        </span>
                        <p className="font-bold text-xs mt-0.5">{announcementText || (siteLang === "en" ? "Banner text will appear here..." : "نص التنبيه راح يطلع هنا فورا...")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      onClick={() => handleSaveAnnouncement(announcementText, announcementType, announcementActive, announcementDuration)}
                      className="w-full sm:w-auto px-6 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all"
                    >
                      {siteLang === "en" ? "Save & Apply Banner" : "حفظ وتطبيق شريط التنبيه فوراً"}
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteAnnouncement}
                      className="w-full sm:w-auto px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-800 font-black text-xs border-2 border-red-600 shadow-[2px_2px_0px_#991b1b] flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                    >
                      <IconTrash size={14} />
                      <span>{siteLang === "en" ? "Delete Banner" : "حذف التنبيه نهائياً"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════ SUB-TAB 3: AUDIT & ACTIVITY LOG ═══════ */}
            {adminSubTab === "audit" && (
              <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-slate-200 pb-3">
                  <div>
                    <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                      <IconActivity size={16} className="text-emerald-primary" />
                      <span>{siteLang === "en" ? "Audit & Activity Log" : "سجل عمليات الإشراف والمشرفين"}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">{siteLang === "en" ? "Real-time documentation of every administrative action" : "توثيق شامل وفوري لكل إجراء إداري لضمان الشفافية ومتابعة عمل المشرفين"}</p>
                  </div>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-800 font-black text-xs border border-slate-900">
                    {auditLogs.length} {siteLang === "en" ? "actions logged" : "عملية مسجلة"}
                  </span>
                </div>

                {auditLogs.length === 0 ? (
                  <div className="text-xs text-slate-400 py-10 text-center font-semibold border-2 border-dashed border-slate-200">
                    {siteLang === "en" ? "No moderation actions recorded yet." : "لا توجد عمليات إشرافية مسجلة بعد في هذا السجل."}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                    {auditLogs.map(log => (
                      <div key={log.id} className="p-3 bg-slate-50 border-2 border-slate-900 shadow-[1px_1px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-slate-900 text-white font-black text-[10px] border border-slate-900">
                              {log.actor}
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-bold text-[10px] border border-emerald-500">
                              {log.action}
                            </span>
                            <span className="font-black text-xs text-slate-900">
                              {log.target}
                            </span>
                          </div>
                          {log.details && (
                            <p className="text-xs text-slate-600 font-semibold">{log.details}</p>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 shrink-0 self-end sm:self-center">
                          {getRelativeTime(log.timestamp, siteLang)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══════ SUB-TAB 4: WORD FILTER MANAGER ═══════ */}
            {adminSubTab === "filter" && (
              <div className="space-y-5">
                <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-4">
                  <div className="border-b-2 border-slate-200 pb-3">
                    <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                      <IconSlash size={16} className="text-red-600" />
                      <span>{siteLang === "en" ? "Word Filter & Auto Content Moderation" : "إدارة الكلمات المحظورة وفلتر المحتوى التلقائي"}</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {siteLang === "en" ? "Words checked automatically across titles, posts, reviews, and comments to block them instantly" : "يتم فحص هذه الكلمات تلقائياً وبشكل مسبق في عناوين ونصوص المنشورات، التقييمات، والتعليقات لحظر نشرها فوراً"}
                    </p>
                  </div>

                  {/* Add word */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">{siteLang === "en" ? "Add new word to filter:" : "إضافة كلمة جديدة لقائمة الحظر:"}</label>
                    <div className="flex gap-2 max-w-md">
                      <input
                        type="text"
                        value={newBannedWordInput}
                        onChange={e => setNewBannedWordInput(e.target.value)}
                        placeholder={siteLang === "en" ? "Enter forbidden word here..." : "اكتب الكلمة المحظورة هنا..."}
                        className="flex-1 p-2 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                        onKeyDown={e => {
                          if (e.key === "Enter") handleAddBannedWord(newBannedWordInput);
                        }}
                      />
                      <button
                        onClick={() => handleAddBannedWord(newBannedWordInput)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                      >
                        {siteLang === "en" ? "+ Add to Filter" : "+ إضافة للفلتر"}
                      </button>
                    </div>
                  </div>

                  {/* Custom Banned Words */}
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-black text-slate-800 block">
                      {siteLang === "en" ? `Recently Added Custom Words • ${customBannedWords.length}:` : `الكلمات المخصصة المضافة حديثاً • ${customBannedWords.length}:`}
                    </span>
                    {customBannedWords.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">{siteLang === "en" ? "No custom forbidden words added currently." : "لا توجد كلمات مخصصة مضافة حالياً."}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {customBannedWords.map(w => (
                          <span
                            key={w}
                            className="px-2.5 py-1 bg-red-50 border border-red-600 text-red-900 text-xs font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000]"
                          >
                            <span>{w}</span>
                            <button
                              onClick={() => handleRemoveBannedWord(w)}
                              className="text-red-500 hover:text-red-800 font-black text-xs p-0.5"
                              title={siteLang === "en" ? "Remove word from filter" : "إزالة الكلمة من الحظر"}
                            >
                              <IconX size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Built-in Banned Words preview */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-600 block">
                      {siteLang === "en" ? "Default System Banned Words:" : "الكلمات المحظورة الافتراضية في النظام:"}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {getBlockedWordsList().map(w => (
                        <span key={w} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-300">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Sentence Tester */}
                  <div className="bg-slate-50 p-4 border-2 border-slate-900 space-y-2.5 mt-4">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <IconCheck size={14} className="text-emerald-primary" />
                      <span>{siteLang === "en" ? "Sentence Tester:" : "اختبار الفحص الفوري:"}</span>
                    </span>
                    <input
                      type="text"
                      value={filterTestSentence}
                      onChange={e => setFilterTestSentence(e.target.value)}
                      placeholder={siteLang === "en" ? "Test a sentence or comment to check if it gets blocked..." : "جرّب اكتب جملة حتى تفحصها..."}
                      className="w-full p-2.5 bg-white border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                    />
                    {filterTestSentence.trim() && (
                      <div>
                        {containsProfanity(filterTestSentence, customBannedWords) ? (
                          <div className="p-2.5 bg-red-100 border border-red-600 text-red-900 text-xs font-black flex items-center gap-1.5">
                            <IconSlash size={14} />
                            <span>{siteLang === "en" ? "This sentence will be blocked because it contains a forbidden word!" : "هاي الجملة تنحظر لأن بيها كلمة ممنوعة!"}</span>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-emerald-100 border border-emerald-600 text-emerald-900 text-xs font-black flex items-center gap-1.5">
                            <IconCheck size={14} />
                            <span>{siteLang === "en" ? "Sentence is clean and approved for publishing." : "الجملة ما بيها شي ومقبولة للنشر."}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ═══════ SUB-TAB 5: OWNER & DELEGATED GOVERNANCE ═══════ */}
            {adminSubTab === "owner" && (canOwner || hasPermission("canManageStaff") || hasPermission("canManagePlatformToggles") || hasPermission("canToggleMaintenance") || hasPermission("canExportData")) && (() => {
              const allUsers = getAllPlatformUsers();
              const ownerCount = allUsers.filter(u => u.role === "owner").length;
              const modCount = allUsers.filter(u => u.role === "mod").length;
              const studentCount = allUsers.filter(u => u.role === "student").length;
              const totalTeacherLikes = teachers.reduce((acc, t) => acc + (t.likes || 0), 0);
              const totalTeacherDislikes = teachers.reduce((acc, t) => acc + (t.dislikes || 0), 0);
              const totalVotes = totalTeacherLikes + totalTeacherDislikes;
              const approvalRate = totalVotes > 0 ? Math.round((totalTeacherLikes / totalVotes) * 100) : 100;

              return (
                <div className="space-y-6">
                  {/* Exclusive Authority Banner */}
                  <div className="bg-amber-400 border-3 border-slate-900 shadow-[4px_4px_0px_#000] p-4 flex items-center justify-between gap-3 text-slate-950">
                    <div className="flex items-center gap-2.5">
                      <IconCrown size={24} />
                      <div>
                        <h3 className="font-black text-sm">{siteLang === "en" ? "Owner Control Panel" : "لوحة تحكم مالك المنصة"}</h3>
                        <p className="text-xs font-bold opacity-90">{siteLang === "en" ? "Sensitive platform tools restricted to the owner account" : "أدوات حساسة خاصة بمالك المنصة وما يكدر يوصل إلها المشرفين"}</p>
                      </div>
                    </div>
                    <button
                      onClick={exportPlatformBackup}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 shrink-0"
                    >
                      <IconDownload size={14} />
                      <span>{siteLang === "en" ? "Export Backup" : "تصدير نسخة احتياطية"}</span>
                    </button>
                  </div>

                  {/* Section 1: Emergency Platform Toggles */}
                  <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-3">
                    <div className="border-b-2 border-slate-200 pb-2 flex items-center justify-between">
                      <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                        <IconSliders size={16} className="text-amber-600" />
                        <span>{siteLang === "en" ? "Platform Master Controls" : "مفاتيح الطوارئ والتحكم بالمنصة"}</span>
                      </h4>
                      <span className="text-[10px] text-slate-500 font-bold">{siteLang === "en" ? "Instant application for all users" : "تطبيق فوري لجميع المستخدمين"}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Maintenance Mode Toggle */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.maintenanceMode ? "bg-red-50 border-red-600" : "bg-slate-50 border-slate-300"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">{siteLang === "en" ? "Maintenance Mode" : "وضع الصيانة العام"}</span>
                            <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Restrict browsing to staff and owner only" : "حصر التصفح بالمشرفين والمالك بس"}</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ maintenanceMode: !platformSettings.maintenanceMode })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.maintenanceMode ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {platformSettings.maintenanceMode ? (siteLang === "en" ? "Active" : "مفعل") : (siteLang === "en" ? "Disabled" : "معطل")}
                          </button>
                        </div>
                      </div>

                      {/* Allow Registration Toggle */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.allowRegistration ? "bg-emerald-50 border-emerald-500" : "bg-red-50 border-red-600"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">{siteLang === "en" ? "New Signups" : "تسجيل حسابات جديدة"}</span>
                            <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Halt registrations during spam attacks" : "إيقاف التسجيل في حال الهجمات العشوائية"}</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ allowRegistration: !platformSettings.allowRegistration })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.allowRegistration ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                            }`}
                          >
                            {platformSettings.allowRegistration ? (siteLang === "en" ? "Allowed" : "مسموح") : (siteLang === "en" ? "Paused" : "موقف")}
                          </button>
                        </div>
                      </div>

                      {/* Allow Posting Toggle */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.allowPosting ? "bg-emerald-50 border-emerald-500" : "bg-red-50 border-red-600"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">{siteLang === "en" ? "Feed Posting" : "نشر المشاركات بالساحة"}</span>
                            <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Freeze posting during exam periods" : "تجميد النشر أثناء فترات الامتحانات"}</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ allowPosting: !platformSettings.allowPosting })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.allowPosting ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                            }`}
                          >
                            {platformSettings.allowPosting ? (siteLang === "en" ? "Allowed" : "مسموح") : (siteLang === "en" ? "Paused" : "موقف")}
                          </button>
                        </div>
                      </div>

                      {/* Allow Teacher Submissions & Reviews */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.allowTeacherSubmissions ? "bg-emerald-50 border-emerald-500" : "bg-red-50 border-red-600"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">{siteLang === "en" ? "Teacher Suggestions" : "اقتراح أساتذة جدد"}</span>
                            <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Suspend waiting list for review" : "تعليق قائمة الانتظار للمراجعة"}</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ allowTeacherSubmissions: !platformSettings.allowTeacherSubmissions })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.allowTeacherSubmissions ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                            }`}
                          >
                            {platformSettings.allowTeacherSubmissions ? (siteLang === "en" ? "Allowed" : "مسموح") : (siteLang === "en" ? "Paused" : "موقف")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Staff & Role Management */}
                  <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-3">
                    <div className="border-b-2 border-slate-200 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                          <IconShield size={16} className="text-blue-600" />
                          <span>{siteLang === "en" ? "Moderation Staff & Permissions" : "إدارة طاقم المشرفين والصلاحيات"}</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          {siteLang === "en" ? "Search any user to promote to mod or customize their permissions" : "ابحث عن أي طالب لترقيته إلى مشرف أو تعديل صلاحياته"}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-600 shrink-0">
                        {ownerCount} {siteLang === "en" ? "owner" : "مالك"} • {modCount} {siteLang === "en" ? "moderators" : "مشرف"} • {studentCount} {siteLang === "en" ? "students" : "طالب"}
                      </span>
                    </div>

                    {/* User Search & Role Filters Bar */}
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={staffSearchQuery}
                            onChange={e => setStaffSearchQuery(e.target.value)}
                            placeholder={siteLang === "en" ? "Search student or moderator to promote or edit permissions..." : "ابحث بالاسم عن أي طالب أو مشرف لترقيته أو تعديل صلاحياته..."}
                            className="w-full pr-8 pl-8 py-2 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none focus:bg-white"
                          />
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <IconSearch size={14} />
                          </div>
                          {staffSearchQuery && (
                            <button
                              onClick={() => setStaffSearchQuery("")}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                            >
                              <IconX size={13} />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-xs">
                          <button
                            type="button"
                            onClick={() => setStaffRoleFilter("all")}
                            className={`px-3 py-2 font-bold border transition-all ${
                              staffRoleFilter === "all"
                                ? "bg-slate-900 text-white border-slate-900 shadow-[1px_1px_0px_#000]"
                                : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"
                            }`}
                          >
                            {siteLang === "en" ? `All • ${allUsers.length}` : `الكل • ${allUsers.length}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStaffRoleFilter("mod")}
                            className={`px-3 py-2 font-bold border transition-all ${
                              staffRoleFilter === "mod"
                                ? "bg-blue-600 text-white border-slate-900 shadow-[1px_1px_0px_#000]"
                                : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"
                            }`}
                          >
                            {siteLang === "en" ? `Moderators • ${modCount}` : `مشرفين • ${modCount}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStaffRoleFilter("student")}
                            className={`px-3 py-2 font-bold border transition-all ${
                              staffRoleFilter === "student"
                                ? "bg-slate-900 text-white border-slate-900 shadow-[1px_1px_0px_#000]"
                                : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"
                            }`}
                          >
                            {siteLang === "en" ? `Students • ${studentCount}` : `طلاب • ${studentCount}`}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Filtered Users List */}
                    {(() => {
                      const q = staffSearchQuery.trim().toLowerCase();
                      const filteredUsers = allUsers.filter(u => {
                        const matchesQuery = !q || u.username.toLowerCase().includes(q);
                        if (staffRoleFilter === "mod") return matchesQuery && u.role === "mod";
                        if (staffRoleFilter === "student") return matchesQuery && u.role === "student";
                        return matchesQuery;
                      });

                      if (filteredUsers.length === 0) {
                        return (
                          <div className="text-xs text-slate-400 py-8 text-center font-bold border-2 border-dashed border-slate-200">
                            {siteLang === "en" ? `No users match search: "${staffSearchQuery}"` : `لا يوجد أي مستخدم يطابق البحث: "${staffSearchQuery}"`}
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                          {filteredUsers.map(u => {
                            const userPerms = modPermissionsMap[u.username] || DEFAULT_MOD_PERMISSIONS;
                            const grantedCount = Object.values(userPerms).filter(Boolean).length;
                            const hasOwnerPowers = userPerms.canManageAnnouncements || userPerms.canViewAuditLog || userPerms.canManagePlatformToggles || userPerms.canToggleMaintenance || userPerms.canExportData || userPerms.canManageStaff;

                            return (
                              <div key={u.username} className="p-3 bg-slate-50 border-2 border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[2px_2px_0px_#000]">
                                <div className="flex items-center gap-2.5">
                                  <Avatar username={u.username} size="w-9 h-9 text-xs" />
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-black text-xs text-slate-900">{u.username}</span>
                                      <HonorBadge username={u.username} />
                                      <span className={`px-2 py-0.2 text-[9px] font-black border border-slate-900 ${
                                        u.role === "owner" ? "bg-amber-400 text-slate-950" : u.role === "mod" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-800"
                                      }`}>
                                        {u.role === "owner" ? (siteLang === "en" ? "Owner" : "مالك المنصة") : u.role === "mod" ? (siteLang === "en" ? "Moderator" : "مشرف") : (siteLang === "en" ? "Student" : "طالب")}
                                      </span>
                                      {u.role === "mod" && (
                                        <span className={`px-2 py-0.2 text-[9px] font-bold border border-slate-900 ${
                                          hasOwnerPowers ? "bg-amber-200 text-amber-950" : "bg-blue-100 text-blue-900"
                                        }`}>
                                          {grantedCount === 11 ? (siteLang === "en" ? "Full Access" : "كامل الصلاحيات") : (siteLang === "en" ? `${grantedCount} permissions` : `${grantedCount} صلاحيات`)}
                                          {hasOwnerPowers && (siteLang === "en" ? " • Includes Owner Tools" : " • تشمل أدوات المالك")}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                      {u.role === "owner"
                                        ? (siteLang === "en" ? "Platform Owner" : "المالك الأساسي للنظام بصلاحيات كاملة")
                                        : u.role === "mod"
                                        ? (siteLang === "en" ? `Platform Moderator - ${grantedCount} active permissions` : `مشرف بالمنصة - ${grantedCount} صلاحيات مفعلة`)
                                        : (siteLang === "en" ? "Registered Student" : "طالب مسجل في المنصة")}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center">
                                  {u.role === "owner" ? (
                                    <span className="text-[10px] text-amber-900 font-black px-2.5 py-1 bg-amber-100 border border-amber-400 flex items-center gap-1">
                                      <IconCrown size={12} /> {siteLang === "en" ? "Owner Account" : "حساب المالك"}
                                    </span>
                                  ) : u.role === "mod" ? (
                                    <>
                                      <button
                                        onClick={() => openModPermissionModal(u.username)}
                                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1 active:translate-x-px active:translate-y-px transition-all"
                                      >
                                        <IconSliders size={13} />
                                        <span>{siteLang === "en" ? "Edit Permissions" : "تعديل الصلاحيات"}</span>
                                      </button>
                                      <button
                                        onClick={() => handleDemoteToStudent(u.username)}
                                        className="px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs border border-red-400 active:translate-x-px active:translate-y-px transition-all"
                                      >
                                        {siteLang === "en" ? "Demote to Student" : "تخفيض إلى طالب"}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => openModPermissionModal(u.username)}
                                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1.5 active:translate-x-px active:translate-y-px transition-all"
                                    >
                                      <IconKey size={13} />
                                      <span>{siteLang === "en" ? "Promote & Assign Permissions" : "ترقية وتعيين الصلاحيات"}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Section 3: Growth & Platform Analytics Dashboard */}
                  <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-4">
                    <div className="border-b-2 border-slate-200 pb-2 flex items-center justify-between">
                      <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                        <IconAward size={16} className="text-amber-500" />
                        <span>{siteLang === "en" ? "Growth & Activity Analytics" : "لوحة إحصائيات النمو الشاملة"}</span>
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold">{siteLang === "en" ? "Live data" : "بيانات مباشرة"}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-slate-900">{allUsers.length}</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">{siteLang === "en" ? "Total Accounts" : "إجمالي الحسابات"}</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-emerald-700">{teachers.filter(t => t.status === "active").length}</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">{siteLang === "en" ? "Verified Teachers" : "أساتذة معتمدين"}</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-blue-700">{posts.length}</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">{siteLang === "en" ? "Total Posts & Reviews" : "إجمالي المنشورات والتقييمات"}</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-amber-600">{approvalRate}%</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">{siteLang === "en" ? "Teacher Approval Rate" : "متوسط قبول الأساتذة"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
          )
        )}
        </>
        )}

      </main>

      {/* ═══════ MOBILE BOTTOM NAVIGATION BAR ═══════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-border-subtle z-50 flex justify-around py-2 shadow-lg">
        <button onClick={() => setTab("feed")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "feed" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconHome size={20} />{t("navHome")}
        </button>
        <button onClick={() => setTab("directory")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "directory" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconBook size={20} />{t("navTeachers")}
        </button>
        <button onClick={() => { if (!session) { setAuthModal(true); return; } setTab("notifications"); fetchSupabaseData(); }} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 relative ${tab === "notifications" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconBell size={20} />{t("navNotifications")}
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-2 bg-red-600 text-white font-black text-[8px] px-1 rounded-full border border-slate-900">
              {unreadCount}
            </span>
          )}
        </button>
        <button onClick={() => { setViewedUser(session?.username || null); setTab("profile"); }} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "profile" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconUser size={20} />{t("navProfile")}
        </button>
        <button onClick={() => setSettingsModal(true)} className="flex flex-col items-center text-[10px] font-bold py-1 px-2 text-slate-400 hover:text-emerald-primary">
          <IconSettings size={20} />{t("navSettings")}
        </button>
        {canAdmin && (
          <button onClick={() => { setTab("admin"); fetchSupabaseData(); }} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "admin" ? "text-red-600" : "text-slate-400"}`}>
            <IconShield size={20} />{t("navAdmin")}
          </button>
        )}

      </nav>

      {/* ═══════ IN-APP TOAST NOTIFICATIONS (NO BROWSER POPUPS) ═══════ */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[110] w-full max-w-md px-4 pointer-events-none flex flex-col gap-2.5">
        {toasts.map(toast => {
          const isErr = toast.type === "error";
          const isSucc = toast.type === "success";
          const isWarn = toast.type === "warning";
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-3.5 flex items-start gap-3 transition-all animate-in slide-in-from-top-3 duration-200 ${
                isSucc ? "border-l-8 border-l-emerald-600" : isErr ? "border-l-8 border-l-red-600" : isWarn ? "border-l-8 border-l-amber-500" : "border-l-8 border-l-blue-600"
              }`}
            >
              <div className={`w-6 h-6 border border-slate-900 flex items-center justify-center shrink-0 text-white ${
                isSucc ? "bg-emerald-600" : isErr ? "bg-red-600" : isWarn ? "bg-amber-500 text-slate-950" : "bg-blue-600"
              }`}>
                {isSucc ? <IconCheck size={14} /> : isErr ? <IconAlertTriangle size={14} /> : isWarn ? <IconAlertTriangle size={14} /> : <IconInfo size={14} />}
              </div>
              <p className="text-xs font-black text-slate-900 flex-1 leading-relaxed pt-0.5">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="p-1 text-slate-400 hover:text-slate-900 transition-colors"
                title={siteLang === "en" ? "Dismiss" : "إغلاق"}
              >
                <IconX size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ═══════ IN-APP CONFIRMATION MODAL ═══════ */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[105] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-900 shadow-[6px_6px_0px_#000] w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 border-b-2 border-slate-100 pb-2.5">
              <div className={`w-8 h-8 border-2 border-slate-900 flex items-center justify-center shrink-0 ${
                confirmDialog.isDestructive ? "bg-red-600 text-white shadow-[2px_2px_0px_#000]" : "bg-emerald-primary text-white shadow-[2px_2px_0px_#000]"
              }`}>
                <IconAlertTriangle size={16} />
              </div>
              <h3 className="font-black text-sm text-slate-900">{confirmDialog.title}</h3>
            </div>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
              >
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 ${confirmDialog.isDestructive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-primary hover:bg-emerald-dark text-white"} text-xs font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ AUTH MODAL ═══════ */}
      {authModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4">
            {/* Clear Mode Switch Tabs */}
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setIsRegister(false); setAuthError(""); if (!turnstileServerVerified) resetTurnstile(); }}
                  className={`px-4 py-2 text-xs font-black border-2 border-slate-900 transition-all ${
                    !isRegister
                      ? "bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {siteLang === "en" ? "Sign In" : "تسجيل الدخول"}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsRegister(true); setAuthError(""); if (!turnstileServerVerified) resetTurnstile(); }}
                  className={`px-4 py-2 text-xs font-black border-2 border-slate-900 transition-all ${
                    isRegister
                      ? "bg-emerald-primary text-white shadow-[2px_2px_0px_#000]"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {siteLang === "en" ? "Create Account" : "إنشاء حساب جديد"}
                </button>
              </div>
              <button
                onClick={() => { setAuthModal(false); resetTurnstile(); }}
                className="p-1 hover:bg-slate-100 rounded border border-transparent hover:border-slate-400"
                title={siteLang === "en" ? "Close" : "إغلاق"}
              >
                <IconX size={18} />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 font-bold">
              {isRegister
                ? (siteLang === "en" ? "Join for free to participate in discussions and rate teachers" : "سوي حساب للمشاركة ونقاش الأساتذة وتقييمهم")
                : (siteLang === "en" ? "Welcome back! Sign in to continue" : "هلا بيك! سجل دخولك حتى تكمل")}
            </p>

            {authError && <div className="p-2.5 bg-red-100 border border-red-400 text-red-700 text-xs font-bold leading-relaxed">{authError}</div>}
            
            {!isRegister && lockoutRemaining > 0 && (
              <div className="p-2.5 bg-amber-100 border-2 border-amber-600 text-amber-900 text-xs font-bold text-center">
                {siteLang === "en" ? "Login temporarily locked! Please wait: " : "تم قفل تسجيل الدخول مؤقتاً! يرجى الانتظار: "}<span className="font-black text-sm">{lockoutRemaining} {siteLang === "en" ? "seconds" : "ثانية"}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">{siteLang === "en" ? "Username" : "اسم المستخدم"}</label>
                <input
                  type="text"
                  value={authUser}
                  onChange={e => setAuthUser(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none"
                  placeholder={siteLang === "en" ? "Username" : "اسم المستخدم"}
                />
              </div>
              <div>
                <label className="block font-bold mb-1">
                  {siteLang === "en" ? "Password" : "كلمة المرور"}
                </label>
                <input
                  type="password"
                  value={authPass}
                  onChange={e => setAuthPass(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none"
                  placeholder="••••••••"
                />
                {isRegister && authPass.length > 0 && (
                  <div className="mt-2 space-y-1 text-[11px] font-bold">
                    <p className={`flex items-center gap-1.5 ${authPass.length >= 8 ? "text-emerald-600" : "text-slate-400"}`}>
                      {authPass.length >= 8 ? <IconCheck size={12} /> : <span className="w-2.5 h-2.5 rounded-full border border-current inline-block" />}
                      <span>{siteLang === "en" ? "At least 8 characters" : "٨ أحرف على الأقل"}</span>
                    </p>
                    <p className={`flex items-center gap-1.5 ${/[0-9]/.test(authPass) ? "text-emerald-600" : "text-slate-400"}`}>
                      {/[0-9]/.test(authPass) ? <IconCheck size={12} /> : <span className="w-2.5 h-2.5 rounded-full border border-current inline-block" />}
                      <span>{siteLang === "en" ? "Contains a number" : "بيها رقم"}</span>
                    </p>
                    <p className={`flex items-center gap-1.5 ${/[A-Z]/.test(authPass) ? "text-emerald-600" : "text-slate-400"}`}>
                      {/[A-Z]/.test(authPass) ? <IconCheck size={12} /> : <span className="w-2.5 h-2.5 rounded-full border border-current inline-block" />}
                      <span>{siteLang === "en" ? "Contains uppercase letter" : "بيها حرف جبير"}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Cloudflare Turnstile Human Verification */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800 flex items-center gap-1">
                    <span>{siteLang === "en" ? "Security Verification:" : "التحقق الأمني:"}</span>
                  </label>
                  {turnstileServerVerified ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-700 font-black flex items-center gap-1">
                        <IconCheck size={12} className="text-emerald-700" /> {siteLang === "en" ? "Verified" : "تم التحقق"}
                      </span>
                      <button
                        type="button"
                        onClick={resetTurnstile}
                        className="text-[10px] text-slate-500 hover:text-slate-900 underline font-bold"
                        title={siteLang === "en" ? "Reset verification" : "إعادة تعيين التحقق"}
                      >
                        {siteLang === "en" ? "Retry" : "إعادة التحقق"}
                      </button>
                    </div>
                  ) : turnstileToken ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-700 font-black flex items-center gap-1">
                        <IconCheck size={12} className="text-emerald-700" /> {siteLang === "en" ? "Ready" : "جاهز"}
                      </span>
                      <button
                        type="button"
                        onClick={resetTurnstile}
                        className="text-[10px] text-slate-500 hover:text-slate-900 underline font-bold"
                        title={siteLang === "en" ? "Reset verification" : "إعادة تعيين التحقق"}
                      >
                        {siteLang === "en" ? "Retry" : "إعادة التحقق"}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-semibold">{siteLang === "en" ? "Required" : "مطلوب"}</span>
                  )}
                </div>
                <Turnstile
                  action="auth"
                  resetKey={turnstileResetKey}
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                  onError={handleTurnstileError}
                />
              </div>

              <button
                onClick={handleAuth}
                disabled={(!isRegister && lockoutRemaining > 0) || !turnstileToken || authSubmitting}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:bg-slate-300 disabled:text-slate-500 disabled:border-slate-400 disabled:shadow-none transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {authSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    <span>{siteLang === "en" ? "Verifying..." : "جاري التحقق والربط..."}</span>
                  </span>
                ) : !isRegister && lockoutRemaining > 0 ? (
                  <span>{siteLang === "en" ? `Locked - ${lockoutRemaining}s remaining` : `مقفل مؤقتاً - باقي ${lockoutRemaining} ثانية`}</span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    {isRegister ? <IconCheck size={14} /> : <IconArrowRight size={14} className="rtl:rotate-180" />}
                    <span>{isRegister ? (siteLang === "en" ? "Create New Account" : "إنشاء حساب جديد") : (siteLang === "en" ? "Log In" : "تسجيل الدخول")}</span>
                  </span>
                )}
              </button>
            </div>
            <div className="text-center pt-1 border-t border-slate-200">
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setAuthError("");
                }}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-bold underline"
              >
                {isRegister
                  ? (siteLang === "en" ? "Already have an account? Click to sign in" : "لديك حساب بالفعل؟ اضغط لتسجيل الدخول")
                  : (siteLang === "en" ? "Don't have an account yet? Click to register" : "ليس لديك حساب بعد؟ اضغط لإنشاء حساب جديد")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ CREATE POST MODAL ═══════ */}
      {postModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <h3 className="font-black text-base">{siteLang === "en" ? "Create New Post" : "نشر مشاركة جديدة"}</h3>
              <button onClick={() => setPostModal(false)} title={siteLang === "en" ? "Close" : "إغلاق"}><IconX size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-800">
                    {siteLang === "en" ? "Related Teacher" : "الأستاذ المعني"}
                  </label>
                  {postTeacher && (
                    <button
                      type="button"
                      onClick={() => setPostTeacher("")}
                      className="text-[10px] text-red-600 hover:underline font-bold"
                    >
                      {siteLang === "en" ? "Clear selection" : "إلغاء التحديد"}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={postTeacherSearch}
                      onChange={e => setPostTeacherSearch(e.target.value)}
                      placeholder={siteLang === "en" ? "Search teacher by name, subject, or governorate..." : "ابحث عن الأستاذ بالاسم، المادة أو المحافظة..."}
                      className="w-full p-2 ps-8 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                    />
                    <span className="absolute start-2.5 top-2.5 text-slate-500 pointer-events-none">
                      <IconSearch size={13} />
                    </span>
                    {postTeacherSearch && (
                      <button
                        type="button"
                        onClick={() => setPostTeacherSearch("")}
                        className="absolute end-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-700"
                        title={siteLang === "en" ? "Clear" : "مسح"}
                      >
                        <IconX size={12} />
                      </button>
                    )}
                  </div>

                  <select
                    value={postTeacher}
                    onChange={e => setPostTeacher(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none text-xs"
                  >
                    <option value="">
                      {siteLang === "en" ? "-- No Teacher --" : "-- بدون أستاذ --"}
                    </option>
                    {activeTeachers
                      .filter(t => matchesArabicFuzzy(postTeacherSearch, t.name, t.normalizedName, t.normalized_name, t.subject, t.gov))
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} - {t.subject} - {t.gov}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* 1-Click Post Tag Selector (Zero typing needed) */}
              <div>
                <label className="block font-bold mb-1.5 text-slate-800">
                  {t("postTypeLabel")}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: "question", label: t("tagQuestion"), icon: <IconHelpCircle size={13} />, color: "bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-500", active: "bg-indigo-600 text-white border-slate-900" },
                    { id: "discussion", label: t("tagDiscussion"), icon: <IconPen size={13} />, color: "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-400", active: "bg-slate-900 text-white border-slate-900" },
                    { id: "news", label: t("tagNews"), icon: <IconPalmTree size={13} />, color: "bg-blue-50 hover:bg-blue-100 text-blue-950 border-blue-900", active: "bg-blue-900 text-white border-slate-900" },
                    { id: "tips", label: t("tagTips"), icon: <IconCheck size={13} />, color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-500", active: "bg-emerald-600 text-white border-slate-900" },
                    { id: "booklet", label: t("tagBooklet"), icon: <IconBookmark size={13} />, color: "bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-500", active: "bg-blue-600 text-white border-slate-900" },
                    { id: "other", label: t("tagOther"), icon: <IconTag size={13} />, color: "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-400", active: "bg-slate-800 text-white border-slate-900" },
                  ].map(tItem => (
                    <button
                      type="button"
                      key={tItem.id}
                      onClick={() => setPostTag(tItem.id as PostTag)}
                      className={`p-2 border-2 text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-[1px_1px_0px_#000] active:translate-x-px active:translate-y-px ${
                        postTag === tItem.id ? `${tItem.active} shadow-[2px_2px_0px_#000]` : tItem.color
                      }`}
                    >
                      {tItem.icon}
                      <span>{tItem.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">{siteLang === "en" ? "Post Title" : "عنوان المشاركة"}</label>
                <input type="text" value={postTitle} onChange={e => setPostTitle(e.target.value)} maxLength={100} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder={siteLang === "en" ? "Post title" : "عنوان المنشور"} />
                <span className="text-[10px] text-slate-400 font-bold">{postTitle.length}/100</span>
              </div>
              <div>
                <label className="block font-bold mb-1">{siteLang === "en" ? "Content" : "محتوى المنشور"}</label>
                <textarea value={postBody} onChange={e => setPostBody(e.target.value)} maxLength={1500} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold min-h-[100px] resize-none focus:outline-none" placeholder={siteLang === "en" ? "Write something helpful..." : "اكتب هنا..."} />
                <span className="text-[10px] text-slate-400 font-bold">{postBody.length}/1500</span>
              </div>
              <div>
                <label className="block font-bold mb-1">{siteLang === "en" ? "Grade Level" : "المرحلة الدراسية"}</label>
                <select value={postGrade} onChange={e => setPostGrade(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none">
                  <option value="General">{siteLang === "en" ? "General" : "عام لكل المراحل"}</option>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {/* Multi-Image Upload */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  {siteLang === "en" ? "Attach Study Images" : "إرفاق صور الملازم والملخصات"}
                </label>
                <div className="border-2 border-dashed border-slate-300 p-3 bg-slate-50 text-center space-y-2">
                  <input
                    type="file"
                    id="post-images-input"
                    multiple
                    accept="image/*"
                    onChange={handlePostImagesUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="post-images-input"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs border border-slate-900 shadow-[1px_1px_0px_#000] cursor-pointer transition-all ${
                      isCompressingImages ? "opacity-60 cursor-not-allowed pointer-events-none" : ""
                    }`}
                  >
                    <IconImage size={14} className="text-emerald-primary" />
                    <span>
                      {isCompressingImages
                        ? (siteLang === "en" ? "Compressing images..." : "جاري ضغط الصور...")
                        : (siteLang === "en" ? "+ Add images from device" : "+ إضافة صور من جهازك")}
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-500">
                    {siteLang === "en"
                      ? "Images are automatically compressed. Multi-image posts support swipe slider."
                      : "يتم ضغط الصور تلقائياً. المنشورات متعددة الصور تدعم التمرير بالسحب."}
                  </p>

                  {postImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center pt-2">
                      {postImages.map((img, idx) => (
                        <div key={idx} className="relative group w-14 h-14 border border-slate-900 bg-white shadow-[1px_1px_0px_#000]">
                          <img src={img} alt={siteLang === "en" ? `Attachment ${idx + 1}` : `مرفق ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePostImage(idx)}
                            className="absolute -top-1.5 -left-1.5 bg-red-600 text-white w-4 h-4 text-[10px] font-black rounded-full flex items-center justify-center border border-slate-900 hover:bg-red-700"
                            title={siteLang === "en" ? "Remove image" : "حذف الصورة"}
                          >
                            <IconX size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* YouTube URL */}
              <div>
                <label className="block font-bold mb-1 text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <IconVideo size={13} className="text-red-600" />
                    <span>{siteLang === "en" ? "YouTube Explanation Link" : "رابط شرح يوتيوب"}</span>
                  </span>
                  {postYoutube.trim() && !isValidYoutubeUrl(postYoutube) && (
                    <span className="text-[10px] text-red-600 font-bold">
                      {siteLang === "en" ? "Invalid YouTube URL" : "رابط يوتيوب غير صالح"}
                    </span>
                  )}
                </label>
                <input
                  type="url"
                  value={postYoutube}
                  onChange={e => setPostYoutube(e.target.value)}
                  className={`w-full p-2.5 bg-slate-50 border-2 font-semibold focus:outline-none ${
                    postYoutube.trim() && !isValidYoutubeUrl(postYoutube)
                      ? "border-red-600 bg-red-50 text-red-900"
                      : "border-slate-900"
                  }`}
                  placeholder="https://youtube.com/watch?v=... / https://youtu.be/..."
                />
                {postYoutube.trim() && !isValidYoutubeUrl(postYoutube) && (
                  <p className="text-[10px] text-red-600 font-bold mt-1">
                    {siteLang === "en" ? "Must be a valid YouTube link" : "يجب أن يكون الرابط من موقع يوتيوب"}
                  </p>
                )}
              </div>

              <button
                onClick={submitPost}
                disabled={!postTitle.trim() || !postBody.trim() || (!!postYoutube.trim() && !isValidYoutubeUrl(postYoutube))}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {siteLang === "en" ? "Publish Post" : "نشر المشاركة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ADD TEACHER MODAL (المدرسين - قائمة الانتظار) ═══════ */}
      {teacherModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">{siteLang === "en" ? "Suggest a New Teacher" : "إضافة أستاذ جديد"}</h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{siteLang === "en" ? "Will be sent to waiting list for admin review" : "يروح لقائمة الانتظار حتى تراجعه الإدارة"}</p>
              </div>
              <button onClick={() => setTeacherModal(false)} title={siteLang === "en" ? "Close" : "إغلاق"}><IconX size={16} /></button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Box 1: Teacher Name (No name prefilled in box) */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  {siteLang === "en" ? "Teacher Name" : "اسم الأستاذ"} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tName}
                  onChange={e => setTName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none focus:bg-white"
                  placeholder={siteLang === "en" ? "Enter teacher name..." : "اكتب اسم الأستاذ هنا..."}
                />
              </div>

              {/* Box 2: Location / City (Single select from 18 governorates) */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  {siteLang === "en" ? "Governorate" : "محافظة الأستاذ"} <span className="text-red-500">*</span>
                </label>
                <select
                  value={tGov}
                  onChange={e => setTGov(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-bold focus:outline-none cursor-pointer"
                >
                  {GOVERNORATES.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Box 3: Subject Boxes + Other */}
              <div>
                <label className="block font-bold mb-1.5 text-slate-800">
                  {siteLang === "en" ? "Subject" : "المادة الدراسية"} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {SUBJECT_OPTIONS.map(s => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setTSubjectChoice(s)}
                      className={`p-2 text-xs font-bold border-2 transition-all ${
                        tSubjectChoice === s
                          ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#000]"
                          : "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-900"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {tSubjectChoice === "أخرى" && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={tCustomSubject}
                      onChange={e => setTCustomSubject(e.target.value)}
                      placeholder={siteLang === "en" ? "Enter custom subject..." : "اكتب اسم المادة الدراسية غير المتوفرة..."}
                      className="w-full p-2 bg-white border-2 border-emerald-600 text-xs font-semibold focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Box 4: Grades Options (Multiple selection) */}
              <div>
                <label className="block font-bold mb-1.5 text-slate-800">
                  {siteLang === "en" ? "Grade Levels" : "المراحل الدراسية"} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {GRADE_OPTIONS.map(g => {
                    const isSelected = tSelectedGrades.includes(g);
                    return (
                      <button
                        type="button"
                        key={g}
                        onClick={() => {
                          if (isSelected) {
                            setTSelectedGrades(tSelectedGrades.filter(x => x !== g));
                          } else {
                            setTSelectedGrades([...tSelectedGrades, g]);
                          }
                        }}
                        className={`p-2 text-xs font-bold border-2 text-right transition-all flex items-center justify-between ${
                          isSelected
                            ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#000]"
                            : "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-900"
                        }`}
                      >
                        <span>{g}</span>
                        <span>{isSelected ? <IconCheck size={12} /> : <IconPlus size={12} />}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Box: Teaching Mode (حضوري / إلكتروني / كلاهما) */}
              <div>
                <label className="block font-bold mb-1.5 text-slate-800">
                  {siteLang === "en" ? "Teaching Mode" : "طريقة التدريس المتاحة"} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (tTeachingModes.includes("حضوري")) {
                        if (tTeachingModes.length > 1) setTTeachingModes(tTeachingModes.filter(m => m !== "حضوري"));
                      } else {
                        setTTeachingModes([...tTeachingModes, "حضوري"]);
                      }
                    }}
                    className={`p-2.5 text-xs font-bold border-2 text-center transition-all flex items-center justify-between ${
                      tTeachingModes.includes("حضوري")
                        ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#000]"
                        : "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-900"
                    }`}
                  >
                    <span>{siteLang === "en" ? "In-Person" : "حضوري"}</span>
                    <span>{tTeachingModes.includes("حضوري") ? <IconCheck size={12} /> : <IconPlus size={12} />}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (tTeachingModes.includes("إلكتروني")) {
                        if (tTeachingModes.length > 1) setTTeachingModes(tTeachingModes.filter(m => m !== "إلكتروني"));
                      } else {
                        setTTeachingModes([...tTeachingModes, "إلكتروني"]);
                      }
                    }}
                    className={`p-2.5 text-xs font-bold border-2 text-center transition-all flex items-center justify-between ${
                      tTeachingModes.includes("إلكتروني")
                        ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#000]"
                        : "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-900"
                    }`}
                  >
                    <span>{siteLang === "en" ? "Online" : "إلكتروني"}</span>
                    <span>{tTeachingModes.includes("إلكتروني") ? <IconCheck size={12} /> : <IconPlus size={12} />}</span>
                  </button>
                </div>
              </div>

              {/* Box 5: Image File Upload (FILE ONLY, NOT LINK) */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  {siteLang === "en" ? "Teacher Photo" : "صورة الأستاذ"} <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-slate-400 p-4 bg-slate-50 text-center">
                  <input
                    type="file"
                    id="teacher-img-file"
                    accept="image/png, image/jpeg, image/jpg, image/webp, image/*"
                    onChange={handleTeacherImageUpload}
                    className="hidden"
                  />
                  {tImg ? (
                    <div className="flex items-center justify-center gap-4">
                      {/* Medium-sized preview image */}
                      <img
                        src={tImg}
                        alt={siteLang === "en" ? "Teacher preview" : "معاينة الأستاذ"}
                        className="w-20 h-20 border-2 border-slate-900 object-cover shadow-[2px_2px_0px_#000] bg-white"
                      />
                      <div className="text-right space-y-1">
                        <span className="text-xs font-black text-emerald-800 flex items-center gap-1">
                          <IconCheck size={13} className="text-emerald-700" />
                          <span>{siteLang === "en" ? "Photo uploaded successfully" : "تم رفع الصورة بنجاح"}</span>
                        </span>
                        <label
                          htmlFor="teacher-img-file"
                          className="inline-block px-3 py-1 bg-white border border-slate-900 text-xs font-bold cursor-pointer hover:bg-slate-100 shadow-[1px_1px_0px_#000]"
                        >
                          {siteLang === "en" ? "Change photo file" : "تغيير ملف الصورة"}
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="teacher-img-file" className="cursor-pointer block py-2 space-y-1.5">
                      <div className="flex justify-center text-slate-600"><IconCamera size={28} /></div>
                      <div className="text-xs font-black text-slate-800">{siteLang === "en" ? "Click here to choose teacher photo from device" : "اضغط هنا لاختيار ملف صورة الأستاذ من جهازك"}</div>
                      <div className="text-[10px] text-slate-500 font-semibold">{siteLang === "en" ? "JPG, PNG, WebP supported" : "يقبل JPG، PNG، WebP وغيرها"}</div>
                    </label>
                  )}
                </div>
              </div>

              {/* Submit to Waiting List */}
              <button
                onClick={submitTeacher}
                disabled={
                  !tName.trim() ||
                  (tSubjectChoice === "أخرى" ? !tCustomSubject.trim() : !tSubjectChoice) ||
                  tSelectedGrades.length === 0 ||
                  tTeachingModes.length === 0 ||
                  !tImg
                }
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                {siteLang === "en" ? "Submit for Review" : "إرسال للتدقيق"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ REPORT MODAL (بلاغ عن محتوى) ═══════ */}
      {reportTarget && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-900 shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <h3 className="font-black text-base flex items-center gap-2 text-slate-900">
                <IconFlag size={18} className="text-red-600" />
                <span>{siteLang === "en" ? "Report Content" : "إرسال بلاغ عن محتوى"}</span>
              </h3>
              <button
                onClick={() => { setReportTarget(null); setReportNote(""); }}
                className="p-1 hover:bg-slate-100 border border-transparent hover:border-slate-900"
                title={siteLang === "en" ? "Close" : "إغلاق"}
              >
                <IconX size={16} />
              </button>
            </div>

            {reportTarget.title && (
              <div className="p-3 bg-slate-50 border-2 border-slate-200 space-y-1 text-xs">
                <span className="text-[10px] font-bold text-slate-500 block">
                  {reportTarget.type === "post" ? (siteLang === "en" ? "Reported post:" : "المنشور المبلّغ عنه:") : (siteLang === "en" ? "Reported comment:" : "التعليق المبلّغ عنه:")}
                </span>
                <p className="font-bold text-slate-800 line-clamp-2">{reportTarget.title}</p>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-900">
                {siteLang === "en" ? "Select report reason:" : "حدد سبب البلاغ:"} <span className="text-red-500">*</span>
              </label>

              {/* Option 1: Inappropriate */}
              <label
                onClick={() => setReportReason("inappropriate")}
                className={`p-3 border-2 flex items-start gap-3 cursor-pointer transition-all ${
                  reportReason === "inappropriate"
                    ? "border-slate-900 bg-red-50 shadow-[2px_2px_0px_#dc2626]"
                    : "border-slate-300 bg-white hover:border-slate-900"
                }`}
              >
                <input
                  type="radio"
                  name="reportReason"
                  checked={reportReason === "inappropriate"}
                  onChange={() => setReportReason("inappropriate")}
                  className="mt-0.5 accent-red-600"
                />
                <div className="space-y-0.5">
                  <div className="font-black text-slate-900 text-xs">{siteLang === "en" ? "Inappropriate or offensive content" : "محتوى غير لائق أو مسيء"}</div>
                  <div className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Offensive language, harassment, or personal attacks" : "ألفاظ غير مقبولة، تنمر، أو إساءة شخصية"}</div>
                </div>
              </label>

              {/* Option 2: Wrong Info */}
              <label
                onClick={() => setReportReason("wrong_info")}
                className={`p-3 border-2 flex items-start gap-3 cursor-pointer transition-all ${
                  reportReason === "wrong_info"
                    ? "border-slate-900 bg-amber-50 shadow-[2px_2px_0px_#d97706]"
                    : "border-slate-300 bg-white hover:border-slate-900"
                }`}
              >
                <input
                  type="radio"
                  name="reportReason"
                  checked={reportReason === "wrong_info"}
                  onChange={() => setReportReason("wrong_info")}
                  className="mt-0.5 accent-amber-600"
                />
                <div className="space-y-0.5">
                  <div className="font-black text-slate-900 text-xs">{siteLang === "en" ? "False or misleading information" : "معلومات غلط أو مضللة"}</div>
                  <div className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Incorrect info, fake or deceptive reviews" : "بيانات غير صحيحة، تقييم كاذب أو مضلل"}</div>
                </div>
              </label>

              {/* Option 3: Other */}
              <label
                onClick={() => setReportReason("other")}
                className={`p-3 border-2 flex items-start gap-3 cursor-pointer transition-all ${
                  reportReason === "other"
                    ? "border-slate-900 bg-slate-100 shadow-[2px_2px_0px_#000]"
                    : "border-slate-300 bg-white hover:border-slate-900"
                }`}
              >
                <input
                  type="radio"
                  name="reportReason"
                  checked={reportReason === "other"}
                  onChange={() => setReportReason("other")}
                  className="mt-0.5 accent-slate-900"
                />
                <div className="space-y-0.5">
                  <div className="font-black text-slate-900 text-xs">{siteLang === "en" ? "Other reason" : "سالفة ثانية"}</div>
                  <div className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Other violation of platform guidelines" : "مخالفة ثانية لقواعد المنصة"}</div>
                </div>
              </label>

              {/* Note input (up to 50 words) */}
              <div className="pt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    {siteLang === "en" ? "Additional note for moderators:" : "ملاحظة إضافية للمشرفين:"}
                  </label>
                  <span className={`text-[10px] font-bold ${getWordCount(reportNote) > 50 ? "text-red-600 font-black" : "text-slate-500"}`}>
                    {getWordCount(reportNote)} / 50 {siteLang === "en" ? "words" : "كلمة"}
                  </span>
                </div>
                <textarea
                  value={reportNote}
                  onChange={e => {
                    const val = e.target.value;
                    const words = getWordCount(val);
                    if (words <= 50 || val.length < reportNote.length) {
                      setReportNote(val);
                    }
                  }}
                  placeholder={siteLang === "en" ? "Add extra details for moderators..." : "اكتب توضيح إضافي للمشرفين..."}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-semibold min-h-[75px] resize-none focus:outline-none focus:bg-white"
                />
                {getWordCount(reportNote) > 50 && (
                  <p className="text-[10px] text-red-600 font-bold">{siteLang === "en" ? "Word limit reached: 50 words maximum." : "لا يمكن تجاوز الحد الأقصى 50 كلمة."}</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setReportTarget(null); setReportNote(""); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border-2 border-slate-900 transition-all"
                >
                  {siteLang === "en" ? "Cancel" : "إلغاء"}
                </button>
                <button
                  type="button"
                  onClick={submitReport}
                  disabled={getWordCount(reportNote) > 50}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#7f1d1d] disabled:bg-slate-300 disabled:shadow-none transition-all active:translate-x-0.5 active:translate-y-0.5"
                >
                  {siteLang === "en" ? "Submit Report" : "إرسال البلاغ"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ INSPECT REPORT DETAILS MODAL (تفاصيل المُبلّغين والأسباب) ═══════ */}
      {inspectingReport && (
        <div className="fixed inset-0 z-[75] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-3 border-slate-900 shadow-[8px_8px_0px_#000] w-full max-w-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div className="space-y-0.5">
                <h3 className="font-black text-base flex items-center gap-2 text-slate-900">
                  <IconFlag size={20} className="text-red-600" />
                  <span>{siteLang === "en" ? "Report Details & Reporters" : "تفاصيل البلاغات والمُبلّغين"}</span>
                </h3>
                <p className="text-xs text-slate-500 font-semibold">
                  {siteLang === "en" ? "Detailed review of all accounts that submitted reports with reasons and notes" : "مراجعة دقيقة لجميع الحسابات التي قدمت بلاغاً مع الأسباب والملاحظات"}
                </p>
              </div>
              <button
                onClick={() => setInspectingReport(null)}
                className="p-1 hover:bg-slate-100 border border-transparent hover:border-slate-900 transition-all"
                title={siteLang === "en" ? "Close" : "إغلاق"}
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Target Item Details */}
            <div className="bg-slate-50 border-2 border-slate-900 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-slate-900 text-sm">{inspectingReport.targetTitle}</span>
                <span className="px-2.5 py-0.5 bg-red-600 text-white font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1">
                  <IconAlertTriangle size={12} className="shrink-0" />
                  <span>{inspectingReport.reportCount || inspectingReport.reportsList?.length || 1} {siteLang === "en" ? "reports" : "بلاغات"}</span>
                </span>
              </div>
              {(() => {
                const targetPost = posts.find(p => p.id === inspectingReport.targetId);
                return targetPost ? (
                  <div className="space-y-1.5 text-xs">
                    {targetPost.body && (
                      <p className="text-slate-700 bg-white p-2 border border-slate-200 line-clamp-4 leading-relaxed font-medium">
                        {targetPost.body}
                      </p>
                    )}
                    <div className="text-[11px] text-slate-600 pt-1 flex items-center justify-between flex-wrap gap-2">
                      <span>{siteLang === "en" ? "Author:" : "الكاتب:"} <strong className="text-slate-900 font-black">{targetPost.author}</strong></span>
                      <span>{siteLang === "en" ? "Status:" : "الحالة:"} <strong className={targetPost.status === "hidden" ? "text-red-600 font-black" : "text-emerald-700 font-black"}>{targetPost.status === "hidden" ? (siteLang === "en" ? "Hidden" : "مخفي") : (siteLang === "en" ? "Active" : "نشط")}</strong></span>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>

            {/* List of Individual Reports */}
            <div className="space-y-2.5">
              <h4 className="font-black text-xs text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <IconUser size={15} className="text-emerald-700" />
                  <span>{siteLang === "en" ? "Reporters and reasons list:" : "قائمة المُبلّغين والأسباب بالتفصيل:"}</span>
                </span>
                <span className="text-slate-500 font-bold">
                  • {(inspectingReport.reportsList || [inspectingReport]).length} {siteLang === "en" ? "reports" : "بلاغ"}
                </span>
              </h4>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {(inspectingReport.reportsList || [inspectingReport]).map((rep: any, idx: number) => {
                  const reasonLabel =
                    rep.reason === "inappropriate"
                      ? (siteLang === "en" ? "Inappropriate or offensive" : "محتوى غير لائق أو مسيء")
                      : rep.reason === "wrong_info"
                      ? (siteLang === "en" ? "False or misleading info" : "معلومات غلط أو مضللة")
                      : (siteLang === "en" ? "Other reason" : "سالفة ثانية");

                  return (
                    <div
                      key={rep.id || idx}
                      className="p-3 bg-slate-50 border-2 border-slate-900 shadow-[2px_2px_0px_#000] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900 flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full bg-red-600 inline-block"></span>
                          <span>{siteLang === "en" ? "Reporter:" : "مُقدّم البلاغ:"} <strong>{rep.reporter}</strong></span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold">{getRelativeTime(rep.created_at, siteLang)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-black border ${
                          rep.reason === "inappropriate"
                            ? "bg-red-100 text-red-900 border-red-400"
                            : rep.reason === "wrong_info"
                            ? "bg-amber-100 text-amber-900 border-amber-400"
                            : "bg-slate-100 text-slate-800 border-slate-400"
                        }`}>
                          {siteLang === "en" ? "Reason:" : "السبب المختار:"} {reasonLabel}
                        </span>
                      </div>

                      {rep.note ? (
                        <div className="bg-white p-2 border border-slate-300 text-[11px] text-slate-800 font-semibold space-y-0.5">
                          <span className="text-[10px] text-slate-500 font-bold block">{siteLang === "en" ? "Note:" : "الملاحظة المكتوبة:"}</span>
                          <p className="leading-relaxed">"{rep.note}"</p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">{siteLang === "en" ? "No extra notes provided." : "ما انكتبت ملاحظة إضافية ويه هذا البلاغ."}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t-2 border-slate-200 flex flex-wrap gap-2 justify-between items-center text-xs">
              <button
                type="button"
                onClick={() => {
                  deleteReportRecordOnly(inspectingReport.targetId, inspectingReport.targetType);
                  setInspectingReport(null);
                }}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5"
              >
                <IconTrash size={13} />
                <span>{siteLang === "en" ? "Delete all reports & reset counter" : "حذف جميع البلاغات وتصفير العداد"}</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectingReport(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border-2 border-slate-900"
              >
                {siteLang === "en" ? "Close" : "إغلاق النافذة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MOD PERMISSIONS & PROMOTION MODAL ═══════ */}
      {permModalUser && (
        <div className="fixed inset-0 z-[75] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border-3 border-slate-900 shadow-[8px_8px_0px_#000] w-full max-w-2xl my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b-2 border-slate-900 bg-slate-50 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-base sm:text-lg text-slate-900 flex items-center gap-2">
                    <IconKey size={20} className="text-amber-500" />
                    <span>{siteLang === "en" ? "Assign Moderator Permissions:" : "تخصيص وتعيين صلاحيات المشرف:"}</span>
                    <span className="text-emerald-primary">{permModalUser}</span>
                  </h3>
                  <span className={`px-2 py-0.5 text-[10px] font-black border border-slate-900 ${
                    permModalRole === "mod" ? "bg-blue-600 text-white" : "bg-amber-400 text-slate-950"
                  }`}>
                    {permModalRole === "mod" ? (siteLang === "en" ? "Current Moderator" : "مشرف حالي") : (siteLang === "en" ? "Student Promotion" : "ترقية طالب")}
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-semibold">
                  {siteLang === "en" ? "Specify exact permissions for this moderator in the control panel" : "حدد بدقة ما يُسمح لهذا المشرف تنفيذه في لوحة التحكم"}
                </p>
              </div>
              <button
                onClick={() => setPermModalUser(null)}
                className="p-1 hover:bg-slate-200 border-2 border-slate-900 shadow-[1px_1px_0px_#000] shrink-0 active:translate-x-px active:translate-y-px"
                title={siteLang === "en" ? "Close" : "إغلاق"}
              >
                <IconX size={16} />
              </button>
            </div>

            {/* Quick Presets Bar */}
            <div className="px-4 sm:px-5 py-3 bg-slate-100 border-b-2 border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs font-bold">
              <span className="text-slate-600 font-black">{siteLang === "en" ? "Quick Presets:" : "قوالب الصلاحيات السريعة:"}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPermForm({ ...DEFAULT_MOD_PERMISSIONS })}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-900 border border-slate-900 shadow-[1px_1px_0px_#000] text-[11px] font-black"
                >
                  {siteLang === "en" ? "Standard Moderator" : "مشرف قياسي"}
                </button>
                <button
                  type="button"
                  onClick={() => setPermForm({ ...FULL_OWNER_PERMISSIONS })}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 border border-slate-900 shadow-[1px_1px_0px_#000] text-[11px] font-black flex items-center gap-1"
                >
                  <IconCrown size={12} />
                  <span>{siteLang === "en" ? "Full Permissions" : "كامل الصلاحيات"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const allFalse: ModPermissions = {
                      canApproveTeachers: false,
                      canModeratePosts: false,
                      canManageTickets: false,
                      canDisciplineUsers: false,
                      canManageWordFilter: false,
                      canManageAnnouncements: false,
                      canViewAuditLog: false,
                      canManagePlatformToggles: false,
                      canToggleMaintenance: false,
                      canExportData: false,
                      canManageStaff: false,
                    };
                    setPermForm(allFalse);
                  }}
                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 border border-slate-400 text-[11px]"
                >
                  {siteLang === "en" ? "Clear All" : "إلغاء الكل"}
                </button>
              </div>
            </div>

            {/* Scrollable Checkbox Groups */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs">
              {/* Group 1: Standard Moderation Powers */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b-2 border-slate-200 pb-1.5">
                  <IconShield size={16} className="text-blue-600" />
                  <h4 className="font-black text-xs text-slate-900 uppercase">
                    {siteLang === "en" ? "1. Standard Moderation Powers" : "١. الصلاحيات الإشرافية الأساسية"}
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-slate-50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canApproveTeachers}
                      onChange={e => setPermForm(prev => ({ ...prev, canApproveTeachers: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Approve & Reject Teachers" : "قبول ورفض الأساتذة"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Review submissions in waiting list" : "مراجعة طلبات إضافة الأساتذة في قائمة الانتظار واعتمادها"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-slate-50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canModeratePosts}
                      onChange={e => setPermForm(prev => ({ ...prev, canModeratePosts: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Moderate Posts & Reports" : "إدارة المشاركات والبلاغات"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Delete or hide posts, comments, and handle reports" : "حذف أو إخفاء المنشورات والتعليقات ومعالجة البلاغات"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-slate-50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canManageTickets}
                      onChange={e => setPermForm(prev => ({ ...prev, canManageTickets: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Support Tickets" : "تذاكر الدعم الفني"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Resolve student support inquiries" : "معالجة وحل استفسارات وتذاكر الدعم الفني"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-slate-50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canDisciplineUsers}
                      onChange={e => setPermForm(prev => ({ ...prev, canDisciplineUsers: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Discipline & User Bans" : "الانضباط وحظر الحسابات"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Issue warnings and ban accounts temporarily or permanently" : "توجيه إنذارات وحظر الحسابات مؤقتاً أو نهائياً"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-slate-50 transition-all select-none sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={permForm.canManageWordFilter}
                      onChange={e => setPermForm(prev => ({ ...prev, canManageWordFilter: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Profanity Filter" : "فلتر الكلمات المحظورة"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Add or remove blocked words" : "إضافة وإزالة الكلمات المحظورة من فلتر الحظر"}</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Group 2: Owner Delegated Powers */}
              <div className="p-4 border-2 border-amber-400 bg-amber-50/70 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b-2 border-amber-300 pb-2">
                  <div className="flex items-center gap-2">
                    <IconCrown size={18} className="text-amber-700" />
                    <h4 className="font-black text-xs text-amber-950 uppercase">
                      {siteLang === "en" ? "2. Owner Delegated Powers" : "٢. صلاحيات الإدارة العليا المفوضة"}
                    </h4>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 bg-amber-300 text-amber-950 border border-slate-900">
                    {siteLang === "en" ? "Sensitive Tools" : "أدوات حساسة"}
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 font-semibold">
                  {siteLang === "en" ? "Warning: Granting these gives access to platform announcements, emergency controls, and maintenance" : "تحذير: تفعيل هذه الصلاحيات يمنح المشرف وصولاً لأدوات شريط التنبيهات، مفاتيح الطوارئ، والصيانة"}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-amber-100/50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canManageAnnouncements}
                      onChange={e => setPermForm(prev => ({ ...prev, canManageAnnouncements: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-amber-500"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Site Announcements" : "شريط التنبيهات العام"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Publish and edit announcements across the site" : "نشر وتعديل وحذف التنبيهات والبيانات في أعلى الموقع"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-amber-100/50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canViewAuditLog}
                      onChange={e => setPermForm(prev => ({ ...prev, canViewAuditLog: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-amber-500"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Audit Log Access" : "الاطلاع على سجل العمليات"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Review moderator action history" : "مراجعة تقرير وتاريخ تصرفات المشرفين والأنشطة الإدارية"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-amber-100/50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canManagePlatformToggles}
                      onChange={e => setPermForm(prev => ({ ...prev, canManagePlatformToggles: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-amber-500"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Emergency Toggles" : "مفاتيح طوارئ المنصة"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Pause or resume registrations, posting, and suggestions" : "تعليق أو تفعيل التسجيل، النشر، واقتراح الأساتذة"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-amber-100/50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canToggleMaintenance}
                      onChange={e => setPermForm(prev => ({ ...prev, canToggleMaintenance: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-amber-500"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Maintenance Mode" : "وضع الصيانة العام"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Activate maintenance mode and restrict browsing" : "تفعيل شاشة الصيانة وحجب التصفح عن عامة الطلاب"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-amber-100/50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canExportData}
                      onChange={e => setPermForm(prev => ({ ...prev, canExportData: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-amber-500"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Export Backup" : "تصدير النسخة الاحتياطية"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Download complete JSON database backup" : "تحميل ملف شامل لجميع بيانات المنصة"}</span>
                    </div>
                  </label>

                  <label className="p-3 border-2 border-slate-900 bg-white flex items-start gap-2.5 cursor-pointer shadow-[2px_2px_0px_#000] hover:bg-amber-100/50 transition-all select-none">
                    <input
                      type="checkbox"
                      checked={permForm.canManageStaff}
                      onChange={e => setPermForm(prev => ({ ...prev, canManageStaff: e.target.checked }))}
                      className="w-4 h-4 mt-0.5 accent-amber-500"
                    />
                    <div>
                      <span className="font-black text-slate-900 block">{siteLang === "en" ? "Staff Governance" : "إدارة وترقية المشرفين"}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Promote students and manage staff permissions" : "ترقية طلاب وتعديل صلاحيات باقي الكادر"}</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t-2 border-slate-900 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-600">
                {siteLang === "en" ? "Selected permissions: " : "الصلاحيات المحددة: "} <strong className="text-slate-950 font-black">{Object.values(permForm).filter(Boolean).length}</strong> / 11
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPermModalUser(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs border border-slate-900 transition-all"
                >
                  {siteLang === "en" ? "Cancel" : "إلغاء"}
                </button>
                <button
                  type="button"
                  onClick={handleSaveModPermissions}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
                >
                  {siteLang === "en" ? "Save & Apply Permissions" : "حفظ وتطبيق الصلاحيات فوراً"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ PROFILE EDIT MODAL ═══════ */}
      {profileModal && session && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <h3 className="font-black text-base flex items-center gap-1.5"><IconCamera size={16} /> {siteLang === "en" ? "Edit Profile & Photo" : "تعديل الملف الشخصي والصورة"}</h3>
              <button onClick={() => setProfileModal(false)} title={siteLang === "en" ? "Close" : "إغلاق"}><IconX size={16} /></button>
            </div>
            <div className="space-y-4 text-xs">
              
              {/* Custom Image Upload (Screenshots, JPG, PNG, WebP) */}
              <div className="bg-slate-50 border-2 border-slate-900 p-3 space-y-2">
                <label className="block font-bold text-slate-800">
                  {siteLang === "en" ? "Profile Picture:" : "صورة الحساب الشخصية:"}
                </label>
                <div className="flex items-center gap-3">
                  {editPfpUrl ? (
                    <div className="w-14 h-14 border-2 border-slate-900 overflow-hidden shrink-0 bg-white">
                      <img src={editPfpUrl} alt={siteLang === "en" ? "Preview" : "معاينة"} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 border-2 border-slate-900 flex items-center justify-center font-black text-white text-lg shrink-0" style={{ backgroundColor: editColor }}>
                      {session.username.substring(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="space-y-1.5 flex-1">
                    <label className="block">
                      <span className="sr-only">{siteLang === "en" ? "Choose image" : "اختر صورة"}</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp, image/*"
                        onChange={handlePfpUpload}
                        className="block w-full text-xs text-slate-500 file:mr-0 file:py-1.5 file:px-3 file:border-2 file:border-slate-900 file:text-xs file:font-black file:bg-emerald-primary file:text-white hover:file:bg-emerald-dark cursor-pointer"
                      />
                    </label>
                    <p className="text-[10px] text-slate-500">{siteLang === "en" ? "Supports screenshots, JPG, PNG, WebP, etc." : "يقبل الصور، السكرين شوت، JPG، PNG، WebP وغيرها."}</p>
                    {editPfpUrl && (
                      <button
                        type="button"
                        onClick={() => setEditPfpUrl("")}
                        className="text-[10px] text-red-600 font-bold hover:underline"
                      >
                        {siteLang === "en" ? "Remove picture & use color icon" : "حذف الصورة واستخدام الرمز اللوني"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Color Picker (Fallback if no custom image) */}
              <div>
                <label className="block font-bold mb-2">{siteLang === "en" ? "Avatar Color:" : "لون الرمز الشخصي:"}</label>
                <div className="flex gap-2 flex-wrap">
                  {AVATAR_COLORS.map(c => (
                    <button key={c} onClick={() => setEditColor(c)}
                      className={`w-9 h-9 border-2 flex items-center justify-center font-black text-white text-xs ${editColor === c ? "border-slate-900 shadow-[2px_2px_0px_#000]" : "border-slate-300"}`}
                      style={{ backgroundColor: c }}>
                      {editColor === c ? <IconCheck size={14} className="text-white" /> : session.username.substring(0, 1).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Profile Banner & Custom Styling */}
              <div className="bg-slate-50 border-2 border-slate-900 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800">
                    {t("customizeProfile")}
                  </label>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 border border-emerald-500">
                    Neo-Brutalist Banner
                  </span>
                </div>

                {/* Real-time Banner Preview */}
                <div
                  className="w-full h-20 border-2 border-slate-900 relative overflow-hidden flex items-end justify-between p-2 shadow-[2px_2px_0px_#000]"
                  style={
                    editBannerUrl
                      ? { backgroundImage: `url(${editBannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                      : editBannerPattern === "stripes"
                      ? { backgroundColor: editBannerColor, backgroundImage: `repeating-linear-gradient(45deg, rgba(0,0,0,0.15) 0, rgba(0,0,0,0.15) 10px, transparent 10px, transparent 20px)` }
                      : editBannerPattern === "dots"
                      ? { backgroundColor: editBannerColor, backgroundImage: `radial-gradient(rgba(0,0,0,0.2) 2px, transparent 2px)`, backgroundSize: "14px 14px" }
                      : editBannerPattern === "grid"
                      ? { backgroundColor: editBannerColor, backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.15) 1px, transparent 1px)`, backgroundSize: "16px 16px" }
                      : editBannerPattern === "gradient"
                      ? { background: `linear-gradient(135deg, ${editBannerColor} 0%, #0f172a 100%)` }
                      : { backgroundColor: editBannerColor }
                  }
                >
                  <span className="text-[10px] font-black bg-white/90 px-1.5 py-0.5 border border-slate-900">
                    {siteLang === "ar" ? "معاينة الغلاف" : "Banner Preview"}
                  </span>
                </div>

                {/* Pattern Selector */}
                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1.5">
                    {t("bannerPattern")}
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {[
                      { id: "none", label: t("patternNone") },
                      { id: "stripes", label: t("patternStripes") },
                      { id: "dots", label: t("patternDots") },
                      { id: "grid", label: t("patternGrid") },
                      { id: "gradient", label: t("patternGradient") },
                    ].map(p => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => { setEditBannerPattern(p.id as any); setEditBannerUrl(""); }}
                        className={`py-1.5 px-1 text-[10px] font-bold border-2 transition-all ${
                          editBannerPattern === p.id && !editBannerUrl
                            ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]"
                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-800"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Banner Background Color presets */}
                <div>
                  <label className="block font-bold text-slate-700 text-[11px] mb-1.5">
                    {t("bannerColor")}
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["#0d9488", "#0284c7", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#1e293b"].map(col => (
                      <button
                        type="button"
                        key={col}
                        onClick={() => setEditBannerColor(col)}
                        className={`w-7 h-7 border-2 transition-all ${editBannerColor === col ? "border-slate-950 scale-110 shadow-[2px_2px_0px_#000]" : "border-slate-300"}`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                    <input
                      type="color"
                      value={editBannerColor}
                      onChange={e => setEditBannerColor(e.target.value)}
                      className="w-7 h-7 border-2 border-slate-900 cursor-pointer p-0 bg-transparent"
                      title={siteLang === "ar" ? "اختر لوناً مخصصاً" : "Pick custom color"}
                    />
                  </div>
                </div>

                {/* Banner Upload */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 text-[11px]">
                    {t("uploadBanner")}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    className="block w-full text-xs text-slate-500 file:mr-0 file:py-1 file:px-2.5 file:border-2 file:border-slate-900 file:text-xs file:font-black file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                  />
                  {editBannerUrl && (
                    <button
                      type="button"
                      onClick={() => setEditBannerUrl("")}
                      className="text-[10px] text-red-600 font-bold hover:underline block pt-1"
                    >
                      {t("removeBanner")}
                    </button>
                  )}
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block font-bold mb-1">{siteLang === "en" ? "Bio:" : "النبذة التعريفية:"}</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  maxLength={200}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold min-h-[70px] resize-none focus:outline-none"
                  placeholder={siteLang === "en" ? "Write something about yourself, your grade, or goals..." : "اكتب شيئاً عنك، مرحلتك الدراسية، أو هدفك..."}
                />
                <span className="text-[10px] text-slate-400 font-bold">{editBio.length}/200</span>
              </div>

              <button
                onClick={saveProfile}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {t("saveChanges")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ VOTING HISTORY MODAL (سجل التفاعلات) ═══════ */}
      {historyModal && session && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div>
                <h3 className="font-black text-base flex items-center gap-1.5 text-amber-900">
                  <IconHistory size={18} /> {siteLang === "en" ? "Your Interaction History" : "سجل تفاعلاتك"}
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold">{siteLang === "en" ? "Visible only to you and owner — includes all your votes" : "خاص بيك وبالمالك — يحتوي على كل تصويتاتك"}</p>
              </div>
              <button onClick={() => setHistoryModal(false)} title={siteLang === "en" ? "Close" : "إغلاق"}><IconX size={16} /></button>
            </div>

            {userVoteHistory.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-300">
                {siteLang === "en" ? "You haven't cast any votes yet." : "ما مصوت على أي شي بعد."}
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {userVoteHistory.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-800">{item.label}</div>
                      {item.sub && <div className="text-[10px] text-slate-500 truncate max-w-xs">{item.sub}</div>}
                    </div>
                    <span className={`px-2.5 py-1 font-black text-xs border border-slate-900 flex items-center gap-1 ${
                      item.voteType === "like" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
                    }`}>
                      {item.voteType === "like" ? (
                        <>
                          <IconThumbUp size={12} /> {siteLang === "en" ? "Upvoted" : "أنصح بيه"}
                        </>
                      ) : (
                        <>
                          <IconThumbDown size={12} /> {siteLang === "en" ? "Downvoted" : "ما أنصح بيه"}
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ GRADE ONBOARDING MODAL ═══════ */}
      {gradeModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4">
            <div className="text-center mb-2">
              <h3 className="font-black text-xl text-slate-900">{siteLang === "en" ? "Which grades are you interested in?" : "يا صفوف تهمك؟"}</h3>
              <p className="text-xs text-slate-600 font-semibold mt-1">{siteLang === "en" ? "Select your grade levels to customize your experience" : "اختر المراحل الدراسية اللي تهمك حتى نضبط الحساب إلك"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {GRADES.map(g => (
                <button key={g} onClick={() => {
                  if (selectedGrades.includes(g)) setSelectedGrades(selectedGrades.filter(x => x !== g));
                  else setSelectedGrades([...selectedGrades, g]);
                }}
                  className={`border-2 py-3 text-xs font-bold transition-all ${selectedGrades.includes(g) ? "border-slate-900 bg-emerald-primary text-white shadow-none translate-x-[1px] translate-y-[1px]" : "border-slate-900 bg-white text-slate-700 shadow-[2px_2px_0px_#000] hover:bg-slate-50"}`}>
                  <span className="flex items-center justify-center gap-1.5">
                    {selectedGrades.includes(g) && <IconCheck size={13} className="text-white shrink-0" />}
                    <span>{g}</span>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={completeGrades} disabled={selectedGrades.length === 0}
              className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
              {siteLang === "en" ? `Continue • ${selectedGrades.length}` : `متابعة • ${selectedGrades.length}`}
            </button>
          </div>
        </div>
      )}

      {/* ═══════ FULL-SIZE IMAGE PREVIEW MODAL ═══════ */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-[80] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white border-2 border-slate-900 shadow-[6px_6px_0px_#000] p-2 flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between border-b border-slate-200 pb-2 mb-2 px-1">
              <span className="text-xs font-black text-slate-800">{siteLang === "en" ? "Full-Size Image Preview" : "معاينة الصورة بالحجم الكامل"}</span>
              <button
                onClick={() => setPreviewImageModal(null)}
                className="px-2.5 py-1 bg-red-600 text-white font-bold text-xs border border-slate-900 shadow-[1px_1px_0px_#000] hover:bg-red-700 flex items-center gap-1"
              >
                <IconX size={12} />
                <span>{siteLang === "en" ? "Close" : "إغلاق"}</span>
              </button>
            </div>
            <img
              src={previewImageModal}
              alt="معاينة الصورة بالحجم الكامل"
              className="max-h-[80vh] w-auto object-contain border border-slate-200"
            />
          </div>
        </div>
      )}

      {/* ═══════ SETTINGS & THEMES & FAQ & SUPPORT MODAL ═══════ */}
      {settingsModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border-2 border-slate-900 shadow-[8px_8px_0px_#000] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b-2 border-slate-900 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center border border-slate-900 shadow-[1px_1px_0px_#000]">
                  <IconSettings size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">{t("settingsTitle")}</h3>
                  <p className="text-[10px] text-slate-500 font-semibold">{t("settingsSub")}</p>
                </div>
              </div>
              <button
                onClick={() => setSettingsModal(false)}
                className="w-7 h-7 border-2 border-slate-900 bg-white hover:bg-slate-100 flex items-center justify-center font-black text-slate-900 shadow-[1px_1px_0px_#000]"
                title={t("close")}
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center border-b-2 border-slate-900 bg-slate-100 p-1 gap-1 overflow-x-auto">
              <button
                onClick={() => setSettingsTab("theme")}
                className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all shrink-0 ${
                  settingsTab === "theme"
                    ? "border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#000]"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <IconPalette size={14} />
                <span>{t("tabTheme")}</span>
              </button>
              <button
                onClick={() => setSettingsTab("lang")}
                className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all shrink-0 ${
                  settingsTab === "lang"
                    ? "border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#000]"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <IconGlobe size={14} />
                <span>{t("tabLang")}</span>
              </button>
              <button
                onClick={() => setSettingsTab("about")}
                className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all shrink-0 ${
                  settingsTab === "about"
                    ? "border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#000]"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <IconInfo size={14} />
                <span>{t("tabAbout")}</span>
              </button>
              <button
                onClick={() => setSettingsTab("faq")}
                className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all shrink-0 ${
                  settingsTab === "faq"
                    ? "border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#000]"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <IconHelpCircle size={14} />
                <span>{t("tabFaq")}</span>
              </button>
              <button
                onClick={() => setSettingsTab("support")}
                className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all shrink-0 ${
                  settingsTab === "support"
                    ? "border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_#000]"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <IconLifeBuoy size={14} />
                <span>{t("tabSupport")}</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* TAB 1: THEMES */}
              {settingsTab === "theme" && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-700">{t("themeSection")}</p>
                  
                  <div className="grid grid-cols-1 gap-2.5">
                    {/* 1. Classic Light Mode */}
                    <div
                      onClick={() => {
                        setSiteTheme("light");
                        localStorage.setItem("iq_site_theme", "light");
                      }}
                      className={`p-3.5 border-2 cursor-pointer transition-all flex items-center justify-between ${
                        siteTheme === "light"
                          ? "border-slate-900 bg-emerald-50 shadow-[3px_3px_0px_#000]"
                          : "border-slate-300 bg-white hover:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-slate-900 bg-emerald-600 text-white flex items-center justify-center font-bold shadow-[2px_2px_0px_#000]">
                          <IconSun size={20} />
                        </div>
                        <div>
                          <div className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                            <span>{t("themeLight")}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 border border-emerald-400">
                              الافتراضي
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-semibold">{t("themeLightDesc")}</p>
                        </div>
                      </div>
                      {siteTheme === "light" && (
                        <div className="w-6 h-6 bg-slate-900 text-white flex items-center justify-center border border-slate-900">
                          <IconCheck size={14} />
                        </div>
                      )}
                    </div>

                    {/* 2. Dark Mode */}
                    <div
                      onClick={() => {
                        setSiteTheme("dark");
                        localStorage.setItem("iq_site_theme", "dark");
                      }}
                      className={`p-3.5 border-2 cursor-pointer transition-all flex items-center justify-between ${
                        siteTheme === "dark"
                          ? "border-slate-500 bg-slate-800 text-white shadow-[3px_3px_0px_#020617]"
                          : "border-slate-300 bg-white hover:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-slate-500 bg-slate-900 text-teal-400 flex items-center justify-center font-bold shadow-[2px_2px_0px_#020617]">
                          <IconMoon size={20} />
                        </div>
                        <div>
                          <div className={`font-black text-xs sm:text-sm ${siteTheme === "dark" ? "text-white" : "text-slate-900"}`}>
                            {t("themeDark")}
                          </div>
                          <p className={`text-[11px] font-semibold ${siteTheme === "dark" ? "text-slate-300" : "text-slate-500"}`}>
                            {t("themeDarkDesc")}
                          </p>
                        </div>
                      </div>
                      {siteTheme === "dark" && (
                        <div className="w-6 h-6 bg-teal-500 text-slate-950 flex items-center justify-center border border-teal-400 font-bold">
                          <IconCheck size={14} />
                        </div>
                      )}
                    </div>

                    {/* 3. Pink Panther Mode */}
                    <div
                      onClick={() => {
                        setSiteTheme("pink");
                        localStorage.setItem("iq_site_theme", "pink");
                      }}
                      className={`p-3.5 border-2 cursor-pointer transition-all flex items-center justify-between ${
                        siteTheme === "pink"
                          ? "border-pink-900 bg-pink-100 shadow-[3px_3px_0px_#831843]"
                          : "border-slate-300 bg-white hover:border-pink-500"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-pink-900 bg-pink-500 text-white flex items-center justify-center font-bold shadow-[2px_2px_0px_#831843]">
                          <IconPalette size={20} />
                        </div>
                        <div>
                          <div className="font-black text-xs sm:text-sm text-pink-950 flex items-center gap-2">
                            <span>{t("themePink")}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-pink-200 text-pink-900 border border-pink-400">
                              Vibrant Pink
                            </span>
                          </div>
                          <p className="text-[11px] text-pink-800 font-semibold">{t("themePinkDesc")}</p>
                        </div>
                      </div>
                      {siteTheme === "pink" && (
                        <div className="w-6 h-6 bg-pink-600 text-white flex items-center justify-center border border-pink-900">
                          <IconCheck size={14} />
                        </div>
                      )}
                    </div>

                    {/* 4. Plants & Nature Mode */}
                    <div
                      onClick={() => {
                        setSiteTheme("plants");
                        localStorage.setItem("iq_site_theme", "plants");
                      }}
                      className={`p-3.5 border-2 cursor-pointer transition-all flex items-center justify-between ${
                        siteTheme === "plants"
                          ? "border-emerald-950 bg-emerald-100 shadow-[3px_3px_0px_#14532d]"
                          : "border-slate-300 bg-white hover:border-emerald-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-emerald-950 bg-emerald-700 text-white flex items-center justify-center font-bold shadow-[2px_2px_0px_#14532d]">
                          <IconBook size={20} />
                        </div>
                        <div>
                          <div className="font-black text-xs sm:text-sm text-emerald-950 flex items-center gap-2">
                            <span>{t("themePlants")}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-200 text-emerald-900 border border-emerald-600">
                              Lush Green
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-900 font-semibold">{t("themePlantsDesc")}</p>
                        </div>
                      </div>
                      {siteTheme === "plants" && (
                        <div className="w-6 h-6 bg-emerald-800 text-white flex items-center justify-center border border-emerald-950">
                          <IconCheck size={14} />
                        </div>
                      )}
                    </div>

                    {/* 5. Cyber Purple & Blue Mode */}
                    <div
                      onClick={() => {
                        setSiteTheme("purple");
                        localStorage.setItem("iq_site_theme", "purple");
                      }}
                      className={`p-3.5 border-2 cursor-pointer transition-all flex items-center justify-between ${
                        siteTheme === "purple"
                          ? "border-indigo-950 bg-indigo-50 shadow-[3px_3px_0px_#4338ca]"
                          : "border-slate-300 bg-white hover:border-indigo-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-slate-900 bg-indigo-600 text-white flex items-center justify-center font-bold shadow-[2px_2px_0px_#000]">
                          <IconBolt size={20} />
                        </div>
                        <div>
                          <div className="font-black text-xs sm:text-sm text-indigo-950 flex items-center gap-2">
                            <span>{t("themePurple")}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-indigo-200 text-indigo-950 border border-indigo-500">
                              Cyber Mode
                            </span>
                          </div>
                          <p className="text-[11px] text-indigo-800 font-semibold">{t("themePurpleDesc")}</p>
                        </div>
                      </div>
                      {siteTheme === "purple" && (
                        <div className="w-6 h-6 bg-indigo-700 text-white flex items-center justify-center border border-indigo-950">
                          <IconCheck size={14} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: LANGUAGE */}
              {settingsTab === "lang" && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-700">{t("langSection")}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Arabic Option */}
                    <div
                      onClick={() => {
                        setSiteLang("ar");
                        localStorage.setItem("iq_site_lang", "ar");
                      }}
                      className={`p-4 border-2 cursor-pointer transition-all space-y-2 ${
                        siteLang === "ar"
                          ? "border-slate-900 bg-emerald-50 shadow-[3px_3px_0px_#000]"
                          : "border-slate-300 bg-white hover:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-slate-900">العربية</span>
                        {siteLang === "ar" && (
                          <span className="w-5 h-5 bg-slate-900 text-white flex items-center justify-center text-[10px]">
                            <IconCheck size={12} />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 font-semibold">
                        الاتجاه من اليمين لليسار، لغة المنصة ومجتمع الطلاب.
                      </p>
                    </div>

                    {/* English Option */}
                    <div
                      onClick={() => {
                        setSiteLang("en");
                        localStorage.setItem("iq_site_lang", "en");
                      }}
                      className={`p-4 border-2 cursor-pointer transition-all space-y-2 ${
                        siteLang === "en"
                          ? "border-slate-900 bg-emerald-50 shadow-[3px_3px_0px_#000]"
                          : "border-slate-300 bg-white hover:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-slate-900">English</span>
                        {siteLang === "en" && (
                          <span className="w-5 h-5 bg-slate-900 text-white flex items-center justify-center text-[10px]">
                            <IconCheck size={12} />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 font-semibold">
                        Left-to-right layout with full translation for platform menus and controls.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: ABOUT US */}
              {settingsTab === "about" && (
                <div className="space-y-4">
                  {/* Top Bar: Title + Owner Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-slate-200 gap-2">
                    <div>
                      <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                        <IconInfo size={16} />
                        <span>{siteLang === "en" ? "About Our Platform" : "عن المنصة التعليمية"}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 font-semibold">
                        {siteLang === "en"
                          ? "Our mission, core pillars, and direct educational links for students."
                          : "تعرف على رؤية المنصة ورسالتها التعليمية والروابط الخدمية المباشرة."}
                      </p>
                    </div>

                    {canOwner && (
                      <div className="flex items-center gap-2 shrink-0">
                        {isEditingAbout ? (
                          <>
                            <button
                              type="button"
                              onClick={handleResetAboutDefault}
                              className="px-2.5 py-1 text-[11px] font-bold border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center gap-1 shadow-[1px_1px_0px_#000]"
                              title={siteLang === "en" ? "Reset Default" : "استعادة الافتراضي"}
                            >
                              <IconRotateCcw size={12} />
                              <span>{siteLang === "en" ? "Reset" : "افتراضي"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditAbout}
                              className="px-2.5 py-1 text-[11px] font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 text-slate-900 flex items-center gap-1 shadow-[1px_1px_0px_#000]"
                            >
                              <IconX size={12} />
                              <span>{siteLang === "en" ? "Cancel" : "إلغاء"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveAbout}
                              className="px-3 py-1 text-[11px] font-black border-2 border-emerald-950 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px"
                            >
                              <IconCheck size={13} />
                              <span>{siteLang === "en" ? "Save Changes" : "حفظ التعديلات"}</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={handleStartEditAbout}
                            className="px-3 py-1.5 text-xs font-black border-2 border-slate-900 bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px"
                          >
                            <IconPen size={13} />
                            <span>{siteLang === "en" ? "Edit About Page" : "تعديل محتوى الصفحة"}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* If Owner is Editing: The Editor Interface */}
                  {canOwner && isEditingAbout ? (
                    <div className="space-y-4 bg-slate-50 p-3 sm:p-4 border-2 border-slate-900 shadow-[3px_3px_0px_#000]">
                      <div className="bg-emerald-100 border border-emerald-800 p-2 text-[11px] font-bold text-emerald-950">
                        {siteLang === "en"
                          ? "Owner Mode: All edits will synchronize directly across all devices with zero database migrations."
                          : "وضع المالك: سيتم حفظ التعديلات ومزامنتها مباشرة لجميع الطلاب دون أي تعديل في قاعدة البيانات."}
                      </div>

                      {/* 1. Main Headline & Subtitle */}
                      <div className="space-y-3 bg-white p-3 border-2 border-slate-200">
                        <div className="font-black text-xs text-slate-900 border-b border-slate-200 pb-1">
                          {siteLang === "en" ? "1. Hero Banner Content" : "1. العنوان الرئيسي والمقدمة"}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block font-bold mb-1 text-slate-800">العنوان بالعربية:</label>
                            <input
                              type="text"
                              value={editAboutDraft.headlineAr}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, headlineAr: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-bold focus:outline-none focus:bg-amber-50/20"
                            />
                          </div>
                          <div>
                            <label className="block font-bold mb-1 text-slate-800">Headline (English):</label>
                            <input
                              type="text"
                              value={editAboutDraft.headlineEn}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, headlineEn: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-bold focus:outline-none focus:bg-amber-50/20"
                            />
                          </div>
                          <div>
                            <label className="block font-bold mb-1 text-slate-800">الوصف الفرعي بالعربية:</label>
                            <input
                              type="text"
                              value={editAboutDraft.subtitleAr}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, subtitleAr: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-medium focus:outline-none focus:bg-amber-50/20"
                            />
                          </div>
                          <div>
                            <label className="block font-bold mb-1 text-slate-800">Subtitle (English):</label>
                            <input
                              type="text"
                              value={editAboutDraft.subtitleEn}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, subtitleEn: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-medium focus:outline-none focus:bg-amber-50/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 2. Mission Section */}
                      <div className="space-y-3 bg-white p-3 border-2 border-slate-200">
                        <div className="font-black text-xs text-slate-900 border-b border-slate-200 pb-1">
                          {siteLang === "en" ? "2. Mission Statement" : "2. رسالة المنصة والهدف الأساسي"}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="block font-bold mb-1 text-slate-800">عنوان الرسالة بالعربية:</label>
                            <input
                              type="text"
                              value={editAboutDraft.missionTitleAr}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, missionTitleAr: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-bold focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold mb-1 text-slate-800">Mission Title (English):</label>
                            <input
                              type="text"
                              value={editAboutDraft.missionTitleEn}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, missionTitleEn: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-bold focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-bold mb-1 text-slate-800">نص الرسالة بالعربية:</label>
                            <textarea
                              rows={3}
                              value={editAboutDraft.missionDescAr}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, missionDescAr: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-medium text-xs focus:outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-bold mb-1 text-slate-800">Mission Body (English):</label>
                            <textarea
                              rows={3}
                              value={editAboutDraft.missionDescEn}
                              onChange={e => setEditAboutDraft(prev => ({ ...prev, missionDescEn: e.target.value }))}
                              className="w-full p-2 border-2 border-slate-900 font-medium text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 3. Feature Boxes / Pillars */}
                      <div className="space-y-3 bg-white p-3 border-2 border-slate-200">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                          <span className="font-black text-xs text-slate-900">
                            {siteLang === "en" ? "3. Feature Boxes & Pillars" : "3. صناديق الميزات والركائز"} ({editAboutDraft.pillars.length})
                          </span>
                          <button
                            type="button"
                            onClick={handleAddPillar}
                            className="px-2 py-1 text-[10px] font-black border border-slate-900 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-[1px_1px_0px_#000]"
                          >
                            <IconPlus size={11} />
                            <span>{siteLang === "en" ? "Add Box" : "إضافة صندوق"}</span>
                          </button>
                        </div>

                        <div className="space-y-3">
                          {editAboutDraft.pillars.map((p, pIdx) => (
                            <div key={p.id} className="p-3 border-2 border-slate-900 bg-slate-50 relative space-y-2 text-xs">
                              <div className="flex items-center justify-between gap-2 border-b border-slate-300 pb-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 bg-slate-900 text-white text-[10px] font-black flex items-center justify-center">
                                    {pIdx + 1}
                                  </span>
                                  <label className="font-bold text-[11px] text-slate-700">
                                    {siteLang === "en" ? "Icon:" : "الأيقونة:"}
                                  </label>
                                  <select
                                    value={p.icon}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        pillars: prev.pillars.map(x => x.id === p.id ? { ...x, icon: val } : x),
                                      }));
                                    }}
                                    className="p-1 border border-slate-900 font-bold bg-white text-xs"
                                  >
                                    <option value="star">نجمة (Star)</option>
                                    <option value="users">مجتمع (Users)</option>
                                    <option value="shield">أمان (Shield)</option>
                                    <option value="book">مناهج (Book)</option>
                                    <option value="grad">أساتذة (Grad)</option>
                                    <option value="flame">نشاط (Flame)</option>
                                    <option value="info">إرشاد (Info)</option>
                                  </select>
                                  <div className="p-1 border border-slate-900 bg-white text-slate-900">
                                    {renderPillarIcon(p.icon, 14)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePillar(p.id)}
                                  className="p-1 text-rose-700 hover:bg-rose-100 border border-rose-800"
                                  title={siteLang === "en" ? "Remove Box" : "حذف الصندوق"}
                                >
                                  <IconTrash size={13} />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <input
                                    type="text"
                                    placeholder="العنوان (عربي)"
                                    value={p.titleAr}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        pillars: prev.pillars.map(x => x.id === p.id ? { ...x, titleAr: val } : x),
                                      }));
                                    }}
                                    className="w-full p-1.5 border border-slate-400 font-bold bg-white focus:outline-none focus:border-slate-900"
                                  />
                                </div>
                                <div>
                                  <input
                                    type="text"
                                    placeholder="Title (English)"
                                    value={p.titleEn}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        pillars: prev.pillars.map(x => x.id === p.id ? { ...x, titleEn: val } : x),
                                      }));
                                    }}
                                    className="w-full p-1.5 border border-slate-400 font-bold bg-white focus:outline-none focus:border-slate-900"
                                  />
                                </div>
                                <div>
                                  <textarea
                                    rows={2}
                                    placeholder="الوصف (عربي)"
                                    value={p.descAr}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        pillars: prev.pillars.map(x => x.id === p.id ? { ...x, descAr: val } : x),
                                      }));
                                    }}
                                    className="w-full p-1.5 border border-slate-400 text-[11px] bg-white focus:outline-none focus:border-slate-900"
                                  />
                                </div>
                                <div>
                                  <textarea
                                    rows={2}
                                    placeholder="Description (English)"
                                    value={p.descEn}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        pillars: prev.pillars.map(x => x.id === p.id ? { ...x, descEn: val } : x),
                                      }));
                                    }}
                                    className="w-full p-1.5 border border-slate-400 text-[11px] bg-white focus:outline-none focus:border-slate-900"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 4. Action Buttons & Links */}
                      <div className="space-y-3 bg-white p-3 border-2 border-slate-200">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                          <span className="font-black text-xs text-slate-900">
                            {siteLang === "en" ? "4. Action Buttons & Links" : "4. أزرار الروابط السريعة"} ({editAboutDraft.buttons.length})
                          </span>
                          <button
                            type="button"
                            onClick={handleAddButton}
                            className="px-2 py-1 text-[10px] font-black border border-slate-900 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 shadow-[1px_1px_0px_#000]"
                          >
                            <IconPlus size={11} />
                            <span>{siteLang === "en" ? "Add Link" : "إضافة رابط"}</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {editAboutDraft.buttons.map((b, bIdx) => (
                            <div key={b.id} className="p-2.5 border-2 border-slate-900 bg-slate-50 space-y-2 text-xs">
                              <div className="flex items-center justify-between gap-2 border-b border-slate-300 pb-1">
                                <span className="font-black text-[10px] text-slate-600">#{bIdx + 1}</span>
                                <div className="flex items-center gap-2">
                                  <label className="font-bold text-[10px] text-slate-700">
                                    {siteLang === "en" ? "Style:" : "النمط:"}
                                  </label>
                                  <select
                                    value={b.variant}
                                    onChange={e => {
                                      const val = e.target.value as any;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        buttons: prev.buttons.map(x => x.id === b.id ? { ...x, variant: val } : x),
                                      }));
                                    }}
                                    className="p-1 border border-slate-900 font-bold bg-white text-[11px]"
                                  >
                                    <option value="primary">أساسي (Primary)</option>
                                    <option value="secondary">ثانوي (Emerald)</option>
                                    <option value="outline">إطار (Outline)</option>
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveButton(b.id)}
                                  className="p-1 text-rose-700 hover:bg-rose-100 border border-rose-800"
                                  title={siteLang === "en" ? "Remove Button" : "حذف الزر"}
                                >
                                  <IconTrash size={13} />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <input
                                    type="text"
                                    placeholder="نص الزر (عربي)"
                                    value={b.labelAr}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        buttons: prev.buttons.map(x => x.id === b.id ? { ...x, labelAr: val } : x),
                                      }));
                                    }}
                                    className="w-full p-1.5 border border-slate-400 font-bold bg-white focus:outline-none focus:border-slate-900"
                                  />
                                </div>
                                <div>
                                  <input
                                    type="text"
                                    placeholder="Label (English)"
                                    value={b.labelEn}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        buttons: prev.buttons.map(x => x.id === b.id ? { ...x, labelEn: val } : x),
                                      }));
                                    }}
                                    className="w-full p-1.5 border border-slate-400 font-bold bg-white focus:outline-none focus:border-slate-900"
                                  />
                                </div>
                                <div>
                                  <input
                                    type="url"
                                    placeholder="https://..."
                                    value={b.url}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEditAboutDraft(prev => ({
                                        ...prev,
                                        buttons: prev.buttons.map(x => x.id === b.id ? { ...x, url: val } : x),
                                      }));
                                    }}
                                    className="w-full p-1.5 border border-slate-400 font-mono text-[11px] bg-white focus:outline-none focus:border-slate-900"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bottom Save & Cancel */}
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleCancelEditAbout}
                          className="px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 text-slate-900 shadow-[1px_1px_0px_#000]"
                        >
                          {siteLang === "en" ? "Cancel" : "إلغاء"}
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAbout}
                          className="px-4 py-1.5 text-xs font-black border-2 border-emerald-950 bg-emerald-600 hover:bg-emerald-700 text-white shadow-[2px_2px_0px_#000]"
                        >
                          {siteLang === "en" ? "Save All Changes" : "حفظ جميع التعديلات"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* The Public / Read-only Live About Us View */
                    <div className="space-y-4">
                      {/* Hero Card */}
                      <div className="p-4 sm:p-5 border-2 border-slate-900 bg-slate-900 text-white shadow-[3px_3px_0px_#000] relative overflow-hidden">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-emerald-400/40 bg-emerald-900/60 text-emerald-300 text-[10px] font-black uppercase tracking-wider mb-2">
                          <IconInfo size={12} />
                          <span>{siteLang === "en" ? "Academic Platform" : "المنصة الأكاديمية"}</span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black leading-tight text-white mb-1.5">
                          {siteLang === "en" ? aboutUsData.headlineEn : aboutUsData.headlineAr}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed max-w-2xl">
                          {siteLang === "en" ? aboutUsData.subtitleEn : aboutUsData.subtitleAr}
                        </p>
                      </div>

                      {/* Mission Statement Box */}
                      <div className="p-4 border-2 border-slate-900 bg-emerald-50 shadow-[3px_3px_0px_#000] space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-950 font-black text-xs sm:text-sm">
                          <span className="w-6 h-6 border border-emerald-900 bg-emerald-600 text-white flex items-center justify-center">
                            <IconGrad size={14} />
                          </span>
                          <span>
                            {siteLang === "en" ? aboutUsData.missionTitleEn : aboutUsData.missionTitleAr}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-900 font-medium leading-relaxed whitespace-pre-wrap">
                          {siteLang === "en" ? aboutUsData.missionDescEn : aboutUsData.missionDescAr}
                        </p>
                      </div>

                      {/* Pillars / Feature Boxes Grid */}
                      {aboutUsData.pillars && aboutUsData.pillars.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {aboutUsData.pillars.map(pillar => (
                            <div
                              key={pillar.id}
                              className="p-3.5 border-2 border-slate-900 bg-white shadow-[2px_2px_0px_#000] flex flex-col justify-between hover:translate-y-[-1px] transition-transform"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 border-2 border-slate-900 bg-amber-400 text-slate-900 flex items-center justify-center font-black shadow-[1px_1px_0px_#000] shrink-0">
                                    {renderPillarIcon(pillar.icon, 15)}
                                  </div>
                                  <h5 className="font-black text-xs text-slate-900 leading-snug">
                                    {siteLang === "en" ? pillar.titleEn : pillar.titleAr}
                                  </h5>
                                </div>
                                <p className="text-[11px] text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                                  {siteLang === "en" ? pillar.descEn : pillar.descAr}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Link Buttons */}
                      {aboutUsData.buttons && aboutUsData.buttons.length > 0 && (
                        <div className="pt-2 border-t-2 border-slate-200">
                          <div className="text-[10px] font-black uppercase text-slate-500 mb-2">
                            {siteLang === "en" ? "Official Channels & Direct Links" : "القنوات والروابط الرسمية"}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {aboutUsData.buttons.map(btn => {
                              const variantClass =
                                btn.variant === "primary"
                                  ? "bg-slate-900 text-white hover:bg-slate-800 border-slate-900 shadow-[2px_2px_0px_#000]"
                                  : btn.variant === "secondary"
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700 border-slate-900 shadow-[2px_2px_0px_#000]"
                                  : "bg-white text-slate-900 hover:bg-slate-100 border-slate-900 shadow-[2px_2px_0px_#000]";

                              return (
                                <a
                                  key={btn.id}
                                  href={btn.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 transition-all active:translate-x-px active:translate-y-px ${variantClass}`}
                                >
                                  <IconLink size={13} />
                                  <span>{siteLang === "en" ? btn.labelEn : btn.labelAr}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: FAQ ACCORDION (With Owner Add/Edit/Delete Controls) */}
              {settingsTab === "faq" && (
                <div className="space-y-3">
                  <div className="border-b border-slate-200 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-black text-sm text-slate-900">{t("faqTitle")}</h4>
                      <p className="text-[11px] text-slate-500 font-semibold">{t("faqSub")}</p>
                    </div>

                    {canOwner && (
                      <button
                        type="button"
                        onClick={handleOpenAddFaq}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 self-start sm:self-auto active:translate-x-px active:translate-y-px"
                      >
                        <IconPlus size={13} />
                        <span>{siteLang === "en" ? "Add Question" : "إضافة سؤال جديد"}</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {faqList.map((item, idx) => {
                      const isExp = faqExpanded === idx;
                      return (
                        <div
                          key={item.id || idx}
                          className="border-2 border-slate-900 bg-white shadow-[2px_2px_0px_#000] overflow-hidden transition-all"
                        >
                          <div
                            onClick={() => setFaqExpanded(isExp ? null : idx)}
                            className="w-full p-3 text-start flex items-center justify-between gap-3 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer select-none"
                          >
                            <span className="font-black text-xs text-slate-900 leading-snug flex-1">
                              {item.q[siteLang] || item.q.ar}
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {canOwner && (
                                <div className="flex items-center gap-1 mr-1" onClick={e => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditFaq(item)}
                                    className="p-1 border border-slate-400 bg-white hover:bg-slate-100 text-slate-800 shadow-[1px_1px_0px_#000]"
                                    title={siteLang === "en" ? "Edit Question" : "تعديل السؤال"}
                                  >
                                    <IconPen size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteFaq(item.id)}
                                    className="p-1 border border-rose-400 bg-white hover:bg-rose-50 text-rose-700 shadow-[1px_1px_0px_#000]"
                                    title={siteLang === "en" ? "Delete Question" : "حذف السؤال"}
                                  >
                                    <IconTrash size={12} />
                                  </button>
                                </div>
                              )}
                              <span className="text-slate-600">
                                {isExp ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                              </span>
                            </div>
                          </div>

                          {isExp && (
                            <div className="p-3 bg-white border-t-2 border-slate-900 text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                              {item.a[siteLang] || item.a.ar}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: SUPPORT INQUIRIES */}
              {settingsTab === "support" && (
                <div className="space-y-3">
                  <div className="border-b border-slate-200 pb-2">
                    <h4 className="font-black text-sm text-slate-900">{t("supportTitle")}</h4>
                    <p className="text-[11px] text-slate-500 font-semibold">{t("supportSub")}</p>
                  </div>

                  {supportSuccess && (
                    <div className="p-3 bg-emerald-100 border-2 border-emerald-600 text-emerald-950 text-xs font-bold shadow-[2px_2px_0px_#000]">
                      {t("supportSuccessAlert")}
                    </div>
                  )}

                  <div className="space-y-3 text-xs">
                    {/* Inquiry Category */}
                    <div>
                      <label className="block font-bold mb-1 text-slate-800">{t("supportCategory")}:</label>
                      <select
                        value={supportCategory}
                        onChange={e => setSupportCategory(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-bold focus:outline-none focus:bg-white"
                      >
                        <option value="other">{t("supportCatGeneral")}</option>
                        <option value="bug">{t("supportCatTechnical")}</option>
                        <option value="teacher">{t("supportCatTeacher")}</option>
                        <option value="content">{t("supportCatSuggestion")}</option>
                      </select>
                    </div>

                    {/* Inquiry Subject */}
                    <div>
                      <label className="block font-bold mb-1 text-slate-800">{t("supportSubject")}:</label>
                      <input
                        type="text"
                        value={supportSubject}
                        onChange={e => setSupportSubject(e.target.value)}
                        placeholder={t("supportSubjectPlaceholder")}
                        className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none focus:bg-white"
                      >
                      </input>
                    </div>

                    {/* Inquiry Message */}
                    <div>
                      <label className="block font-bold mb-1 text-slate-800">{t("supportMessage")}:</label>
                      <textarea
                        value={supportMessage}
                        onChange={e => setSupportMessage(e.target.value)}
                        placeholder={t("supportMessagePlaceholder")}
                        className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold min-h-[90px] resize-none focus:outline-none focus:bg-white"
                      />
                    </div>


                    <button
                      type="button"
                      onClick={submitSupportTicket}
                      className="w-full py-3 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                    >
                      {t("sendSupportTicket")}
                    </button>

                    {/* Show User's Own Tickets */}
                    {session && (
                      <div className="mt-8 pt-4 border-t-2 border-slate-200 space-y-3">
                        <h4 className="font-black text-sm text-slate-900">{siteLang === "en" ? "My Previous Tickets" : "تذاكري السابقة"}</h4>
                        {supportTickets.filter(t => t.sender === session.username).length === 0 && (
                          <p className="text-xs text-slate-500 font-medium">{siteLang === "en" ? "No previous tickets." : "ماكو تذاكر سابقة."}</p>
                        )}
                        {supportTickets.filter(t => t.sender === session.username).map(ticket => (
                          <div key={ticket.id} className="p-3 border-2 border-slate-900 bg-white space-y-2 shadow-[2px_2px_0px_#000]">
                            <div className="flex justify-between items-center">
                              <span className="font-black text-xs text-slate-900">{ticket.subject}</span>
                              <span className={`px-2 py-0.5 text-[9px] font-black border border-slate-900 ${ticket.status === "resolved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                                {ticket.status === "resolved" 
                                  ? (siteLang === "en" ? "Resolved" : "تمت المراجعة") 
                                  : (siteLang === "en" ? "Under Review" : "قيد المراجعة")}
                              </span>
                            </div>
                            
                            {ticket.status !== "resolved" && (
                              <button 
                                onClick={() => resolveSupportTicket(ticket.id)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold border border-slate-900 shadow-[1px_1px_0px_#000]"
                              >
                                {siteLang === "en" ? "Mark as Resolved" : "تم الحل"}
                              </button>
                            )}

                            <div className="text-xs text-slate-700 whitespace-pre-wrap">{ticket.message}</div>
                            
                            {/* Replies */}
                            {ticket.replies && ticket.replies.length > 0 && (
                              <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                                {ticket.replies.map(reply => (
                                  <div key={reply.id} className={`p-2 border border-slate-200 text-xs ${reply.sender === session.username ? "bg-emerald-50" : "bg-slate-100"}`}>
                                    <strong className="text-slate-900 block mb-1">{reply.sender}</strong>
                                    <div className="whitespace-pre-wrap">{reply.message}</div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Reply Input if allowed */}
                            {ticket.allowUserReply && ticket.status !== "resolved" && (
                              <div className="mt-2 flex gap-2">
                                <input
                                  type="text"
                                  value={ticketReplyTexts[ticket.id] || ""}
                                  onChange={e => setTicketReplyTexts(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                                  placeholder={siteLang === "en" ? "Add a reply..." : "أضف رداً..."}
                                  className="flex-1 p-2 text-xs border border-slate-300 focus:outline-none focus:border-slate-900"
                                />
                                <button onClick={() => submitSupportReply(ticket.id)} className="px-3 py-1 bg-slate-900 text-white font-bold text-xs border border-slate-900 hover:bg-slate-800">
                                  {siteLang === "en" ? "Send" : "إرسال"}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t-2 border-slate-900 bg-slate-50 flex items-center justify-end">
              <button
                onClick={() => setSettingsModal(false)}
                className="px-4 py-1.5 bg-slate-900 text-white font-black text-xs border-2 border-slate-900 hover:bg-slate-800 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ OWNER FAQ ADD / EDIT MODAL ═══════ */}
      {canOwner && faqModalOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border-2 border-slate-900 shadow-[8px_8px_0px_#000] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b-2 border-slate-900 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-slate-900 text-white flex items-center justify-center border border-slate-900 shadow-[1px_1px_0px_#000]">
                  <IconHelpCircle size={15} />
                </div>
                <h3 className="font-black text-sm text-slate-900">
                  {editingFaqId
                    ? (siteLang === "en" ? "Edit FAQ Question" : "تعديل السؤال الشائع")
                    : (siteLang === "en" ? "Add FAQ Question" : "إضافة سؤال شائع جديد")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="w-7 h-7 border-2 border-slate-900 bg-white hover:bg-slate-100 flex items-center justify-center font-black text-slate-900 shadow-[1px_1px_0px_#000]"
                title={siteLang === "en" ? "Close" : "إغلاق"}
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Form Fields */}
            <div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-xs">
              <div>
                <label className="block font-black mb-1 text-slate-900">
                  {siteLang === "en" ? "Question in Arabic (Required):" : "السؤال بالعربية (مطلوب):"}
                </label>
                <input
                  type="text"
                  value={faqDraftQAr}
                  onChange={e => setFaqDraftQAr(e.target.value)}
                  placeholder="مثال: كيف أقيّم أستاذ جديد في المنصة؟"
                  className="w-full p-2.5 border-2 border-slate-900 font-bold focus:outline-none focus:bg-amber-50/20"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  {siteLang === "en" ? "Question in English (Optional):" : "السؤال بالإنجليزية (اختياري):"}
                </label>
                <input
                  type="text"
                  value={faqDraftQEn}
                  onChange={e => setFaqDraftQEn(e.target.value)}
                  placeholder="e.g. How do I rate a new teacher?"
                  className="w-full p-2.5 border-2 border-slate-900 font-medium focus:outline-none focus:bg-amber-50/20"
                />
              </div>

              <div>
                <label className="block font-black mb-1 text-slate-900">
                  {siteLang === "en" ? "Answer in Arabic (Required):" : "الجواب بالعربية (مطلوب):"}
                </label>
                <textarea
                  rows={4}
                  value={faqDraftAAr}
                  onChange={e => setFaqDraftAAr(e.target.value)}
                  placeholder="اكتب الإجابة التوضيحية الكاملة للطلبة هنا..."
                  className="w-full p-2.5 border-2 border-slate-900 font-medium leading-relaxed focus:outline-none focus:bg-amber-50/20"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  {siteLang === "en" ? "Answer in English (Optional):" : "الجواب بالإنجليزية (اختياري):"}
                </label>
                <textarea
                  rows={4}
                  value={faqDraftAEn}
                  onChange={e => setFaqDraftAEn(e.target.value)}
                  placeholder="Write the full clear explanation for students here..."
                  className="w-full p-2.5 border-2 border-slate-900 font-medium leading-relaxed focus:outline-none focus:bg-amber-50/20"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t-2 border-slate-900 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="px-3.5 py-1.5 bg-white text-slate-900 font-bold text-xs border-2 border-slate-900 hover:bg-slate-100 shadow-[1px_1px_0px_#000]"
              >
                {siteLang === "en" ? "Cancel" : "إلغاء"}
              </button>
              <button
                type="button"
                onClick={handleSaveFaq}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 active:translate-x-px active:translate-y-px"
              >
                <IconCheck size={14} />
                <span>{siteLang === "en" ? "Save Question" : "حفظ السؤال"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
