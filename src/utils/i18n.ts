export type Language = "ar" | "en";

export interface TranslationDict {
  [key: string]: {
    ar: string;
    en: string;
  };
}

export const T_DICT: TranslationDict = {
  appName: { ar: "منصة طلاب العراق", en: "Iraq Student Platform" },
  appTagline: { ar: "مراجعات وتقييمات المدرسين", en: "Teacher Reviews & Ratings" },
  
  // Navigation
  navHome: { ar: "الرئيسية", en: "Home" },
  navTeachers: { ar: "المدرسين", en: "Teachers" },
  navNotifications: { ar: "الإشعارات", en: "Notifications" },
  navProfile: { ar: "حسابي", en: "My Profile" },
  navAdmin: { ar: "لوحة الإدارة", en: "Admin Panel" },
  navSettings: { ar: "الإعدادات", en: "Settings" },
  navFaq: { ar: "الأسئلة الشائعة", en: "FAQ" },
  navSupport: { ar: "الدعم الفني", en: "Support" },
  login: { ar: "دخول", en: "Login" },
  register: { ar: "حساب جديد", en: "Register" },
  logout: { ar: "تسجيل الخروج", en: "Logout" },

  // Feed Tab
  feedTitle: { ar: "ساحة النقاش العامة", en: "General Discussion Hub" },
  feedSubtitle: { ar: "اطرح سؤالك أو شارك تجربتك مع بقية الطلاب في عموم العراق", en: "Ask questions or share your study experience with students across Iraq" },
  newPost: { ar: "أضف منشوراً جديداً", en: "Create New Post" },
  noPosts: { ar: "لا توجد منشورات حالياً. كن أول من يطرح نقاشاً!", en: "No posts yet. Be the first to start a discussion!" },
  trendingTeachersTitle: { ar: "المدرسين الأكثر رواجاً هذا الأسبوع", en: "Top Trending Teachers This Week" },
  trendingTeachersSub: { ar: "بناءً على تفاعلات الطلاب والمراجعات النشطة", en: "Based on active student reviews and interactions" },
  viewAllTeachers: { ar: "عرض كل المدرسين ←", en: "View All Teachers →" },
  honorBoardTitle: { ar: "لوحة شرف الطلاب الأكثر تفاعلاً ومساعدة", en: "Student Honor Board - Top Helpful Contributors" },
  honorBoardSub: { ar: "تكريم أفضل الطلاب الذين ينشرون المراجعات الموثوقة والإجابات المفيدة", en: "Honoring top students who post authentic reviews and helpful study advice" },
  showHonorBoard: { ar: "عرض أفضل ١٠ طلاب", en: "Show Top 10 Students" },
  hideHonorBoard: { ar: "إخفاء لوحة الشرف", en: "Hide Honor Board" },

  // Post Card & Tags
  tagAll: { ar: "الكل", en: "All" },
  tagQuestion: { ar: "سؤال دراسي", en: "Question" },
  tagDiscussion: { ar: "نقاش عام", en: "Discussion" },
  tagNews: { ar: "أخبار وزارية", en: "Ministerial News" },
  tagTips: { ar: "نصائح وملاحظات", en: "Study Tips" },
  tagBooklet: { ar: "ملازم وتلخيصات", en: "Booklets & Notes" },
  tagOther: { ar: "أخرى", en: "Other" },
  postTypeLabel: { ar: "نوع وتصنيف المنشور:", en: "Post Category & Tag:" },
  filterByTag: { ar: "تصفية حسب الموضوع:", en: "Filter by Tag:" },
  pinPost: { ar: "تثبيت في الأعلى", en: "Pin to Top" },
  unpinPost: { ar: "إلغاء التثبيت", en: "Unpin" },
  pinnedBadge: { ar: "منشور مثبت", en: "Pinned Post" },
  commentsCount: { ar: "التعليقات", en: "Comments" },
  report: { ar: "بلاغ", en: "Report" },
  delete: { ar: "حذف", en: "Delete" },
  deleteAdmin: { ar: "حذف (إدارة)", en: "Delete (Admin)" },
  bookmark: { ar: "حفظ", en: "Save" },
  bookmarked: { ar: "محفوظ", en: "Saved" },
  watchYoutube: { ar: "شرح يوتيوب", en: "YouTube Lesson" },
  openTelegram: { ar: "ملزمة / ملف", en: "Booklet / PDF" },
  writeComment: { ar: "اكتب تعليقاً...", en: "Write a comment..." },
  send: { ar: "إرسال", en: "Send" },

  // Directory Tab
  directoryTitle: { ar: "المدرسين", en: "Teachers Directory" },
  directorySubtitle: { ar: "دليل ومراجعات وتقييمات المدرسين في جميع محافظات العراق", en: "Directory and authentic reviews of teachers across all Iraqi governorates" },
  addTeacherBtn: { ar: "إضافة مدرس", en: "Add Teacher" },
  searchPlaceholder: { ar: "ابحث باسم المدرس، المادة، أو المحافظة...", en: "Search by teacher name, subject, or governorate..." },
  allGovs: { ar: "كل المحافظات", en: "All Governorates" },
  allSubjects: { ar: "كل المواد", en: "All Subjects" },
  allGrades: { ar: "كل المراحل", en: "All Grades" },
  teachingModeAll: { ar: "طرق التدريس: الكل", en: "Teaching Mode: All" },
  teachingModeBoth: { ar: "حضوري وإلكتروني", en: "In-Person & Online" },
  teachingModeInPerson: { ar: "حضوري فقط", en: "In-Person Only" },
  teachingModeOnline: { ar: "إلكتروني فقط", en: "Online Only" },
  sortBy: { ar: "ترتيب حسب:", en: "Sort by:" },
  sortLikes: { ar: "الأكثر إعجاباً", en: "Most Liked" },
  sortRating: { ar: "الأعلى قبولاً %", en: "Highest Approval %" },
  sortReviews: { ar: "الأكثر مراجعات", en: "Most Reviews" },
  sortNewest: { ar: "الأحدث", en: "Newest" },
  resetFilters: { ar: "إعادة ضبط الفلاتر", en: "Reset Filters" },
  noTeachersFound: { ar: "لا توجد نتائج مطابقة للبحث في قسم المدرسين.", en: "No matching teachers found in this directory search." },
  viewTeacherPage: { ar: "عرض صفحة المدرس وكل المنشورات ←", en: "View Teacher Page & Reviews →" },

  // Profile Tab
  myProfile: { ar: "ملفي الشخصي", en: "My Profile" },
  studentProfile: { ar: "الملف الشخصي للطالب:", en: "Student Profile:" },
  editProfile: { ar: "تعديل الحساب والمظهر", en: "Edit Profile & Appearance" },
  customizeProfile: { ar: "تخصيص المظهر والبانر", en: "Customize Banner & Look" },
  interactionHistory: { ar: "سجل التفاعلات (سري)", en: "Interaction Log (Private)" },
  posts: { ar: "المنشورات", en: "Posts" },
  teacherReviews: { ar: "تقييمات المدرسين", en: "Teacher Reviews" },
  comments: { ar: "التعليقات", en: "Comments" },
  likesReceived: { ar: "إعجابات مستلمة", en: "Likes Received" },
  dislikesReceived: { ar: "عدم إعجاب", en: "Dislikes" },
  tabActivities: { ar: "النشاطات والمشاركات", en: "Activities & Posts" },
  tabBookmarks: { ar: "المحفوظات", en: "Bookmarks" },
  noBookmarks: { ar: "لم تقم بحفظ أي مدرسين أو منشورات حتى الآن.", en: "You have not saved any teachers or posts yet." },
  noActivities: { ar: "لم يتم نشر أي منشورات أو تقييمات أو تعليقات حتى الآن.", en: "No posts, reviews, or comments have been published yet." },

  // Banner Customization
  bannerPattern: { ar: "نمط البانر الخلفي:", en: "Banner Pattern:" },
  bannerColor: { ar: "لون خلفية البانر:", en: "Banner Background Color:" },
  accentColor: { ar: "اللون المميز (Accent Color):", en: "Profile Accent Color:" },
  uploadBanner: { ar: "صورة البانر المخصصة (اختياري):", en: "Custom Banner Image (Optional):" },
  removeBanner: { ar: "إزالة صورة البانر واستخدام النمط", en: "Remove Banner Image & Use Pattern" },
  patternNone: { ar: "لون مصمت", en: "Solid Color" },
  patternStripes: { ar: "خطوط مائلة (Stripes)", en: "Diagonal Stripes" },
  patternDots: { ar: "نقاط متناسقة (Dots)", en: "Dot Matrix" },
  patternGrid: { ar: "شبكة مربعات (Grid)", en: "Grid Pattern" },
  patternGradient: { ar: "تدرج ناعم (Gradient)", en: "Smooth Gradient" },
  saveChanges: { ar: "حفظ التغييرات", en: "Save Changes" },
  close: { ar: "إغلاق", en: "Close" },

  // Settings
  settingsTitle: { ar: "إعدادات المنصة والمظهر", en: "Platform Settings & Themes" },
  settingsSub: { ar: "تخصيص الثيم اللوني، اللغة، والوصول إلى الدعم والأسئلة الشائعة", en: "Customize color theme, language, support, and FAQ" },
  tabTheme: { ar: "المظهر والثيم", en: "Theme & Colors" },
  tabLang: { ar: "اللغة (Language)", en: "Language" },
  tabFaq: { ar: "الأسئلة الشائعة", en: "FAQ" },
  tabSupport: { ar: "الدعم الفني", en: "Support" },

  themeSection: { ar: "اختر المظهر اللوني المفضل للمنصة:", en: "Select your preferred site theme:" },
  langSection: { ar: "اختر لغة واجهة المنصة:", en: "Select platform language:" },
  themeLight: { ar: "الوضع الكلاسيكي الفاتح", en: "Classic Light" },
  themeLightDesc: { ar: "المظهر الافتراضي الأنيق باللون الزمردي والرمادي الفاتح", en: "Clean default style with emerald accents and crisp borders" },
  themeDark: { ar: "الوضع الليلي (Dark Mode)", en: "Dark Mode" },
  themeDarkDesc: { ar: "واجهة داكنة مريحة للعين للقراءة والمذاكرة الليلية", en: "Comfortable high-contrast dark theme for night study sessions" },
  themePink: { ar: "وضع النمر الوردي (Pink Panther)", en: "Pink Panther Mode" },
  themePinkDesc: { ar: "تصميم لطيف وجريء بلمسات وردية نيو-بروتالية جذابة", en: "Playful, cute, and bold pink neo-brutalist theme" },
  themePlants: { ar: "وضع الطبيعة والنباتات (Plants Mode)", en: "Plants & Nature Mode" },
  themePlantsDesc: { ar: "ألوان خضراء هادئة مستوحاة من أوراق الشجر والحدائق", en: "Lush botanical greens inspired by peaceful nature & botany" },
  themePurple: { ar: "الوضع الأرجواني التقني (Purple & Blue)", en: "Cyber Purple & Blue" },
  themePurpleDesc: { ar: "طابع تقني حديث بلون بنفسجي عميق وأزرق كهربائي", en: "Futuristic tech styling with deep violet & electric cyan-blue" },

  // FAQ
  faqTitle: { ar: "الأسئلة الأكثر شيوعاً بين الطلاب", en: "Frequently Asked Questions" },
  faqSub: { ar: "إجابات شاملة عن كل ما يخص منصة طلاب العراق ومراجعات المدرسين", en: "Comprehensive answers about Iraq Student Platform & reviews" },

  // Support
  supportTitle: { ar: "مركز الدعم الفني والاستفسارات", en: "Help & Support Center" },
  supportSub: { ar: "لديك اقتراح، مشكلة فنية، أو استفسار؟ تواصل مع إدارة المنصة مباشرة", en: "Got a suggestion, technical issue, or inquiry? Reach out directly" },
  supportCatGeneral: { ar: "استفسار عام", en: "General Inquiry" },
  supportCatTechnical: { ar: "مشكلة تقنية في الموقع", en: "Technical Issue" },
  supportCatTeacher: { ar: "تصحيح أو إضافة بيانات مدرس", en: "Teacher Data Correction / Request" },
  supportCatSuggestion: { ar: "اقتراح لتطوير المنصة", en: "Platform Suggestion" },
  supportSubjectPlaceholder: { ar: "مثال: مشكلة في رفع الصورة أو استفسار عن مراجعة", en: "e.g., Issue uploading photo or review inquiry" },
  supportMessagePlaceholder: { ar: "اكتب تفاصيل استفسارك أو المشكلة بوضوح...", en: "Write your message or issue details clearly..." },
  supportContactPlaceholder: { ar: "معرف تيليغرام أو بريد إلكتروني أو رقم هاتف (اختياري)", en: "Telegram username, email, or phone (optional)" },
  sendSupportTicket: { ar: "إرسال التذكرة", en: "Submit Inquiry" },
  supportSuccessAlert: { ar: "تم إرسال استفسارك بنجاح! سيقوم فريق المنصة بمراجعته في أقرب وقت.", en: "Your message has been sent successfully! Our team will review it shortly." },

  // Admin Sub-tabs
  adminSubMod: { ar: "الإشراف والبلاغات", en: "Moderation & Queue" },
  adminSubBanner: { ar: "شريط التنبيهات", en: "Site Announcement" },
  adminSubAudit: { ar: "سجل العمليات", en: "Audit Log" },
  adminSubFilter: { ar: "الكلمات المحظورة", en: "Word Filter" },
  adminSubOwner: { ar: "تحكم المالك الحصري", en: "Owner Controls" },
};

export function getT(lang: Language) {
  return function t(key: keyof typeof T_DICT): string {
    const entry = T_DICT[key];
    if (!entry) return key as string;
    return entry[lang] || entry["ar"];
  };
}
