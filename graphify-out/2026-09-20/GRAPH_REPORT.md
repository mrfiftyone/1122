# Graph Report - 1122  (2026-09-20)

## Corpus Check
- 23 files · ~33,813 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .ico 1, .css 1)

## Summary
- 277 nodes · 472 edges · 20 communities (13 shown, 7 thin omitted)
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
- addAuditLog
- toggleBookmark
- README.md
- devDependencies
- feedAlgorithm.ts
- AGENTS.md
- postcss.config.mjs
- vercel.json
- not-found.tsx
- i18n.ts
- time.ts

## God Nodes (most connected - your core abstractions)
1. `Home()` - 86 edges
2. `addAuditLog()` - 18 edges
3. `compilerOptions` - 16 edges
4. `exportPlatformBackup()` - 12 edges
5. `setNotifications()` - 10 edges
6. `getNotifications()` - 9 edges
7. `getUsers()` - 8 edges
8. `sendNotificationToUser()` - 8 edges
9. `handleMuteUser()` - 8 edges
10. `next` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Home()` --calls--> `getT()`  [EXTRACTED]
  src/app/page.tsx → src/utils/i18n.ts
- `Home()` --calls--> `getRelativeTime()`  [EXTRACTED]
  src/app/page.tsx → src/utils/time.ts
- `submitTeacher()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts
- `Home()` --calls--> `containsProfanity()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts
- `Home()` --calls--> `getBlockedWordsList()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts

## Import Cycles
- None detected.

## Communities (20 total, 7 thin omitted)

### Community 0 - "app/page.tsx"
Cohesion: 0.06
Nodes (32): AuditLogItem, AVATAR_COLORS, BookmarkItem, Comment, GOVERNORATES, GRADE_OPTIONS, GRADES, NotificationItem (+24 more)

### Community 1 - "Home"
Cohesion: 0.05
Nodes (52): getNotifications(), getPinnedPostIds(), getProfiles(), getSession(), getSupportTickets(), getVotes(), Home(), addComment() (+44 more)

### Community 2 - "package.json"
Cohesion: 0.06
Nodes (28): eslintConfig, name, private, scripts, build, dev, lint, start (+20 more)

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
Cohesion: 0.06
Nodes (33): IconActivity(), IconAlertTriangle(), IconAward(), IconBolt(), IconChevronDown(), IconChevronUp(), IconComment(), IconCrown() (+25 more)

### Community 7 - "addAuditLog"
Cohesion: 0.11
Nodes (31): getAuditLogs(), getCustomBannedWords(), getMutedUsers(), getPlatformSettings(), getPosts(), getSiteAnnouncement(), getTeachers(), getUsers() (+23 more)

### Community 8 - "toggleBookmark"
Cohesion: 0.67
Nodes (3): getBookmarks(), toggleBookmark(), setBookmarks()

### Community 9 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 10 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 17 - "not-found.tsx"
Cohesion: 0.33
Nodes (4): IconArrowRight(), IconBook(), IconHome(), IconShield()

### Community 19 - "i18n.ts"
Cohesion: 0.40
Nodes (4): getT(), Language, T_DICT, TranslationDict

## Knowledge Gaps
- **90 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+85 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 113 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Home()` connect `Home` to `app/page.tsx`, `addAuditLog`, `toggleBookmark`, `i18n.ts`, `time.ts`?**
  _High betweenness centrality (0.237) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `app/page.tsx`, `not-found.tsx`, `package.json`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **Why does `react` connect `package.json` to `app/page.tsx`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _90 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `Home` be split into smaller, more focused modules?**
  _Cohesion score 0.05336538461538461 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._