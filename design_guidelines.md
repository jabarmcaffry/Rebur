# Design Guidelines: Python Game Engine Platform

## Design Approach

**Selected Framework:** Design System Approach - Material Design Dark with Game Engine Conventions

**Rationale:** Professional game development tools (Unity, Godot, Roblox Studio) universally adopt dark interfaces to reduce eye strain during extended editing sessions and improve focus on game content. This platform requires a sophisticated, utility-focused design that prioritizes workflow efficiency while maintaining visual clarity.

**Key References:** Roblox Studio (primary), Unity Editor, VS Code, Replit IDE

**Design Principles:**
- Dark-first interface for extended editing comfort
- Clear workspace hierarchy (editor > properties > assets)
- Consistent component library across all tools
- Performance-oriented interactions (minimal animations)
- Professional, confidence-inspiring aesthetics

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary):**
- Background Primary: 220 15% 12% (editor workspace)
- Background Secondary: 220 15% 8% (panels, sidebars)
- Background Tertiary: 220 15% 16% (cards, elevated elements)
- Surface: 220 15% 20% (toolbar, headers)
- Border: 220 10% 25% (subtle divisions)

**Brand Colors:**
- Primary: 210 100% 55% (electric blue - actions, highlights)
- Primary Hover: 210 100% 60%
- Success: 145 65% 50% (green - publishing, play)
- Warning: 35 95% 60% (amber - testing, caution)
- Danger: 0 75% 55% (red - delete, stop)

**Text:**
- Primary: 0 0% 95% (high contrast)
- Secondary: 0 0% 70% (labels, descriptions)
- Muted: 0 0% 50% (disabled, tertiary info)

**Light Mode (Marketing/Landing):**
- Background: 0 0% 98%
- Text: 220 15% 15%
- Maintain same brand color values

### B. Typography

**Font Stack:**
- Primary: 'Inter' (Google Fonts) - UI, labels, content
- Code: 'JetBrains Mono' (Google Fonts) - Python editor, console
- Display: 'Inter' weight 700 - headings, hero

**Scale:**
- Hero Display: text-6xl (60px) font-bold
- Page Headers: text-3xl (30px) font-semibold
- Section Headers: text-xl (20px) font-semibold
- Body: text-base (16px) font-normal
- Labels: text-sm (14px) font-medium
- Captions: text-xs (12px) font-normal
- Code: text-sm (14px) font-mono

### C. Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16 for consistency
- Component padding: p-4, p-6
- Section spacing: gap-8, gap-12
- Panel margins: m-4, m-6
- Tight groupings: gap-2, gap-4

**Grid System:**
- Editor Layout: Fixed sidebar (256px) + flexible content area
- Dashboard: max-w-7xl container with grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Asset Grid: grid-cols-2 md:grid-cols-4 lg:grid-cols-6

### D. Component Library

**Navigation (Top Bar):**
- Height: h-14 (56px)
- Background: Surface color with border-b
- Logo + Product Name (left)
- User avatar + notifications (right)
- Dropdown menus for File, Edit, View, Tools

**Editor Workspace:**
- Three-panel layout: Hierarchy (left 240px) | Viewport (flex-1) | Properties (right 280px)
- Resizable panels with drag handles
- Collapsible sidebars for focus mode
- Viewport: Canvas with grid overlay, camera controls floating top-right
- Bottom dock: Console/Output (h-48, collapsible)

**Toolbox/Asset Library:**
- Tabbed interface: Models, Audio, Scripts, Plugins
- Search bar with filters (2D/3D, category)
- Grid cards: 120x120px thumbnails with title below
- Preview on hover with quick actions (Insert, Favorite)

**Dashboard Cards:**
- Project cards: 4:3 aspect ratio thumbnail
- Title, last edited timestamp
- Action buttons: Play, Edit, Settings (icon-only)
- Hover: Lift effect (shadow-lg), show additional stats

**Game Page (Published):**
- Hero: Full-width game thumbnail (16:9)
- Play button: Large, centered, Success color
- Left sidebar: Game description, creator info, stats
- Right sidebar: Recommended games

**Python Code Editor:**
- Syntax highlighting with dark theme
- Line numbers, minimap (right)
- Autocomplete dropdown with documentation
- Toolbar: Run, Debug, Save icons

**Forms & Inputs:**
- Background: Background Tertiary
- Border: Border color, focus:border-Primary
- Height: h-10 for text inputs
- Labels: text-sm font-medium mb-2

**Buttons:**
- Primary: bg-Primary hover:bg-Primary-Hover text-white h-10 px-6 rounded-md
- Secondary: bg-Surface border border-Border hover:bg-Background-Tertiary
- Danger: bg-Danger hover:bg-red-600
- Icon buttons: p-2 rounded hover:bg-Background-Tertiary

**Modals:**
- Overlay: backdrop-blur-sm bg-black/50
- Content: max-w-2xl rounded-lg bg-Background-Secondary p-6
- Header with close button, scrollable body, action footer

**Data Tables:**
- Striped rows with Background-Secondary/Tertiary alternation
- Sortable headers with icons
- Checkbox selection for bulk actions
- Hover: subtle bg-Background-Tertiary highlight

### E. Animations

**Minimal Movement Philosophy:**
- Hover states: 150ms ease-in-out (opacity, background only)
- Panel open/close: 200ms ease-out
- No parallax, no scroll-triggered animations
- Loading states: Simple spinner or progress bar
- Focus: Fast, subtle transitions (100ms)

## Page-Specific Guidelines

**Landing Page:**
- Hero: Full-width screenshot of editor interface (real product), overlay with h1 "Build Games with Python" + CTA "Start Creating"
- Features: 3-column grid showcasing Editor, Python Scripting, Multiplayer
- Showcase: Gallery of published games (6-8 thumbnails)
- CTA Section: Dark background, centered "Join Thousands of Creators" with signup form

**User Dashboard:**
- Top stats: Games created, plays, followers (3-column cards)
- Tabs: My Games, Published, Drafts, Favorites
- Game grid with infinite scroll
- Create New button: Prominent, top-right, Success color

**Editor Interface:**
- Hierarchy panel: Tree view of game objects (expandable, drag-to-reorder)
- Viewport: 3D/2D scene with transform gizmos, camera controls
- Properties panel: Tabbed (Transform, Script, Appearance)
- Bottom console: Tabs for Output, Errors, Warnings
- Toolbar: Icon buttons for Play, Stop, Camera mode, Snap settings

**Asset Library Modal:**
- Full-screen overlay
- Search + filters header
- Grid of asset cards (infinite scroll)
- Asset detail view (right panel) with Import/Insert buttons

**Game Page:**
- Large hero: Game embed (16:9) with Play overlay
- Info sidebar: Creator card with follow button, genre tags, player count
- Description: Markdown-formatted, collapsible
- Comments section below
- Related games carousel

## Images

**Hero Image:** Yes - Landing page uses full-width hero showcasing actual editor interface
**Placement:**
- Landing hero: Screenshot of 3D game editor with Python code visible
- Dashboard: Game thumbnail previews (generated from games)
- Game pages: Featured game screenshot/video
- Asset library: 3D model previews, icon thumbnails
- Marketing: Screenshots of editor features, example games being built

**Image Treatment:**
- Sharp, high-quality screenshots (no blur unless background)
- Maintain aspect ratios: 16:9 for games, 4:3 for cards
- Dark borders (1px, Border color) around light images
- Loading states: Skeleton loaders matching card dimensions