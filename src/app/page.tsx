"use client";

import { useState, useEffect, useCallback } from "react";
import { normalizeTeacherName } from "@/utils/normalization";
import { containsProfanity } from "@/utils/moderation";
import { getRelativeTime, isWithinEditWindow } from "@/utils/time";
import {
  IconBook, IconPen, IconUser, IconThumbUp, IconThumbDown, IconFlag,
  IconShield, IconCrown, IconGrad, IconTag, IconInbox, IconBolt,
  IconTrash, IconX, IconPlus, IconCamera, IconComment, IconSearch, IconArrowRight,
} from "@/utils/icons";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────
interface User { username: string; pass: string; role: "student" | "mod" | "owner" }
interface Profile { avatarColor: string; bio: string; }
interface Comment {
  id: string; author: string; text: string; created_at: string;
  likes: number; dislikes: number; reports: number;
}
interface Post {
  id: string; author: string; teacherId: string;
  title: string; body: string; grade_level: string;
  likes: number; dislikes: number; reports: number;
  status: "active" | "hidden"; comments: Comment[];
  created_at: string;
}
interface Teacher {
  id: string; createdBy: string; name: string; normalizedName: string;
  gov: string; subject: string; grades: string; img: string;
  likes: number; dislikes: number; status: "active" | "pending_custom";
}

// Vote map: "username_itemId" -> "like" | "dislike"
type VoteMap = Record<string, "like" | "dislike">;

const GRADES = [
  "الأول متوسط", "الثاني متوسط", "الثالث متوسط",
  "الرابع إعدادي", "الخامس إعدادي", "السادس إعدادي",
];

const AVATAR_COLORS = [
  "#0d9488", "#dc2626", "#2563eb", "#7c3aed",
  "#ea580c", "#0891b2", "#4f46e5", "#be185d",
];

