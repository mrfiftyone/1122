# Graph Report - 1122  (2026-09-20)

## Corpus Check
- 28 files · ~39,954 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .ico 1, .css 1)

## Summary
- 308 nodes · 542 edges · 21 communities (14 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app/page.tsx
- Home
- package.json
- compilerOptions
- next
- icons.tsx
- addAuditLog
- toggleBookmark
- README.md
- normalizeTeacherName
- feedAlgorithm.ts
- AGENTS.md
- postcss.config.mjs
- vercel.json
- not-found.tsx
- security.ts
- i18n.ts
- time.ts
- devDependencies

## God Nodes (most connected - your core abstractions)
1. `Home()` - 98 edges
2. `addAuditLog()` - 19 edges
3. `compilerOptions` - 16 edges
4. `exportPlatformBackup()` - 12 edges
5. `setNotifications()` - 10 edges
6. `getNotifications()` - 9 edges
7. `next` - 8 edges
8. `getUsers()` - 8 edges
9. `sendNotificationToUser()` - 8 edges
10. `handleMuteUser()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Home()` --calls--> `getT()`  [EXTRACTED]
  src/app/page.tsx → src/utils/i18n.ts
- `Home()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts
- `Home()` --calls--> `isAllowedTelegramUrl()`  [EXTRACTED]
  src/app/page.tsx → src/utils/security.ts
- `Home()` --calls--> `isAllowedYoutubeUrl()`  [EXTRACTED]
  src/app/page.tsx → src/utils/security.ts
- `Home()` --calls--> `sanitizeText()`  [EXTRACTED]
  src/app/page.tsx → src/utils/security.ts

## Import Cycles
- None detected.

## Communities (21 total, 7 thin omitted)

### Community 0 - "app/page.tsx"
Cohesion: 0.05
Nodes (36): AuditLogItem, AVATAR_COLORS, BookmarkItem, Comment, DEFAULT_MOD_PERMISSIONS, FULL_OWNER_PERMISSIONS, GOVERNORATES, GRADE_OPTIONS (+28 more)

### Community 1 - "Home"
Cohesion: 0.06
Nodes (48): getNotifications(), getPinnedPostIds(), getProfiles(), getSession(), getSupportTickets(), getVotes(), Home(), adminDeleteReportedItem() (+40 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (34): eslintConfig, dependencies, clsx, lucide-react, next, react, react-dom, @supabase/ssr (+26 more)

### Community 3 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 4 - "next"
Cohesion: 0.11
Nodes (8): nextConfig, next, @supabase/supabase-js, src_app_globals, cairo, metadata, ProfileProps, supabase

### Community 6 - "icons.tsx"
Cohesion: 0.05
Nodes (36): IconAlertTriangle(), IconAward(), IconBell(), IconBolt(), IconBookmark(), IconChevronDown(), IconChevronUp(), IconClock (+28 more)

### Community 7 - "addAuditLog"
Cohesion: 0.09
Nodes (38): getAuditLogs(), getCustomBannedWords(), getModPermissions(), getMutedUsers(), getPlatformSettings(), getPosts(), getSiteAnnouncement(), getTeachers() (+30 more)

### Community 8 - "toggleBookmark"
Cohesion: 0.67
Nodes (3): getBookmarks(), toggleBookmark(), setBookmarks()

### Community 9 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 10 - "normalizeTeacherName"
Cohesion: 0.67
Nodes (3): submitTeacher(), checkIsDuplicate(), normalizeTeacherName()

### Community 17 - "not-found.tsx"
Cohesion: 0.33
Nodes (4): IconArrowRight(), IconBook(), IconHome(), IconShield()

### Community 18 - "security.ts"
Cohesion: 0.17
Nodes (13): addComment(), submitPost(), ALLOWED_TELEGRAM_PATTERNS, ALLOWED_YOUTUBE_PATTERNS, generateSalt(), hashPassword(), isAllowedTelegramUrl(), isAllowedYoutubeUrl() (+5 more)

### Community 19 - "i18n.ts"
Cohesion: 0.40
Nodes (4): getT(), Language, T_DICT, TranslationDict

### Community 21 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

## Knowledge Gaps
- **96 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+91 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 123 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Home()` connect `Home` to `app/page.tsx`, `addAuditLog`, `toggleBookmark`, `normalizeTeacherName`, `security.ts`, `i18n.ts`, `time.ts`?**
  _High betweenness centrality (0.237) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `app/page.tsx`, `not-found.tsx`, `package.json`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **Why does `react` connect `package.json` to `app/page.tsx`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _96 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `Home` be split into smaller, more focused modules?**
  _Cohesion score 0.05649717514124294 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._