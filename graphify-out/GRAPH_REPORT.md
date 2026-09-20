# Graph Report - 1122  (2026-09-20)

## Corpus Check
- 23 files · ~36,558 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .ico 1, .css 1)

## Summary
- 287 nodes · 499 edges · 21 communities (13 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app/page.tsx
- Home
- package.json
- compilerOptions
- next
- dependencies
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
- moderation.ts
- i18n.ts
- time.ts

## God Nodes (most connected - your core abstractions)
1. `Home()` - 91 edges
2. `addAuditLog()` - 19 edges
3. `compilerOptions` - 16 edges
4. `exportPlatformBackup()` - 12 edges
5. `setNotifications()` - 10 edges
6. `getUsers()` - 9 edges
7. `getNotifications()` - 9 edges
8. `sendNotificationToUser()` - 8 edges
9. `handleMuteUser()` - 8 edges
10. `handleSaveModPermissions()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Home()` --calls--> `getT()`  [EXTRACTED]
  src/app/page.tsx → src/utils/i18n.ts
- `Home()` --calls--> `getBlockedWordsList()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts
- `Home()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts
- `Home()` --calls--> `getRelativeTime()`  [EXTRACTED]
  src/app/page.tsx → src/utils/time.ts
- `submitTeacher()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts

## Import Cycles
- None detected.

## Communities (21 total, 8 thin omitted)

### Community 0 - "app/page.tsx"
Cohesion: 0.06
Nodes (35): AuditLogItem, AVATAR_COLORS, BookmarkItem, Comment, DEFAULT_MOD_PERMISSIONS, FULL_OWNER_PERMISSIONS, GOVERNORATES, GRADE_OPTIONS (+27 more)

### Community 1 - "Home"
Cohesion: 0.06
Nodes (43): getNotifications(), getPinnedPostIds(), getSession(), getSupportTickets(), getVotes(), Home(), addComment(), adminDeleteReportedItem() (+35 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (36): eslintConfig, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+28 more)

### Community 3 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 4 - "next"
Cohesion: 0.18
Nodes (6): nextConfig, next, src_app_globals, cairo, metadata, ProfileProps

### Community 5 - "dependencies"
Cohesion: 0.22
Nodes (9): dependencies, clsx, lucide-react, next, react, react-dom, @supabase/ssr, @supabase/supabase-js (+1 more)

### Community 6 - "icons.tsx"
Cohesion: 0.05
Nodes (36): IconActivity(), IconAward(), IconBell(), IconBolt(), IconCamera(), IconChevronDown(), IconChevronUp(), IconClock (+28 more)

### Community 7 - "addAuditLog"
Cohesion: 0.09
Nodes (40): getAuditLogs(), getCustomBannedWords(), getModPermissions(), getMutedUsers(), getPlatformSettings(), getPosts(), getProfiles(), getSiteAnnouncement() (+32 more)

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

### Community 19 - "i18n.ts"
Cohesion: 0.40
Nodes (4): getT(), Language, T_DICT, TranslationDict

## Knowledge Gaps
- **93 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 116 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Home()` connect `Home` to `app/page.tsx`, `addAuditLog`, `toggleBookmark`, `normalizeTeacherName`, `moderation.ts`, `i18n.ts`, `time.ts`?**
  _High betweenness centrality (0.242) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `app/page.tsx`, `not-found.tsx`, `package.json`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `react` connect `package.json` to `app/page.tsx`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `Home` be split into smaller, more focused modules?**
  _Cohesion score 0.0649895178197065 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._