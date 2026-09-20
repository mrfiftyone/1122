"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { normalizeTeacherName } from "@/utils/normalization";
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
  IconKey, IconClock, IconStar, IconEye,
} from "@/utils/icons";
import { Language, getT } from "@/utils/i18n";

import Link from "next/link";
import Turnstile from "@/components/Turnstile";
import { supabase } from "@/utils/supabase";

function isValidYoutubeUrl(url: string): boolean {
  if (!url || !url.trim()) return true;
  const trimmed = url.trim();
  // Validates standard YouTube watch URLs, short youtu.be, shorts, embeds, and playlists
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|playlist\?list=)|youtu\.be\/)[\w\-?&=]+/;
  return ytRegex.test(trimmed);
}

// ─── Types ─────────────────────────────────────────────────────────
interface User { username: string; pass: string; role: "student" | "mod" | "owner" }
interface Profile {
  avatarColor: string;
  avatarUrl?: string; // Custom uploaded PFP image (DataURL or URL)
  bio: string;
  bannerUrl?: string; // Custom uploaded banner image
  bannerPattern?: "none" | "stripes" | "dots" | "grid" | "gradient";
  bannerColor?: string;
  accentColor?: string;
}
interface Comment {
  id: string; author: string; text: string; created_at: string;
  likes: number; dislikes: number; reports: number;
  views?: number;
}
export type PostTag = "question" | "discussion" | "news" | "tips" | "booklet" | "other";

interface Post {
  id: string; author: string; teacherId?: string; teacher_id?: string;
  title: string; body: string; grade_level: string;
  tag?: PostTag;
  pinned?: boolean;
  likes: number; dislikes: number; reports: number;
  views?: number;
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

interface SupportTicket {
  id: string;
  sender: string;
  contact?: string;
  category: "bug" | "teacher" | "content" | "account" | "other";
  subject: string;
  message: string;
  status: "open" | "resolved";
  created_at: string;
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
  type: "comment" | "reply" | "like" | "teacher_approved" | "teacher_rejected" | "report_alert" | "admin_warning";
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

  // Live Database States
  const [posts, setPostsList] = useState<Post[]>([]);
  const [teachers, setTeachersList] = useState<Teacher[]>([]);
  const [profiles, setProfilesMap] = useState<Record<string, Profile>>({});
  const [allNotifications, setAllNotifications] = useState<NotificationItem[]>([]);

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
  const [postYoutube, setPostYoutube] = useState("");
  const [postTelegram, setPostTelegram] = useState("");
  const [postTag, setPostTag] = useState<PostTag>("discussion");
  const [selectedFeedTag, setSelectedFeedTag] = useState<"all" | PostTag>("all");
  const [pinnedPostIds, setPinnedPostIds] = useState<string[]>([]);

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
  const [adminSubTab, setAdminSubTab] = useState<"moderation" | "announcement" | "audit" | "filter" | "owner">("moderation");

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
  const [siteTheme, setSiteTheme] = useState<"light" | "dark" | "pink" | "plants" | "purple">("light");
  const [siteLang, setSiteLang] = useState<Language>("ar");
  const [settingsModal, setSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"theme" | "lang" | "faq" | "support">("theme");
  const [faqExpanded, setFaqExpanded] = useState<number | null>(null);

  // Support Form State
  const [supportCategory, setSupportCategory] = useState<"bug" | "teacher" | "content" | "account" | "other">("bug");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportContact, setSupportContact] = useState("");
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);

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
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const canOwner = !!(session && session.role === "owner");
  const canAdmin = !!(session && (session.role === "owner" || session.role === "mod"));

  function hasPermission(perm: keyof ModPermissions): boolean {
    if (!session) return false;
    if (session.role === "owner") return true;
    if (session.role !== "mod") return false;
    const perms = modPermissionsMap[session.username] || DEFAULT_MOD_PERMISSIONS;
    return !!perms[perm];
  }

  // ─── Fetch from Supabase (Central Shared Database) ─────────────────
  const fetchSupabaseData = useCallback(async () => {
    try {
      const [pRes, tRes, prRes] = await Promise.all([
        supabase.from('posts').select('*, comments(*)').order('created_at', { ascending: false }),
        supabase.from('teachers').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ]);

      if (pRes.data) {
        const formattedPosts: Post[] = pRes.data.map((p: any) => {
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
            views: p.views !== undefined ? p.views : (meta.views || 0),
            status: p.status || "active",
            images: meta.images || [],
            youtubeUrl: meta.youtubeUrl || p.youtube_url || "",
            telegramUrl: meta.telegramUrl || p.telegram_url || "",
            comments: (p.comments || []).map((c: any) => {
              let cText = c.text || "";
              let cMeta: any = {};
              const cMetaMatch = cText.match(/<!--meta:(.*?)-->/);
              if (cMetaMatch) {
                try {
                  cMeta = JSON.parse(cMetaMatch[1]);
                  cText = cText.replace(/<!--meta:.*?-->/, "").trim();
                } catch {}
              }
              return {
                id: c.id,
                author: c.author,
                text: cText,
                created_at: c.created_at,
                likes: c.likes || 0,
                dislikes: c.dislikes || 0,
                reports: c.reports || 0,
                views: c.views !== undefined ? c.views : (cMeta.views || 0),
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
      }

      if (prRes.data && prRes.data.length > 0) {
        const currentProfiles = getProfiles();
        prRes.data.forEach((p: any) => {
          currentProfiles[p.username] = {
            avatarColor: p.avatar_color || "#0d9488",
            avatarUrl: currentProfiles[p.username]?.avatarUrl || "",
            bio: p.bio || currentProfiles[p.username]?.bio || "",
          };
        });
        setProfilesMap(currentProfiles);
        setProfiles(currentProfiles);
      }
    } catch (err) {
      console.error("Supabase load error:", err);
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
    setSession(currUser);
    setPostsList(getPosts());
    setTeachersList(getTeachers());
    setAllNotifications(getNotifications());
    setReportRecordsList(getReportRecords());
    setSupportTickets(getSupportTickets());
    setPinnedPostIds(getPinnedPostIds());

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

    // Read profile or user query parameter if present
    try {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const targetProfile = urlParams.get("profile") || urlParams.get("user");
        if (targetProfile) {
          setViewedUser(targetProfile);
          setTab("profile");
        }
      }
    } catch {
      // ignore
    }

    // Listen to Supabase Realtime updates from any user
    const channel = supabase
      .channel('public-global-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        fetchSupabaseData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
        fetchSupabaseData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, () => {
        fetchSupabaseData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => {
        fetchSupabaseData();
      })
      .subscribe();

    const lockExpiry = parseInt(localStorage.getItem("login_lockout_until") || "0");
    const now = Date.now();
    if (lockExpiry > now) {
      setLockoutRemaining(Math.ceil((lockExpiry - now) / 1000));
    }
    setMounted(true);

    return () => {
      clearInterval(expireCheckInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchSupabaseData, fetchVotesFromSupabase]);

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
  function handleAuth() {
    setAuthError("");

    if (!isRegister && lockoutRemaining > 0) {
      setAuthError(`تسجيل الدخول مقفل مؤقتاً بسبب كثرة المحاولات. يرجى الانتظار ${lockoutRemaining} ثانية.`);
      return;
    }

    if (!authUser.trim() || !authPass.trim()) { setAuthError("املأ الحقول المطلوبة."); return; }

    if (!turnstileToken) {
      setAuthError("يرجى إكمال التحقق الأمني من Cloudflare أولاً.");
      return;
    }

    const users = getUsers();
    if (isRegister) {
      if (!platformSettings.allowRegistration) {
        setAuthError(siteLang === "en" ? "Account registration is temporarily paused by platform administration." : "تم تعليق إنشاء الحسابات الجديدة مؤقتاً بأمر من إدارة المنصة.");
        setTurnstileToken(null);
        return;
      }
      if (authPass.length < 8 || !/[0-9]/.test(authPass) || !/[A-Z]/.test(authPass)) {
        setAuthError("كلمة المرور قصيرة أو لا تحتوي على رقم وحرف كبير.");
        setTurnstileToken(null);
        return;
      }
      if (users.find(u => u.username === authUser.trim())) {
        setAuthError("اسم المستخدم موجود مسبقاً.");
        setTurnstileToken(null);
        return;
      }
      const newUser: User = { username: authUser.trim(), pass: authPass, role: "student" };
      users.push(newUser);
      setUsers(users);
      const p = getProfiles();
      p[newUser.username] = { avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)], bio: "", avatarUrl: "" };
      setProfiles(p);
      setProfilesMap(p);
      localStorage.setItem("currentUser", JSON.stringify(newUser));
      setSession(newUser);
      setAuthModal(false);
      setAuthUser(""); setAuthPass(""); setTurnstileToken(null);
      setSelectedGrades([]);
      setGradeModal(true);
    } else {
      const found = users.find(u => u.username === authUser.trim() && u.pass === authPass);
      if (!found) {
        const nextFails = failedAttempts + 1;
        setFailedAttempts(nextFails);
        setTurnstileToken(null);
        if (nextFails >= 5) {
          const lockUntil = Date.now() + 60 * 1000;
          localStorage.setItem("login_lockout_until", lockUntil.toString());
          setLockoutRemaining(60);
          setFailedAttempts(0);
          setAuthError("تم قفل تسجيل الدخول لمدة دقيقة بعد ٥ محاولات خاطئة متتالية.");
        } else {
          setAuthError(`خطأ في اسم المستخدم أو كلمة المرور. (المحاولة ${nextFails} من ٥ قبل القفل المؤقت)`);
        }
        return;
      }
      setFailedAttempts(0);
      localStorage.removeItem("login_lockout_until");
      localStorage.setItem("currentUser", JSON.stringify(found));
      setSession(found);
      fetchVotesFromSupabase(found.username);
      setAuthModal(false); setAuthUser(""); setAuthPass(""); setTurnstileToken(null);
    }
    rerender();
  }

  function logout() {
    localStorage.removeItem("currentUser");
    setSession(null);
    if (tab === "admin" || tab === "profile" || tab === "notifications") setTab("feed");
    rerender();
  }

  // ─── Voting (Persisted to Supabase & Central Database) ────────────
  async function castVote(itemKey: string, type: "like" | "dislike", updateFn: (delta: { likes: number; dislikes: number }) => void) {
    if (!session) { setAuthModal(true); return; }

    let amount = 1;
    if (session.role === "owner") {
      const val = prompt("أنت المالك. أدخل عدد الأصوات:", "1");
      amount = parseInt(val || "1") || 1;
      updateFn({ likes: type === "like" ? amount : 0, dislikes: type === "dislike" ? amount : 0 });
      const votesMap = getVotes();
      votesMap[`${session.username}_${itemKey}`] = type;
      setVotes(votesMap);
      rerender();
      return;
    }

    const votesMap = getVotes();
    const voteKey = `${session.username}_${itemKey}`;
    const existing = votesMap[voteKey];
    if (existing === type) return;

    let delta = { likes: 0, dislikes: 0 };
    if (existing) {
      if (existing === "like") delta.likes = -1; else delta.dislikes = -1;
    }
    if (type === "like") delta.likes += 1; else delta.dislikes += 1;

    votesMap[voteKey] = type;
    setVotes(votesMap);
    updateFn(delta);

    // Save to Supabase Central Database
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
    if (postTitle.length > 100 || postBody.length > 1500) return;

    const muteCheck = isUserCurrentlyMuted(session.username);
    if (muteCheck.muted) {
      alert(siteLang === "en"
        ? `Your account is temporarily muted (${muteCheck.remainingText}). Reason: ${muteCheck.reason}`
        : `حسابك محظور مؤقتاً من النشر حتى ${muteCheck.remainingText}. السبب: ${muteCheck.reason}`);
      return;
    }

    if (!platformSettings.allowPosting && session.role === "student") {
      alert(siteLang === "en"
        ? "Post publishing is temporarily paused by platform administration."
        : "تم تعليق نشر المشاركات الجديدة مؤقتاً بأمر من إدارة المنصة.");
      return;
    }

    if (containsProfanity(postTitle, customBannedWords) || containsProfanity(postBody, customBannedWords)) {
      alert(siteLang === "en"
        ? "Post content contains prohibited words."
        : "المحتوى يحتوي على كلمات غير مسموح بها وفق معايير المجتمع والكلمات المحظورة.");
      return;
    }

    // Strict YouTube link validation
    if (postYoutube.trim() && !isValidYoutubeUrl(postYoutube.trim())) {
      alert(siteLang === "en"
        ? "Please enter a valid YouTube link (e.g., https://youtube.com/watch?v=... or https://youtu.be/...)"
        : "يرجى إدخال رابط يوتيوب صحيح (مثل https://youtube.com/watch?v=... أو https://youtu.be/...)");
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
      title: postTitle.trim(),
      body: postBody.trim() + metaSuffix,
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
      title: postTitle.trim(),
      body: postBody.trim(),
      grade_level: postGrade,
      tag: postTag,
      pinned: false,
      likes: 0,
      dislikes: 0,
      reports: 0,
      views: 0,
      status: "active",
      images: postImages,
      youtubeUrl: postYoutube.trim(),
      telegramUrl: "",
      comments: [],
      created_at: new Date().toISOString(),
    };
    setPostsList(prev => [tempPost, ...prev]);

    // Send to Supabase
    try {
      const { data, error } = await supabase.from('posts').insert([newPostPayload]).select('*, comments(*)').single();
      if (!error && data) {
        fetchSupabaseData();
      }
    } catch (e) {
      console.error("Error creating post in Supabase:", e);
    }

    setPostTitle(""); setPostBody(""); setPostGrade("General"); setPostTeacher("");
    setPostTeacherSearch("");
    setPostImages([]); setPostYoutube(""); setPostTelegram(""); setPostTag("discussion");
    setPostModal(false); rerender();
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

  function handlePostImagesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    fileList.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const res = ev.target?.result as string;
        if (res) {
          setPostImages(prev => [...prev, res]);
        }
      };
      reader.readAsDataURL(file);
    });
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

  function safeSessionGet(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSessionSet(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  }

  // Track and register post & comment views in current browser session
  const viewedPostKeysRef = useRef<Set<string>>(new Set());
  const viewedCommentKeysRef = useRef<Set<string>>(new Set());

  const recordPostView = useCallback((postId: string) => {
    if (!postId || viewedPostKeysRef.current.has(postId)) return;
    const sessionKey = `viewed_p_${postId}`;
    if (safeSessionGet(sessionKey)) {
      viewedPostKeysRef.current.add(postId);
      return;
    }
    viewedPostKeysRef.current.add(postId);
    safeSessionSet(sessionKey, "1");

    setPostsList(prev => {
      let nextViews = 1;
      const updated = prev.map(p => {
        if (p.id === postId) {
          nextViews = (p.views || 0) + 1;
          return { ...p, views: nextViews };
        }
        return p;
      });
      setPosts(updated);
      try {
        supabase.from('posts').update({ views: nextViews }).eq('id', postId).then(() => {}, () => {});
      } catch {}
      return updated;
    });
  }, []);

  const recordCommentView = useCallback((postId: string, commentId: string) => {
    if (!commentId || viewedCommentKeysRef.current.has(commentId)) return;
    const sessionKey = `viewed_c_${commentId}`;
    if (safeSessionGet(sessionKey)) {
      viewedCommentKeysRef.current.add(commentId);
      return;
    }
    viewedCommentKeysRef.current.add(commentId);
    safeSessionSet(sessionKey, "1");

    setPostsList(prev => {
      let nextViews = 1;
      const updated = prev.map(p => {
        if (p.id === postId) {
          const updatedComments = (p.comments || []).map(c => {
            if (c.id === commentId) {
              nextViews = (c.views || 0) + 1;
              return { ...c, views: nextViews };
            }
            return c;
          });
          return { ...p, comments: updatedComments };
        }
        return p;
      });
      setPosts(updated);
      try {
        supabase.from('comments').update({ views: nextViews }).eq('id', commentId).then(() => {}, () => {});
      } catch {}
      return updated;
    });
  }, []);

  // Automatically batch-record views on mount in current session without multiple state dispatches
  useEffect(() => {
    if (!posts.length) return;

    const postsToInc = new Set<string>();
    const commentsToInc = new Set<string>();

    posts.forEach(p => {
      if (!viewedPostKeysRef.current.has(p.id)) {
        const sKey = `viewed_p_${p.id}`;
        if (!safeSessionGet(sKey)) {
          safeSessionSet(sKey, "1");
          postsToInc.add(p.id);
        }
        viewedPostKeysRef.current.add(p.id);
      }

      (p.comments || []).forEach(c => {
        if (!viewedCommentKeysRef.current.has(c.id)) {
          const cKey = `viewed_c_${c.id}`;
          if (!safeSessionGet(cKey)) {
            safeSessionSet(cKey, "1");
            commentsToInc.add(c.id);
          }
          viewedCommentKeysRef.current.add(c.id);
        }
      });
    });

    if (postsToInc.size === 0 && commentsToInc.size === 0) return;

    // Single atomic state update to prevent cascading re-renders
    setPostsList(prev => {
      const updated = prev.map(p => {
        const shouldIncPost = postsToInc.has(p.id);
        const postViews = shouldIncPost ? (p.views || 0) + 1 : (p.views || 0);
        const updatedComments = (p.comments || []).map(c => {
          const shouldIncC = commentsToInc.has(c.id);
          return shouldIncC ? { ...c, views: (c.views || 0) + 1 } : c;
        });
        return { ...p, views: postViews, comments: updatedComments };
      });
      setPosts(updated);
      return updated;
    });

    postsToInc.forEach(pid => {
      try {
        const target = posts.find(p => p.id === pid);
        const nextV = (target?.views || 0) + 1;
        supabase.from('posts').update({ views: nextV }).eq('id', pid).then(() => {}, () => {});
      } catch {}
    });

    commentsToInc.forEach(cid => {
      try {
        supabase.from('comments').update({ views: 1 }).eq('id', cid).then(() => {}, () => {});
      } catch {}
    });
  }, [posts.length]);

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

  function saveReportRecord(r: ReportRecord) {
    if (typeof window === "undefined") return;
    try {
      const list = getReportRecords();
      list.unshift(r);
      localStorage.setItem("report_records_v1", JSON.stringify(list.slice(0, 200)));
      setReportRecordsList(list);
    } catch {}
  }

  async function dismissReport(reportId: string, targetId: string) {
    const list = getReportRecords().map(r => r.id === reportId ? { ...r, status: "dismissed" as const } : r);
    localStorage.setItem("report_records_v1", JSON.stringify(list));
    setReportRecordsList(list);

    setPostsList(prev => prev.map(p => p.id === targetId ? { ...p, reports: 0, status: "active" } : p));
    try {
      await supabase.from('posts').update({ reports: 0, status: "active" }).eq('id', targetId);
    } catch (e) {
      console.error("Error dismissing report in Supabase:", e);
    }
    rerender();
  }

  async function adminDeleteReportedItem(targetId: string, targetType: "post" | "comment", reportId?: string) {
    if (!confirm("هل أنت متأكد من الحذف النهائي لهذا المحتوى؟")) return;

    if (targetType === "post") {
      deletePost(targetId);
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
          console.error("Error deleting comment in Supabase:", e);
        }
      }
    }

    if (reportId) {
      const list = getReportRecords().map(r => r.id === reportId ? { ...r, status: "resolved" as const } : r);
      localStorage.setItem("report_records_v1", JSON.stringify(list));
      setReportRecordsList(list);
    }
    rerender();
  }

  function sendAdminWarning(authorUsername: string, targetTitle?: string) {
    if (!session) return;
    const notifs = getNotifications();
    notifs.unshift({
      id: "notif_warn_" + Date.now(),
      recipient: authorUsername,
      actor: "إدارة المنصة",
      type: "admin_warning",
      postId: "",
      targetTitle: targetTitle || "محتوى مخالف",
      commentText: "تنبيه إداري رسمي: تلقى حسابك تحذيراً بشأن محتوى مخالف لسياسات المنصة. يُرجى الالتزام بالقواعد لتجنب حظر الحساب نهائياً.",
      read: false,
      created_at: new Date().toISOString(),
    });
    setNotifications(notifs);
    setAllNotifications(notifs);
    alert(`تم توجيه إنذار إداري رسمي للمستخدم: ${authorUsername}`);
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
    if (!reportTarget) return;
    if (getWordCount(reportNote) > 50) {
      alert("الملاحظة يجب ألا تتجاوز 50 كلمة.");
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
      targetTitle: reportTarget.title,
      reporter: session.username,
      reason: reportReason,
      note: reportNote.trim(),
      created_at: new Date().toISOString(),
      status: "pending",
    };
    saveReportRecord(record);

    // Notify all moderators and owners of this incoming report
    const adminUsers = getUsers().filter(u => u.role === "owner" || u.role === "mod");
    const notifs = getNotifications();
    const reasonArabic = reportReason === "inappropriate" ? "محتوى غير لائق ومسيء" : reportReason === "wrong_info" ? "معلومات خاطئة ومضللة" : "سبب آخر";
    adminUsers.forEach(adm => {
      notifs.unshift({
        id: "notif_rep_" + Date.now() + "_" + adm.username,
        recipient: adm.username,
        actor: session.username,
        type: "report_alert",
        postId: reportTarget.id,
        targetTitle: reportTarget.title || "محتوى",
        commentText: `بلاغ جديد [${reasonArabic}]: ${reportNote.trim() || "بدون ملاحظة إضافية"}`,
        read: false,
        created_at: new Date().toISOString(),
      });
    });
    setNotifications(notifs);
    setAllNotifications(notifs);

    setReportTarget(null);
    setReportNote("");
    setReportReason("inappropriate");
    rerender();
    alert("تم تسجيل بلاغك بنجاح وسيقوم المشرفون بمراجعته في لوحة التحكم.");
  }


  async function addComment(postId: string, textOverride?: string) {
    if (!session) { setAuthModal(true); return; }

    const muteCheck = isUserCurrentlyMuted(session.username);
    if (muteCheck.muted) {
      alert(siteLang === "en"
        ? `Your account is temporarily muted (${muteCheck.remainingText}). Reason: ${muteCheck.reason}`
        : `حسابك محظور مؤقتاً من كتابة التعليقات حتى ${muteCheck.remainingText}. السبب: ${muteCheck.reason}`);
      return;
    }

    const input = (document.getElementById(`comment-${postId}`) || document.getElementById(`profile-comment-${postId}`)) as HTMLInputElement;
    const rawText = textOverride || input?.value || "";
    if (!rawText.trim()) return;
    if (containsProfanity(rawText, customBannedWords)) {
      alert(siteLang === "en" ? "Comment contains prohibited words." : "التعليق يحتوي على كلمات غير مسموح بها وفق معايير المجتمع.");
      return;
    }

    const commentText = rawText.trim();

    // Optimistic UI update
    const tempComment: Comment = {
      id: "temp_c_" + Date.now(),
      author: session.username,
      text: commentText,
      created_at: new Date().toISOString(),
      likes: 0,
      dislikes: 0,
      reports: 0,
      views: 0,
    };

    setPostsList(prev => prev.map(p => {
      if (p.id === postId) {
        return { ...p, comments: [...(p.comments || []), tempComment] };
      }
      return p;
    }));

    // Trigger notification if replying to another user
    const targetPost = posts.find(p => p.id === postId);
    if (targetPost && targetPost.author !== session.username) {
      const notifs = getNotifications();
      notifs.unshift({
        id: "notif_" + Date.now(),
        recipient: targetPost.author,
        actor: session.username,
        type: "comment",
        postId: targetPost.id,
        targetTitle: targetPost.title,
        commentText: commentText,
        read: false,
        created_at: new Date().toISOString(),
      });
      setNotifications(notifs);
      setAllNotifications(notifs);
    }

    if (input) input.value = "";

    // Send to Supabase Central Database
    try {
      await supabase.from('comments').insert([{
        post_id: postId,
        author: session.username,
        text: commentText,
        likes: 0,
        dislikes: 0,
        reports: 0,
      }]);
      fetchSupabaseData();
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
    if (!confirm("هل أنت متأكد من حذف هذا المنشور/التقييم؟")) return;

    setPostsList(prev => prev.filter(item => item.id !== postId));
    try {
      await supabase.from('posts').delete().eq('id', postId);
      fetchSupabaseData();
    } catch (e) {
      console.error("Error deleting post from Supabase:", e);
    }
    rerender();
  }

  // Delete Teacher (Owner / Mod only)
  async function deleteTeacher(teacherId: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) {
      alert("عذراً، هذه الصلاحية للمالك والمشرفين فقط.");
      return;
    }
    const target = teachers.find(t => t.id === teacherId);
    if (!target) return;
    if (!confirm(`هل أنت متأكد من حذف المدرس "${target.name}" نهائياً من المنصة؟`)) return;

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
    alert("تم حذف المدرس بنجاح.");
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
            resolve(canvas.toDataURL("image/jpeg", quality));
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

    if (!platformSettings.allowTeacherSubmissions && session.role === "student") {
      alert(siteLang === "en" ? "New teacher suggestions are temporarily paused by platform administration." : "تم تعليق اقتراح المدرسين الجدد مؤقتاً بأمر من إدارة المنصة.");
      return;
    }

    const finalSubject = tSubjectChoice === "أخرى" ? tCustomSubject.trim() : tSubjectChoice.trim();
    if (!tName.trim()) { alert("يرجى كتابة اسم المدرس."); return; }
    if (!finalSubject) { alert("يرجى اختيار أو كتابة المادة الدراسية."); return; }
    if (tSelectedGrades.length === 0) { alert("يرجى اختيار مرحلة دراسية واحدة على الأقل."); return; }
    if (tTeachingModes.length === 0) { alert("يرجى تحديد طريقة تدريس واحدة على الأقل (حضوري أو إلكتروني)."); return; }
    if (!tImg.trim()) { alert("يرجى رفع ملف صورة للمدرس (ملف صورة وليس رابط)."); return; }

    const normalized = normalizeTeacherName(tName.trim());
    const isDupe = teachers.some(t =>
      (t.normalizedName === normalized || t.normalized_name === normalized) &&
      t.subject === finalSubject &&
      t.gov === tGov
    );
    if (isDupe) { alert("هذا المدرس موجود مسبقاً في قسم المدرسين!"); return; }

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
    alert("تم إرسال الأستاذ بنجاح وهو الآن في قائمة الانتظار للمراجعة من قبل المشرفين!");
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

    const muteCheck = isUserCurrentlyMuted(session.username);
    if (muteCheck.muted) {
      alert(siteLang === "en"
        ? `Your account is temporarily muted (${muteCheck.remainingText}). Reason: ${muteCheck.reason}`
        : `حسابك محظور مؤقتاً من كتابة التقييمات حتى ${muteCheck.remainingText}. السبب: ${muteCheck.reason}`);
      return;
    }

    if (!platformSettings.allowReviews && session.role === "student") {
      alert(siteLang === "en" ? "Review submissions are temporarily paused by platform administration." : "تم تعليق إضافة التقييمات مؤقتاً بأمر من إدارة المنصة.");
      return;
    }

    if (!reviewVerdict) {
      alert("يرجى تحديد هل المدرس أعجبك أو لم يعجبك للمتابعة.");
      return;
    }
    if (!reviewBody.trim()) { alert("يرجى كتابة نص التقييم أو المراجعة."); return; }
    if (containsProfanity(reviewTitle, customBannedWords) || containsProfanity(reviewBody, customBannedWords)) {
      alert("المحتوى يحتوي على كلمات غير مسموح بها وفق معايير المجتمع.");
      return;
    }

    const titleText = reviewTitle.trim() || `تقييم للأستاذ ${selectedTeacher.name}`;
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
      views: 0,
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
    alert("تم نشر تقييمك للأستاذ بنجاح!");
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
        commentText: `تمت الموافقة على طلبك لإضافة المدرس "${target?.name}" بنجاح! أصبح الآن متاحاً للجميع في قسم المدرسين.`,
        read: false,
        created_at: new Date().toISOString(),
      });
      setNotifications(notifs);
      setAllNotifications(notifs);
    }
    addAuditLog("قبول مدرس", target?.name || id, "الموافقة على نشر المدرس في دليل المدرسين");
    rerender();
    alert("تمت الموافقة على الأستاذ وإرسال إشعار لصاحب الطلب!");
  }

