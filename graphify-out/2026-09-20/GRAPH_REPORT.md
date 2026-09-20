# Graph Report - 1122  (2026-09-20)

## Corpus Check
- 23 files · ~27,883 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .ico 1, .css 1)

## Summary
- 239 nodes · 357 edges · 27 communities (20 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app/page.tsx
- Home
- package.json
- compilerOptions
- next
- dependencies
- icons.tsx
- handleAuth
- toggleBookmark
- README.md
- normalizeTeacherName
- feedAlgorithm.ts
- AGENTS.md
- postcss.config.mjs
- vercel.json
- not-found.tsx
- Turnstile.tsx
- i18n.ts
- time.ts
- setNotifications
- castVote
- getSupportTickets
- getReportRecords
- containsProfanity
- getPinnedPostIds

## God Nodes (most connected - your core abstractions)
1. `Home()` - 65 edges
2. `compilerOptions` - 16 edges
3. `setNotifications()` - 9 edges
4. `getNotifications()` - 8 edges
5. `next` - 6 edges
6. `castVote()` - 6 edges
7. `submitReport()` - 6 edges
8. `scripts` - 5 edges
9. `getSupportTickets()` - 5 edges
10. `handleAuth()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Home()` --calls--> `getT()`  [EXTRACTED]
  src/app/page.tsx → src/utils/i18n.ts
- `Home()` --calls--> `containsProfanity()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts
- `Home()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts
- `Home()` --calls--> `getRelativeTime()`  [EXTRACTED]
  src/app/page.tsx → src/utils/time.ts
- `submitTeacher()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts

## Import Cycles
- None detected.

## Communities (27 total, 7 thin omitted)

### Community 0 - "app/page.tsx"
Cohesion: 0.07
Nodes (27): AVATAR_COLORS, BookmarkItem, Comment, GOVERNORATES, GRADE_OPTIONS, GRADES, NotificationItem, Post (+19 more)

### Community 1 - "Home"
Cohesion: 0.09
Nodes (12): getPosts(), getSession(), getTeachers(), Home(), compressImage(), handleTeacherImageUpload(), openReportModal(), reportComment() (+4 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (33): eslintConfig, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+25 more)

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
Cohesion: 0.07
Nodes (26): IconBell(), IconBolt(), IconCheck(), IconChevronDown(), IconChevronUp(), IconComment(), IconFlag(), IconFlame() (+18 more)

### Community 7 - "handleAuth"
Cohesion: 0.50
Nodes (5): getProfiles(), handleAuth(), saveProfile(), setProfiles(), setUsers()

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

### Community 18 - "Turnstile.tsx"
Cohesion: 0.40
Nodes (4): react, Turnstile(), TurnstileProps, Window

### Community 19 - "i18n.ts"
Cohesion: 0.40
Nodes (4): getT(), Language, T_DICT, TranslationDict

### Community 21 - "setNotifications"
Cohesion: 0.31
Nodes (9): getNotifications(), getUsers(), approveTeacher(), getWordCount(), markAllNotifsRead(), rejectTeacher(), sendAdminWarning(), submitReport() (+1 more)

### Community 22 - "castVote"
Cohesion: 0.29
Nodes (8): getVotes(), castVote(), getUserVote(), submitTeacherReview(), voteComment(), votePost(), voteTeacher(), setVotes()

### Community 23 - "getSupportTickets"
Cohesion: 0.60
Nodes (5): getSupportTickets(), deleteSupportTicket(), resolveSupportTicket(), submitSupportTicket(), setSupportTicketsStorage()

### Community 24 - "getReportRecords"
Cohesion: 0.40
Nodes (5): adminDeleteReportedItem(), deletePost(), dismissReport(), getReportRecords(), saveReportRecord()

### Community 25 - "containsProfanity"
Cohesion: 0.50
Nodes (3): addComment(), BLOCKED_WORDS, containsProfanity()

### Community 26 - "getPinnedPostIds"
Cohesion: 0.67
Nodes (3): getPinnedPostIds(), togglePinPost(), setPinnedPostIdsStorage()

## Knowledge Gaps
- **85 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 112 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Home()` connect `Home` to `app/page.tsx`, `handleAuth`, `toggleBookmark`, `normalizeTeacherName`, `i18n.ts`, `time.ts`, `setNotifications`, `castVote`, `getSupportTickets`, `getReportRecords`, `containsProfanity`, `getPinnedPostIds`?**
  _High betweenness centrality (0.232) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `app/page.tsx`, `not-found.tsx`, `package.json`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `react` connect `Turnstile.tsx` to `app/page.tsx`, `package.json`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Home` be split into smaller, more focused modules?**
  _Cohesion score 0.08615384615384615 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._