// ─── LocalStorage Helpers ──────────────────────────────────────────
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
      hh: { avatarColor: "#0d9488", bio: "مالك المنصة" },
      mod1: { avatarColor: "#2563eb", bio: "مشرف" },
      student1: { avatarColor: "#dc2626", bio: "" },
    }));
  }
  if (!localStorage.getItem("teachers")) {
    localStorage.setItem("teachers", JSON.stringify([
      { id: "t1", createdBy: "mod1", name: "أستاذ حيدر وليد", normalizedName: normalizeTeacherName("أستاذ حيدر وليد"), gov: "بغداد", subject: "رياضيات", grades: "السادس الاعدادي", img: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=150&h=150&fit=crop", likes: 142, dislikes: 5, status: "active" },
      { id: "t2", createdBy: "student1", name: "أستاذ علاء الدين", normalizedName: normalizeTeacherName("أستاذ علاء الدين"), gov: "كركوك", subject: "فيزياء", grades: "السادس الإعدادي", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop", likes: 89, dislikes: 12, status: "active" },
    ]));
  }
  if (!localStorage.getItem("posts")) {
    localStorage.setItem("posts", JSON.stringify([
      {
        id: "p1", author: "student1", teacherId: "t1",
        title: "شنو رأيكم بملزمة الفصل الثالث مالته؟",
        body: "شباب اليوم شفت المحاضرة الأولى، الأستاذ شرحه كلش زين بس عندي استفسار عن طريقة حل المسائل...",
        grade_level: "السادس إعدادي", likes: 42, dislikes: 3, reports: 2, status: "active",
        comments: [{ id: "c1", author: "mod1", text: "اليوتيوب كافي وزيادة بس حل كل الوزاريات وياه.", created_at: new Date(Date.now() - 3600000).toISOString(), likes: 5, dislikes: 0, reports: 0 }],
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ]));
  }
  if (!localStorage.getItem("votes")) localStorage.setItem("votes", JSON.stringify({}));
}

function getUsers(): User[] { return JSON.parse(localStorage.getItem("users") || "[]"); }
function getProfiles(): Record<string, Profile> { return JSON.parse(localStorage.getItem("profiles") || "{}"); }
function getTeachers(): Teacher[] { return JSON.parse(localStorage.getItem("teachers") || "[]"); }
function getPosts(): Post[] { return JSON.parse(localStorage.getItem("posts") || "[]"); }
function getVotes(): VoteMap { return JSON.parse(localStorage.getItem("votes") || "{}"); }
function setUsers(u: User[]) { localStorage.setItem("users", JSON.stringify(u)); }
function setProfiles(p: Record<string, Profile>) { localStorage.setItem("profiles", JSON.stringify(p)); }
function setTeachers(t: Teacher[]) { localStorage.setItem("teachers", JSON.stringify(t)); }
function setPosts(p: Post[]) { localStorage.setItem("posts", JSON.stringify(p)); }
function setVotes(v: VoteMap) { localStorage.setItem("votes", JSON.stringify(v)); }
function getSession(): User | null { const s = localStorage.getItem("currentUser"); return s ? JSON.parse(s) : null; }

// ─── Main Component ───────────────────────────────────────────────
export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"feed" | "directory" | "admin">("feed");
  const [session, setSession] = useState<User | null>(null);
  const [_, setTick] = useState(0);
  const rerender = useCallback(() => setTick(t => t + 1), []);

  // Modals
  const [authModal, setAuthModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [teacherModal, setTeacherModal] = useState(false);
  const [postModal, setPostModal] = useState(false);
  const [gradeModal, setGradeModal] = useState(false);
  const [profileModal, setProfileModal] = useState(false);

  // Auth fields
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authError, setAuthError] = useState("");

  // Post fields
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postGrade, setPostGrade] = useState("General");
  const [postTeacher, setPostTeacher] = useState("");

  // Teacher fields
  const [tName, setTName] = useState("");
  const [tGov, setTGov] = useState("بغداد");
  const [tSubject, setTSubject] = useState("");
  const [tGrades, setTGrades] = useState("");
  const [tImg, setTImg] = useState("");

  // Search & profile
  const [dirSearch, setDirSearch] = useState("");
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [editBio, setEditBio] = useState("");
  const [editColor, setEditColor] = useState("#0d9488");

  useEffect(() => {
    initStorage();
    setSession(getSession());
    if (!localStorage.getItem("gradesDone")) setGradeModal(true);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const profiles = getProfiles();
  const getProfile = (u: string): Profile => profiles[u] || { avatarColor: "#94a3b8", bio: "" };

  // ─── Auth ─────────────────────────────────────────────────────────
  function handleAuth() {
    setAuthError("");
    if (!authUser.trim() || !authPass.trim()) { setAuthError("املأ الحقول المطلوبة."); return; }
    const users = getUsers();
    if (isRegister) {
      if (authPass.length < 8 || !/[0-9]/.test(authPass) || !/[A-Z]/.test(authPass)) {
        setAuthError("كلمة المرور قصيرة أو لا تحتوي على رقم وحرف كبير."); return;
      }
      if (users.find(u => u.username === authUser.trim())) { setAuthError("اسم المستخدم موجود مسبقاً."); return; }
      const newUser: User = { username: authUser.trim(), pass: authPass, role: "student" };
      users.push(newUser);
      setUsers(users);
      const p = getProfiles();
      p[newUser.username] = { avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)], bio: "" };
      setProfiles(p);
      localStorage.setItem("currentUser", JSON.stringify(newUser));
      setSession(newUser);
    } else {
      const found = users.find(u => u.username === authUser.trim() && u.pass === authPass);
      if (!found) { setAuthError("خطأ في اسم المستخدم أو كلمة المرور."); return; }
      localStorage.setItem("currentUser", JSON.stringify(found));
      setSession(found);
    }
    setAuthModal(false); setAuthUser(""); setAuthPass(""); rerender();
  }

  function logout() {
    localStorage.removeItem("currentUser"); setSession(null);
    if (tab === "admin") setTab("feed"); rerender();
  }

  // ─── Voting (single vote per user per item, changeable) ────────────
  function castVote(itemKey: string, type: "like" | "dislike", updateFn: (delta: { likes: number; dislikes: number }) => void) {
    if (!session) { setAuthModal(true); return; }

    // Owner super-voting bypass
    if (session.role === "owner") {
      const val = prompt("أنت المالك. أدخل عدد الأصوات:", "1");
      const amount = parseInt(val || "1") || 1;
      updateFn({ likes: type === "like" ? amount : 0, dislikes: type === "dislike" ? amount : 0 });
      rerender(); return;
    }

    const votes = getVotes();
    const voteKey = `${session.username}_${itemKey}`;
    const existing = votes[voteKey];

    if (existing === type) return; // Already voted this way, do nothing

    let delta = { likes: 0, dislikes: 0 };
    if (existing) {
      // Changing vote: undo the old one
      if (existing === "like") delta.likes = -1; else delta.dislikes = -1;
    }
    // Apply the new one
    if (type === "like") delta.likes += 1; else delta.dislikes += 1;

    votes[voteKey] = type;
    setVotes(votes);
    updateFn(delta);
    rerender();
  }

  function getUserVote(itemKey: string): "like" | "dislike" | null {
    if (!session) return null;
    return getVotes()[`${session.username}_${itemKey}`] || null;
  }

  // ─── Post Handlers ────────────────────────────────────────────────
  function submitPost() {
    if (!session) return;
    if (!postTitle.trim() || !postBody.trim()) return;
    if (!postTeacher) { alert("يجب اختيار مدرس للمنشور."); return; }
    if (postTitle.length > 100 || postBody.length > 1500) return;
    if (containsProfanity(postTitle) || containsProfanity(postBody)) { alert("المحتوى يحتوي على كلمات غير مسموح بها."); return; }
    const posts = getPosts();
    posts.unshift({
      id: "p_" + Date.now(), author: session.username, teacherId: postTeacher,
      title: postTitle.trim(), body: postBody.trim(), grade_level: postGrade,
      likes: 0, dislikes: 0, reports: 0, status: "active",
      comments: [], created_at: new Date().toISOString(),
    });
    setPosts(posts);
    setPostTitle(""); setPostBody(""); setPostGrade("General"); setPostTeacher("");
    setPostModal(false); rerender();
  }

  function votePost(postId: string, type: "like" | "dislike") {
    castVote(`post_${postId}`, type, (delta) => {
      const posts = getPosts();
      const p = posts.find(x => x.id === postId);
      if (!p) return;
      p.likes += delta.likes; p.dislikes += delta.dislikes;
      setPosts(posts);
    });
  }

  function reportPost(postId: string) {
    if (!session) { setAuthModal(true); return; }
    const posts = getPosts();
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    p.reports = (p.reports || 0) + 1;
    if (p.reports >= 20) p.status = "hidden";
    setPosts(posts); rerender();
    alert("تم إرسال البلاغ.");
  }

  function addComment(postId: string) {
    if (!session) { setAuthModal(true); return; }
    const input = document.getElementById(`comment-${postId}`) as HTMLInputElement;
    if (!input || !input.value.trim()) return;
    if (containsProfanity(input.value)) { alert("التعليق يحتوي على كلمات غير مسموح بها."); return; }
    const posts = getPosts();
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    p.comments.push({ id: "c_" + Date.now(), author: session.username, text: input.value.trim(), created_at: new Date().toISOString(), likes: 0, dislikes: 0, reports: 0 });
    setPosts(posts); input.value = ""; rerender();
  }

  function voteComment(postId: string, commentId: string, type: "like" | "dislike") {
    castVote(`comment_${commentId}`, type, (delta) => {
      const posts = getPosts();
      const p = posts.find(x => x.id === postId);
      if (!p) return;
      const c = p.comments.find(x => x.id === commentId);
      if (!c) return;
      c.likes += delta.likes; c.dislikes += delta.dislikes;
      setPosts(posts);
    });
  }

  function reportComment(postId: string, commentId: string) {
    if (!session) { setAuthModal(true); return; }
    const posts = getPosts();
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    const c = p.comments.find(x => x.id === commentId);
    if (!c) return;
    c.reports = (c.reports || 0) + 1;
    setPosts(posts); rerender();
    alert("تم إرسال بلاغ التعليق.");
  }

  function deletePost(postId: string) {
    const posts = getPosts().filter(p => p.id !== postId);
    setPosts(posts); rerender();
  }

  // ─── Teacher Handlers ─────────────────────────────────────────────
  function submitTeacher() {
    if (!session) return;
    if (!tName.trim() || !tSubject.trim()) return;
    if (!tImg.trim()) { alert("يجب إضافة رابط صورة المدرس."); return; }
    const teachers = getTeachers();
    const normalized = normalizeTeacherName(tName.trim());
    const isDupe = teachers.some(t => t.normalizedName === normalized && t.subject === tSubject.trim() && t.gov === tGov);
    if (isDupe) { alert("هذا المدرس موجود مسبقاً في الدليل!"); return; }
    teachers.push({
      id: "t_" + Date.now(), createdBy: session.username,
      name: tName.trim(), normalizedName: normalized,
      gov: tGov, subject: tSubject.trim(), grades: tGrades, img: tImg.trim(),
      likes: 0, dislikes: 0, status: "active",
    });
    setTeachers(teachers);
    setTName(""); setTSubject(""); setTGrades(""); setTImg("");
    setTeacherModal(false); rerender();
    alert("تمت إضافة الأستاذ بنجاح!");
  }

  function voteTeacher(teacherId: string, type: "like" | "dislike") {
    castVote(`teacher_${teacherId}`, type, (delta) => {
      const teachers = getTeachers();
      const t = teachers.find(x => x.id === teacherId);
      if (!t) return;
      t.likes += delta.likes; t.dislikes += delta.dislikes;
      setTeachers(teachers);
    });
  }

  // ─── Admin ────────────────────────────────────────────────────────
  function approveTeacher(id: string) { const t = getTeachers(); const x = t.find(i => i.id === id); if (x) x.status = "active"; setTeachers(t); rerender(); }
  function restorePost(id: string) { const p = getPosts(); const x = p.find(i => i.id === id); if (x) { x.status = "active"; x.reports = 0; } setPosts(p); rerender(); }
  function hidePost(id: string) { const p = getPosts(); const x = p.find(i => i.id === id); if (x) x.status = "hidden"; setPosts(p); rerender(); }

  // ─── Profile ──────────────────────────────────────────────────────
  function saveProfile() {
    if (!session) return;
    const p = getProfiles();
    p[session.username] = { avatarColor: editColor, bio: editBio };
    setProfiles(p);
    setProfileModal(false); rerender();
  }

  function openProfileEditor() {
    if (!session) return;
    const p = getProfile(session.username);
    setEditBio(p.bio); setEditColor(p.avatarColor);
    setProfileModal(true);
  }

  // ─── Grade onboarding ─────────────────────────────────────────────
  function completeGrades() { localStorage.setItem("gradesDone", JSON.stringify(selectedGrades)); setGradeModal(false); }

  // ─── Data ──────────────────────────────────────────────────────────
  const posts = getPosts();
  const teachers = getTeachers();
  const activePosts = posts.filter(p => p.status === "active");
  const activeTeachers = teachers.filter(t => t.status === "active");
  const filteredTeachers = activeTeachers.filter(t =>
    t.name.includes(dirSearch) || t.subject.includes(dirSearch) || t.gov.includes(dirSearch)
  );
  const pendingTeachers = teachers.filter(t => t.status === "pending_custom");
  const reportedPosts = posts.filter(p => p.status === "hidden" || (p.reports && p.reports > 0));
  const canAdmin = session && (session.role === "owner" || session.role === "mod");

  // Helper: render avatar
  const Avatar = ({ username, size = "w-8 h-8 text-sm" }: { username: string; size?: string }) => {
    const p = getProfile(username);
    return (
      <div className={`${size} border-2 border-slate-900 flex items-center justify-center font-black text-white`} style={{ backgroundColor: p.avatarColor }}>
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

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-page-bg text-slate-900 selection:bg-teal-500 selection:text-white pb-16 md:pb-0">

      {/* ═══════ TOP NAV ═══════ */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-border-subtle shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setTab("feed")}>
            <div className="w-10 h-10 border-2 border-slate-900 bg-emerald-primary flex items-center justify-center text-white shadow-[2px_2px_0px_#115e59]">
              <IconBook size={20} />
            </div>
            <div>
              <h1 className="font-black text-base tracking-tight text-slate-900">منصة طلاب العراق</h1>
              <p className="text-[11px] text-slate-600 font-semibold">دليل ومناقشات المدرسين</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            <button onClick={() => setTab("feed")}
              className={`px-4 py-2 text-xs font-bold transition-all border-2 ${tab === "feed" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
              الرئيسية
            </button>
            <button onClick={() => setTab("directory")}
              className={`px-4 py-2 text-xs font-bold transition-all border-2 ${tab === "directory" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
              دليل المدرسين
            </button>
            {canAdmin && (
              <button onClick={() => setTab("admin")}
                className={`px-4 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1 ${tab === "admin" ? "border-slate-900 bg-red-600 text-white shadow-[2px_2px_0px_#7f1d1d]" : "border-red-600 bg-red-50 text-red-700"}`}>
                لوحة الإدارة <IconBolt size={12} />
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {!session ? (
              <>
                <button onClick={() => { setIsRegister(false); setAuthModal(true); setAuthError(""); }}
                  className="px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000]">دخول</button>
                <button onClick={() => { setIsRegister(true); setAuthModal(true); setAuthError(""); }}
                  className="px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#000]">حساب جديد</button>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-white border-2 border-slate-900 px-3 py-1 shadow-[2px_2px_0px_#000]">
                <button onClick={openProfileEditor} className="hover:opacity-70"><Avatar username={session.username} /></button>
                <div className="text-right">
                  <Link href={`/profile/${session.username}`} className="text-xs font-black hover:underline">{session.username}</Link>
                  <div className="text-[9px]"><RoleIcon role={session.role} /></div>
                </div>
                <button onClick={logout} className="text-red-600 mr-1"><IconX size={14} /></button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══════ MAIN ═══════ */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ──── TAB: FEED ──── */}
        {tab === "feed" && (
          <section className="space-y-6">
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <IconPen size={24} className="text-emerald-primary" />
                <div>
                  <h2 className="font-black text-base text-slate-900">ساحة النقاش العامة</h2>
                  <p className="text-xs text-slate-600">اطرح سؤالك أو شارك تجربتك مع بقية الطلاب</p>
                </div>
              </div>
              <button onClick={() => { if (!session) { setAuthModal(true); return; } setPostModal(true); }}
                className="w-full md:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2">
                <IconPlus size={14} /> أضف منشوراً جديداً
              </button>
            </div>

            {activePosts.length === 0 ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-6 text-center text-xs font-bold text-slate-500">لا توجد منشورات حالياً.</div>
            ) : (
              <div className="space-y-5">
                {activePosts.map(p => {
                  const teacher = teachers.find(t => t.id === p.teacherId);
                  const canEditPost = session?.username === p.author && isWithinEditWindow(p.created_at);
                  const postVote = getUserVote(`post_${p.id}`);
                  return (
                    <div key={p.id} className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                      {/* Post Header */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <Link href={`/profile/${p.author}`} className="flex items-center gap-2 hover:opacity-80">
                          <Avatar username={p.author} />
                          <span className="text-xs font-black text-slate-700">{p.author}</span>
                        </Link>
                        <div className="flex items-center gap-2">
                          {teacher && (
                            <span className="px-2.5 py-0.5 bg-emerald-100 border border-slate-900 text-[10px] font-black text-emerald-900 flex items-center gap-1">
                              <IconTag size={10} /> {teacher.name} ({teacher.subject})
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(p.created_at)}</span>
                        </div>
                      </div>

                      {/* Post Body */}
                      <div>
                        <h3 className="font-black text-sm text-slate-900">{p.title}</h3>
                        <p className="text-xs text-slate-700 mt-1 leading-relaxed">{p.body}</p>
                      </div>

                      {/* Post Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <button onClick={() => votePost(p.id, "like")} className={vbtn(postVote === "like", "like")}>
                            <IconThumbUp size={13} /> {p.likes}
                          </button>
                          <button onClick={() => votePost(p.id, "dislike")} className={vbtn(postVote === "dislike", "dislike")}>
                            <IconThumbDown size={13} /> {p.dislikes}
                          </button>
                          <button onClick={() => reportPost(p.id)} className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1">
                            <IconFlag size={12} /> بلاغ ({p.reports || 0}/20)
                          </button>
                        </div>
                        {canEditPost && (
                          <button onClick={() => deletePost(p.id)} className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1">
                            <IconTrash size={12} /> حذف
                          </button>
                        )}
                      </div>

                      {/* Comments Section */}
                      <div className="bg-slate-50 p-3 border border-slate-200 space-y-2 text-xs">
                        <div className="font-bold text-[11px] text-slate-500 flex items-center gap-1"><IconComment size={12} /> التعليقات ({p.comments.length}):</div>
                        {p.comments.map(c => {
                          const commentVote = getUserVote(`comment_${c.id}`);
                          return (
                            <div key={c.id} className="bg-white p-2 border border-slate-200 space-y-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <Link href={`/profile/${c.author}`} className="font-bold text-teal-800 hover:underline">{c.author}: </Link>
                                  <span>{c.text}</span>
                                </div>
                                <span className="text-[9px] text-slate-400 font-bold shrink-0 mr-2">{getRelativeTime(c.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button onClick={() => voteComment(p.id, c.id, "like")} className={`${vbtn(commentVote === "like", "like")} py-0.5 px-1.5 text-[10px]`}>
                                  <IconThumbUp size={10} /> {c.likes}
                                </button>
                                <button onClick={() => voteComment(p.id, c.id, "dislike")} className={`${vbtn(commentVote === "dislike", "dislike")} py-0.5 px-1.5 text-[10px]`}>
                                  <IconThumbDown size={10} /> {c.dislikes}
                                </button>
                                <button onClick={() => reportComment(p.id, c.id)} className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5">
                                  <IconFlag size={9} /> ({c.reports || 0})
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex gap-2 pt-1">
                          <input type="text" id={`comment-${p.id}`} placeholder="اكتب تعليقاً..." className="flex-1 p-1.5 bg-white border border-slate-900 text-xs focus:outline-none" />
                          <button onClick={() => addComment(p.id)} className="px-3 bg-slate-900 text-white font-bold text-xs active:bg-slate-700">إرسال</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ──── TAB: DIRECTORY ──── */}
        {tab === "directory" && (
          <section className="space-y-6">
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="w-full md:w-1/2 relative">
                <IconSearch size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={dirSearch} onChange={e => setDirSearch(e.target.value)}
                  placeholder="ابحث باسم الأستاذ، المادة، أو المحافظة..." className="w-full pr-9 pl-4 py-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none focus:bg-white" />
              </div>
              <button onClick={() => { if (!session) { setAuthModal(true); return; } setTeacherModal(true); }}
                className="w-full md:w-auto px-5 py-2.5 bg-emerald-primary hover:bg-emerald-dark text-white font-black text-xs border-2 border-slate-900 shadow-[3px_3px_0px_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2">
                <IconPlus size={14} /> إضافة أستاذ جديد للدليل
              </button>
            </div>

            {filteredTeachers.length === 0 ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-6 text-center text-xs font-bold">لا توجد نتائج.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTeachers.map(t => {
                  const tVote = getUserVote(`teacher_${t.id}`);
                  return (
                    <div key={t.id} className="bg-white border-[1.5px] border-border-subtle shadow-[2px_2px_0px_#d1dcd6] p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={t.img} alt={t.name} className="w-12 h-12 border border-slate-900 object-cover" onError={(e) => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).style.display = "none"; }} />
                        <div>
                          <h3 className="font-black text-sm">{t.name}</h3>
                          <p className="text-[11px] text-emerald-800 font-bold">{t.subject} • {t.gov}</p>
                          {t.grades && <p className="text-[10px] text-slate-500 font-bold">{t.grades}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => voteTeacher(t.id, "like")} className={vbtn(tVote === "like", "like")}>
                          <IconThumbUp size={12} /> {t.likes}
                        </button>
                        <button onClick={() => voteTeacher(t.id, "dislike")} className={vbtn(tVote === "dislike", "dislike")}>
                          <IconThumbDown size={12} /> {t.dislikes}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ──── TAB: ADMIN ──── */}
        {tab === "admin" && canAdmin && (
          <section className="space-y-6">
            <div className="bg-red-50 border-2 border-red-600 shadow-[4px_4px_0px_#dc2626] p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconShield size={20} className="text-red-700" />
                <div>
                  <h2 className="font-black text-base text-red-800">لوحة التحكم والإشراف</h2>
                  <p className="text-xs text-red-600 mt-0.5">إدارة المحتوى المبلغ عنه</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-red-600 text-white font-black text-[10px] border border-slate-900">صلاحيات المالك</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                  <h3 className="font-black text-sm flex items-center gap-1"><IconInbox size={14} /> طلبات الأساتذة المعلقة</h3>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold text-xs border border-slate-900">{pendingTeachers.length}</span>
                </div>
                {pendingTeachers.length === 0 ? <div className="text-xs text-slate-400">لا توجد طلبات.</div> : pendingTeachers.map(t => (
                  <div key={t.id} className="bg-white p-2 border border-slate-900 text-xs flex justify-between items-center">
                    <span>{t.name} ({t.subject})</span>
                    <button onClick={() => approveTeacher(t.id)} className="px-2 py-1 bg-emerald-600 text-white font-bold">قبول</button>
                  </div>
                ))}
              </div>

              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                  <h3 className="font-black text-sm flex items-center gap-1"><IconFlag size={14} /> المحتوى المبلغ عنه</h3>
                  <span className="px-2 py-0.5 bg-red-200 text-red-900 font-bold text-xs border border-slate-900">{reportedPosts.length}</span>
                </div>
                {reportedPosts.length === 0 ? <div className="text-xs text-slate-400">لا يوجد محتوى مبلغ عنه.</div> : reportedPosts.map(p => (
                  <div key={p.id} className="bg-white p-2 border border-slate-900 text-xs flex justify-between items-center gap-2">
                    <div><span className="font-bold">{p.title}</span><span className="text-slate-400 mr-2">({p.reports} — {p.status === "hidden" ? "مخفي" : "مرئي"})</span></div>
                    <div className="flex gap-1">
                      {p.status === "hidden" ? <button onClick={() => restorePost(p.id)} className="px-2 py-1 bg-blue-600 text-white font-bold">إعادة</button> : <button onClick={() => hidePost(p.id)} className="px-2 py-1 bg-red-600 text-white font-bold">إخفاء</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ═══════ MOBILE BOTTOM NAV ═══════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-border-subtle z-50 flex justify-around py-2.5">
        <button onClick={() => setTab("feed")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-3 ${tab === "feed" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconPen size={20} />مناقشات
        </button>
        <button onClick={() => setTab("directory")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-3 ${tab === "directory" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconBook size={20} />الدليل
        </button>
        {canAdmin && (
          <button onClick={() => setTab("admin")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-3 ${tab === "admin" ? "text-red-600" : "text-slate-400"}`}>
            <IconShield size={20} />الإدارة
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
            {authError && <div className="p-2.5 bg-red-100 border border-red-400 text-red-700 text-xs font-bold">{authError}</div>}
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
              <button onClick={handleAuth} className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">{isRegister ? "حساب جديد" : "دخول"}</button>
            </div>
            <div className="text-center pt-1">
              <button onClick={() => setIsRegister(!isRegister)} className="text-xs text-emerald-700 font-bold underline">{isRegister ? "لديك حساب؟ سجل دخولك" : "ليس لديك حساب؟ سجل الآن"}</button>
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
                <label className="block font-bold mb-1">اختر المدرس <span className="text-red-500">*</span></label>
                <select value={postTeacher} onChange={e => setPostTeacher(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none">
                  <option value="">-- اختر مدرس --</option>
                  {activeTeachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subject} - {t.gov})</option>)}
                </select>
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
              <button onClick={submitPost} disabled={!postTitle.trim() || !postBody.trim() || !postTeacher}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                نشر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ADD TEACHER MODAL ═══════ */}
      {teacherModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <h3 className="font-black text-base">إضافة أستاذ جديد</h3>
              <button onClick={() => setTeacherModal(false)}><IconX size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">اسم الأستاذ الكامل</label>
                <input type="text" value={tName} onChange={e => setTName(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder="أستاذ حيدر وليد" />
              </div>
              <div>
                <label className="block font-bold mb-1">المحافظة</label>
                <select value={tGov} onChange={e => setTGov(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none">
                  <option value="بغداد">بغداد</option><option value="كركوك">كركوك</option><option value="أربيل">أربيل</option>
                  <option value="البصرة">البصرة</option><option value="الموصل">الموصل</option><option value="النجف">النجف</option><option value="كربلاء">كربلاء</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">المادة الدراسية</label>
                <input type="text" value={tSubject} onChange={e => setTSubject(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder="رياضيات" />
              </div>
              <div>
                <label className="block font-bold mb-1">المراحل</label>
                <input type="text" value={tGrades} onChange={e => setTGrades(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder="السادس الاعدادي" />
              </div>
              <div>
                <label className="block font-bold mb-1">رابط صورة المدرس <span className="text-red-500">*</span></label>
                <input type="text" value={tImg} onChange={e => setTImg(e.target.value)} className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold focus:outline-none" placeholder="https://..." />
                {tImg && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={tImg} alt="معاينة" className="w-12 h-12 border border-slate-900 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="text-[10px] text-slate-500">معاينة الصورة</span>
                  </div>
                )}
              </div>
              <button onClick={submitTeacher} disabled={!tName.trim() || !tSubject.trim() || !tImg.trim()}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                إرسال للدليل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ PROFILE EDIT MODAL ═══════ */}
      {profileModal && session && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <h3 className="font-black text-base flex items-center gap-1"><IconCamera size={16} /> تعديل الملف الشخصي</h3>
              <button onClick={() => setProfileModal(false)}><IconX size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-2">لون الأفاتار</label>
                <div className="flex gap-2 flex-wrap">
                  {AVATAR_COLORS.map(c => (
                    <button key={c} onClick={() => setEditColor(c)}
                      className={`w-10 h-10 border-2 flex items-center justify-center font-black text-white text-sm ${editColor === c ? "border-slate-900 shadow-[2px_2px_0px_#000]" : "border-slate-300"}`}
                      style={{ backgroundColor: c }}>
                      {editColor === c ? "✓" : session.username.substring(0, 1).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-bold mb-1">النبذة التعريفية</label>
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} maxLength={200}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-900 font-semibold min-h-[60px] resize-none focus:outline-none" placeholder="اكتب شيئاً عنك..." />
              </div>
              <button onClick={saveProfile}
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ GRADE ONBOARDING MODAL ═══════ */}
      {gradeModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-border-subtle shadow-[6px_6px_0px_#000] w-full max-w-md p-6 space-y-4">
            <div className="text-center mb-2">
              <h3 className="font-black text-xl text-slate-900">أي الصفوف تهمك؟</h3>
              <p className="text-xs text-slate-600 font-semibold mt-1">اختر بالضبط ٢ من المراحل الدراسية</p>
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
    </div>
  );
}
