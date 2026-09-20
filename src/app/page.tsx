"use client";

import { useState, useEffect, useCallback } from "react";
import { normalizeTeacherName } from "@/utils/normalization";
import { containsProfanity } from "@/utils/moderation";
import { getRelativeTime, isWithinEditWindow } from "@/utils/time";
import {
  IconBook, IconPen, IconUser, IconThumbUp, IconThumbDown, IconFlag,
  IconShield, IconCrown, IconGrad, IconTag, IconInbox, IconBolt,
  IconTrash, IconX, IconPlus, IconCamera, IconComment, IconSearch,
  IconArrowRight, IconHome, IconBell, IconHistory,
} from "@/utils/icons";
import Link from "next/link";
import Turnstile from "@/components/Turnstile";
import { supabase } from "@/utils/supabase";

// ─── Types ─────────────────────────────────────────────────────────
interface User { username: string; pass: string; role: "student" | "mod" | "owner" }
interface Profile {
  avatarColor: string;
  avatarUrl?: string; // Custom uploaded PFP image (DataURL or URL)
  bio: string;
}
interface Comment {
  id: string; author: string; text: string; created_at: string;
  likes: number; dislikes: number; reports: number;
}
interface Post {
  id: string; author: string; teacherId?: string; teacher_id?: string;
  title: string; body: string; grade_level: string;
  likes: number; dislikes: number; reports: number;
  status: "active" | "hidden"; comments: Comment[];
  created_at: string;
}
interface Teacher {
  id: string; createdBy?: string; created_by?: string; name: string;
  normalizedName?: string; normalized_name?: string;
  gov: string; subject: string; grades: string; img: string;
  likes: number; dislikes: number; status: "active" | "pending" | "pending_custom";
}
interface NotificationItem {
  id: string;
  recipient: string; // username of recipient
  actor: string; // who triggered notification
  type: "comment" | "reply" | "like" | "teacher_approved" | "teacher_rejected";
  postId: string;
  targetTitle: string;
  commentText?: string;
  read: boolean;
  created_at: string;
}

// Vote map: "username_itemId" -> "like" | "dislike"
type VoteMap = Record<string, "like" | "dislike">;

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
}

