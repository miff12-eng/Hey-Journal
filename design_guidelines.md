# Journal App Design Guidelines

## Design Decision Framework

**Approach**: Reference-Based Design inspired by **Notion** and **Instagram**
- **Rationale**: Combining Notion's clean productivity interface with Instagram's media-rich social elements
- **Key Principles**: Content-first design, seamless audio recording experience, intuitive media sharing

## Core Design Elements

### A. Color Palette
**Light Mode:**
- Primary: 220 15% 20% (Deep blue-gray for trust and focus)
- Surface: 0 0% 98% (Warm white backgrounds)
- Accent: 142 70% 45% (Gentle green for recording states)
- Text: 220 15% 25% (High contrast readable text)

**Dark Mode:**
- Primary: 220 15% 85% (Light blue-gray)
- Surface: 220 15% 8% (Deep blue-black backgrounds)
- Accent: 142 60% 55% (Softer green for dark environments)
- Text: 220 15% 90% (Light readable text)

### B. Typography
**Primary Font**: Inter (via Google Fonts CDN)
- Headings: Inter 600-700 (semibold to bold)
- Body: Inter 400-500 (regular to medium)
- UI Elements: Inter 500 (medium)

**Sizes**: Tailwind's text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl

### C. Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, and 8
- Tight spacing: p-2, m-2
- Standard spacing: p-4, m-4, gap-4
- Section spacing: p-6, m-6
- Large spacing: p-8, m-8

### D. Component Library

**Navigation**
- Bottom tab bar for iOS (5 tabs: Record, Feed, Search, Profile, Settings)
- Clean icons with subtle color fills on active states
- Safe area padding for iOS devices

**Core Recording Interface**
- Large circular record button (80px diameter) with pulsing animation during recording
- Waveform visualization using subtle accent colors
- Floating transcription overlay with real-time text updates
- Quick action buttons for photo/video attachment

**Content Cards**
- Instagram-inspired entry cards with rounded corners (rounded-xl)
- Photo/video media with aspect ratio preservation
- Expandable transcription text with "Read more" functionality
- Privacy indicators with clear iconography

**Forms & Inputs**
- Notion-style inline editing for transcriptions
- Tag suggestions dropdown with @ symbol trigger
- Privacy toggle switches with clear visual states
- Rich text editor toolbar with essential formatting

**AI Chat Interface**
- Chat bubble design with message threading
- Entry preview cards when referencing specific journal entries
- Voice input option for chat queries

### E. Mobile-First Optimizations

**Touch Targets**
- Minimum 44px touch targets for all interactive elements
- Generous padding around buttons and links
- Swipe gestures for entry actions (archive, share, delete)

**iOS Integration**
- PWA manifest for home screen installation
- iOS Safari viewport meta tags
- Native-feeling transitions using transform and opacity
- Haptic feedback simulation through micro-animations

**Performance**
- Lazy loading for media content
- Infinite scroll with pagination
- Offline-first data caching strategy

## Images Section

**Profile Avatars**: 40px circular user photos throughout the interface
**Entry Media**: Full-width images/videos with 16:9 aspect ratio preservation and rounded corners
**Recording Visualization**: Dynamic waveform SVG graphics with real-time amplitude updates
**Empty States**: Minimal line-art illustrations for empty journal feed, no entries, etc.

**No Large Hero Image**: The app focuses on content creation and browsing rather than marketing presentation.

## Accessibility & Dark Mode

- Consistent dark mode implementation across all components including form inputs
- WCAG AA contrast ratios maintained in both light and dark modes
- Voice-over friendly labels for all interactive elements
- Reduced motion preferences respected for animations
- Large text support with scalable typography