  async function rejectTeacher(id: string) {
    const target = teachers.find(t => t.id === id);
    if (!target) return;
    if (!confirm(`هل أنت متأكد من رفض وحذف طلب الأستاذ "${target.name}"؟`)) return;
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
        commentText: `نعتذر، لم تتم الموافقة على طلب إضافة المدرس "${target.name}".`,
        read: false,
        created_at: new Date().toISOString(),
      });
      setNotifications(notifs);
      setAllNotifications(notifs);
    }
    addAuditLog("رفض مدرس", target.name, "رفض وحذف طلب إضافة المدرس");
    rerender();
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
  function saveProfile() {
    if (!session) return;
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

  function handlePfpUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      if (result) setEditPfpUrl(result);
    };
    reader.readAsDataURL(file);
  }

  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      if (result) setEditBannerUrl(result);
    };
    reader.readAsDataURL(file);
  }

  // ─── Support Inquiries Handlers ──────────────────────────────────
  function submitSupportTicket() {
    if (!supportSubject.trim() || !supportMessage.trim()) {
      alert(siteLang === "en" ? "Please fill in the subject and message." : "يرجى كتابة عنوان ورسالة الاستفسار.");
      return;
    }
    const newTicket: SupportTicket = {
      id: "ticket_" + Date.now(),
      sender: session ? session.username : (supportContact.trim() || (siteLang === "en" ? "Guest Student" : "طالب زائر")),
      contact: supportContact.trim(),
      category: supportCategory,
      subject: supportSubject.trim(),
      message: supportMessage.trim(),
      status: "open",
      created_at: new Date().toISOString(),
    };

    const existing = getSupportTickets();
    const updated = [newTicket, ...existing];
    setSupportTicketsStorage(updated);
    setSupportTickets(updated);

    setSupportSubject("");
    setSupportMessage("");
    setSupportContact("");
    setSupportSuccess(true);
    setTimeout(() => setSupportSuccess(false), 5000);
  }

  function resolveSupportTicket(id: string) {
    const existing = getSupportTickets();
    const updated = existing.map(t => t.id === id ? { ...t, status: (t.status === "open" ? "resolved" : "open") as any } : t);
    setSupportTicketsStorage(updated);
    setSupportTickets(updated);
    rerender();
  }

  function deleteSupportTicket(id: string) {
    if (!confirm(siteLang === "en" ? "Delete this support ticket?" : "هل أنت متأكد من حذف تذكرة الدعم هذه؟")) return;
    const existing = getSupportTickets();
    const updated = existing.filter(t => t.id !== id);
    setSupportTicketsStorage(updated);
    setSupportTickets(updated);
    addAuditLog("حذف تذكرة دعم", `تذكرة #${id}`, "حذف تذكرة الدعم الفني");
    rerender();
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

  function sendNotificationToUser(username: string, payload: { type: string; message: string; title?: string }) {
    const notifs = getNotifications();
    notifs.unshift({
      id: "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      recipient: username,
      actor: session?.username || "الإدارة",
      type: payload.type as any,
      postId: "",
      targetTitle: payload.title || "تنبيه إداري",
      commentText: payload.message,
      read: false,
      created_at: new Date().toISOString(),
    });
    setNotifications(notifs);
    setAllNotifications(notifs);
  }

  function isUserCurrentlyMuted(username: string): { muted: boolean; remainingText?: string; reason?: string } {
    if (!username) return { muted: false };
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

  function handleMuteUser(username: string, duration: "24h" | "7d" | "30d" | "permanent", reason: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) return;
    if (username === session.username) {
      alert("لا يمكنك حظر حسابك الشخصي!");
      return;
    }
    const targetUser = getUsers().find(u => u.username === username);
    if (targetUser?.role === "owner") {
      alert("لا يمكن حظر مالك المنصة!");
      return;
    }
    if (session.role === "mod" && targetUser?.role === "mod") {
      alert("لا يمكن لمشرف حظر مشرف آخر!");
      return;
    }

    let ms = 24 * 60 * 60 * 1000;
    if (duration === "7d") ms = 7 * 24 * 60 * 60 * 1000;
    if (duration === "30d") ms = 30 * 24 * 60 * 60 * 1000;
    if (duration === "permanent") ms = 365 * 10 * 24 * 60 * 60 * 1000;

    const until = Date.now() + ms;
    const finalReason = reason.trim() || "مخالفة معايير المجتمع وقواعد النشر";

    const mutedMap = getMutedUsers();
    mutedMap[username] = { until, reason: finalReason, mutedBy: session.username };
    setMutedUsers(mutedMap);
    setMutedUsersState({ ...mutedMap });

    const strikesMap = getUserStrikes();
    const current = strikesMap[username] || { count: 0, history: [] };
    current.count += 1;
    current.history.unshift({
      date: new Date().toISOString(),
      reason: `حظر (${duration}): ${finalReason}`,
      by: session.username,
    });
    strikesMap[username] = current;
    setUserStrikes(strikesMap);
    setUserStrikesState({ ...strikesMap });

    sendNotificationToUser(username, {
      type: "report",
      message: `تم حظر حسابك مؤقتاً لمدة (${duration}) من قبل الإدارة. السبب: ${finalReason}`,
    });

    addAuditLog("حظر مؤقت لمستخدم", username, `حظر لمدة ${duration}، السبب: ${finalReason}`);
    setAdminMuteReason("");
    rerender();
    alert(`تم تطبيق الحظر المؤقت على المستخدم ${username} بنجاح.`);
  }

  function handleUnmuteUser(username: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) return;
    const mutedMap = getMutedUsers();
    delete mutedMap[username];
    setMutedUsers(mutedMap);
    setMutedUsersState({ ...mutedMap });

    sendNotificationToUser(username, {
      type: "report",
      message: "تم رفع الحظر عن حسابك بواسطة إدارة المنصة. نتمنى الالتزام بالقواعد.",
    });

    addAuditLog("رفع الحظر عن مستخدم", username, "تم إلغاء الحظر اليدوي");
    rerender();
    alert(`تم رفع الحظر عن ${username}.`);
  }

  function handleIssueWarning(username: string, reason: string) {
    if (!session || (session.role !== "owner" && session.role !== "mod")) return;
    const finalReason = reason.trim() || "تنبيه إداري رسمي لمخالفة القواعد";
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
      message: `إنذار إداري رسمي: ${finalReason} (عدد الإنذارات المسجلة: ${current.count})`,
    });

    addAuditLog("توجيه إنذار رسمي", username, `إنذار #${current.count}: ${finalReason}`);
    setAdminWarningReason("");
    rerender();
    alert(`تم توجيه الإنذار للمستخدم ${username} بنجاح.`);
  }

  function openModPermissionModal(username: string) {
    if (!session || (!canOwner && !hasPermission("canManageStaff"))) {
      alert("صلاحية تعيين المشرفين وتحديد الصلاحيات مقتصرة على المالك أو الإداري المفوض!");
      return;
    }
    const allUsers = getUsers();
    const target = allUsers.find(u => u.username === username);
    if (!target) return;
    if (target.role === "owner") {
      alert("لا يمكن تعديل صلاحيات مالك المنصة!");
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

    const allUsers = getUsers();
    const target = allUsers.find(u => u.username === permModalUser);
    if (!target || target.role === "owner") return;

    const wasStudent = target.role === "student";
    target.role = "mod";
    setUsers(allUsers);

    const updatedPermsMap = { ...getModPermissions(), [permModalUser]: permForm };
    setModPermissionsStorage(updatedPermsMap);
    setModPermissionsMap(updatedPermsMap);

    const totalGranted = Object.values(permForm).filter(Boolean).length;
    const hasOwnerPowers = permForm.canManageAnnouncements || permForm.canViewAuditLog || permForm.canManagePlatformToggles || permForm.canToggleMaintenance || permForm.canExportData || permForm.canManageStaff;

    addAuditLog(
      wasStudent ? "ترقية لرتبة مشرف مع تخصيص الصلاحيات" : "تعديل صلاحيات مشرف",
      permModalUser,
      `تم منح (${totalGranted}/11) صلاحية ${hasOwnerPowers ? "شاملة صلاحيات إدارية للمالك" : "إشرافية"}`
    );

    sendNotificationToUser(permModalUser, {
      type: "badge",
      message: wasStudent
        ? `تهانينا! لقد قام ${session.username} بترقيتك إلى رتبة مشرف مع منحك (${totalGranted}) صلاحية إدارية خاصة.`
        : `تم تحديث صلاحياتك الإشرافية (${totalGranted} صلاحية مفعّلة) من قِبل إدارة المنصة.`,
    });

    setPermModalUser(null);
    rerender();
    alert(`تم حفظ وتطبيق صلاحيات المشرف (${permModalUser}) بنجاح!`);
  }

  function handleDemoteToStudent(username: string) {
    if (!session || (!canOwner && !hasPermission("canManageStaff"))) {
      alert("صلاحية تعديل الرتب مقتصرة على المالك أو الإداري المفوض!");
      return;
    }
    const allUsers = getUsers();
    const target = allUsers.find(u => u.username === username);
    if (!target) return;
    if (target.role === "owner") {
      alert("لا يمكن تخفيض رتبة مالك المنصة!");
      return;
    }
    if (!confirm(`هل أنت متأكد من سحب صلاحيات الإشراف من ${username} وتخفيضه إلى طالب؟`)) return;

    target.role = "student";
    setUsers(allUsers);

    const updatedPermsMap = { ...getModPermissions() };
    delete updatedPermsMap[username];
    setModPermissionsStorage(updatedPermsMap);
    setModPermissionsMap(updatedPermsMap);

    addAuditLog("تخفيض لرتبة طالب", username, "تم سحب صلاحيات الإشراف بالكامل");
    sendNotificationToUser(username, {
      type: "report",
      message: "تم تعديل رتبة حسابك إلى طالب عادي وإلغاء صلاحيات الإشراف.",
    });
    rerender();
    alert(`تم سحب صلاحيات الإشراف من ${username}.`);
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
      alert("صلاحية إدارة شريط التنبيهات مقتصرة على المالك أو المشرفين المفوضين!");
      return;
    }
    if (!text.trim() && active) {
      alert("يرجى كتابة نص التنبيه أولاً قبل التفعيل.");
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
        ? `تفعيل إعلان (${type}): ${text.slice(0, 35)}... ${expiresAt ? `(ينتهي بعد ${duration})` : "(بدون انتهاء تلقائي)"}`
        : "إلغاء تفعيل الإعلان"
    );
    rerender();
    alert(active ? "تم تفعيل ونشر التنبيه العام في أعلى الموقع بنجاح!" : "تم إيقاف التنبيه العام.");
  }

  function handleDeleteAnnouncement() {
    if (!session || (!canOwner && !hasPermission("canManageAnnouncements"))) {
      alert("صلاحية حذف شريط التنبيهات مقتصرة على المالك أو المشرفين المفوضين!");
      return;
    }
    if (!confirm("هل أنت متأكد من حذف التنبيه العام نهائياً وإزالته من المنصة؟")) return;

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
    alert("تم حذف التنبيه العام نهائياً.");
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
      alert("النسخ الاحتياطي متاح فقط لمالك المنصة.");
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

  const faqList = [
    {
      q: {
        ar: "كيف يتم احتساب نسبة قبول المدرس وتقييماته؟",
        en: "How are teacher approval percentages and ratings calculated?",
      },
      a: {
        ar: "يتم احتساب نسبة القبول من خلال قياس نسبة الطلاب الذين اختاروا (أعجبني) مقارنة بإجمالي عدد المصوتين مع استبعاد التكرارات العشوائية. كما تظهر مراجعات الطلاب التفصيلية لتوضح مميزات وطريقة تدريس كل أستاذ بحيادية تامة.",
        en: "The approval percentage is calculated by dividing positive votes (thumbs up) by total votes. Detailed written reviews provide students with honest insight into teaching methods.",
      },
    },
    {
      q: {
        ar: "كيف أقوم باقتراح مدرس جديد لإضافته إلى المنصة؟",
        en: "How do I propose a new teacher to be added?",
      },
      a: {
        ar: "اضغط على زر (إضافة مدرس) في قسم المدرسين، ثم املأ اسم المدرس، محافظته، المادة الدراسية، المراحل، وطريقة تدريسه (حضوري أو إلكتروني أو كلاهما)، ثم ارفع ملف صورة المدرس. ينتقل الطلب مباشرة إلى قائمة الانتظار للمراجعة من قبل المشرفين.",
        en: "Click 'Add Teacher' in the directory tab, fill in the teacher's name, governorate, subject, grades, and teaching mode (in-person, online, or both), and upload an image file. The request is submitted to the admin waiting list for verification.",
      },
    },
    {
      q: {
        ar: "ما هي شروط كتابة مراجعة وتقييم للمدرس؟",
        en: "What are the rules for writing a review on a teacher?",
      },
      a: {
        ar: "يشترط أولاً تسجيل الدخول واختيار (أعجبني أو لم يعجبني) كشرط إلزامي قبل كتابة التقييم. يجب أن تكون المراجعة موضوعية ومحترمة وخالية من أي ألفاظ مسيئة أو تجريح شخصي وفق معايير مجتمع طلاب العراق.",
        en: "You must be logged in and explicitly select your recommendation verdict (Recommend / Dislike). Reviews must remain respectful, objective, and constructive without personal insults.",
      },
    },
    {
      q: {
        ar: "كيف تعمل لوحة شرف الطلاب وما هي معايير الترتيب؟",
        en: "How does the Student Honor Board work and how are ranks decided?",
      },
      a: {
        ar: "تُكرّم لوحة الشرف أفضل ١٠ طلاب في المنصة اعتماداً على مجموع الإعجابات التي حصلوا عليها على منشوراتهم ومراجعاتهم وردودهم المفيدة ومساهماتهم الفعالة في مساعدة زملائهم الطلاب في عموم العراق.",
        en: "The Honor Board recognizes the top 10 most helpful students based on total positive feedback, likes received on study advice, and verified teacher reviews.",
      },
    },
    {
      q: {
        ar: "كيف أتحكم في مظهر وثيم ولغة الموقع؟",
        en: "How do I change the website theme and language?",
      },
      a: {
        ar: "يمكنك في أي وقت الضغط على زر (الإعدادات) في الشريط العلوي للاختيار بين 5 ثيمات متنوعة (الكلاسيكي، الوضع الليلي، النمر الوردي، الطبيعة الخضراء، والأرجواني التقني)، بالإضافة للتبديل الفوري بين العربية والإنجليزية.",
        en: "Click on the Settings button in the top navigation at any time to switch between 5 visual Neo-brutalist themes or toggle between Arabic and English with full directional layout support.",
      },
    },
  ];

  // ─── Grade onboarding ─────────────────────────────────────────────
  function completeGrades() { localStorage.setItem("gradesDone", JSON.stringify(selectedGrades)); setGradeModal(false); }

  // ─── Data Views ───────────────────────────────────────────────────
  const myNotifications = session ? allNotifications.filter(n => n.recipient === session.username) : [];
  const unreadCount = myNotifications.filter(n => !n.read).length;

  function markAllNotifsRead() {
    if (!session) return;
    const updated = allNotifications.map(n => n.recipient === session.username ? { ...n, read: true } : n);
    setNotifications(updated);
    setAllNotifications(updated);
    rerender();
  }

  const activePosts = posts.filter(p => p.status === "active");
  const activeTeachers = teachers.filter(t => t.status === "active");
  const filteredTeachers = activeTeachers.filter(t => {
    const q = dirSearch.trim().toLowerCase();
    const matchesSearch = !q ||
      t.name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.gov.toLowerCase().includes(q) ||
      (t.grades && t.grades.toLowerCase().includes(q));
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
      const aTotal = a.likes + a.dislikes;
      const bTotal = b.likes + b.dislikes;
      const aPct = aTotal > 0 ? a.likes / aTotal : 0;
      const bPct = bTotal > 0 ? b.likes / bTotal : 0;
      return bPct - aPct;
    }
    if (sortTeacherBy === "reviews") {
      const aReviews = posts.filter(p => p.teacher_id === a.id || p.teacherId === a.id).length;
      const bReviews = posts.filter(p => p.teacher_id === b.id || p.teacherId === b.id).length;
      return bReviews - aReviews;
    }
    return 0; // newest / default order
  });

  // Top trending teachers this week based on interactions (likes + dislikes + reviews)
  const trendingTeachers = [...activeTeachers]
    .map(t => {
      const reviewCount = posts.filter(p => p.teacher_id === t.id || p.teacherId === t.id).length;
      const score = t.likes * 2 + t.dislikes + reviewCount * 3;
      return { ...t, trendScore: score, reviewCount };
    })
    .sort((a, b) => b.trendScore - a.trendScore)
    .slice(0, 5);

  // Top students ranked by total likes and rating received on posts, reviews, and comments (No limit)
  const allStudentUsernames = Array.from(
    new Set([
      ...Object.keys(profiles),
      ...posts.map(p => p.author).filter(Boolean),
      ...getUsers().map((u: User) => u.username).filter(Boolean),
    ])
  );
  const topHonorStudents = allStudentUsernames.map(username => {
    const userPosts = posts.filter(p => p.author === username);
    const userLikes = userPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
    const userDislikes = userPosts.reduce((sum, p) => sum + (p.dislikes || 0), 0);
    const userReviews = userPosts.filter(p => p.grade_level?.includes("تقييم أستاذ") || p.teacher_id || p.teacherId).length;
    const totalVotes = userLikes + userDislikes;
    const approvalRate = totalVotes > 0 
      ? Math.round((userLikes / totalVotes) * 100) 
      : (userLikes > 0 ? 100 : (userPosts.length > 0 ? 95 : 0));
    return {
      username,
      profile: profiles[username] || { avatarColor: "#0d9488", bio: "" },
      totalLikes: userLikes,
      totalDislikes: userDislikes,
      reviewsCount: userReviews,
      postsCount: userPosts.length,
      approvalRate,
    };
  })
  .filter(s => s.postsCount > 0 || s.totalLikes > 0)
  .sort((a, b) => b.totalLikes - a.totalLikes || b.approvalRate - a.approvalRate || b.postsCount - a.postsCount);

  // Teacher Badges & Milestones Helper
  function getTeacherBadges(t: Teacher): { label: string; cls: string; type: "favorite" | "top_subject" | "active" }[] {
    const badges: { label: string; cls: string; type: "favorite" | "top_subject" | "active" }[] = [];
    const totalVotes = t.likes + t.dislikes;
    const approvalRate = totalVotes > 0 ? (t.likes / totalVotes) * 100 : 0;
    const reviewCount = posts.filter(p => p.teacher_id === t.id || p.teacherId === t.id).length;

    if (totalVotes >= 5 && approvalRate >= 85) {
      badges.push({ label: "مفضل لدى الطلاب", cls: "bg-emerald-100 text-emerald-950 border-emerald-600", type: "favorite" });
    }

    if (reviewCount >= 3) {
      badges.push({ label: "الأكثر مراجعات ونشاطاً", cls: "bg-blue-100 text-blue-950 border-blue-600", type: "active" });
    }

    const sameSubjectTeachers = activeTeachers.filter(other => other.subject === t.subject && (other.likes + other.dislikes) >= 3);
    if (sameSubjectTeachers.length > 1) {
      const topTeacher = sameSubjectTeachers.reduce((max, curr) => (curr.likes - curr.dislikes) > (max.likes - max.dislikes) ? curr : max, sameSubjectTeachers[0]);
      if (topTeacher.id === t.id && (t.likes - t.dislikes) > 0) {
        badges.push({ label: `الأعلى تقييماً في ال${t.subject}`, cls: "bg-amber-100 text-amber-950 border-amber-600", type: "top_subject" });
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

  // Helper: role icon
  const RoleIcon = ({ role }: { role: string }) => {
    if (role === "owner") return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-200 text-amber-900 border border-amber-600 text-[9px] font-black"><IconCrown size={10} /> مالك</span>;
    if (role === "mod") return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-900 border border-blue-600 text-[9px] font-black"><IconShield size={10} /> مشرف</span>;
    return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-400 text-[9px] font-black"><IconGrad size={10} /> طالب</span>;
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
      views: p.views || 0,
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
      views: r.views || 0,
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
      views: c.comment.views || 0,
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
              <button onClick={() => setTab("notifications")}
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
              <button onClick={() => setTab("admin")}
                className={`px-3 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1 ${tab === "admin" ? "border-slate-900 bg-red-600 text-white shadow-[2px_2px_0px_#7f1d1d]" : "border-red-600 bg-red-50 text-red-700"}`}>
                {t("navAdmin")} <IconBolt size={12} />
              </button>
            )}
          </nav>

          {/* User Auth & Settings / Language Widget */}
          <div className="flex items-center gap-2">
            {/* Language Quick Toggle */}
            <button
              onClick={() => {
                const nextLang = siteLang === "ar" ? "en" : "ar";
                setSiteLang(nextLang);
                localStorage.setItem("iq_site_lang", nextLang);
              }}
              className="px-2.5 py-1.5 text-xs font-black border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000] flex items-center gap-1 active:translate-x-px active:translate-y-px transition-all"
              title={siteLang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            >
              <IconGlobe size={13} />
              <span>{siteLang === "ar" ? "EN" : "عربي"}</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setSettingsModal(true)}
              className="p-1.5 text-xs font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000] flex items-center justify-center text-slate-900 active:translate-x-px active:translate-y-px transition-all"
              title={t("navSettings")}
            >
              <IconSettings size={16} />
            </button>

            {!session ? (
              <>
                <button onClick={() => { setIsRegister(false); setAuthModal(true); setAuthError(""); setTurnstileToken(null); }}
                  className="px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000]">{t("login")}</button>
                <button onClick={() => { setIsRegister(true); setAuthModal(true); setAuthError(""); setTurnstileToken(null); }}
                  className="px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#000]">{t("register")}</button>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-white border-2 border-slate-900 px-2.5 py-1 shadow-[2px_2px_0px_#000]">
                <button onClick={() => { setViewedUser(session.username); setTab("profile"); }} className="hover:opacity-70"><Avatar username={session.username} /></button>
                <div className="text-right">
                  <button onClick={() => { setViewedUser(session.username); setTab("profile"); }} className="text-xs font-black hover:underline block">{session.username}</button>
                  <div className="text-[9px]"><RoleIcon role={session.role} /></div>
                </div>
                <button onClick={logout} title={t("logout")} className="text-red-600 mr-1 p-1 hover:bg-red-50 rounded"><IconX size={14} /></button>
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
                <span>{siteLang === "en" ? "Staff Login (Mods & Owner)" : "تسجيل دخول الكادر الإداري (مشرفين / مالك)"}</span>
              </button>
            </div>
          </section>
        ) : (
          <>
        {/* ──── TAB 1: FEED (الرئيسية) ──── */}
        {tab === "feed" && (
          <section className="space-y-6">
            {/* 1. Trending Teachers This Week */}
            {trendingTeachers.length > 0 && (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-4 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-amber-100 border border-amber-500 text-amber-700 flex items-center justify-center font-bold">
                      <IconFlame size={16} />
                    </div>
                    <div>
                      <h3 className="font-black text-xs sm:text-sm text-slate-900">المدرسين الأكثر رواجاً هذا الأسبوع</h3>
                      <p className="text-[10px] text-slate-500 font-semibold">بناءً على تفاعلات الطلاب والمراجعات النشطة</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTab("directory")}
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
                  >
                    عرض كل المدرسين ←
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
                        <IconThumbUp size={9} /> {t.likes} • {t.reviewCount} تقييم
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Student Honor Board (لوحة شرف الطلاب) */}
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-amber-400 border border-slate-900 text-slate-900 flex items-center justify-center font-bold shadow-[1px_1px_0px_#000]">
                    <IconAward size={16} />
                  </div>
                  <div>
                    <h3 className="font-black text-xs sm:text-sm text-slate-900">لوحة شرف الطلاب الأكثر تفاعلاً ومساعدة</h3>
                    <p className="text-[10px] text-slate-500 font-semibold">تكريم أفضل الطلاب الذين ينشرون المراجعات الموثوقة والإجابات المفيدة</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHonorBoard(!showHonorBoard)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-900 shadow-[1px_1px_0px_#000] transition-all"
                >
                  {showHonorBoard ? "إخفاء لوحة الشرف" : `عرض الطلاب المتميزين (${topHonorStudents.length})`}
                </button>
              </div>

              {showHonorBoard && (
                <div className="pt-2.5 border-t border-slate-200">
                  {topHonorStudents.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 font-bold">لا يوجد طلاب متفاعلون حالياً</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[460px] overflow-y-auto pr-1">
                      {topHonorStudents.map((s, idx) => (
                        <div
                          key={s.username}
                          onClick={() => { setViewedUser(s.username); setTab("profile"); }}
                          className="p-2 border border-slate-900 bg-slate-50 hover:bg-amber-50/70 shadow-[1px_1px_0px_#000] cursor-pointer transition-all flex items-center gap-2"
                        >
                          <div className={`font-black text-[10px] px-1.5 py-0.5 border border-slate-900 shrink-0 ${
                            idx === 0 ? "bg-amber-300 text-slate-950 font-black shadow-[1px_1px_0px_#000]" : 
                            idx === 1 ? "bg-slate-300 text-slate-900 font-black shadow-[1px_1px_0px_#000]" : 
                            idx === 2 ? "bg-amber-700 text-white font-black shadow-[1px_1px_0px_#000]" : 
                            "bg-white text-slate-700"
                          }`}>
                            #{idx + 1}
                          </div>
                          <Avatar username={s.username} size="w-7 h-7 text-xs" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-black text-xs text-slate-900 truncate">{s.username}</span>
                              <span className="text-[10px] font-black px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-500 rounded flex items-center gap-0.5 shrink-0">
                                <IconStar size={9} fill="currentColor" className="text-amber-600" />
                                {s.approvalRate}%
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-500 font-bold flex items-center gap-1.5 mt-0.5">
                              <span className="text-emerald-700 flex items-center gap-0.5"><IconThumbUp size={9} /> {s.totalLikes}</span>
                              <span>•</span>
                              <span>{s.postsCount} مشاركة</span>
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
                  <h2 className="font-black text-base text-slate-900">ساحة النقاش العامة</h2>
                  <p className="text-xs text-slate-600">اطرح سؤالك أو شارك تجربتك مع بقية الطلاب في عموم العراق</p>
                </div>
              </div>
              <button onClick={() => { if (!session) { setAuthModal(true); return; } setPostModal(true); }}
                className="w-full md:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2">
                <IconPlus size={14} /> أضف منشوراً جديداً
              </button>
            </div>

            {/* Feed Tag Filter Bar */}
            <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <IconTag size={13} className="text-emerald-primary" /> {t("filterByTag")}
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  {selectedFeedTag === "all" ? `${activePosts.length} منشور` : `${activePosts.filter(p => (selectedFeedTag === "discussion" ? (p.tag === "discussion" || !p.tag) : p.tag === selectedFeedTag)).length} منشور`}
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
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              });

              if (sortedFeedPosts.length === 0) {
                return (
                  <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center text-xs font-bold text-slate-500">
                    {selectedFeedTag === "all" ? t("noPosts") : (siteLang === "ar" ? "لا توجد منشورات مطابقة لهذا التصنيف حتى الآن." : "No posts found for this category yet.")}
                  </div>
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
                                <IconTag size={10} /> {teacher.name} ({teacher.subject})
                              </button>
                            )}
                            <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(p.created_at)}</span>
                          </div>
                        </div>

                        {/* Post Body */}
                        <div>
                          <h3 className="font-black text-sm text-slate-900">{p.title}</h3>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{p.body}</p>
                        </div>

                        {/* Multi-Image Gallery */}
                        {p.images && p.images.length > 0 && (
                          <div className="pt-2">
                            <div className={`grid gap-2 ${
                              p.images.length === 1 ? "grid-cols-1" : p.images.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
                            }`}>
                              {p.images.map((img, i) => (
                                <div
                                  key={i}
                                  onClick={() => setPreviewImageModal(img)}
                                  className="relative group cursor-pointer border-2 border-slate-900 overflow-hidden bg-slate-100 shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000] transition-all max-h-56"
                                >
                                  <img src={img} alt={`مرفق ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-black transition-opacity">
                                    عرض بالحجم الكامل
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
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
                            <span
                              className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1.5"
                              title={siteLang === "en" ? `${p.views || 0} views` : `${p.views || 0} مشاهدة`}
                            >
                              <IconEye size={13} className="text-slate-600" />
                              <span>{p.views || 0}</span>
                              <span className="text-[10px] text-slate-500 font-semibold">{t("views")}</span>
                            </span>
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
                          {(p.comments || []).map(c => {
                            const commentVote = getUserVote(`comment_${c.id}`);
                            return (
                              <div key={c.id} className="bg-white p-2 border border-slate-200 space-y-1">
                                <div className="flex items-center justify-between">
                                  <button onClick={() => { setViewedUser(c.author); setTab("profile"); }} className="flex items-center gap-1.5 hover:opacity-80 text-right">
                                    <Avatar username={c.author} size="w-5 h-5 text-[10px]" />
                                    <span className="font-bold text-teal-800">{c.author}: </span>
                                    <span>{c.text}</span>
                                  </button>
                                  <span className="text-[9px] text-slate-400 font-bold shrink-0 mr-2">{getRelativeTime(c.created_at)}</span>
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                  <button onClick={() => voteComment(p.id, c.id, "like")} className={`${vbtn(commentVote === "like", "like")} py-0.5 px-1.5 text-[10px]`}>
                                    <IconThumbUp size={10} /> {c.likes}
                                  </button>
                                  <button onClick={() => voteComment(p.id, c.id, "dislike")} className={`${vbtn(commentVote === "dislike", "dislike")} py-0.5 px-1.5 text-[10px]`}>
                                    <IconThumbDown size={10} /> {c.dislikes}
                                  </button>
                                  <span
                                    className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-600 flex items-center gap-1"
                                    title={siteLang === "en" ? `${c.views || 0} views` : `${c.views || 0} مشاهدة`}
                                  >
                                    <IconEye size={10} className="text-slate-500" />
                                    <span>{c.views || 0}</span>
                                    <span className="text-[9px] text-slate-400 font-normal">{t("views")}</span>
                                  </span>
                                  <button onClick={() => reportComment(p.id, c.id)} className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5">
                                    <IconFlag size={9} /> ({c.reports || 0})
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          <div className="flex gap-2 pt-1">
                            <input type="text" id={`comment-${p.id}`} placeholder={t("writeComment")} className="flex-1 p-1.5 bg-white border border-slate-900 text-xs focus:outline-none" />
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
                  <h2 className="font-black text-base text-slate-900">المدرسين</h2>
                  <p className="text-xs text-slate-600">دليل ومراجعات وتقييمات المدرسين في جميع محافظات العراق</p>
                </div>
              </div>
              <button onClick={() => { if (!session) { setAuthModal(true); return; } setTeacherModal(true); }}
                className="w-full md:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2 shrink-0">
                <IconPlus size={14} /> إضافة مدرس
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
                    placeholder="ابحث باسم المدرس، المادة، أو المحافظة..."
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
                    <option value="all">كل المحافظات</option>
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
                    <option value="all">كل المواد</option>
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
                    <option value="all">كل المراحل</option>
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
                    <option value="all">طرق التدريس: الكل</option>
                    <option value="both">حضوري وإلكتروني</option>
                    <option value="حضوري">حضوري فقط</option>
                    <option value="إلكتروني">إلكتروني فقط</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Sort Buttons & Clear Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-500 text-[11px] ml-1">ترتيب حسب:</span>
                  <button
                    onClick={() => setSortTeacherBy("likes")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "likes" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    الأكثر إعجاباً
                  </button>
                  <button
                    onClick={() => setSortTeacherBy("rating")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "rating" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    الأعلى قبولاً %
                  </button>
                  <button
                    onClick={() => setSortTeacherBy("reviews")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "reviews" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    الأكثر مراجعات
                  </button>
                  <button
                    onClick={() => setSortTeacherBy("newest")}
                    className={`px-2.5 py-1 text-[11px] font-bold border transition-all ${sortTeacherBy === "newest" ? "border-slate-900 bg-slate-900 text-white shadow-[1px_1px_0px_#000]" : "border-slate-300 bg-white hover:border-slate-900 text-slate-700"}`}
                  >
                    الأحدث
                  </button>
                </div>

                {(dirSearch || filterGov !== "all" || filterSubject !== "all" || filterGrade !== "all" || filterTeachingMode !== "all" || sortTeacherBy !== "likes") && (
                  <button
                    onClick={() => { setDirSearch(""); setFilterGov("all"); setFilterSubject("all"); setFilterGrade("all"); setFilterTeachingMode("all"); setSortTeacherBy("likes"); }}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-900"
                  >
                    إعادة ضبط الفلاتر
                  </button>
                )}
              </div>
            </div>


            {/* Results Count & Grid */}
            {filteredTeachers.length === 0 ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center text-xs font-bold text-slate-500">
                لا توجد نتائج مطابقة للبحث في قسم المدرسين.
              </div>
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
                                {isBoth ? "حضوري + إلكتروني" : modes.includes("إلكتروني") ? "إلكتروني (أونلاين)" : "حضوري (قاعات)"}
                              </span>
                              {t.likes + t.dislikes > 0 && (
                                <span className={`px-2 py-0.5 border border-slate-900 text-[10px] font-black ${
                                  Math.round((t.likes / (t.likes + t.dislikes)) * 100) >= 70
                                    ? "bg-emerald-200 text-emerald-950"
                                    : Math.round((t.likes / (t.likes + t.dislikes)) * 100) >= 50
                                    ? "bg-amber-100 text-amber-950"
                                    : "bg-red-100 text-red-950"
                                }`}>
                                  {Math.round((t.likes / (t.likes + t.dislikes)) * 100)}% قبول
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
                              title={isBookmarked(t.id) ? "إزالة من المحفوظات" : "حفظ المدرس في المحفوظات"}
                            >
                              <IconBookmark size={13} fill={isBookmarked(t.id) ? "currentColor" : "none"} />
                            </button>
                            <button onClick={() => voteTeacher(t.id, "like")} className={vbtn(tVote === "like", "like")} title="إعجاب">
                              <IconThumbUp size={12} /> {t.likes}
                            </button>
                            <button onClick={() => voteTeacher(t.id, "dislike")} className={vbtn(tVote === "dislike", "dislike")} title="عدم إعجاب">
                              <IconThumbDown size={12} /> {t.dislikes}
                            </button>
                          </div>
                          {session && (session.role === "owner" || session.role === "mod") && (
                            <button
                              onClick={() => deleteTeacher(t.id)}
                              className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold border border-red-500 flex items-center gap-0.5 shadow-[1px_1px_0px_#dc2626]"
                              title="حذف المدرس نهائياً (إدارة)"
                            >
                              <IconTrash size={10} /> حذف (إدارة)
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Card Footer: Posts & Reviews Count & Open Button */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 flex items-center gap-1 bg-slate-100 px-2 py-0.5 border border-slate-300">
                          <IconBook size={12} className="text-slate-600" />
                          <span>{teacherPostsCount} منشور وتقييم</span>
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700 group-hover:underline flex items-center gap-0.5">
                          عرض صفحة المدرس وكل المنشورات ←
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
                <p className="text-sm font-black text-slate-700">لم يتم تحديد أي مدرس لعرض صفحته.</p>
                <button
                  onClick={() => setTab("directory")}
                  className="px-5 py-2.5 bg-emerald-primary text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000]"
                >
                  ← العودة إلى قائمة المدرسين
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
                    ← العودة إلى قائمة المدرسين
                  </button>

                  {session && (session.role === "owner" || session.role === "mod") && (
                    <button
                      onClick={() => deleteTeacher(selectedTeacher.id)}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs border-2 border-red-600 shadow-[2px_2px_0px_#dc2626] flex items-center gap-1.5 transition-all"
                    >
                      <IconTrash size={14} /> حذف المدرس نهائياً (إدارة)
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
                            محافظة {selectedTeacher.gov}
                          </span>
                          {(() => {
                            const modes = selectedTeacher.teachingMode || selectedTeacher.teaching_mode || ["حضوري"];
                            const isBoth = modes.includes("حضوري") && modes.includes("إلكتروني");
                            return (
                              <span className="px-3 py-1 bg-purple-100 border border-slate-900 text-xs font-black text-purple-900 flex items-center gap-1.5">
                                <IconMonitor size={12} />
                                {isBoth ? "حضوري + إلكتروني" : modes.includes("إلكتروني") ? "إلكتروني (أونلاين)" : "حضوري (قاعات)"}
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
                            المراحل الدراسية: <span className="text-slate-900 font-semibold">{selectedTeacher.grades}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Teacher Rating & Bookmark Card */}
                    <div className="bg-slate-50 border-2 border-slate-900 p-4 shadow-[3px_3px_0px_#000] flex flex-col items-center gap-2.5 w-full sm:w-auto shrink-0">
                      <span className="text-xs font-black text-slate-800">تقييم الطلاب للمدرس:</span>
                      <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
                        <button
                          onClick={() => voteTeacher(selectedTeacher.id, "like")}
                          className={`px-4 py-2 border-2 border-slate-900 font-black text-xs flex items-center gap-2 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                            getUserVote(`teacher_${selectedTeacher.id}`) === "like"
                              ? "bg-emerald-600 text-white"
                              : "bg-white hover:bg-emerald-50 text-emerald-800"
                          }`}
                          title="أعجبني"
                        >
                          <IconThumbUp size={16} /> {selectedTeacher.likes} أعجبني
                        </button>
                        <button
                          onClick={() => voteTeacher(selectedTeacher.id, "dislike")}
                          className={`px-4 py-2 border-2 border-slate-900 font-black text-xs flex items-center gap-2 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all ${
                            getUserVote(`teacher_${selectedTeacher.id}`) === "dislike"
                              ? "bg-red-600 text-white"
                              : "bg-white hover:bg-red-50 text-red-800"
                          }`}
                          title="لم يعجبني"
                        >
                          <IconThumbDown size={16} /> {selectedTeacher.dislikes} لم يعجبني
                        </button>
                      </div>

                      <button
                        onClick={() => toggleBookmark(selectedTeacher.id, "teacher", selectedTeacher.name, `${selectedTeacher.subject} - ${selectedTeacher.gov}`)}
                        className={`w-full py-2 px-3 border-2 border-slate-900 text-xs font-black flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all ${
                          isBookmarked(selectedTeacher.id) ? "bg-amber-300 text-slate-900" : "bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                        title={isBookmarked(selectedTeacher.id) ? "إزالة من المحفوظات" : "حفظ المدرس في المحفوظات"}
                      >
                        <IconBookmark size={13} fill={isBookmarked(selectedTeacher.id) ? "currentColor" : "none"} />
                        <span>{isBookmarked(selectedTeacher.id) ? "محفوظ في المحفوظات ✓" : "حفظ المدرس في المحفوظات"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Toggle Review Form */}
                  <div className="pt-4 border-t-2 border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 font-bold">
                      هل درست عند الأستاذ {selectedTeacher.name}؟ شارك رأيك وتقييمك لمساعدة بقية الطلاب!
                    </div>
                    <button
                      onClick={() => {
                        if (!session) { setAuthModal(true); return; }
                        setShowReviewForm(!showReviewForm);
                      }}
                      className="w-full sm:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2 transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
                    >
                      <IconPen size={14} />
                      {showReviewForm ? "إغلاق استمارة التقييم" : "اكتب مراجعة وتقييم للمدرس"}
                    </button>
                  </div>

                  {/* Review Form: Mandatory Like or Dislike selection (NO stars) */}
                  {showReviewForm && (
                    <div className="bg-slate-50 border-2 border-slate-900 p-5 space-y-4 shadow-[3px_3px_0px_#000]">
                      <div className="border-b border-slate-300 pb-2">
                        <h4 className="font-black text-sm text-slate-900">استمارة تقييم الأستاذ {selectedTeacher.name}</h4>
                        <p className="text-[11px] text-slate-600 font-semibold mt-0.5">
                          يجب تحديد ما إذا كان المدرس قد أعجبك أم لا كشرط أساسي لكتابة ونشر التقييم.
                        </p>
                      </div>

                      {/* Prerequisite: Mandatory Like or Dislike Choice */}
                      <div>
                        <label className="block text-xs font-black text-slate-800 mb-2">
                          هل تنصح بهذا المدرس؟ <span className="text-red-500">* (إجباري: اختر أحدهما)</span>
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
                            <IconThumbUp size={16} /> أعجبني (أنصح به)
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
                            <IconThumbDown size={16} /> لم يعجبني (لا أنصح به)
                          </button>
                        </div>
                      </div>

                      {/* Review Title */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">عنوان التقييم (اختياري)</label>
                        <input
                          type="text"
                          value={reviewTitle}
                          onChange={e => setReviewTitle(e.target.value)}
                          placeholder="مثال: تجربتي مع الأستاذ في مادة الرياضيات..."
                          className="w-full p-2.5 bg-white border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                        />
                      </div>

                      {/* Review Body */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          تفاصيل رأيك وتجربتك <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={reviewBody}
                          onChange={e => setReviewBody(e.target.value)}
                          placeholder="اكتب بالتفصيل: طريقة الشرح، الواجبات، أسلوب التدريس، ومستوى الاستفادة..."
                          className="w-full p-2.5 bg-white border-2 border-slate-900 text-xs font-semibold min-h-[90px] resize-none focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowReviewForm(false); setReviewVerdict(null); }}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 font-bold text-xs border border-slate-900"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={submitTeacherReview}
                          disabled={!reviewVerdict || !reviewBody.trim()}
                          className="px-6 py-2 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:border-slate-400 disabled:shadow-none"
                        >
                          نشر التقييم الآن
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
                      كل ما نُشر عن الأستاذ {selectedTeacher.name}
                    </h3>
                    <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 border border-slate-300">
                      {posts.filter(p => p.teacher_id === selectedTeacher.id || p.teacherId === selectedTeacher.id).length} منشور وتقييم
                    </span>
                  </div>

                  {posts.filter(p => p.teacher_id === selectedTeacher.id || p.teacherId === selectedTeacher.id).length === 0 ? (
                    <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center text-xs font-bold text-slate-500">
                      لا توجد منشورات أو تقييمات عن هذا المدرس حتى الآن. كن أول من يكتب عنه!
                    </div>
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
                                  {isReview ? (
                                    isDislikeReview ? (
                                      <span className="px-2 py-0.5 bg-red-100 border border-red-500 text-[10px] font-black text-red-900 flex items-center gap-1">
                                        <IconThumbDown size={10} /> تقييم: لم يعجبني
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-600 text-[10px] font-black text-emerald-900 flex items-center gap-1">
                                        <IconThumbUp size={10} /> تقييم: أعجبني
                                      </span>
                                    )
                                  ) : (
                                    <span className="px-2 py-0.5 bg-blue-100 border border-blue-600 text-[10px] font-black text-blue-900 flex items-center gap-1">
                                      <IconComment size={10} /> منشور نقاش
                                    </span>
                                  )}
                                </button>
                                <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(postItem.created_at)}</span>
                              </div>

                              {/* Content */}
                              <div>
                                <h4 className="font-black text-sm text-slate-900">{postItem.title}</h4>
                                <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{postItem.body}</p>
                              </div>

                              {/* Multi-Image Gallery */}
                              {postItem.images && postItem.images.length > 0 && (
                                <div className="pt-2">
                                  <div className={`grid gap-2 ${
                                    postItem.images.length === 1 ? "grid-cols-1" : postItem.images.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
                                  }`}>
                                    {postItem.images.map((img, i) => (
                                      <div
                                        key={i}
                                        onClick={() => setPreviewImageModal(img)}
                                        className="relative group cursor-pointer border-2 border-slate-900 overflow-hidden bg-slate-100 shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000] transition-all max-h-56"
                                      >
                                        <img src={img} alt={`مرفق ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-black transition-opacity">
                                          عرض بالحجم الكامل
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
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
                                      <span>شرح يوتيوب</span>
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
                                      <span>ملزمة / ملف</span>
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
                                  <span
                                    className="px-2 py-1 bg-slate-100 text-slate-700 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1.5"
                                    title={siteLang === "en" ? `${postItem.views || 0} views` : `${postItem.views || 0} مشاهدة`}
                                  >
                                    <IconEye size={12} className="text-slate-600" />
                                    <span>{postItem.views || 0}</span>
                                    <span className="text-[10px] text-slate-500 font-semibold">{t("views")}</span>
                                  </span>
                                  <button
                                    onClick={() => toggleBookmark(postItem.id, "post", postItem.title, postItem.author)}
                                    className={`px-2.5 py-1 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1 active:translate-x-px active:translate-y-px active:shadow-none transition-all ${
                                      isBookmarked(postItem.id) ? "bg-amber-300 text-slate-900" : "bg-white text-slate-700 hover:bg-slate-50"
                                    }`}
                                    title={isBookmarked(postItem.id) ? "إزالة من المحفوظات" : "حفظ في المحفوظات"}
                                  >
                                    <IconBookmark size={12} fill={isBookmarked(postItem.id) ? "currentColor" : "none"} />
                                    <span>{isBookmarked(postItem.id) ? "محفوظ" : "حفظ"}</span>
                                  </button>
                                  <button onClick={() => reportPost(postItem.id)} className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1">
                                    <IconFlag size={12} /> بلاغ ({postItem.reports || 0}/20)
                                  </button>
                                </div>
                                {canDelete && (
                                  <button onClick={() => deletePost(postItem.id)} className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1">
                                    <IconTrash size={12} /> {session?.username === postItem.author ? "حذف" : "حذف (إدارة)"}
                                  </button>
                                )}
                              </div>

                              {/* Comments Section */}
                              <div className="bg-slate-50 p-3 border border-slate-200 space-y-2 text-xs">
                                <div className="font-bold text-[11px] text-slate-500 flex items-center gap-1">
                                  <IconComment size={12} /> التعليقات والردود ({postItem.comments?.length || 0}):
                                </div>
                                {(postItem.comments || []).map(c => {
                                  const commentVote = getUserVote(`comment_${c.id}`);
                                  return (
                                    <div key={c.id} className="bg-white p-2 border border-slate-200 space-y-1">
                                      <div className="flex items-center justify-between">
                                        <button
                                          onClick={() => { setViewedUser(c.author); setTab("profile"); }}
                                          className="flex items-center gap-1.5 hover:opacity-80 text-right"
                                        >
                                          <Avatar username={c.author} size="w-5 h-5 text-[10px]" />
                                          <span className="font-bold text-teal-800">{c.author}: </span>
                                          <span>{c.text}</span>
                                        </button>
                                        <span className="text-[9px] text-slate-400 font-bold shrink-0 mr-2">{getRelativeTime(c.created_at)}</span>
                                      </div>
                                      <div className="flex items-center gap-2 pt-1">
                                        <button onClick={() => voteComment(postItem.id, c.id, "like")} className={`${vbtn(commentVote === "like", "like")} py-0.5 px-1.5 text-[10px]`}>
                                          <IconThumbUp size={10} /> {c.likes}
                                        </button>
                                        <button onClick={() => voteComment(postItem.id, c.id, "dislike")} className={`${vbtn(commentVote === "dislike", "dislike")} py-0.5 px-1.5 text-[10px]`}>
                                          <IconThumbDown size={10} /> {c.dislikes}
                                        </button>
                                        <span
                                          className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-600 flex items-center gap-1"
                                          title={siteLang === "en" ? `${c.views || 0} views` : `${c.views || 0} مشاهدة`}
                                        >
                                          <IconEye size={10} className="text-slate-500" />
                                          <span>{c.views || 0}</span>
                                          <span className="text-[9px] text-slate-400 font-normal">{t("views")}</span>
                                        </span>
                                        <button onClick={() => reportComment(postItem.id, c.id)} className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5">
                                          <IconFlag size={9} /> ({c.reports || 0})
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="flex gap-2 pt-1">
                                  <input
                                    type="text"
                                    id={`comment-${postItem.id}`}
                                    placeholder="اكتب رداً أو تعليقاً..."
                                    className="flex-1 p-1.5 bg-white border border-slate-900 text-xs focus:outline-none"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") addComment(postItem.id);
                                    }}
                                  />
                                  <button
                                    onClick={() => addComment(postItem.id)}
                                    className="px-3 bg-slate-900 text-white font-bold text-xs active:bg-slate-700"
                                  >
                                    إرسال
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
                  <h2 className="font-black text-base text-slate-900">صندوق الإشعارات</h2>
                  <p className="text-xs text-slate-600">التفاعلات، الردود، والتقارير الإدارية الخاصة بحسابك</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {myNotifications.length > 0 && (
                  <button onClick={markAllNotifsRead} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-900">
                    تحديد الكل كمقروء ✓
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
                الكل ({myNotifications.length})
              </button>
              <button
                onClick={() => setNotifFilter("unread")}
                className={`px-3 py-1 font-bold border transition-all ${notifFilter === "unread" ? "bg-slate-900 text-white border-slate-900 shadow-[1px_1px_0px_#000]" : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"}`}
              >
                غير مقروءة ({unreadCount})
              </button>
              {canAdmin && (
                <button
                  onClick={() => setNotifFilter("reports")}
                  className={`px-3 py-1 font-bold border transition-all ${notifFilter === "reports" ? "bg-red-700 text-white border-red-900 shadow-[1px_1px_0px_#000]" : "bg-white text-red-700 border-red-300 hover:border-red-600"}`}
                >
                  بلاغات الإشراف ({myNotifications.filter(n => n.type === "report_alert").length})
                </button>
              )}
            </div>

            {myNotifications.length === 0 ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center text-xs font-bold text-slate-500">
                لا توجد إشعارات جديدة حالياً.
              </div>
            ) : (
              <div className="space-y-3">
                {myNotifications
                  .filter(n => {
                    if (notifFilter === "unread") return !n.read;
                    if (notifFilter === "reports") return n.type === "report_alert";
                    return true;
                  })
                  .map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        const updated = allNotifications.map(item => item.id === n.id ? { ...item, read: true } : item);
                        setNotifications(updated);
                        setAllNotifications(updated);
                        if (n.type === "report_alert") {
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
                            <div className="w-7 h-7 bg-amber-600 border border-slate-900 flex items-center justify-center text-white text-xs shrink-0">
                              <IconShield size={14} />
                            </div>
                          ) : (
                            <Avatar username={n.actor} size="w-7 h-7 text-xs" />
                          )}

                          <span className="font-black text-xs text-slate-800">{n.actor}</span>
                          <span className="text-xs text-slate-600">
                            {n.type === "teacher_approved"
                              ? "تمت الموافقة على إضافة المدرس:"
                              : n.type === "teacher_rejected"
                              ? "تم رفض طلب إضافة المدرس:"
                              : n.type === "like"
                              ? "أعجب بمنشورك:"
                              : n.type === "report_alert"
                              ? "تنبيه إداري: وصل بلاغ عن:"
                              : n.type === "admin_warning"
                              ? "إنذار إداري رسمي:"
                              : "علّق على منشورك:"}
                          </span>
                          <span className="text-xs font-bold text-emerald-800">"{n.targetTitle}"</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">{getRelativeTime(n.created_at)}</span>
                      </div>
                      {n.commentText && (
                        <p className="text-xs font-medium text-slate-700 mt-2 pr-9 bg-white/80 p-2.5 border border-slate-200 leading-relaxed">
                          {n.commentText}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}


        {/* ──── TAB 4: PROFILE (الملف الشخصي) ──── */}
        {tab === "profile" && (
          <section className="space-y-6">
            {!targetProfileUser ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center space-y-4">
                <h3 className="text-base font-black">يجب تسجيل الدخول لمشاهدة وتعديل ملفك الشخصي</h3>
                <button onClick={() => { setIsRegister(false); setAuthModal(true); }} className="px-6 py-2.5 bg-emerald-primary text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000]">
                  تسجيل الدخول الآن
                </button>
              </div>
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
                    ) : null}
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
                            تغيير
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black text-slate-900">{targetProfileUser}</h3>
                          {getUsers().find(u => u.username === targetProfileUser) && (
                            <RoleIcon role={getUsers().find(u => u.username === targetProfileUser)?.role || "student"} />
                          )}
                        </div>
                        <p className="text-xs text-slate-600 font-medium mt-1 max-w-md">
                          {getProfile(targetProfileUser).bio || "لا توجد نبذة تعريفية بعد."}
                        </p>
                      </div>
                    </div>

                    {isOwnProfile && (
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
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
                          title="سجل كل التفاعلات واللايكات التي قمت بها (سري)"
                        >
                          <IconHistory size={14} /> سجل التفاعلات (سري)
                        </button>
                      </div>
                    )}
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
                      <span>{t("tabBookmarks")} ({userBookmarks.length})</span>
                    </button>
                  )}
                </div>

                {profileSubTab === "saved" && isOwnProfile ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <h3 className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                        <IconBookmark size={16} className="text-amber-500" />
                        <span>العناصر المحفوظة للرجوع السريع ({userBookmarks.length})</span>
                      </h3>
                      <span className="text-[11px] text-slate-500 font-semibold">تُحفظ بحسابك للرجوع إليها في أي وقت</span>
                    </div>

                    {userBookmarks.length === 0 ? (
                      <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center space-y-2">
                        <div className="text-amber-500 flex justify-center"><IconBookmark size={28} /></div>
                        <p className="text-xs font-bold text-slate-600">لم تقم بحفظ أي مدرسين أو منشورات حتى الآن.</p>
                        <p className="text-[11px] text-slate-400 font-semibold">اضغط على زر الحفظ (أيقونة العلامة) بجانب أي مدرس أو منشور لحفظه هنا.</p>
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
                                      {isTeacher ? "مدرس محفوظ" : "منشور محفوظ"}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold">{getRelativeTime(b.created_at)}</span>
                                  </div>
                                  <h4 className="font-black text-sm text-slate-900">{b.title}</h4>
                                  {b.subtitle && <p className="text-xs text-slate-600 font-semibold">{b.subtitle}</p>}
                                  {post && <p className="text-xs text-slate-500 line-clamp-2 mt-1">{post.body}</p>}
                                </div>

                                <button
                                  onClick={() => toggleBookmark(b.targetId, b.type, b.title)}
                                  className="p-1.5 border border-slate-300 hover:border-red-600 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                                  title="إزالة من المحفوظات"
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
                                    الانتقال لصفحة المدرس ←
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setTab("feed");
                                      window.scrollTo({ top: 0, behavior: "smooth" });
                                    }}
                                    className="text-xs font-black text-emerald-800 hover:underline flex items-center gap-1"
                                  >
                                    عرض في ساحة النقاش ←
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
                    {isOwnProfile ? "سجل نشاطاتي ومشاركاتي:" : `نشاطات ومشاركات الطالب (${targetProfileUser}):`}
                  </h3>

                  {combinedActivities.length === 0 ? (
                    <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-6 text-center text-xs font-bold text-slate-400">
                      لم يتم نشر أي منشورات أو تقييمات أو تعليقات حتى الآن.
                    </div>
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
                        <div key={item.id} className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 space-y-3 relative">
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
                                    <IconPen size={10} /> منشور
                                  </>
                                ) : item.kind === "review" ? (
                                  isDislikeReview ? (
                                    <>
                                      <IconThumbDown size={10} /> تقييم: لم يعجبني
                                    </>
                                  ) : (
                                    <>
                                      <IconThumbUp size={10} /> تقييم: أعجبني
                                    </>
                                  )
                                ) : (
                                  <>
                                    <IconComment size={10} /> تعليق
                                  </>
                                )}
                              </span>
                              {teacher && (
                                <button
                                  onClick={() => { setSelectedTeacher(teacher); setTab("teacher"); }}
                                  className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
                                >
                                  الأستاذ: {teacher.name} ({teacher.subject})
                                </button>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(item.created_at)}</span>
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
                                    title="إعجاب"
                                  >
                                    <IconThumbUp size={12} /> {item.likes}
                                  </button>
                                  <button
                                    onClick={() => votePost(item.id, "dislike")}
                                    className={vbtn(postVote === "dislike", "dislike")}
                                    title="عدم إعجاب"
                                  >
                                    <IconThumbDown size={12} /> {item.dislikes}
                                  </button>
                                  <span
                                    className="px-2 py-1 bg-slate-100 text-slate-700 border border-slate-900 shadow-[1px_1px_0px_#000] text-xs font-bold flex items-center gap-1.5"
                                    title={siteLang === "en" ? `${fullPost?.views || item.views || 0} views` : `${fullPost?.views || item.views || 0} مشاهدة`}
                                  >
                                    <IconEye size={12} className="text-slate-600" />
                                    <span>{fullPost?.views || item.views || 0}</span>
                                    <span className="text-[10px] text-slate-500 font-semibold">{t("views")}</span>
                                  </span>
                                  <button
                                    onClick={() => toggleProfileComments(item.id)}
                                    className={`px-2.5 py-1 border text-xs font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000] active:translate-x-px active:translate-y-px transition-all ${
                                      isCommentsOpen
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-900 bg-white hover:bg-slate-100 text-slate-800"
                                    }`}
                                  >
                                    <IconComment size={12} />
                                    <span>التعليقات ({fullPost?.comments?.length || 0})</span>
                                  </button>
                                  <button
                                    onClick={() => openReportModal({ id: item.id, type: "post", title: item.title })}
                                    className="text-[11px] text-slate-500 hover:text-red-600 font-bold flex items-center gap-1 px-1.5 py-1"
                                    title="إبلاغ عن محتوى"
                                  >
                                    <IconFlag size={12} />
                                    <span>بلاغ ({item.reports || 0})</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => item.postId && voteComment(item.postId, item.id, "like")}
                                    className={`${vbtn(commentVote === "like", "like")} py-0.5 px-2 text-[10px]`}
                                    title="إعجاب"
                                  >
                                    <IconThumbUp size={10} /> {item.likes}
                                  </button>
                                  <button
                                    onClick={() => item.postId && voteComment(item.postId, item.id, "dislike")}
                                    className={`${vbtn(commentVote === "dislike", "dislike")} py-0.5 px-2 text-[10px]`}
                                    title="عدم إعجاب"
                                  >
                                    <IconThumbDown size={10} /> {item.dislikes}
                                  </button>
                                  <span
                                    className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-600 flex items-center gap-1"
                                    title={siteLang === "en" ? `${item.views || 0} views` : `${item.views || 0} مشاهدة`}
                                  >
                                    <IconEye size={10} className="text-slate-500" />
                                    <span>{item.views || 0}</span>
                                    <span className="text-[9px] text-slate-400 font-normal">{t("views")}</span>
                                  </span>
                                  <button
                                    onClick={() => item.postId && openReportModal({ id: item.id, type: "comment", title: item.content, parentPostId: item.postId })}
                                    className="text-[10px] text-slate-500 hover:text-red-600 font-bold flex items-center gap-0.5 px-1.5 py-1"
                                    title="إبلاغ عن هذا التعليق"
                                  >
                                    <IconFlag size={10} />
                                    <span>بلاغ ({item.reports || 0})</span>
                                  </button>
                                </>
                              )}
                            </div>

                            {(item.kind === "post" || item.kind === "review") && session && (session.username === targetProfileUser || session.role === "owner" || session.role === "mod") && (
                              <button
                                onClick={() => deletePost(item.id)}
                                className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                              >
                                <IconTrash size={12} /> {session.username === targetProfileUser ? "حذف" : "حذف (إدارة)"}
                              </button>
                            )}
                          </div>

                          {/* Expandable Comments Section for Posts / Reviews in Profile */}
                          {isPostOrReview && isCommentsOpen && (
                            <div className="bg-slate-50 p-3 border-2 border-slate-900 space-y-2.5 text-xs mt-2">
                              <div className="font-bold text-[11px] text-slate-600 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                <IconComment size={12} className="text-emerald-primary" />
                                <span>الردود والتعليقات ({fullPost?.comments?.length || 0}):</span>
                              </div>

                              {(fullPost?.comments || []).length === 0 ? (
                                <div className="text-[11px] text-slate-400 py-1 font-semibold">
                                  لا توجد تعليقات حتى الآن. كن أول من يكتب تعليقاً!
                                </div>
                              ) : (
                                (fullPost?.comments || []).map(c => {
                                  const cVote = getUserVote(`comment_${c.id}`);
                                  return (
                                    <div key={c.id} className="bg-white p-2.5 border border-slate-200 space-y-1.5 shadow-[1px_1px_0px_#000]">
                                      <div className="flex items-center justify-between">
                                        <button
                                          onClick={() => { setViewedUser(c.author); setTab("profile"); }}
                                          className="flex items-center gap-1.5 hover:opacity-80 text-right"
                                        >
                                          <Avatar username={c.author} size="w-5 h-5 text-[10px]" />
                                          <span className="font-bold text-teal-800">{c.author}</span>
                                        </button>
                                        <span className="text-[9px] text-slate-400 font-bold shrink-0">{getRelativeTime(c.created_at)}</span>
                                      </div>
                                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">{c.text}</p>
                                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                                        <button
                                          onClick={() => voteComment(item.id, c.id, "like")}
                                          className={`${vbtn(cVote === "like", "like")} py-0.5 px-1.5 text-[10px]`}
                                          title="إعجاب"
                                        >
                                          <IconThumbUp size={10} /> {c.likes}
                                        </button>
                                        <button
                                          onClick={() => voteComment(item.id, c.id, "dislike")}
                                          className={`${vbtn(cVote === "dislike", "dislike")} py-0.5 px-1.5 text-[10px]`}
                                          title="عدم إعجاب"
                                        >
                                          <IconThumbDown size={10} /> {c.dislikes}
                                        </button>
                                        <span
                                          className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-600 flex items-center gap-1"
                                          title={siteLang === "en" ? `${c.views || 0} views` : `${c.views || 0} مشاهدة`}
                                        >
                                          <IconEye size={10} className="text-slate-500" />
                                          <span>{c.views || 0}</span>
                                          <span className="text-[9px] text-slate-400 font-normal">{t("views")}</span>
                                        </span>
                                        <button
                                          onClick={() => openReportModal({ id: c.id, type: "comment", title: c.text, parentPostId: item.id })}
                                          className="text-[10px] text-slate-400 hover:text-red-500 font-bold flex items-center gap-0.5"
                                          title="بلاغ"
                                        >
                                          <IconFlag size={9} /> ({c.reports || 0})
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}

                              {/* Comment Input */}
                              <div className="flex gap-2 pt-1">
                                <input
                                  type="text"
                                  id={`profile-comment-${item.id}`}
                                  placeholder="اكتب تعليقك هنا..."
                                  className="flex-1 p-2 bg-white border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                                  onKeyDown={e => {
                                    if (e.key === "Enter") addComment(item.id);
                                  }}
                                />
                                <button
                                  onClick={() => addComment(item.id)}
                                  className="px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all shrink-0"
                                >
                                  إرسال
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
        {tab === "admin" && canAdmin && (
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
              {(canOwner || hasPermission("canApproveTeachers") || hasPermission("canModeratePosts") || hasPermission("canManageTickets") || hasPermission("canDisciplineUsers")) && (
                <button
                  onClick={() => setAdminSubTab("moderation")}
                  className={`px-3 py-2 text-xs font-black border-2 flex items-center gap-1.5 shrink-0 transition-all ${
                    adminSubTab === "moderation"
                      ? "border-slate-900 bg-slate-900 text-white shadow-[2px_2px_0px_#000]"
                      : "border-transparent text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <IconShield size={14} />
                  <span>{t("adminSubMod")}</span>
                  {(pendingTeachers.length > 0 || reportedPosts.length > 0) && (
                    <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black rounded-full">
                      {pendingTeachers.length + reportedPosts.length}
                    </span>
                  )}
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
                  <span className="text-[10px] text-slate-400 font-bold">({auditLogs.length})</span>
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
                  <span className="text-[10px] text-slate-400 font-bold">({customBannedWords.length})</span>
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

            {/* ═══════ SUB-TAB 1: MODERATION & QUEUE ═══════ */}
            {adminSubTab === "moderation" && (
              <div className="space-y-6">
                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 text-center">
                    <div className="text-2xl font-black text-amber-700">{pendingTeachers.length}</div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">طلبات مدرسين معلقة</div>
                  </div>
                  <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 text-center">
                    <div className="text-2xl font-black text-red-600">{reportedPosts.length}</div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">منشورات عليها بلاغات</div>
                  </div>
                  <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 text-center">
                    <div className="text-2xl font-black text-blue-700">{supportTickets.length}</div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">تذاكر الدعم الفني</div>
                  </div>
                  <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 text-center">
                    <div className="text-2xl font-black text-slate-800">{Object.keys(mutedUsers).length}</div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">مستخدمين محظورين</div>
                  </div>
                </div>

                {/* Main Moderation Grid: Teacher Submissions & Reports Queue */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Column 1: Teacher Requests */}
                  <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                    <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                      <h3 className="font-black text-sm flex items-center gap-1.5 text-slate-900">
                        <IconInbox size={16} className="text-emerald-primary" />
                        <span>طلبات إضافة المدرسين</span>
                      </h3>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold text-xs border border-slate-900">
                        {pendingTeachers.length} معلق
                      </span>
                    </div>

                    {pendingTeachers.length === 0 ? (
                      <div className="text-xs text-slate-400 py-6 text-center font-semibold border-2 border-dashed border-slate-200">
                        لا توجد طلبات معلقة حالياً في قائمة الانتظار.
                      </div>
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
                                  مُرسل الطلب: <span className="font-bold text-slate-800">{t.createdBy || t.created_by || "مستخدم"}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                              <button onClick={() => approveTeacher(t.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border border-slate-900 flex items-center gap-1 shadow-[1px_1px_0px_#000] active:translate-x-px active:translate-y-px transition-all">
                                ✓ قبول ونشر
                              </button>
                              <button onClick={() => rejectTeacher(t.id)} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs border border-red-400 flex items-center gap-1 active:translate-x-px active:translate-y-px transition-all">
                                ✕ رفض
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Column 2: Reports & Moderation Queue */}
                  <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                    <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                      <h3 className="font-black text-sm flex items-center gap-1 text-slate-900">
                        <IconFlag size={14} className="text-red-600" />
                        <span>مركز مراجعة البلاغات والملاحظات</span>
                      </h3>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          onClick={() => setAdminReportFilter("pending")}
                          className={`px-2 py-0.5 font-bold border transition-all ${adminReportFilter === "pending" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"}`}
                        >
                          معلقة
                        </button>
                        <button
                          onClick={() => setAdminReportFilter("all")}
                          className={`px-2 py-0.5 font-bold border transition-all ${adminReportFilter === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300"}`}
                        >
                          الكل
                        </button>
                      </div>
                    </div>

                    {reportRecordsList.length === 0 && reportedPosts.length === 0 ? (
                      <div className="text-xs text-slate-400 py-6 text-center font-semibold border-2 border-dashed border-slate-200">
                        لا يوجد محتوى تم الإبلاغ عنه حالياً.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                        {reportRecordsList
                          .filter(r => adminReportFilter === "all" || (r.status || "pending") === adminReportFilter)
                          .map(r => {
                            const targetPost = posts.find(p => p.id === r.targetId);
                            const reasonLabel = r.reason === "inappropriate" ? "محتوى غير لائق ومسيء" : r.reason === "wrong_info" ? "معلومات خاطئة ومضللة" : "سبب آخر";
                            const isResolved = r.status === "resolved" || r.status === "dismissed";

                            return (
                              <div key={r.id} className={`p-3.5 border-2 space-y-2.5 transition-all ${isResolved ? "bg-slate-50/70 border-slate-200 opacity-75" : "bg-white border-slate-900 shadow-[2px_2px_0px_#000]"}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2 py-0.5 text-[9px] font-black border uppercase tracking-wider ${
                                      r.reason === "inappropriate"
                                        ? "bg-red-100 text-red-900 border-red-400"
                                        : r.reason === "wrong_info"
                                        ? "bg-amber-100 text-amber-900 border-amber-400"
                                        : "bg-slate-100 text-slate-800 border-slate-400"
                                    }`}>
                                      {reasonLabel}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-bold">
                                      من قِبل: <span className="text-slate-800">{r.reporter}</span>
                                    </span>
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-bold shrink-0">{getRelativeTime(r.created_at)}</span>
                                </div>

                                <div className="bg-slate-50 p-2 border border-slate-200 text-xs">
                                  <div className="font-black text-slate-900">{r.targetTitle || targetPost?.title || "محتوى محدد"}</div>
                                  {targetPost?.body && (
                                    <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{targetPost.body}</p>
                                  )}
                                  {targetPost && (
                                    <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                                      <span>الكاتب: <strong className="text-teal-800">{targetPost.author}</strong></span>
                                      <span>الحالة: <strong className={targetPost.status === "hidden" ? "text-red-600" : "text-emerald-700"}>{targetPost.status === "hidden" ? "مخفي" : "نشط"}</strong></span>
                                    </div>
                                  )}
                                </div>

                                {r.note && (
                                  <div className="text-xs bg-amber-50 border border-amber-200 p-2 text-amber-950">
                                    <span className="font-bold block text-[10px] text-amber-800 mb-0.5">ملاحظة المُبلغ للمشرفين:</span>
                                    <p className="text-[11px] leading-relaxed font-semibold">"{r.note}"</p>
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    {targetPost && (
                                      targetPost.status === "hidden" ? (
                                        <button
                                          onClick={() => restorePost(targetPost.id)}
                                          className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] border border-emerald-500"
                                        >
                                          إعادة إظهار
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => hidePost(targetPost.id)}
                                          className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] border border-amber-500"
                                        >
                                          إخفاء المحتوى
                                        </button>
                                      )
                                    )}
                                    <button
                                      onClick={() => adminDeleteReportedItem(r.targetId, r.targetType, r.id)}
                                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[11px] border border-red-500 flex items-center gap-1"
                                    >
                                      <IconTrash size={11} /> حذف نهائي
                                    </button>
                                    {targetPost && targetPost.author && (
                                      <button
                                        onClick={() => {
                                          setAdminSelectedUser(targetPost.author);
                                          setAdminWarningReason(`مخالفة معايير المجتمع في المنشور "${r.targetTitle || targetPost.title}"`);
                                        }}
                                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] border border-slate-400"
                                      >
                                        إدارة/إنذار الكاتب
                                      </button>
                                    )}
                                  </div>

                                  {!isResolved && (
                                    <button
                                      onClick={() => dismissReport(r.id, r.targetId)}
                                      className="text-[10px] font-bold text-slate-500 hover:text-slate-900 underline"
                                    >
                                      تجاهل وتبرئة
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>

                {/* User Disciplinary & Strike Management Center */}
                <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                    <h3 className="font-black text-sm flex items-center gap-1.5 text-slate-900">
                      <IconVolumeX size={16} className="text-red-600" />
                      <span>مركز انضباط المستخدمين والحظر المؤقت (User Disciplinary Center)</span>
                    </h3>
                    <span className="text-[11px] text-slate-500 font-bold">حظر مؤقت أو إنذارات رسمية</span>
                  </div>

                  {/* Search user */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 relative">
                      <input
                        type="text"
                        value={adminUserSearch}
                        onChange={e => setAdminUserSearch(e.target.value)}
                        placeholder="ابحث عن اسم المستخدم لإدارته أو توجيه عقوبة..."
                        className="w-full p-2.5 ps-8 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                      />
                      <span className="absolute start-2.5 top-3 text-slate-400">
                        <IconSearch size={14} />
                      </span>
                      {adminUserSearch && (
                        <button onClick={() => setAdminUserSearch("")} className="absolute end-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-700">✕</button>
                      )}
                    </div>
                    <div>
                      <select
                        value={adminSelectedUser || ""}
                        onChange={e => setAdminSelectedUser(e.target.value || null)}
                        className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none"
                      >
                        <option value="">-- اختر مستخدم من القائمة --</option>
                        {getUsers()
                          .filter(u => !adminUserSearch.trim() || u.username.toLowerCase().includes(adminUserSearch.toLowerCase()))
                          .map(u => (
                            <option key={u.username} value={u.username}>
                              {u.username} ({u.role}) {isUserCurrentlyMuted(u.username).muted ? "[محظور]" : ""}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Selected User Management Card */}
                  {adminSelectedUser ? (() => {
                    const targetUser = getUsers().find(u => u.username === adminSelectedUser);
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
                                إجمالي الإنذارات المسجلة: <strong className="text-red-600">{strikes.count}</strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {muteStatus.muted ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 bg-red-100 border border-red-600 text-red-800 font-black text-xs">
                                  محظور مؤقتاً ({muteStatus.remainingText})
                                </span>
                                <button
                                  onClick={() => handleUnmuteUser(targetUser.username)}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs border border-slate-900 shadow-[1px_1px_0px_#000]"
                                >
                                  رفع الحظر فوراً
                                </button>
                              </div>
                            ) : (
                              <span className="px-2.5 py-1 bg-emerald-100 border border-emerald-600 text-emerald-800 font-black text-xs">
                                الحساب نشط وغير محظور
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Mute controls */}
                        {!muteStatus.muted && targetUser.role !== "owner" && (
                          <div className="bg-white p-3 border border-slate-300 space-y-2.5">
                            <h5 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                              <IconVolumeX size={14} className="text-red-600" />
                              <span>تطبيق حظر مؤقت على هذا الحساب:</span>
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">مدة الحظر</label>
                                <select
                                  value={adminMuteDuration}
                                  onChange={e => setAdminMuteDuration(e.target.value as any)}
                                  className="w-full p-2 bg-slate-50 border border-slate-900 text-xs font-bold"
                                >
                                  <option value="24h">٢٤ ساعة (يوم واحد)</option>
                                  <option value="7d">٧ أيام (أسبوع)</option>
                                  <option value="30d">٣٠ يوماً (شهر)</option>
                                  <option value="permanent">حظر دائم</option>
                                </select>
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">سبب الحظر (يصل للمستخدم)</label>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={adminMuteReason}
                                    onChange={e => setAdminMuteReason(e.target.value)}
                                    placeholder="مثال: ألفاظ غير لائقة في التعليقات..."
                                    className="flex-1 p-2 bg-slate-50 border border-slate-900 text-xs font-semibold"
                                  />
                                  <button
                                    onClick={() => handleMuteUser(targetUser.username, adminMuteDuration, adminMuteReason)}
                                    className="px-4 bg-red-600 hover:bg-red-700 text-white font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] shrink-0"
                                  >
                                    تطبيق الحظر
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
                            <span>توجيه إنذار رسمي دون حظر:</span>
                          </h5>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={adminWarningReason}
                              onChange={e => setAdminWarningReason(e.target.value)}
                              placeholder="سبب الإنذار والتنبيه..."
                              className="flex-1 p-2 bg-slate-50 border border-slate-900 text-xs font-semibold"
                            />
                            <button
                              onClick={() => handleIssueWarning(targetUser.username, adminWarningReason)}
                              className="px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] shrink-0"
                            >
                              إرسال الإنذار
                            </button>
                          </div>
                        </div>

                        {/* Strike History */}
                        {strikes.history.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-bold text-slate-700 block">سجل العقوبات والإنذارات السابقة لهذا الطالب:</span>
                            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                              {strikes.history.map((h, idx) => (
                                <div key={idx} className="p-1.5 bg-white border border-slate-200 text-[10px] flex items-center justify-between">
                                  <span className="text-red-700 font-semibold">{h.reason}</span>
                                  <span className="text-slate-400 font-bold shrink-0">{getRelativeTime(h.date)} • بواسطة: {h.by}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-300 font-semibold">
                      اختر أو ابحث عن مستخدم أعلاه لإدارة عقوباته، حظره مؤقتاً، أو مراجعة سجله الإشرافي.
                    </div>
                  )}
                </div>

                {/* Support Inquiries Management */}
                <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                  <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                    <h3 className="font-black text-sm flex items-center gap-1.5 text-slate-900">
                      <IconLifeBuoy size={16} className="text-blue-600" />
                      <span>تذاكر الدعم الفني واستفسارات الطلاب</span>
                    </h3>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-900 font-bold text-xs border border-slate-900">
                      {supportTickets.length} تذكرة
                    </span>
                  </div>

                  {supportTickets.length === 0 ? (
                    <div className="text-xs text-slate-400 py-6 text-center font-semibold border-2 border-dashed border-slate-200">
                      لا توجد تذاكر دعم فني واردة حالياً.
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
                                  {ticket.status === "resolved" ? "تمت المعالجة" : "قيد المتابعة"}
                                </span>
                                <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700 border border-slate-400">
                                  {ticket.category}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-semibold mt-1">
                                المرسل: <strong className="text-slate-800">{ticket.sender}</strong> {ticket.contact && `• للتواصل: ${ticket.contact}`} • {new Date(ticket.created_at).toLocaleDateString("ar-IQ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 self-end sm:self-start">
                              <button
                                onClick={() => resolveSupportTicket(ticket.id)}
                                className={`px-2.5 py-1 text-xs font-bold border border-slate-900 transition-all ${ticket.status === "resolved" ? "bg-slate-200 text-slate-700" : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[1px_1px_0px_#000]"}`}
                              >
                                {ticket.status === "resolved" ? "إعادة الفتح" : "معالجة التذكرة"}
                              </button>
                              <button
                                onClick={() => deleteSupportTicket(ticket.id)}
                                className="px-2 py-1 text-xs font-bold border border-red-600 bg-red-100 text-red-700 hover:bg-red-200"
                              >
                                حذف
                              </button>
                            </div>
                          </div>
                          <div className="bg-white p-2.5 border border-slate-300 text-xs text-slate-700 font-medium whitespace-pre-wrap">
                            {ticket.message}
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
                        <span>شريط التنبيهات العام في أعلى الموقع (Site-Wide Banner)</span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">يظهر لجميع الطلاب والزوار فور دخولهم المنصة</p>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-xs font-black text-slate-800">تفعيل الشريط:</span>
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
                    <label className="block text-xs font-bold text-slate-800">اختر نوع وطابع التنبيه:</label>
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
                        <span>بيان وزاري رسمي (Navy Blue)</span>
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
                        <span>تنبيه عاجل (Amber Alert)</span>
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
                        <span>إعلان المنصة (Emerald Notice)</span>
                      </button>
                    </div>
                  </div>

                  {/* Auto-Expiration Duration Selector */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <IconClock size={14} className="text-slate-700" />
                        <span>مدة صلاحية الإعلان قبل الإيقاف التلقائي (Auto-Expiration):</span>
                      </label>
                      {siteAnnouncement.expiresAt && (
                        <span className={`text-[10px] font-black px-2 py-0.5 border border-slate-900 ${
                          siteAnnouncement.expiresAt <= Date.now()
                            ? "bg-red-200 text-red-950"
                            : "bg-amber-200 text-amber-950"
                        }`}>
                          {siteAnnouncement.expiresAt <= Date.now()
                            ? "انتهت صلاحية الإعلان تلقائياً"
                            : `ينتهي خلال: ${Math.max(1, Math.ceil((siteAnnouncement.expiresAt - Date.now()) / (1000 * 60 * 60)))} ساعة`}
                        </span>
                      )}
                    </div>
                    <select
                      value={announcementDuration}
                      onChange={e => setAnnouncementDuration(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:bg-white"
                    >
                      <option value="never">بدون انتهاء تلقائي (يبقى نشطاً حتى حذفه يدوياً)</option>
                      <option value="1h">ساعة واحدة (1 Hour)</option>
                      <option value="6h">6 ساعات (6 Hours)</option>
                      <option value="12h">12 ساعة (12 Hours)</option>
                      <option value="24h">24 ساعة / يوم واحد (24 Hours)</option>
                      <option value="3d">3 أيام (3 Days)</option>
                      <option value="7d">أسبوع كامل (7 Days)</option>
                    </select>
                  </div>

                  {/* Text input */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-800">نص التنبيه أو القرار:</label>
                    <textarea
                      value={announcementText}
                      onChange={e => setAnnouncementText(e.target.value)}
                      maxLength={200}
                      rows={3}
                      placeholder="اكتب هنا الإعلان الوزاري أو التنبيه العام للطلاب..."
                      className="w-full p-3 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none focus:bg-white resize-none"
                    />
                    <div className="flex justify-end text-[10px] font-bold text-slate-400">
                      {announcementText.length}/200 حرف
                    </div>
                  </div>

                  {/* Live Preview Box */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <span className="text-xs font-black text-slate-700 block">معاينة حية لما سيظهر للطلاب:</span>
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
                          {announcementType === "ministerial" ? "بيان وزاري رسمي" : announcementType === "warning" ? "تنبيه دراسي عاجل" : "إعلان المنصة"}
                        </span>
                        <p className="font-bold text-xs mt-0.5">{announcementText || "نص التنبيه سيظهر هنا بشكل فوري..."}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      onClick={() => handleSaveAnnouncement(announcementText, announcementType, announcementActive, announcementDuration)}
                      className="w-full sm:w-auto px-6 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all"
                    >
                      حفظ وتطبيق شريط التنبيه فوراً
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteAnnouncement}
                      className="w-full sm:w-auto px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-800 font-black text-xs border-2 border-red-600 shadow-[2px_2px_0px_#991b1b] flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                    >
                      <IconTrash size={14} />
                      <span>حذف التنبيه نهائياً (Delete Banner)</span>
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
                      <span>سجل عمليات الإشراف والمشرفين (Audit & Activity Log)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">توثيق شامل وفوري لكل إجراء إداري لضمان الشفافية ومتابعة عمل المشرفين</p>
                  </div>
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-800 font-black text-xs border border-slate-900">
                    {auditLogs.length} عملية مسجلة
                  </span>
                </div>

                {auditLogs.length === 0 ? (
                  <div className="text-xs text-slate-400 py-10 text-center font-semibold border-2 border-dashed border-slate-200">
                    لا توجد عمليات إشرافية مسجلة بعد في هذا السجل.
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
                          {getRelativeTime(log.timestamp)}
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
                      <span>إدارة الكلمات المحظورة وفلتر المحتوى التلقائي (Profanity Filter)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      يتم فحص هذه الكلمات تلقائياً وبشكل مسبق في عناوين ونصوص المنشورات، التقييمات، والتعليقات لحظر نشرها فوراً
                    </p>
                  </div>

                  {/* Add word */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">إضافة كلمة جديدة لقائمة الحظر:</label>
                    <div className="flex gap-2 max-w-md">
                      <input
                        type="text"
                        value={newBannedWordInput}
                        onChange={e => setNewBannedWordInput(e.target.value)}
                        placeholder="اكتب الكلمة المحظورة هنا..."
                        className="flex-1 p-2 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                        onKeyDown={e => {
                          if (e.key === "Enter") handleAddBannedWord(newBannedWordInput);
                        }}
                      />
                      <button
                        onClick={() => handleAddBannedWord(newBannedWordInput)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                      >
                        + إضافة للفلتر
                      </button>
                    </div>
                  </div>

                  {/* Custom Banned Words */}
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-black text-slate-800 block">
                      الكلمات المخصصة المضافة حديثاً ({customBannedWords.length}):
                    </span>
                    {customBannedWords.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">لا توجد كلمات مخصصة مضافة حالياً.</p>
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
                              className="text-red-500 hover:text-red-800 font-black text-xs"
                              title="إزالة الكلمة من الحظر"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Built-in Banned Words preview */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-600 block">
                      الكلمات المحظورة الأساسية في النظام (مدمجة):
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
                      <span>اختبار الفحص الفوري (Sentence Tester):</span>
                    </span>
                    <input
                      type="text"
                      value={filterTestSentence}
                      onChange={e => setFilterTestSentence(e.target.value)}
                      placeholder="جرّب كتابة جملة أو تعليق لمعرفة هل سيتم حظره أم قبوله..."
                      className="w-full p-2.5 bg-white border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                    />
                    {filterTestSentence.trim() && (
                      <div>
                        {containsProfanity(filterTestSentence, customBannedWords) ? (
                          <div className="p-2.5 bg-red-100 border border-red-600 text-red-900 text-xs font-black flex items-center gap-1.5">
                            <IconSlash size={14} />
                            <span>✕ سيتم حظر هذه الجملة تلقائياً لاحتوائها على كلمة محظورة!</span>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-emerald-100 border border-emerald-600 text-emerald-900 text-xs font-black flex items-center gap-1.5">
                            <IconCheck size={14} />
                            <span>✓ الجملة سليمة ومقبولة للنشر وفق المعايير.</span>
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
              const allUsers = getUsers();
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
                        <h3 className="font-black text-sm">لوحة تحكم مالك المنصة الحصرية (Owner Authority)</h3>
                        <p className="text-xs font-bold opacity-90">هذه الأدوات الحساسة مقتصرة حصرياً على حساب المالك ولا يمكن للمشرفين الوصول إليها</p>
                      </div>
                    </div>
                    <button
                      onClick={exportPlatformBackup}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] flex items-center gap-1.5 shrink-0"
                    >
                      <IconDownload size={14} />
                      <span>تصدير نسخة احتياطية (Backup)</span>
                    </button>
                  </div>

                  {/* Section 1: Emergency Platform Toggles */}
                  <div className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#000] p-5 space-y-3">
                    <div className="border-b-2 border-slate-200 pb-2 flex items-center justify-between">
                      <h4 className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                        <IconSliders size={16} className="text-amber-600" />
                        <span>مفاتيح الطوارئ والتحكم بالمنصة (Emergency Master Toggles)</span>
                      </h4>
                      <span className="text-[10px] text-slate-500 font-bold">تطبيق فوري لجميع المستخدمين</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Maintenance Mode Toggle */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.maintenanceMode ? "bg-red-50 border-red-600" : "bg-slate-50 border-slate-300"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">وضع الصيانة العام (Maintenance Mode)</span>
                            <span className="text-[11px] text-slate-500 font-semibold">حصر التصفح بالمشرفين والمالك فقط</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ maintenanceMode: !platformSettings.maintenanceMode })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.maintenanceMode ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {platformSettings.maintenanceMode ? "مفعل (ON)" : "معطل (OFF)"}
                          </button>
                        </div>
                      </div>

                      {/* Allow Registration Toggle */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.allowRegistration ? "bg-emerald-50 border-emerald-500" : "bg-red-50 border-red-600"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">تسجيل حسابات جديدة (Signups)</span>
                            <span className="text-[11px] text-slate-500 font-semibold">إيقاف التسجيل في حال الهجمات العشوائية</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ allowRegistration: !platformSettings.allowRegistration })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.allowRegistration ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                            }`}
                          >
                            {platformSettings.allowRegistration ? "مسموح (ON)" : "موقف (OFF)"}
                          </button>
                        </div>
                      </div>

                      {/* Allow Posting Toggle */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.allowPosting ? "bg-emerald-50 border-emerald-500" : "bg-red-50 border-red-600"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">نشر المنشورات في الساحة (Posting)</span>
                            <span className="text-[11px] text-slate-500 font-semibold">تجميد النشر أثناء فترات الامتحانات</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ allowPosting: !platformSettings.allowPosting })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.allowPosting ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                            }`}
                          >
                            {platformSettings.allowPosting ? "مسموح (ON)" : "موقف (OFF)"}
                          </button>
                        </div>
                      </div>

                      {/* Allow Teacher Submissions & Reviews */}
                      <div className={`p-3.5 border-2 transition-all ${
                        platformSettings.allowTeacherSubmissions ? "bg-emerald-50 border-emerald-500" : "bg-red-50 border-red-600"
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-black text-xs text-slate-900 block">اقتراح مدرسين جدد (Teacher Suggestions)</span>
                            <span className="text-[11px] text-slate-500 font-semibold">تعليق قائمة الانتظار للمراجعة</span>
                          </div>
                          <button
                            onClick={() => handleSavePlatformSettings({ allowTeacherSubmissions: !platformSettings.allowTeacherSubmissions })}
                            className={`px-3 py-1 text-xs font-black border border-slate-900 shadow-[1px_1px_0px_#000] ${
                              platformSettings.allowTeacherSubmissions ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                            }`}
                          >
                            {platformSettings.allowTeacherSubmissions ? "مسموح (ON)" : "موقف (OFF)"}
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
                          <span>إدارة طاقم المشرفين والصلاحيات المخصصة (Staff & Granular Permissions)</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                          ابحث عن أي مستخدم لترقيته إلى مشرف، أو تخصيص وتعديل صلاحياته بما فيها صلاحيات المالك
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-600 shrink-0">
                        {ownerCount} مالك • {modCount} مشرف • {studentCount} طالب
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
                            placeholder="ابحث بالاسم عن أي طالب أو مشرف لترقيته أو تعديل صلاحياته..."
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
                            الكل ({allUsers.length})
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
                            مشرفين ({modCount})
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
                            طلاب ({studentCount})
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
                            لا يوجد أي مستخدم يطابق البحث: "{staffSearchQuery}"
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
                                      <span className={`px-2 py-0.2 text-[9px] font-black border border-slate-900 ${
                                        u.role === "owner" ? "bg-amber-400 text-slate-950" : u.role === "mod" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-800"
                                      }`}>
                                        {u.role === "owner" ? "مالك المنصة" : u.role === "mod" ? "مشرف" : "طالب"}
                                      </span>
                                      {u.role === "mod" && (
                                        <span className={`px-2 py-0.2 text-[9px] font-bold border border-slate-900 ${
                                          hasOwnerPowers ? "bg-amber-200 text-amber-950" : "bg-blue-100 text-blue-900"
                                        }`}>
                                          {grantedCount === 11 ? "كامل الصلاحيات (11/11)" : `${grantedCount} صلاحيات`}
                                          {hasOwnerPowers && " • تشمل أدوات المالك"}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                      {u.role === "owner"
                                        ? "المالك الأساسي للنظام بصلاحيات كاملة غير قابلة للتعديل"
                                        : u.role === "mod"
                                        ? `مشرف في المنصة (${grantedCount} صلاحية مفعلة)`
                                        : "طالب مسجل في المنصة"}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center">
                                  {u.role === "owner" ? (
                                    <span className="text-[10px] text-amber-900 font-black px-2.5 py-1 bg-amber-100 border border-amber-400 flex items-center gap-1">
                                      <IconCrown size={12} /> محمي (المالك)
                                    </span>
                                  ) : u.role === "mod" ? (
                                    <>
                                      <button
                                        onClick={() => openModPermissionModal(u.username)}
                                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1 active:translate-x-px active:translate-y-px transition-all"
                                      >
                                        <IconSliders size={13} />
                                        <span>تعديل الصلاحيات</span>
                                      </button>
                                      <button
                                        onClick={() => handleDemoteToStudent(u.username)}
                                        className="px-2.5 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs border border-red-400 active:translate-x-px active:translate-y-px transition-all"
                                      >
                                        تخفيض إلى طالب
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => openModPermissionModal(u.username)}
                                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#000] flex items-center gap-1.5 active:translate-x-px active:translate-y-px transition-all"
                                    >
                                      <IconKey size={13} />
                                      <span>ترقية وتعيين الصلاحيات</span>
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
                        <span>لوحة إحصائيات النمو الشاملة (Executive Growth Analytics)</span>
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold">بيانات مباشرة</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-slate-900">{allUsers.length}</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">إجمالي الحسابات</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-emerald-700">{teachers.filter(t => t.status === "active").length}</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">مدرسين معتمدين</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-blue-700">{posts.length}</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">إجمالي المنشورات والمراجعات</div>
                      </div>
                      <div className="bg-slate-50 border border-slate-300 p-3 text-center">
                        <div className="text-2xl font-black text-amber-600">{approvalRate}%</div>
                        <div className="text-[11px] font-bold text-slate-600 mt-0.5">متوسط قبول المدرسين</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
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
        <button onClick={() => { if (!session) { setAuthModal(true); return; } setTab("notifications"); }} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 relative ${tab === "notifications" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconBell size={20} />{t("navNotifications")}
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-2 bg-red-600 text-white font-black text-[8px] px-1 rounded-full border border-slate-900">
              {unreadCount}
            </span>
          )}
        </button>
        <button onClick={() => { if (!session) { setAuthModal(true); return; } setViewedUser(session.username); setTab("profile"); }} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "profile" && targetProfileUser === session?.username ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconUser size={20} />{t("navProfile")}
        </button>
        <button onClick={() => setSettingsModal(true)} className="flex flex-col items-center text-[10px] font-bold py-1 px-2 text-slate-400 hover:text-emerald-primary">
          <IconSettings size={20} />{t("navSettings")}
        </button>
        {canAdmin && (
          <button onClick={() => setTab("admin")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "admin" ? "text-red-600" : "text-slate-400"}`}>
            <IconShield size={20} />{t("navAdmin")}
          </button>
        )}

      </nav>

      {/* ═══════ AUTH MODAL ═══════ */}
      {authModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <h3 className="font-black text-base">{isRegister ? "إنشاء حساب جديد" : "تسجيل الدخول"}</h3>
              <button onClick={() => setAuthModal(false)}><IconX size={16} /></button>
            </div>
            {authError && <div className="p-2.5 bg-red-100 border border-red-400 text-red-700 text-xs font-bold leading-relaxed">{authError}</div>}
            
            {!isRegister && lockoutRemaining > 0 && (
              <div className="p-2.5 bg-amber-100 border-2 border-amber-600 text-amber-900 text-xs font-bold text-center">
                تم قفل تسجيل الدخول مؤقتاً! يرجى الانتظار: <span className="font-black text-sm">{lockoutRemaining} ثانية</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">اسم المستخدم</label>
                <input type="text" value={authUser} onChange={e => setAuthUser(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder="مثال: hh" />
              </div>
              <div>
                <label className="block font-bold mb-1">كلمة المرور (8+ أحرف، رقم، وحرف كبير)</label>
                <input type="password" value={authPass} onChange={e => setAuthPass(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder="••••••••" />
                {isRegister && authPass.length > 0 && (
                  <div className="mt-2 space-y-0.5 text-[11px] font-bold">
                    <p className={authPass.length >= 8 ? "text-emerald-600" : "text-slate-400"}>{authPass.length >= 8 ? "✓" : "○"} ٨ أحرف على الأقل</p>
                    <p className={/[0-9]/.test(authPass) ? "text-emerald-600" : "text-slate-400"}>{/[0-9]/.test(authPass) ? "✓" : "○"} يحتوي على رقم</p>
                    <p className={/[A-Z]/.test(authPass) ? "text-emerald-600" : "text-slate-400"}>{/[A-Z]/.test(authPass) ? "✓" : "○"} يحتوي على حرف كبير</p>
                  </div>
                )}
              </div>

              {/* Cloudflare Turnstile Human Verification */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800 flex items-center gap-1">
                    <span>التحقق الأمني (Cloudflare Turnstile):</span>
                  </label>
                  {turnstileToken ? (
                    <span className="text-[10px] text-emerald-700 font-black flex items-center gap-1">
                      <IconCheck size={12} className="text-emerald-700" /> تم التحقق بنجاح
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-semibold">مطلوب للتحقق</span>
                  )}
                </div>
                <Turnstile
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                  onError={handleTurnstileError}
                />
              </div>

              <button
                onClick={handleAuth}
                disabled={(!isRegister && lockoutRemaining > 0) || !turnstileToken}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:bg-slate-300 disabled:text-slate-500 disabled:border-slate-400 disabled:shadow-none transition-all"
              >
                {!isRegister && lockoutRemaining > 0
                  ? `مقفل مؤقتاً (${lockoutRemaining} ثانية)`
                  : isRegister ? "حساب جديد" : "دخول"}
              </button>
            </div>
            <div className="text-center pt-1">
              <button onClick={() => { setIsRegister(!isRegister); setAuthError(""); setTurnstileToken(null); }} className="text-xs text-emerald-700 font-bold underline">
                {isRegister ? "لديك حساب؟ سجل دخولك" : "ليس لديك حساب؟ سجل الآن"}
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
              <h3 className="font-black text-base">إنشاء منشور جديد</h3>
              <button onClick={() => setPostModal(false)}><IconX size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-800">
                    {siteLang === "en" ? "Related Teacher (Optional)" : "المدرس المعني (اختياري)"}
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
                      placeholder={siteLang === "en" ? "Search teacher by name, subject, or city..." : "ابحث عن المدرس بالاسم، المادة أو المحافظة..."}
                      className="w-full p-2 ps-8 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none"
                    />
                    <span className="absolute start-2.5 top-2.5 text-slate-500 pointer-events-none">
                      <IconSearch size={13} />
                    </span>
                    {postTeacherSearch && (
                      <button
                        type="button"
                        onClick={() => setPostTeacherSearch("")}
                        className="absolute end-2.5 top-2 text-xs text-slate-400 hover:text-slate-700 font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <select
                    value={postTeacher}
                    onChange={e => setPostTeacher(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none text-xs"
                  >
                    <option value="">
                      {siteLang === "en" ? "-- No Teacher (General / Ministerial Post) --" : "-- بدون مدرس (منشور عام / وزاري) --"}
                    </option>
                    {activeTeachers
                      .filter(t => {
                        if (!postTeacherSearch.trim()) return true;
                        const q = postTeacherSearch.trim().toLowerCase();
                        return (
                          t.name.toLowerCase().includes(q) ||
                          t.subject.toLowerCase().includes(q) ||
                          t.gov.toLowerCase().includes(q)
                        );
                      })
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.subject} - {t.gov})
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
                <label className="block font-bold mb-1">العنوان (حد أقصى ١٠٠ حرف)</label>
                <input type="text" value={postTitle} onChange={e => setPostTitle(e.target.value)} maxLength={100} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder="عنوان المنشور" />
                <span className="text-[10px] text-slate-400 font-bold">{postTitle.length}/100</span>
              </div>
              <div>
                <label className="block font-bold mb-1">المحتوى (حد أقصى ١٥٠٠ حرف)</label>
                <textarea value={postBody} onChange={e => setPostBody(e.target.value)} maxLength={1500} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold min-h-[100px] resize-none focus:outline-none" placeholder="اكتب هنا..." />
                <span className="text-[10px] text-slate-400 font-bold">{postBody.length}/1500</span>
              </div>
              <div>
                <label className="block font-bold mb-1">المرحلة</label>
                <select value={postGrade} onChange={e => setPostGrade(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none">
                  <option value="General">عام</option>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {/* Multi-Image Upload */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  إرفاق صور (ملازم، ملخصات، أسئلة وزارية - يمكنك اختيار أكثر من صورة)
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs border border-slate-900 shadow-[1px_1px_0px_#000] cursor-pointer transition-all"
                  >
                    <IconImage size={14} className="text-emerald-primary" />
                    <span>+ إضافة صور من جهازك</span>
                  </label>

                  {postImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center pt-2">
                      {postImages.map((img, idx) => (
                        <div key={idx} className="relative group w-14 h-14 border border-slate-900 bg-white shadow-[1px_1px_0px_#000]">
                          <img src={img} alt={`مرفق ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePostImage(idx)}
                            className="absolute -top-1.5 -left-1.5 bg-red-600 text-white w-4 h-4 text-[10px] font-black rounded-full flex items-center justify-center border border-slate-900 hover:bg-red-700"
                            title="حذف الصورة"
                          >
                            ✕
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
                    <span>{siteLang === "en" ? "YouTube Explanation Link (Optional)" : "رابط شرح يوتيوب (اختياري)"}</span>
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
                  placeholder="https://youtube.com/watch?v=... أو https://youtu.be/..."
                />
                {postYoutube.trim() && !isValidYoutubeUrl(postYoutube) && (
                  <p className="text-[10px] text-red-600 font-bold mt-1">
                    {siteLang === "en" ? "Must be a valid YouTube link (youtube.com or youtu.be)" : "يجب أن يكون الرابط من موقع يوتيوب (youtube.com أو youtu.be)"}
                  </p>
                )}
              </div>

              <button
                onClick={submitPost}
                disabled={!postTitle.trim() || !postBody.trim() || (!!postYoutube.trim() && !isValidYoutubeUrl(postYoutube))}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {siteLang === "en" ? "Publish Post" : "نشر المنشور"}
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
                <h3 className="font-black text-base text-slate-900">إضافة مدرس جديد</h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">سيتم إرسال المدرس لقائمة الانتظار لمراجعة الإدارة</p>
              </div>
              <button onClick={() => setTeacherModal(false)}><IconX size={16} /></button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Box 1: Teacher Name (No name prefilled in box) */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  اسم المدرس <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tName}
                  onChange={e => setTName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none focus:bg-white"
                  placeholder="اكتب اسم المدرس هنا..."
                />
              </div>

              {/* Box 2: Location / City (Single select from 18 governorates) */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  أين يتواجد هذا المدرس؟ (اختر محافظة واحدة) <span className="text-red-500">*</span>
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
                  المادة الدراسية <span className="text-red-500">*</span>
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
                      placeholder="اكتب اسم المادة الدراسية غير المتوفرة..."
                      className="w-full p-2 bg-white border-2 border-emerald-600 text-xs font-semibold focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Box 4: Grades Options (Multiple selection) */}
              <div>
                <label className="block font-bold mb-1.5 text-slate-800">
                  المراحل الدراسية التي يدرّسها (يمكنك اختيار أكثر من مرحلة) <span className="text-red-500">*</span>
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
                        <span>{isSelected ? "✓" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Box: Teaching Mode (حضوري / إلكتروني / كلاهما) */}
              <div>
                <label className="block font-bold mb-1.5 text-slate-800">
                  طريقة التدريس المتاحة للمدرس <span className="text-red-500">* (اختر طريقة واحدة أو كلاهما)</span>
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
                    <span>حضوري (معاهد وقاعات)</span>
                    <span>{tTeachingModes.includes("حضوري") ? "✓" : "+"}</span>
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
                    <span>إلكتروني (دورات أونلاين)</span>
                    <span>{tTeachingModes.includes("إلكتروني") ? "✓" : "+"}</span>
                  </button>
                </div>
              </div>

              {/* Box 5: Image File Upload (FILE ONLY, NOT LINK) */}
              <div>
                <label className="block font-bold mb-1 text-slate-800">
                  صورة المدرس (ملف صورة فقط) <span className="text-red-500">*</span>
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
                        alt="معاينة المدرس"
                        className="w-20 h-20 border-2 border-slate-900 object-cover shadow-[2px_2px_0px_#000] bg-white"
                      />
                      <div className="text-right space-y-1">
                        <span className="text-xs font-black text-emerald-800 block">✓ تم رفع الصورة بنجاح</span>
                        <label
                          htmlFor="teacher-img-file"
                          className="inline-block px-3 py-1 bg-white border border-slate-900 text-xs font-bold cursor-pointer hover:bg-slate-100 shadow-[1px_1px_0px_#000]"
                        >
                          تغيير ملف الصورة
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="teacher-img-file" className="cursor-pointer block py-2 space-y-1.5">
                      <div className="flex justify-center text-slate-600"><IconCamera size={28} /></div>
                      <div className="text-xs font-black text-slate-800">اضغط هنا لاختيار ملف صورة المدرس من جهازك</div>
                      <div className="text-[10px] text-slate-500 font-semibold">يقبل JPG، PNG، WebP، وغيرها (ملف فقط وليس رابط)</div>
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
                إرسال للمراجعة (قائمة الانتظار)
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
                <span>إرسال بلاغ عن محتوى</span>
              </h3>
              <button
                onClick={() => { setReportTarget(null); setReportNote(""); }}
                className="p-1 hover:bg-slate-100 border border-transparent hover:border-slate-900"
              >
                <IconX size={16} />
              </button>
            </div>

            {reportTarget.title && (
              <div className="p-3 bg-slate-50 border-2 border-slate-200 space-y-1 text-xs">
                <span className="text-[10px] font-bold text-slate-500 block">
                  {reportTarget.type === "post" ? "المحتوى المبلّغ عنه:" : "التعليق المبلّغ عنه:"}
                </span>
                <p className="font-bold text-slate-800 line-clamp-2">{reportTarget.title}</p>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <label className="block font-bold text-slate-900">
                حدد سبب البلاغ: <span className="text-red-500">*</span>
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
                  <div className="font-black text-slate-900 text-xs">محتوى غير لائق أو مسيء</div>
                  <div className="text-[11px] text-slate-500 font-semibold">ألفاظ غير مقبولة، تنمر، أو إساءة شخصية</div>
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
                  <div className="font-black text-slate-900 text-xs">معلومات خاطئة أو مضللة</div>
                  <div className="text-[11px] text-slate-500 font-semibold">بيانات غير صحيحة، تقييم كاذب أو مضلل للطلاب</div>
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
                  <div className="font-black text-slate-900 text-xs">سبب آخر</div>
                  <div className="text-[11px] text-slate-500 font-semibold">مخالفة أخرى لسياسات المنصة وقواعد السلوك</div>
                </div>
              </label>

              {/* Note input (up to 50 words) */}
              <div className="pt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    ملاحظة إضافية للمشرفين (اختياري - حتى 50 كلمة):
                  </label>
                  <span className={`text-[10px] font-bold ${getWordCount(reportNote) > 50 ? "text-red-600 font-black" : "text-slate-500"}`}>
                    {getWordCount(reportNote)} / 50 كلمة
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
                  placeholder="اكتب توضيحاً إضافياً للمشرفين (بحد أقصى 50 كلمة)..."
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-semibold min-h-[75px] resize-none focus:outline-none focus:bg-white"
                />
                {getWordCount(reportNote) > 50 && (
                  <p className="text-[10px] text-red-600 font-bold">لا يمكن تجاوز الحد الأقصى (50 كلمة).</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setReportTarget(null); setReportNote(""); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border-2 border-slate-900 transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={submitReport}
                  disabled={getWordCount(reportNote) > 50}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#7f1d1d] disabled:bg-slate-300 disabled:shadow-none transition-all active:translate-x-0.5 active:translate-y-0.5"
                >
                  إرسال البلاغ
                </button>
              </div>
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
                    <span>تخصيص وتعيين صلاحيات المشرف:</span>
                    <span className="text-emerald-primary">{permModalUser}</span>
                  </h3>
                  <span className={`px-2 py-0.5 text-[10px] font-black border border-slate-900 ${
                    permModalRole === "mod" ? "bg-blue-600 text-white" : "bg-amber-400 text-slate-950"
                  }`}>
                    {permModalRole === "mod" ? "مشرف حالي" : "طالب (ترقية جديدة)"}
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-semibold">
                  حدد بدقة ما يُسمح لهذا المشرف تنفيذه في لوحة التحكم، بما في ذلك الصلاحيات الحساسة الخاصة بالمالك
                </p>
              </div>
              <button
                onClick={() => setPermModalUser(null)}
                className="p-1 hover:bg-slate-200 border-2 border-slate-900 shadow-[1px_1px_0px_#000] shrink-0 active:translate-x-px active:translate-y-px"
              >
                <IconX size={16} />
              </button>
            </div>

            {/* Quick Presets Bar */}
            <div className="px-4 sm:px-5 py-3 bg-slate-100 border-b-2 border-slate-200 flex items-center justify-between gap-2 flex-wrap text-xs font-bold">
              <span className="text-slate-600 font-black">قوالب الصلاحيات السريعة:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPermForm({ ...DEFAULT_MOD_PERMISSIONS })}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-900 border border-slate-900 shadow-[1px_1px_0px_#000] text-[11px] font-black"
                >
                  مشرف قياسي (افتراضي)
                </button>
                <button
                  type="button"
                  onClick={() => setPermForm({ ...FULL_OWNER_PERMISSIONS })}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 border border-slate-900 shadow-[1px_1px_0px_#000] text-[11px] font-black flex items-center gap-1"
                >
                  <IconCrown size={12} />
                  <span>كامل الصلاحيات (شريك / Super Mod)</span>
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
                  إلغاء الكل
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
                    1. الصلاحيات الإشرافية الأساسية (Standard Moderation)
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
                      <span className="font-black text-slate-900 block">قبول ورفض المدرسين</span>
                      <span className="text-[11px] text-slate-500 font-semibold">مراجعة طلبات إضافة المدرسين في قائمة الانتظار واعتمادها</span>
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
                      <span className="font-black text-slate-900 block">إدارة المنشورات والبلاغات</span>
                      <span className="text-[11px] text-slate-500 font-semibold">حذف أو إخفاء المنشورات والتعليقات ومعالجة البلاغات</span>
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
                      <span className="font-black text-slate-900 block">تذاكر الدعم الفني</span>
                      <span className="text-[11px] text-slate-500 font-semibold">معالجة وحذف استفسارات وتذاكر الدعم الفني للطلاب</span>
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
                      <span className="font-black text-slate-900 block">الانضباط وحظر المستخدمين</span>
                      <span className="text-[11px] text-slate-500 font-semibold">توجيه إنذارات رسمية وحظر حسابات الطلاب مؤقتاً أو نهائياً</span>
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
                      <span className="font-black text-slate-900 block">فلتر الكلمات المحظورة</span>
                      <span className="text-[11px] text-slate-500 font-semibold">إضافة وإزالة الكلمات المحظورة من فلتر الحظر التلقائي</span>
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
                      2. صلاحيات المالك الحصرية والمفوضة (Owner Delegated Powers)
                    </h4>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 bg-amber-300 text-amber-950 border border-slate-900">
                    أدوات حساسة
                  </span>
                </div>
                <p className="text-[11px] text-amber-900 font-semibold">
                  تحذير: تفعيل هذه الصلاحيات يمنح المشرف وصولاً لأدوات الإدارة العليا للمنصة، شريط التنبيهات، مفاتيح الطوارئ، والصيانة
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
                      <span className="font-black text-slate-900 block">شريط التنبيهات العام (Announcements)</span>
                      <span className="text-[11px] text-slate-500 font-semibold">نشر وتعديل وحذف التنبيهات والبيانات الوزارية في أعلى الموقع</span>
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
                      <span className="font-black text-slate-900 block">الاطلاع على سجل العمليات (Audit Log)</span>
                      <span className="text-[11px] text-slate-500 font-semibold">مراجعة تقرير وتاريخ تصرفات المشرفين والأنشطة الإدارية</span>
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
                      <span className="font-black text-slate-900 block">مفاتيح طوارئ المنصة (Emergency Toggles)</span>
                      <span className="text-[11px] text-slate-500 font-semibold">تعليق أو تفعيل التسجيل، النشر، واقتراح المدرسين</span>
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
                      <span className="font-black text-slate-900 block">وضع الصيانة العام (Maintenance Mode)</span>
                      <span className="text-[11px] text-slate-500 font-semibold">تفعيل شاشة الصيانة وحجب التصفح عن عامة الطلاب</span>
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
                      <span className="font-black text-slate-900 block">تصدير النسخة الاحتياطية (Backup)</span>
                      <span className="text-[11px] text-slate-500 font-semibold">تحميل ملف JSON الشامل لجميع بيانات المنصة</span>
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
                      <span className="font-black text-slate-900 block">إدارة وترقية المشرفين (Staff Governance)</span>
                      <span className="text-[11px] text-slate-500 font-semibold">ترقية طلاب آخرين وتعديل صلاحيات باقي الكادر</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t-2 border-slate-900 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-600">
                الصلاحيات المحددة: <strong className="text-slate-950 font-black">{Object.values(permForm).filter(Boolean).length}</strong> من 11
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPermModalUser(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs border border-slate-900 transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveModPermissions}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_#000] active:translate-x-px active:translate-y-px transition-all"
                >
                  حفظ وتطبيق الصلاحيات فوراً
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
              <h3 className="font-black text-base flex items-center gap-1.5"><IconCamera size={16} /> تعديل الملف الشخصي والصورة</h3>
              <button onClick={() => setProfileModal(false)}><IconX size={16} /></button>
            </div>
            <div className="space-y-4 text-xs">
              
              {/* Custom Image Upload (Screenshots, JPG, PNG, WebP) */}
              <div className="bg-slate-50 border-2 border-slate-900 p-3 space-y-2">
                <label className="block font-bold text-slate-800">
                  صورة الحساب الشخصية (PFP):
                </label>
                <div className="flex items-center gap-3">
                  {editPfpUrl ? (
                    <div className="w-14 h-14 border-2 border-slate-900 overflow-hidden shrink-0 bg-white">
                      <img src={editPfpUrl} alt="معاينة" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 border-2 border-slate-900 flex items-center justify-center font-black text-white text-lg shrink-0" style={{ backgroundColor: editColor }}>
                      {session.username.substring(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="space-y-1.5 flex-1">
                    <label className="block">
                      <span className="sr-only">اختر صورة</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp, image/*"
                        onChange={handlePfpUpload}
                        className="block w-full text-xs text-slate-500 file:mr-0 file:py-1.5 file:px-3 file:border-2 file:border-slate-900 file:text-xs file:font-black file:bg-emerald-primary file:text-white hover:file:bg-emerald-dark cursor-pointer"
                      />
                    </label>
                    <p className="text-[10px] text-slate-500">يقبل الصور، السكرين شوت، JPG، PNG، WebP وغيرها.</p>
                    {editPfpUrl && (
                      <button
                        type="button"
                        onClick={() => setEditPfpUrl("")}
                        className="text-[10px] text-red-600 font-bold hover:underline"
                      >
                        حذف الصورة واستخدام الرمز اللوني
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Color Picker (Fallback if no custom image) */}
              <div>
                <label className="block font-bold mb-2">لون الرمز التعبيري (إذا لم ترفع صورة):</label>
                <div className="flex gap-2 flex-wrap">
                  {AVATAR_COLORS.map(c => (
                    <button key={c} onClick={() => setEditColor(c)}
                      className={`w-9 h-9 border-2 flex items-center justify-center font-black text-white text-xs ${editColor === c ? "border-slate-900 shadow-[2px_2px_0px_#000]" : "border-slate-300"}`}
                      style={{ backgroundColor: c }}>
                      {editColor === c ? "✓" : session.username.substring(0, 1).toUpperCase()}
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
                    {siteLang === "ar" ? "معاينة البانر" : "Banner Preview"}
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
                <label className="block font-bold mb-1">النبذة التعريفية (Bio):</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  maxLength={200}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold min-h-[70px] resize-none focus:outline-none"
                  placeholder="اكتب شيئاً عنك، مرحلتك الدراسية، أو هدفك..."
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
                  <IconHistory size={18} /> سجل تفاعلاتك (سري وخاص)
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold">مرئي فقط لك وللمالك — يحتوي على كل تصويتاتك</p>
              </div>
              <button onClick={() => setHistoryModal(false)}><IconX size={16} /></button>
            </div>

            {userVoteHistory.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-300">
                لم تقم بأي تصويت (إعجاب أو عدم إعجاب) بعد.
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
                          <IconThumbUp size={12} /> أعجبك
                        </>
                      ) : (
                        <>
                          <IconThumbDown size={12} /> لم يعجبك
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
              <h3 className="font-black text-xl text-slate-900">أي الصفوف تهمك؟</h3>
              <p className="text-xs text-slate-600 font-semibold mt-1">اختر بالضبط ٢ من المراحل الدراسية لتخصيص تجربتك</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {GRADES.map(g => (
                <button key={g} onClick={() => {
                  if (selectedGrades.includes(g)) setSelectedGrades(selectedGrades.filter(x => x !== g));
                  else if (selectedGrades.length < 2) setSelectedGrades([...selectedGrades, g]);
                }}
                  className={`border-2 py-3 text-xs font-bold transition-all ${selectedGrades.includes(g) ? "border-slate-900 bg-emerald-primary text-white shadow-none translate-x-[1px] translate-y-[1px]" : "border-slate-900 bg-white text-slate-700 shadow-[2px_2px_0px_#000] hover:bg-slate-50"}`}>
                  {selectedGrades.includes(g) ? "✓ " : ""}{g}
                </button>
              ))}
            </div>
            <button onClick={completeGrades} disabled={selectedGrades.length !== 2}
              className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
              متابعة ({selectedGrades.length}/2)
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
              <span className="text-xs font-black text-slate-800">معاينة الصورة بالحجم الكامل</span>
              <button
                onClick={() => setPreviewImageModal(null)}
                className="px-2.5 py-1 bg-red-600 text-white font-bold text-xs border border-slate-900 shadow-[1px_1px_0px_#000] hover:bg-red-700"
              >
                إغلاق ✕
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
                          ? "border-slate-900 bg-slate-900 text-white shadow-[3px_3px_0px_#000]"
                          : "border-slate-300 bg-white hover:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-white bg-slate-800 text-white flex items-center justify-center font-bold shadow-[2px_2px_0px_#000]">
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
                        <div className="w-6 h-6 bg-white text-slate-900 flex items-center justify-center border border-white">
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
                          ? "border-pink-900 bg-pink-50 shadow-[3px_3px_0px_#db2777]"
                          : "border-slate-300 bg-white hover:border-pink-500"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-slate-900 bg-pink-500 text-white flex items-center justify-center font-bold shadow-[2px_2px_0px_#000]">
                          <IconPalette size={20} />
                        </div>
                        <div>
                          <div className="font-black text-xs sm:text-sm text-pink-900 flex items-center gap-2">
                            <span>{t("themePink")}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-pink-200 text-pink-900 border border-pink-400">
                              Cute Pink
                            </span>
                          </div>
                          <p className="text-[11px] text-pink-700 font-semibold">{t("themePinkDesc")}</p>
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
                          ? "border-emerald-950 bg-emerald-50 shadow-[3px_3px_0px_#15803d]"
                          : "border-slate-300 bg-white hover:border-emerald-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border-2 border-slate-900 bg-emerald-700 text-white flex items-center justify-center font-bold shadow-[2px_2px_0px_#000]">
                          <IconBook size={20} />
                        </div>
                        <div>
                          <div className="font-black text-xs sm:text-sm text-emerald-950 flex items-center gap-2">
                            <span>{t("themePlants")}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-200 text-emerald-900 border border-emerald-600">
                              Green Botany
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-800 font-semibold">{t("themePlantsDesc")}</p>
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
                        <span className="font-black text-sm text-slate-900">العربية (Arabic)</span>
                        {siteLang === "ar" && (
                          <span className="w-5 h-5 bg-slate-900 text-white flex items-center justify-center text-[10px]">
                            <IconCheck size={12} />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 font-semibold">
                        الاتجاه من اليمين إلى اليسار (RTL). اللغة الرسمية والافتراضية للمنصة ومجتمع الطلاب.
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
                        <span className="font-black text-sm text-slate-900">English (الإنجليزية)</span>
                        {siteLang === "en" && (
                          <span className="w-5 h-5 bg-slate-900 text-white flex items-center justify-center text-[10px]">
                            <IconCheck size={12} />
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 font-semibold">
                        Left-to-Right layout (LTR). Complete English translation for all platform menus and tabs.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: FAQ ACCORDION */}
              {settingsTab === "faq" && (
                <div className="space-y-3">
                  <div className="border-b border-slate-200 pb-2">
                    <h4 className="font-black text-sm text-slate-900">{t("faqTitle")}</h4>
                    <p className="text-[11px] text-slate-500 font-semibold">{t("faqSub")}</p>
                  </div>

                  <div className="space-y-2">
                    {faqList.map((item, idx) => {
                      const isExp = faqExpanded === idx;
                      return (
                        <div
                          key={idx}
                          className="border-2 border-slate-900 bg-white shadow-[2px_2px_0px_#000] overflow-hidden transition-all"
                        >
                          <button
                            type="button"
                            onClick={() => setFaqExpanded(isExp ? null : idx)}
                            className="w-full p-3 text-start flex items-center justify-between gap-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                          >
                            <span className="font-black text-xs text-slate-900 leading-snug">
                              {item.q[siteLang]}
                            </span>
                            <span className="shrink-0 text-slate-600">
                              {isExp ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                            </span>
                          </button>

                          {isExp && (
                            <div className="p-3 bg-white border-t-2 border-slate-900 text-xs text-slate-700 font-medium leading-relaxed">
                              {item.a[siteLang]}
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
                      />
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

                    {/* Sender Contact info */}
                    <div>
                      <label className="block font-bold mb-1 text-slate-800">{t("supportContact")}:</label>
                      <input
                        type="text"
                        value={supportContact}
                        onChange={e => setSupportContact(e.target.value)}
                        placeholder={t("supportContactPlaceholder")}
                        className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none focus:bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={submitSupportTicket}
                      className="w-full py-3 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                    >
                      {t("sendSupportTicket")}
                    </button>
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
    </div>
  );
}
