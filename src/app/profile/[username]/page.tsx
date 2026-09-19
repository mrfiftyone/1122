import Link from "next/link";

interface ProfileProps {
  params: Promise<{ username: string }>;
}

export default async function ProfilePage({ params }: ProfileProps) {
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);

  // In production these come from Supabase. For now, mock data.
  const mockRole = decodedUsername === "hh" ? "owner" : decodedUsername === "mod1" ? "mod" : "student";
  const stats = { posts: 12, comments: 45, likes: 150, dislikes: 35 };
  const totalVotes = stats.likes + stats.dislikes;
  const dislikeRatio = totalVotes > 0 ? (stats.dislikes / totalVotes) * 100 : 0;
  const isLowTrust = dislikeRatio >= 80;

  const roleBadge = mockRole === "owner"
    ? { label: "👑 المالك", cls: "bg-amber-200 text-amber-900 border-amber-600" }
    : mockRole === "mod"
    ? { label: "🛡️ مشرف", cls: "bg-blue-100 text-blue-900 border-blue-600" }
    : { label: "🎓 طالب", cls: "bg-slate-100 text-slate-700 border-slate-400" };

  const activityFeed = [
    { id: "1", type: "post" as const, title: "تجربتي مع أستاذ الرياضيات", body: "أنصح جداً بمتابعة ملزمته، الأسئلة الوزارية كلها موجودة.", time: "منذ 3 ساعات" },
    { id: "2", type: "reply" as const, title: "رد على: أفضل مدرس فيزياء", body: "اليوتيوب كافي وزيادة بس حل كل الوزاريات وياه.", time: "منذ يومين" },
  ];

  return (
    <div className="min-h-screen bg-page-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-border-subtle shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-slate-900 bg-emerald-primary flex items-center justify-center font-black text-white text-lg shadow-[2px_2px_0px_#115e59]">📚</div>
            <div>
              <h1 className="font-black text-base tracking-tight text-slate-900">منصة طلاب العراق</h1>
              <p className="text-[11px] text-slate-600 font-semibold">دليل ومناقشات المدرسين</p>
            </div>
          </Link>
          <Link href="/" className="px-4 py-2 text-xs font-bold border-2 border-slate-900 bg-white hover:bg-slate-100 shadow-[2px_2px_0px_#000]">← الرئيسية</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Profile Card */}
        <div className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 border-2 border-slate-900 bg-slate-200 flex items-center justify-center font-black text-2xl text-slate-600">
              {decodedUsername.substring(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-xl text-slate-900">{decodedUsername}</h2>
                <span className={`px-2 py-0.5 text-[10px] font-black border ${roleBadge.cls}`}>{roleBadge.label}</span>
                {isLowTrust && (
                  <span className="px-2 py-0.5 text-[10px] font-black border border-red-600 bg-red-100 text-red-800">⚠️ ثقة منخفضة</span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 border-t-2 border-slate-200 pt-4 text-center">
            <div>
              <div className="text-xl font-black text-slate-900">{stats.posts}</div>
              <div className="text-[11px] font-bold text-slate-500">مشاركات</div>
            </div>
            <div>
              <div className="text-xl font-black text-slate-900">{stats.comments}</div>
              <div className="text-[11px] font-bold text-slate-500">تعليقات</div>
            </div>
            <div>
              <div className="text-xl font-black text-emerald-700">{stats.likes} 👍</div>
              <div className="text-[11px] font-bold text-slate-500">إعجابات</div>
            </div>
            <div>
              <div className="text-xl font-black text-red-600">{stats.dislikes} 👎</div>
              <div className="text-[11px] font-bold text-slate-500">عدم إعجاب</div>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="space-y-4">
          <h3 className="font-black text-sm text-slate-700 border-b-2 border-slate-200 pb-2">📋 النشاطات الأخيرة</h3>
          {activityFeed.map((item) => (
            <div key={item.id} className="bg-white border-2 border-border-subtle shadow-[4px_4px_0px_#d1dcd6] p-4 relative">
              <span className="absolute -top-2.5 left-4 bg-white border border-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                {item.type === "post" ? "مشاركة" : "تعليق"}
              </span>
              <h4 className="font-black text-sm text-slate-900 mt-1">{item.title}</h4>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed">{item.body}</p>
              <span className="text-[10px] font-bold text-slate-400 mt-2 block">{item.time}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export const revalidate = 60;
