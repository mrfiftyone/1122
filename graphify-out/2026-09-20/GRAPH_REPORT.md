# Graph Report - 1122  (2026-09-20)

## Corpus Check
- 22 files · ~18,113 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .ico 1, .css 1)

## Summary
- 197 nodes · 283 edges · 21 communities (15 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app/page.tsx
- Home
- package.json
- compilerOptions
- next
- dependencies
- devDependencies
- handleAuth
- setNotifications
- README.md
- normalizeTeacherName
- feedAlgorithm.ts
- AGENTS.md
- postcss.config.mjs
- vercel.json
- castVote
- Turnstile.tsx
- containsProfanity
- getReportRecords

## God Nodes (most connected - your core abstractions)
1. `Home()` - 52 edges
2. `compilerOptions` - 16 edges
3. `setNotifications()` - 9 edges
4. `getNotifications()` - 8 edges
5. `next` - 6 edges
6. `castVote()` - 6 edges
7. `submitReport()` - 6 edges
8. `containsProfanity()` - 6 edges
9. `scripts` - 5 edges
10. `handleAuth()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Home()` --calls--> `containsProfanity()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts
- `Home()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts
- `Home()` --calls--> `getRelativeTime()`  [EXTRACTED]
  src/app/page.tsx → src/utils/time.ts
- `submitPost()` --calls--> `containsProfanity()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts
- `submitTeacher()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts

## Import Cycles
- None detected.

## Communities (21 total, 6 thin omitted)

### Community 0 - "app/page.tsx"
Cohesion: 0.07
Nodes (38): AVATAR_COLORS, Comment, GOVERNORATES, GRADE_OPTIONS, GRADES, NotificationItem, Post, Profile (+30 more)

### Community 1 - "Home"
Cohesion: 0.12
Nodes (12): getPosts(), getSession(), getTeachers(), Home(), compressImage(), handleTeacherImageUpload(), openReportModal(), reportComment() (+4 more)

### Community 2 - "package.json"
Cohesion: 0.08
Nodes (24): eslintConfig, name, private, scripts, build, dev, lint, start (+16 more)

### Community 3 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 4 - "next"
Cohesion: 0.18
Nodes (6): nextConfig, next, src_app_globals, cairo, metadata, ProfileProps

### Community 5 - "dependencies"
Cohesion: 0.22
Nodes (9): dependencies, clsx, lucide-react, next, react, react-dom, @supabase/ssr, @supabase/supabase-js (+1 more)

### Community 6 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 7 - "handleAuth"
Cohesion: 0.50
Nodes (5): getProfiles(), handleAuth(), saveProfile(), setProfiles(), setUsers()

### Community 8 - "setNotifications"
Cohesion: 0.31
Nodes (9): getNotifications(), getUsers(), approveTeacher(), getWordCount(), markAllNotifsRead(), rejectTeacher(), sendAdminWarning(), submitReport() (+1 more)

### Community 9 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 10 - "normalizeTeacherName"
Cohesion: 0.67
Nodes (3): submitTeacher(), checkIsDuplicate(), normalizeTeacherName()

### Community 17 - "castVote"
Cohesion: 0.29
Nodes (8): getVotes(), castVote(), getUserVote(), submitTeacherReview(), voteComment(), votePost(), voteTeacher(), setVotes()

### Community 18 - "Turnstile.tsx"
Cohesion: 0.40
Nodes (4): react, Turnstile(), TurnstileProps, Window

### Community 19 - "containsProfanity"
Cohesion: 0.40
Nodes (4): addComment(), submitPost(), BLOCKED_WORDS, containsProfanity()

### Community 20 - "getReportRecords"
Cohesion: 0.40
Nodes (5): adminDeleteReportedItem(), deletePost(), dismissReport(), getReportRecords(), saveReportRecord()

## Knowledge Gaps
- **80 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 101 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Home()` connect `Home` to `app/page.tsx`, `handleAuth`, `setNotifications`, `normalizeTeacherName`, `castVote`, `containsProfanity`, `getReportRecords`?**
  _High betweenness centrality (0.212) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `app/page.tsx`, `package.json`?**
  _High betweenness centrality (0.200) - this node is a cross-community bridge._
- **Why does `react` connect `Turnstile.tsx` to `app/page.tsx`, `package.json`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._
- **Should `Home` be split into smaller, more focused modules?**
  _Cohesion score 0.11578947368421053 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._