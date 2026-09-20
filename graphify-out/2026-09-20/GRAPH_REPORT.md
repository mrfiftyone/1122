# Graph Report - 1122  (2026-09-20)

## Corpus Check
- 22 files · ~15,342 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .ico 1, .css 1)

## Summary
- 187 nodes · 258 edges · 17 communities (11 shown, 6 thin omitted)
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
- Turnstile.tsx
- README.md
- normalizeTeacherName
- feedAlgorithm.ts
- AGENTS.md
- postcss.config.mjs
- vercel.json

## God Nodes (most connected - your core abstractions)
1. `Home()` - 43 edges
2. `compilerOptions` - 16 edges
3. `next` - 6 edges
4. `setNotifications()` - 6 edges
5. `castVote()` - 6 edges
6. `containsProfanity()` - 6 edges
7. `scripts` - 5 edges
8. `getNotifications()` - 5 edges
9. `handleAuth()` - 5 edges
10. `normalizeTeacherName()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Home()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts
- `Home()` --calls--> `getRelativeTime()`  [EXTRACTED]
  src/app/page.tsx → src/utils/time.ts
- `submitPost()` --calls--> `containsProfanity()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts
- `submitTeacher()` --calls--> `normalizeTeacherName()`  [EXTRACTED]
  src/app/page.tsx → src/utils/normalization.ts
- `Home()` --calls--> `containsProfanity()`  [EXTRACTED]
  src/app/page.tsx → src/utils/moderation.ts

## Import Cycles
- None detected.

## Communities (17 total, 6 thin omitted)

### Community 0 - "app/page.tsx"
Cohesion: 0.08
Nodes (37): AVATAR_COLORS, Comment, GOVERNORATES, GRADE_OPTIONS, GRADES, NotificationItem, Post, Profile (+29 more)

### Community 1 - "Home"
Cohesion: 0.08
Nodes (26): getNotifications(), getPosts(), getSession(), getTeachers(), getVotes(), Home(), addComment(), approveTeacher() (+18 more)

### Community 2 - "package.json"
Cohesion: 0.08
Nodes (24): eslintConfig, name, private, scripts, build, dev, lint, start (+16 more)

### Community 3 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 4 - "next"
Cohesion: 0.17
Nodes (7): nextConfig, next, src_app_globals, cairo, metadata, ProfileProps, revalidate

### Community 5 - "dependencies"
Cohesion: 0.22
Nodes (9): dependencies, clsx, lucide-react, next, react, react-dom, @supabase/ssr, @supabase/supabase-js (+1 more)

### Community 6 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 7 - "handleAuth"
Cohesion: 0.40
Nodes (6): getProfiles(), getUsers(), handleAuth(), saveProfile(), setProfiles(), setUsers()

### Community 8 - "Turnstile.tsx"
Cohesion: 0.40
Nodes (4): react, Turnstile(), TurnstileProps, Window

### Community 9 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 10 - "normalizeTeacherName"
Cohesion: 0.67
Nodes (3): submitTeacher(), checkIsDuplicate(), normalizeTeacherName()

## Knowledge Gaps
- **80 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 102 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `app/page.tsx`, `package.json`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **Why does `Home()` connect `Home` to `app/page.tsx`, `normalizeTeacherName`, `handleAuth`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `react` connect `Turnstile.tsx` to `app/page.tsx`, `package.json`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07751937984496124 - nodes in this community are weakly interconnected._
- **Should `Home` be split into smaller, more focused modules?**
  _Cohesion score 0.08258258258258258 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._