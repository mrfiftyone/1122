export type Language = "ar" | "en";

export interface TranslationDict {
  [key: string]: {
    ar: string;
    en: string;
  };
}

export const T_DICT: TranslationDict = {
  appName: { ar: "منصة طلاب العراق", en: "Iraq Student Platform" },
  appTagline: { ar: "دليل وتقييمات ومراجعات الأساتذة", en: "Teacher Reviews & Ratings" },
  
  // Navigation
  navHome: { ar: "الرئيسية", en: "Home" },
  navTeachers: { ar: "الأساتذة", en: "Teachers" },
  navNotifications: { ar: "الإشعارات", en: "Notifications" },
  navProfile: { ar: "صفحتي", en: "My Profile" },
  navAdmin: { ar: "لوحة الإدارة", en: "Admin Panel" },
  navSettings: { ar: "الإعدادات", en: "Settings" },
  navFaq: { ar: "الأسئلة الشائعة", en: "FAQ" },
  navSupport: { ar: "الدعم والمساعدة", en: "Support" },
  login: { ar: "دخول", en: "Login" },
  register: { ar: "حساب جديد", en: "Register" },
  logout: { ar: "تسجيل الخروج", en: "Logout" },

  // Feed Tab
  feedTitle: { ar: "ساحة نقاشات الطلاب", en: "Student Discussion Hub" },
  feedSubtitle: { ar: "شارك تجربتك واسأل واستفاد من بقية الطلاب بكل العراق", en: "Ask questions and share study advice with students across Iraq" },
  newPost: { ar: "نشر مشاركة جديدة", en: "Create New Post" },
  noPosts: { ar: "ماكو منشورات بعد.. صير أول واحد ينشر!", en: "No posts yet. Be the first to start a discussion!" },
  trendingTeachersTitle: { ar: "أكثر الأساتذة تفاعلاً هذا الأسبوع", en: "Top Trending Teachers This Week" },
  trendingTeachersSub: { ar: "حسب مراجعات وتقييمات الطلاب الحقيقية", en: "Based on active student reviews" },
  viewAllTeachers: { ar: "كل الأساتذة ←", en: "All Teachers →" },
  honorBoardTitle: { ar: "لوحة شرف الطلاب المتفاعلين", en: "Student Honor Board" },
  honorBoardSub: { ar: "تكريم الطلاب اللي يساعدون غيرهم بمراجعات ونصائح حقيقية", en: "Honoring students who help others with authentic reviews" },
  showHonorBoard: { ar: "عرض أفضل الطلاب", en: "Show Top Students" },
  hideHonorBoard: { ar: "إخفاء لوحة الشرف", en: "Hide Honor Board" },

  // Post Card & Tags
  tagAll: { ar: "الكل", en: "All" },
  tagQuestion: { ar: "سؤال دراسي", en: "Question" },
  tagDiscussion: { ar: "سالفة ونقاش", en: "Discussion" },
  tagNews: { ar: "أخبار التربية والوزاريات", en: "Ministerial News" },
  tagTips: { ar: "نصائح وتجارب", en: "Study Tips" },
  tagBooklet: { ar: "ملازم ومرشحات", en: "Booklets & Notes" },
  tagOther: { ar: "أخرى", en: "Other" },
  postTypeLabel: { ar: "نوع المشاركة:", en: "Post Category:" },
  filterByTag: { ar: "تصفية حسب الموضوع:", en: "Filter by Tag:" },
  pinPost: { ar: "تثبيت في الأعلى", en: "Pin to Top" },
  unpinPost: { ar: "إلغاء التثبيت", en: "Unpin" },
  pinnedBadge: { ar: "منشور مثبت", en: "Pinned Post" },
  commentsCount: { ar: "الردود", en: "Replies" },
  noCommentsYet: { ar: "ماكو ردود بعد.. اكتب أول رد!", en: "No replies yet. Be the first to reply!" },
  report: { ar: "بلاغ", en: "Report" },
  delete: { ar: "حذف", en: "Delete" },
  deleteAdmin: { ar: "حذف إداري", en: "Admin Delete" },
  bookmark: { ar: "حفظ", en: "Save" },
  bookmarked: { ar: "محفوظ", en: "Saved" },
  share: { ar: "مشاركة", en: "Share" },
  shared: { ar: "تمت المشاركة", en: "Shared" },
  linkCopied: { ar: "تم نسخ الرابط بنجاح!", en: "Link copied to clipboard!" },
  watchYoutube: { ar: "شرح يوتيوب", en: "YouTube Lesson" },
  openTelegram: { ar: "ملزمة أو ملخص", en: "Booklet PDF" },
  writeComment: { ar: "اكتب ردك هنا...", en: "Write a reply..." },
  send: { ar: "إرسال", en: "Send" },
  reply: { ar: "رد", en: "Reply" },
  cancelReply: { ar: "إلغاء", en: "Cancel" },
  sendReply: { ar: "إرسال الرد", en: "Submit Reply" },
  replyingTo: { ar: "الرد على:", en: "Replying to:" },
  hideReplies: { ar: "إخفاء الردود", en: "Hide replies" },

  // Directory Tab
  directoryTitle: { ar: "دليل الأساتذة", en: "Teachers Directory" },
  directorySubtitle: { ar: "دليل ومراجعات وتقييمات أساتذة العراق بكل المحافظات", en: "Directory and reviews of teachers across all Iraqi governorates" },
  addTeacherBtn: { ar: "إضافة أستاذ", en: "Add Teacher" },
  searchPlaceholder: { ar: "ابحث باسم الأستاذ، المادة، أو المحافظة...", en: "Search by teacher, subject, or city..." },
  allGovs: { ar: "كل المحافظات", en: "All Governorates" },
  allSubjects: { ar: "كل المواد", en: "All Subjects" },
  allGrades: { ar: "كل المراحل", en: "All Grades" },
  teachingModeAll: { ar: "طرق التدريس: الكل", en: "Teaching Mode: All" },
  teachingModeBoth: { ar: "حضوري وإلكتروني", en: "In-Person & Online" },
  teachingModeInPerson: { ar: "حضوري", en: "In-Person" },
  teachingModeOnline: { ar: "إلكتروني", en: "Online" },
  sortBy: { ar: "ترتيب حسب:", en: "Sort by:" },
  sortLikes: { ar: "الأكثر تفاعلاً", en: "Most Liked" },
  sortRating: { ar: "الأعلى تقييماً", en: "Highest Rated" },
  sortReviews: { ar: "الأكثر مراجعات", en: "Most Reviews" },
  sortNewest: { ar: "الأحدث", en: "Newest" },
  resetFilters: { ar: "إعادة تعيين الفلاتر", en: "Reset Filters" },
  noTeachersFound: { ar: "ما لكَينا أي أستاذ يطابق بحثك.", en: "No matching teachers found." },
  viewTeacherPage: { ar: "صفحة الأستاذ والتقييمات ←", en: "Teacher Page & Reviews →" },

  // Dedicated Teacher Page
  recommend: { ar: "أنصح بيه", en: "Recommend" },
  dontRecommend: { ar: "ما أنصح بيه", en: "Don't Recommend" },
  teacherPrompt: { ar: "شنو رأيك وتجربتك وي الأستاذ؟ شارك تقييمك لمساعدة الطلاب", en: "Share your authentic review to help fellow students" },

  // Profile Tab
  myProfile: { ar: "صفحتي", en: "My Profile" },
  studentProfile: { ar: "الملف الشخصي للطالب:", en: "Student Profile:" },
  editProfile: { ar: "تعديل الحساب والمظهر", en: "Edit Profile & Appearance" },
  customizeProfile: { ar: "تخصيص المظهر والغلاف", en: "Customize Look & Cover" },
  interactionHistory: { ar: "سجل التفاعلات الخاص", en: "Private History" },
  posts: { ar: "المنشورات", en: "Posts" },
  teacherReviews: { ar: "تقييمات الأساتذة", en: "Teacher Reviews" },
  comments: { ar: "الردود", en: "Replies" },
  likesReceived: { ar: "إعجابات مستلمة", en: "Likes Received" },
  dislikesReceived: { ar: "عدم إعجاب", en: "Dislikes" },
  tabActivities: { ar: "النشاطات والمشاركات", en: "Activities & Posts" },
  tabBookmarks: { ar: "المحفوظات", en: "Bookmarks" },
  noBookmarks: { ar: "بعدك ما حافظ أي أستاذ أو منشور بالمحفوظات.", en: "You haven't saved any teachers or posts yet." },
  noActivities: { ar: "ماكو أي مشاركات أو تقييمات منشورة بعد.", en: "No posts, reviews, or comments published yet." },
  noVotesYet: { ar: "ما صوتت على أي مشاركة بعد.", en: "You have not voted on any posts yet." },

  // Banner Customization
  bannerPattern: { ar: "نمط الغلاف:", en: "Banner Pattern:" },
  bannerColor: { ar: "لون خلفية الغلاف:", en: "Banner Color:" },
  accentColor: { ar: "اللون المميز:", en: "Accent Color:" },
  uploadBanner: { ar: "صورة الغلاف:", en: "Cover Image:" },
  removeBanner: { ar: "إزالة صورة الغلاف واستخدام النمط", en: "Remove Cover Image & Use Pattern" },
  patternNone: { ar: "لون مصمت", en: "Solid Color" },
  patternStripes: { ar: "خطوط مائلة", en: "Diagonal Stripes" },
  patternDots: { ar: "نقاط متناسقة", en: "Dot Matrix" },
  patternGrid: { ar: "شبكة مربعات", en: "Grid Pattern" },
  patternGradient: { ar: "تدرج لوني", en: "Gradient" },
  saveChanges: { ar: "حفظ التغييرات", en: "Save Changes" },
  close: { ar: "إغلاق", en: "Close" },

  // Settings
  settingsTitle: { ar: "إعدادات المنصة والمظهر", en: "Platform Settings & Themes" },
  settingsSub: { ar: "تخصيص المظهر اللوني، اللغة، والوصول إلى الدعم والأسئلة الشائعة", en: "Customize theme, language, support, and FAQ" },
  tabTheme: { ar: "المظهر والثيم", en: "Theme & Colors" },
  tabLang: { ar: "اللغة", en: "Language" },
  tabAbout: { ar: "عن المنصة", en: "About Us" },
  tabFaq: { ar: "الأسئلة الشائعة", en: "FAQ" },
  tabSupport: { ar: "الدعم والمساعدة", en: "Support" },

  themeSection: { ar: "اختر مظهر المنصة المفضل:", en: "Select your preferred platform theme:" },
  langSection: { ar: "اختر لغة واجهة المنصة:", en: "Select platform language:" },
  themeLight: { ar: "الوضع الفاتح", en: "Classic Light" },
  themeLightDesc: { ar: "المظهر الافتراضي الأنيق باللون الزمردي والرمادي الهادئ", en: "Clean default style with emerald accents and crisp borders" },
  themeDark: { ar: "الوضع الليلي", en: "Dark Mode" },
  themeDarkDesc: { ar: "واجهة داكنة مريحة للعين للقراءة والمذاكرة الليلية", en: "Comfortable high-contrast dark theme for night study sessions" },
  themePink: { ar: "الوضع الوردي", en: "Pink Mode" },
  themePinkDesc: { ar: "تصميم جريء ومميز بلمسات وردية نيو-بروتالية", en: "Playful, cute, and bold pink neo-brutalist theme" },
  themePlants: { ar: "وضع الطبيعة", en: "Nature Mode" },
  themePlantsDesc: { ar: "ألوان خضراء هادئة مستوحاة من أوراق الشجر", en: "Lush botanical greens inspired by peaceful nature" },
  themePurple: { ar: "الوضع البنفسجي", en: "Purple Mode" },
  themePurpleDesc: { ar: "طابع تقني حديث بلون بنفسجي عميق وأزرق ساطع", en: "Modern tech styling with deep violet & electric cyan-blue" },

  // FAQ
  faqTitle: { ar: "الأسئلة الشائعة بين الطلاب", en: "Frequently Asked Questions" },
  faqSub: { ar: "إجابات واضحة عن كل ما يخص منصة طلاب العراق ومراجعات الأساتذة", en: "Clear answers about Iraq Student Platform & reviews" },

  // Support
  supportTitle: { ar: "مركز الدعم والمساعدة", en: "Help & Support Center" },
  supportSub: { ar: "عندك فكرة أو واجهتك مشكلة؟ راسلنا مباشرة", en: "Got a suggestion or technical issue? Reach out directly" },
  supportCatGeneral: { ar: "استفسار عام", en: "General Inquiry" },
  supportCatTechnical: { ar: "مشكلة تقنية بالموقع", en: "Technical Issue" },
  supportCatTeacher: { ar: "إضافة أو تعديل بيانات أستاذ", en: "Teacher Data Request" },
  supportCatSuggestion: { ar: "اقتراح لتطوير المنصة", en: "Platform Suggestion" },
  supportSubjectPlaceholder: { ar: "عنوان المشكلة أو الاستفسار...", en: "Subject of your inquiry..." },
  supportMessagePlaceholder: { ar: "اكتب التفاصيل بوضوح هنا...", en: "Write your message details clearly..." },
  supportContactPlaceholder: { ar: "معرف تيليغرام أو بريد إلكتروني", en: "Telegram username or email" },
  sendSupportTicket: { ar: "إرسال الرسالة", en: "Submit Inquiry" },
  supportSuccessAlert: { ar: "وصلت رسالتك بنجاح! راح يراجعها فريق المنصة بأقرب وقت.", en: "Your message has been sent successfully! Our team will review it shortly." },

  // Admin Sub-tabs
  adminSubMod: { ar: "الإشراف والبلاغات", en: "Moderation & Queue" },
  adminSubBanner: { ar: "شريط التنبيهات", en: "Site Announcement" },
  adminSubAudit: { ar: "سجل العمليات", en: "Audit Log" },
  adminSubFilter: { ar: "الكلمات المحظورة", en: "Word Filter" },
  adminSubOwner: { ar: "صلاحيات المالك", en: "Owner Controls" },
};

export function getT(lang: Language) {
  return function t(key: keyof typeof T_DICT): string {
    const entry = T_DICT[key];
    if (!entry) return key as string;
    return entry[lang] || entry["ar"];
  };
}