function getUsers(): User[] { return JSON.parse(localStorage.getItem("users") || "[]"); }
function getProfiles(): Record<string, Profile> { return JSON.parse(localStorage.getItem("profiles") || "{}"); }
function getTeachers(): Teacher[] { return JSON.parse(localStorage.getItem("teachers") || "[]"); }
function getPosts(): Post[] { return JSON.parse(localStorage.getItem("posts") || "[]"); }
function getVotes(): VoteMap { return JSON.parse(localStorage.getItem("votes") || "{}"); }
function getNotifications(): NotificationItem[] { return JSON.parse(localStorage.getItem("notifications") || "[]"); }
function setUsers(u: User[]) { localStorage.setItem("users", JSON.stringify(u)); }
function setProfiles(p: Record<string, Profile>) { localStorage.setItem("profiles", JSON.stringify(p)); }
function setTeachers(t: Teacher[]) { localStorage.setItem("teachers", JSON.stringify(t)); }
function setPosts(p: Post[]) { localStorage.setItem("posts", JSON.stringify(p)); }
function setVotes(v: VoteMap) { localStorage.setItem("votes", JSON.stringify(v)); }
function setNotifications(n: NotificationItem[]) { localStorage.setItem("notifications", JSON.stringify(n)); }
function getSession(): User | null { const s = localStorage.getItem("currentUser"); return s ? JSON.parse(s) : null; }

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

  // Teacher fields (Add teacher form)
  const [tName, setTName] = useState("");
  const [tGov, setTGov] = useState("بغداد");
  const [tSubjectChoice, setTSubjectChoice] = useState("رياضيات");
  const [tCustomSubject, setTCustomSubject] = useState("");
  const [tSelectedGrades, setTSelectedGrades] = useState<string[]>([]);
  const [tImg, setTImg] = useState("");

  // Search & Filters for Teachers section
  const [dirSearch, setDirSearch] = useState("");
  const [filterGov, setFilterGov] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");

  // Selected Teacher Dedicated View & Review states
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewVerdict, setReviewVerdict] = useState<"like" | "dislike" | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");

  // Profile Viewing state (view self or another student)
  const [viewedUser, setViewedUser] = useState<string | null>(null);


  // Profile Edit
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [editBio, setEditBio] = useState("");
  const [editColor, setEditColor] = useState("#0d9488");
  const [editPfpUrl, setEditPfpUrl] = useState("");


  // Turnstile & Lockout State
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // ─── Fetch from Supabase (Central Shared Database) ─────────────────
  const fetchSupabaseData = useCallback(async () => {
    try {
      const [pRes, tRes, prRes] = await Promise.all([
        supabase.from('posts').select('*, comments(*)').order('created_at', { ascending: false }),
        supabase.from('teachers').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ]);

      if (pRes.data) {
        const formattedPosts: Post[] = pRes.data.map((p: any) => ({
          id: p.id,
          author: p.author,
          teacherId: p.teacher_id,
          teacher_id: p.teacher_id,
          title: p.title,
          body: p.body,
          grade_level: p.grade_level || "General",
          likes: p.likes || 0,
          dislikes: p.dislikes || 0,
          reports: p.reports || 0,
          status: p.status || "active",
          comments: (p.comments || []).map((c: any) => ({
            id: c.id,
            author: c.author,
            text: c.text,
            created_at: c.created_at,
            likes: c.likes || 0,
            dislikes: c.dislikes || 0,
            reports: c.reports || 0,
          })).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
          created_at: p.created_at,
        }));
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
    setProfilesMap(getProfiles());
    setAllNotifications(getNotifications());

    // Fetch live data immediately
    fetchSupabaseData();
    if (currUser) fetchVotesFromSupabase(currUser.username);

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
    if (!session || !postTitle.trim() || !postBody.trim() || !postTeacher) return;
    if (postTitle.length > 100 || postBody.length > 1500) return;
    if (containsProfanity(postTitle) || containsProfanity(postBody)) { alert("المحتوى يحتوي على كلمات غير مسموح بها."); return; }

    const newPostPayload = {
      author: session.username,
      teacher_id: postTeacher,
      title: postTitle.trim(),
      body: postBody.trim(),
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
      teacherId: postTeacher,
      teacher_id: postTeacher,
      title: postTitle.trim(),
      body: postBody.trim(),
      grade_level: postGrade,
      likes: 0,
      dislikes: 0,
      reports: 0,
      status: "active",
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
    setPostModal(false); rerender();
  }

  function votePost(postId: string, type: "like" | "dislike") {
    castVote(`post_${postId}`, type, (delta) => {
      setPostsList(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + delta.likes, dislikes: p.dislikes + delta.dislikes } : p));
    });
  }

  async function reportPost(postId: string) {
    if (!session) { setAuthModal(true); return; }
    const p = posts.find(x => x.id === postId);
    if (!p) return;
    const newReports = (p.reports || 0) + 1;
    const newStatus = newReports >= 20 ? "hidden" : p.status;

    setPostsList(prev => prev.map(item => item.id === postId ? { ...item, reports: newReports, status: newStatus as any } : item));

    try {
      await supabase.from('posts').update({ reports: newReports, status: newStatus }).eq('id', postId);
    } catch (e) {}

    rerender();
    alert("تم إرسال البلاغ.");
  }

  async function addComment(postId: string) {
    if (!session) { setAuthModal(true); return; }
    const input = document.getElementById(`comment-${postId}`) as HTMLInputElement;
    if (!input || !input.value.trim()) return;
    if (containsProfanity(input.value)) { alert("التعليق يحتوي على كلمات غير مسموح بها."); return; }

    const commentText = input.value.trim();

    // Optimistic UI update
    const tempComment: Comment = {
      id: "temp_c_" + Date.now(),
      author: session.username,
      text: commentText,
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

    input.value = "";

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

  async function reportComment(postId: string, commentId: string) {
    if (!session) { setAuthModal(true); return; }
    setPostsList(prev => prev.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          comments: p.comments.map(c => c.id === commentId ? { ...c, reports: (c.reports || 0) + 1 } : c),
        };
      }
      return p;
    }));
    try {
      const targetPost = posts.find(p => p.id === postId);
      const targetComment = targetPost?.comments.find(c => c.id === commentId);
      if (targetComment) {
        await supabase.from('comments').update({ reports: (targetComment.reports || 0) + 1 }).eq('id', commentId);
      }
    } catch (e) {}
    rerender();
    alert("تم إرسال بلاغ التعليق.");
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
    const finalSubject = tSubjectChoice === "أخرى" ? tCustomSubject.trim() : tSubjectChoice.trim();
    if (!tName.trim()) { alert("يرجى كتابة اسم المدرس."); return; }
    if (!finalSubject) { alert("يرجى اختيار أو كتابة المادة الدراسية."); return; }
    if (tSelectedGrades.length === 0) { alert("يرجى اختيار مرحلة دراسية واحدة على الأقل."); return; }
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
    setTImg("");
    setTeacherModal(false);
    rerender();
    alert("تم إرسال الأستاذ بنجاح وهو الآن في قائمة الانتظار للمراجعة من قبل المشرفين! ⏳");
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
    if (!reviewVerdict) {
      alert("يرجى تحديد هل المدرس أعجبك 👍 أو لم يعجبك 👎 للمتابعة.");
      return;
    }
    if (!reviewBody.trim()) { alert("يرجى كتابة نص التقييم أو المراجعة."); return; }
    if (containsProfanity(reviewTitle) || containsProfanity(reviewBody)) {
      alert("المحتوى يحتوي على كلمات غير مسموح بها.");
      return;
    }

    const titleText = reviewTitle.trim() || `تقييم للأستاذ ${selectedTeacher.name}`;
    const verdictText = reviewVerdict === "like" ? "[أعجبني 👍]" : "[لم يعجبني 👎]";
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
        commentText: `🎉 تمت الموافقة على طلبك لإضافة المدرس "${target?.name}" بنجاح! أصبح الآن متاحاً للجميع في قسم المدرسين.`,
        read: false,
        created_at: new Date().toISOString(),
      });
      setNotifications(notifs);
      setAllNotifications(notifs);
    }
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
    rerender();
  }


  async function restorePost(id: string) {
    setPostsList(prev => prev.map(p => p.id === id ? { ...p, status: "active", reports: 0 } : p));
    try {
      await supabase.from('posts').update({ status: 'active', reports: 0 }).eq('id', id);
      fetchSupabaseData();
    } catch (e) {}
    rerender();
  }

  async function hidePost(id: string) {
    setPostsList(prev => prev.map(p => p.id === id ? { ...p, status: "hidden" } : p));
    try {
      await supabase.from('posts').update({ status: 'hidden' }).eq('id', id);
      fetchSupabaseData();
    } catch (e) {}
    rerender();
  }

  // ─── Profile Handlers ─────────────────────────────────────────────
  function saveProfile() {
    if (!session) return;
    const p = getProfiles();
    p[session.username] = { avatarColor: editColor, bio: editBio, avatarUrl: editPfpUrl };
    setProfiles(p);
    setProfilesMap(p);
    setProfileModal(false); rerender();
  }

  function openProfileEditor() {
    if (!session) return;
    const p = getProfile(session.username);
    setEditBio(p.bio);
    setEditColor(p.avatarColor);
    setEditPfpUrl(p.avatarUrl || "");
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
    return matchesSearch && matchesGov && matchesSubject;
  });
  const pendingTeachers = teachers.filter(t => t.status === "pending" || t.status === "pending_custom");
  const reportedPosts = posts.filter(p => p.status === "hidden" || (p.reports && p.reports > 0));
  const canAdmin = session && (session.role === "owner" || session.role === "mod");

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
  const userComments: { postTitle: string; comment: Comment }[] = [];
  if (targetProfileUser) {
    posts.forEach(p => {
      p.comments.forEach(c => {
        if (c.author === targetProfileUser) {
          userComments.push({ postTitle: p.title, comment: c });
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
      grade_level: p.grade_level,
      teacherId: p.teacher_id || p.teacherId,
      title: p.title,
      content: p.body,
      created_at: p.created_at,
      likes: p.likes,
      dislikes: p.dislikes,
    })),
    ...userTeacherReviews.map(r => ({
      id: r.id,
      kind: "review" as const,
      grade_level: r.grade_level,
      teacherId: r.teacher_id || r.teacherId,
      title: r.title,
      content: r.body,
      created_at: r.created_at,
      likes: r.likes,
      dislikes: r.dislikes,
    })),
    ...userComments.map(c => ({
      id: c.comment.id,
      kind: "comment" as const,
      grade_level: undefined,
      teacherId: undefined,
      title: `رد على: "${c.postTitle}"`,
      content: c.comment.text,
      created_at: c.comment.created_at,
      likes: c.comment.likes,
      dislikes: c.comment.dislikes,
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
  return (
    <div className="min-h-screen bg-page-bg text-slate-900 selection:bg-teal-500 selection:text-white pb-20 md:pb-0">

      {/* ═══════ TOP NAV (DESKTOP) ═══════ */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-border-subtle shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setTab("feed")}>
            <div className="w-10 h-10 border-2 border-slate-900 bg-emerald-primary flex items-center justify-center text-white shadow-[2px_2px_0px_#115e59]">
              <IconBook size={20} />
            </div>
            <div>
              <h1 className="font-black text-base tracking-tight text-slate-900">منصة طلاب العراق</h1>
              <p className="text-[11px] text-slate-600 font-semibold">مراجعات وتقييمات المدرسين</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <button onClick={() => setTab("feed")}
              className={`px-4 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 ${tab === "feed" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
              <IconHome size={14} /> الرئيسية
            </button>
            <button onClick={() => setTab("directory")}
              className={`px-4 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 ${tab === "directory" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
              <IconBook size={14} /> المدرسين
            </button>
            {session && (
              <button onClick={() => setTab("notifications")}
                className={`px-4 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 relative ${tab === "notifications" ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
                <IconBell size={14} /> الإشعارات
                {unreadCount > 0 && (
                  <span className="bg-red-600 text-white font-black text-[9px] px-1.5 py-0.2 rounded-full border border-slate-900">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            {session && (
              <button onClick={() => { setViewedUser(session.username); setTab("profile"); }}
                className={`px-4 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1.5 ${tab === "profile" && targetProfileUser === session.username ? "border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#115e59]" : "border-transparent hover:border-slate-900 text-slate-700"}`}>
                <IconUser size={14} /> حسابي
              </button>
            )}
            {canAdmin && (
              <button onClick={() => setTab("admin")}
                className={`px-4 py-2 text-xs font-bold transition-all border-2 flex items-center gap-1 ${tab === "admin" ? "border-slate-900 bg-red-600 text-white shadow-[2px_2px_0px_#7f1d1d]" : "border-red-600 bg-red-50 text-red-700"}`}>
                لوحة الإدارة <IconBolt size={12} />
              </button>
            )}
          </nav>

          {/* User Auth Profile Widget */}
          <div className="flex items-center gap-2">
            {!session ? (
              <>
                <button onClick={() => { setIsRegister(false); setAuthModal(true); setAuthError(""); setTurnstileToken(null); }}
                  className="px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000]">دخول</button>
                <button onClick={() => { setIsRegister(true); setAuthModal(true); setAuthError(""); setTurnstileToken(null); }}
                  className="px-3 py-1.5 text-xs font-bold border-2 border-slate-900 bg-emerald-primary text-white shadow-[2px_2px_0px_#000]">حساب جديد</button>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-white border-2 border-slate-900 px-3 py-1 shadow-[2px_2px_0px_#000]">
                <button onClick={() => { setViewedUser(session.username); setTab("profile"); }} className="hover:opacity-70"><Avatar username={session.username} /></button>
                <div className="text-right">
                  <button onClick={() => { setViewedUser(session.username); setTab("profile"); }} className="text-xs font-black hover:underline block">{session.username}</button>
                  <div className="text-[9px]"><RoleIcon role={session.role} /></div>
                </div>
                <button onClick={logout} title="تسجيل الخروج" className="text-red-600 mr-1 p-1 hover:bg-red-50 rounded"><IconX size={14} /></button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ═══════ MAIN CONTENT AREA ═══════ */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ──── TAB 1: FEED (الرئيسية) ──── */}
        {tab === "feed" && (
          <section className="space-y-6">
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

            {activePosts.length === 0 ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center text-xs font-bold text-slate-500">
                لا توجد منشورات حالياً. كن أول من يطرح نقاشاً!
              </div>
            ) : (
              <div className="space-y-5">
                {activePosts.map(p => {
                  const teacher = teachers.find(t => t.id === p.teacherId || t.id === p.teacher_id);
                  const canDeletePost = session && (session.username === p.author || session.role === "owner" || session.role === "mod");
                  const postVote = getUserVote(`post_${p.id}`);
                  return (
                    <div key={p.id} className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                      {/* Post Header */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <button onClick={() => { setViewedUser(p.author); setTab("profile"); }} className="flex items-center gap-2 hover:opacity-80">
                          <Avatar username={p.author} />
                          <span className="text-xs font-black text-slate-700">{p.author}</span>
                        </button>
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
                        {canDeletePost && (
                          <button onClick={() => deletePost(p.id)} className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1">
                            <IconTrash size={12} /> {session?.username === p.author ? "حذف" : "حذف (إدارة)"}
                          </button>
                        )}
                      </div>

                      {/* Comments Section */}
                      <div className="bg-slate-50 p-3 border border-slate-200 space-y-2 text-xs">
                        <div className="font-bold text-[11px] text-slate-500 flex items-center gap-1"><IconComment size={12} /> التعليقات ({p.comments?.length || 0}):</div>
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
            <div className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 flex flex-col md:flex-row items-center gap-3">
              {/* Search text */}
              <div className="w-full md:flex-1 relative">
                <IconSearch size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={dirSearch}
                  onChange={e => setDirSearch(e.target.value)}
                  placeholder="ابحث باسم المدرس، المادة، أو المحافظة..."
                  className="w-full pr-9 pl-4 py-2.5 bg-slate-50 border-2 border-slate-900 text-xs font-semibold focus:outline-none focus:bg-white"
                />
              </div>

              {/* Filter by Governorate */}
              <div className="w-full md:w-48">
                <select
                  value={filterGov}
                  onChange={e => setFilterGov(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="all">كل المحافظات</option>
                  {GOVERNORATES.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Filter by Subject */}
              <div className="w-full md:w-44">
                <select
                  value={filterSubject}
                  onChange={e => setFilterSubject(e.target.value)}
                  className="w-full py-2.5 px-3 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="all">كل المواد</option>
                  {SUBJECT_OPTIONS.filter(s => s !== "أخرى").map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Clear filters */}
              {(dirSearch || filterGov !== "all" || filterSubject !== "all") && (
                <button
                  onClick={() => { setDirSearch(""); setFilterGov("all"); setFilterSubject("all"); }}
                  className="w-full md:w-auto px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border-2 border-slate-900 shrink-0"
                >
                  إعادة ضبط
                </button>
              )}
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
                          <div className="space-y-1">
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
                            </div>
                            {t.grades && <p className="text-[11px] text-slate-600 font-semibold">{t.grades}</p>}
                          </div>
                        </div>

                        {/* Votes and Admin Controls */}
                        <div className="flex flex-col items-end gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1.5">
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
                        </div>
                        {selectedTeacher.grades && (
                          <p className="text-xs text-slate-600 font-bold">
                            المراحل الدراسية: <span className="text-slate-900 font-semibold">{selectedTeacher.grades}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Teacher Rating: Like or Dislike buttons with live counts */}
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
                            <IconThumbUp size={16} /> أعجبني 👍 (أنصح به)
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
                            <IconThumbDown size={16} /> لم يعجبني 👎 (لا أنصح به)
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
                                      <span className="px-2 py-0.5 bg-red-100 border border-red-500 text-[10px] font-black text-red-900">
                                        تقييم: لم يعجبني 👎
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-600 text-[10px] font-black text-emerald-900">
                                        تقييم: أعجبني 👍
                                      </span>
                                    )
                                  ) : (
                                    <span className="px-2 py-0.5 bg-blue-100 border border-blue-600 text-[10px] font-black text-blue-900">
                                      منشور نقاش 💬
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

                              {/* Actions: Likes, Dislikes, Reports, Delete */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => votePost(postItem.id, "like")} className={vbtn(postVote === "like", "like")}>
                                    <IconThumbUp size={12} /> {postItem.likes}
                                  </button>
                                  <button onClick={() => votePost(postItem.id, "dislike")} className={vbtn(postVote === "dislike", "dislike")}>
                                    <IconThumbDown size={12} /> {postItem.dislikes}
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
            <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconBell size={24} className="text-emerald-primary" />
                <div>
                  <h2 className="font-black text-base text-slate-900">صندوق الإشعارات</h2>
                  <p className="text-xs text-slate-600">التفاعلات والردود والتعليقات على منشوراتك</p>
                </div>
              </div>
              {myNotifications.length > 0 && (
                <button onClick={markAllNotifsRead} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-900">
                  تحديد الكل كمقروء ✓
                </button>
              )}
            </div>

            {myNotifications.length === 0 ? (
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-8 text-center text-xs font-bold text-slate-500">
                لا توجد إشعارات جديدة حالياً.
              </div>
            ) : (
              <div className="space-y-3">
                {myNotifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      const updated = allNotifications.map(item => item.id === n.id ? { ...item, read: true } : item);
                      setNotifications(updated);
                      setAllNotifications(updated);
                      if (n.type === "teacher_approved") {
                        setTab("directory");
                      } else {
                        setTab("feed");
                      }
                    }}
                    className={`p-4 border-2 transition-all cursor-pointer shadow-[2px_2px_0px_#d1dcd6] ${n.read ? "bg-white border-border-subtle" : "bg-emerald-50 border-emerald-600"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {n.type === "teacher_approved" ? (
                          <div className="w-7 h-7 bg-emerald-600 border border-slate-900 flex items-center justify-center text-white text-xs shrink-0">
                            🎉
                          </div>
                        ) : (
                          <Avatar username={n.actor} size="w-7 h-7 text-xs" />
                        )}
                        <span className="font-black text-xs text-slate-800">{n.actor}</span>
                        <span className="text-xs text-slate-600">
                          {n.type === "teacher_approved" ? "وافق على طلب إضافة المدرس:" : "علّق على منشورك:"}
                        </span>
                        <span className="text-xs font-bold text-emerald-800">"{n.targetTitle}"</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{getRelativeTime(n.created_at)}</span>
                    </div>
                    {n.commentText && (
                      <p className="text-xs font-medium text-slate-700 mt-2 pr-9 bg-white/70 p-2 border border-slate-200">
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
                      <IconUser size={18} /> {isOwnProfile ? "ملفي الشخصي" : `الملف الشخصي للطالب: ${targetProfileUser}`}
                    </h2>
                    {isOwnProfile ? (
                      <button
                        onClick={logout}
                        className="px-4 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs border-2 border-red-600 shadow-[2px_2px_0px_#dc2626] flex items-center gap-1.5 transition-all"
                      >
                        <IconX size={14} /> تسجيل الخروج
                      </button>
                    ) : session ? (
                      <button
                        onClick={() => setViewedUser(session.username)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border-2 border-slate-900 flex items-center gap-1"
                      >
                        ← العودة إلى ملفي الشخصي
                      </button>
                    ) : null}
                  </div>

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
                          <IconCamera size={14} /> تعديل الحساب والصورة
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

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-t-2 border-slate-100 pt-4 text-center">
                    <div className="bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-lg font-black text-slate-900">{userRegularPosts.length}</div>
                      <div className="text-[10px] font-bold text-slate-500">المنشورات</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 p-2.5">
                      <div className="text-lg font-black text-amber-900">{userTeacherReviews.length} 📝</div>
                      <div className="text-[10px] font-bold text-amber-700">تقييمات المدرسين</div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-2.5">
                      <div className="text-lg font-black text-slate-900">{userComments.length}</div>
                      <div className="text-[10px] font-bold text-slate-500">التعليقات</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5">
                      <div className="text-lg font-black text-emerald-800">{totalLikesReceived} 👍</div>
                      <div className="text-[10px] font-bold text-emerald-700">إعجابات مستلمة</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 p-2.5">
                      <div className="text-lg font-black text-red-700">{totalDislikesReceived} 👎</div>
                      <div className="text-[10px] font-bold text-red-600">عدم إعجاب</div>
                    </div>
                  </div>
                </div>

                {/* Mixed Activity Feed (Posts, Teacher Reviews, Comments) */}
                <div className="space-y-4">
                  <h3 className="font-black text-sm text-slate-800 border-b-2 border-slate-200 pb-2">
                    {isOwnProfile ? "📋 سجل نشاطاتي ومشاركاتي:" : `📋 نشاطات ومشاركات الطالب (${targetProfileUser}):`}
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
                      return (
                        <div key={item.id} className="bg-white border-2 border-border-subtle shadow-[3px_3px_0px_#d1dcd6] p-4 space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-0.5 text-[10px] font-black border border-slate-900 uppercase tracking-widest ${
                                item.kind === "post"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : item.kind === "review"
                                  ? (isDislikeReview ? "bg-red-100 text-red-900 border-red-600" : "bg-emerald-100 text-emerald-900 border-emerald-600")
                                  : "bg-blue-100 text-blue-900"
                              }`}>
                                {item.kind === "post" ? "منشور ✍️" : item.kind === "review" ? (isDislikeReview ? "تقييم: لم يعجبني 👎" : "تقييم: أعجبني 👍") : "تعليق 💬"}
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

                          <h4 className="font-black text-sm text-slate-900">{item.title}</h4>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{item.content}</p>

                          <div className="flex items-center justify-between text-xs font-bold pt-2 border-t border-slate-100 text-slate-500">
                            <div className="flex items-center gap-4">
                              <span>👍 {item.likes}</span>
                              <span>👎 {item.dislikes}</span>
                            </div>
                            {(item.kind === "post" || item.kind === "review") && session && (session.username === targetProfileUser || session.role === "owner" || session.role === "mod") && (
                              <button onClick={() => deletePost(item.id)} className="text-[11px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1">
                                <IconTrash size={12} /> {session.username === targetProfileUser ? "حذف" : "حذف (إدارة)"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>
        )}


        {/* ──── TAB 5: ADMIN (الإدارة) ──── */}
        {tab === "admin" && canAdmin && (
          <section className="space-y-6">
            <div className="bg-red-50 border-2 border-red-600 shadow-[4px_4px_0px_#dc2626] p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconShield size={20} className="text-red-700" />
                <div>
                  <h2 className="font-black text-base text-red-800">لوحة التحكم والإشراف</h2>
                  <p className="text-xs text-red-600 mt-0.5">إدارة المحتوى المبلغ عنه والطلبات على قاعدة البيانات المركزية</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-red-600 text-white font-black text-[10px] border border-slate-900">صلاحيات المالك</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-5 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-200 pb-2">
                  <h3 className="font-black text-sm flex items-center gap-1.5"><IconInbox size={16} /> طلبات إضافة المدرسين (قائمة الانتظار)</h3>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold text-xs border border-slate-900">{pendingTeachers.length}</span>
                </div>
                {pendingTeachers.length === 0 ? (
                  <div className="text-xs text-slate-400 py-4 text-center font-semibold">لا توجد طلبات معلقة حالياً في قائمة الانتظار.</div>
                ) : (
                  pendingTeachers.map(t => (
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
                        <button onClick={() => approveTeacher(t.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs border border-slate-900 flex items-center gap-1">
                          ✓ قبول ونشر
                        </button>
                        <button onClick={() => rejectTeacher(t.id)} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs border border-red-400 flex items-center gap-1">
                          ✕ رفض
                        </button>
                      </div>
                    </div>
                  ))
                )}
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

      {/* ═══════ MOBILE BOTTOM NAVIGATION BAR ═══════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-border-subtle z-50 flex justify-around py-2 shadow-lg">
        <button onClick={() => setTab("feed")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "feed" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconHome size={20} />الرئيسية
        </button>
        <button onClick={() => setTab("directory")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "directory" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconBook size={20} />المدرسين
        </button>
        <button onClick={() => { if (!session) { setAuthModal(true); return; } setTab("notifications"); }} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 relative ${tab === "notifications" ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconBell size={20} />الإشعارات
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-2 bg-red-600 text-white font-black text-[8px] px-1 rounded-full border border-slate-900">
              {unreadCount}
            </span>
          )}
        </button>
        <button onClick={() => { if (!session) { setAuthModal(true); return; } setViewedUser(session.username); setTab("profile"); }} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "profile" && targetProfileUser === session?.username ? "text-emerald-primary" : "text-slate-400"}`}>
          <IconUser size={20} />حسابي
        </button>
        {canAdmin && (
          <button onClick={() => setTab("admin")} className={`flex flex-col items-center text-[10px] font-bold py-1 px-2 ${tab === "admin" ? "text-red-600" : "text-slate-400"}`}>
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
            {authError && <div className="p-2.5 bg-red-100 border border-red-400 text-red-700 text-xs font-bold leading-relaxed">{authError}</div>}
            
            {!isRegister && lockoutRemaining > 0 && (
              <div className="p-2.5 bg-amber-100 border-2 border-amber-600 text-amber-900 text-xs font-bold text-center">
                ⏳ تم قفل تسجيل الدخول مؤقتاً! يرجى الانتظار: <span className="font-black text-sm">{lockoutRemaining} ثانية</span>
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
                    <span className="text-[10px] text-emerald-700 font-black">✓ تم التحقق بنجاح</span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-semibold">مطلوب للتحقق</span>
                  )}
                </div>
                <Turnstile
                  onVerify={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
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
                  !tImg
                }
                className="w-full py-3 bg-emerald-primary text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_#000] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:border-slate-400 hover:bg-emerald-dark active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                إرسال للمراجعة (قائمة الانتظار) ⏳
              </button>
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
                حفظ التغييرات
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
                    <span className={`px-2.5 py-1 font-black text-xs border border-slate-900 ${
                      item.voteType === "like" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
                    }`}>
                      {item.voteType === "like" ? "أعجبك 👍" : "لم يعجبك 👎"}
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
    </div>
  );
}
