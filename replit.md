# Journal App - Voice-First Personal Journaling

## Overview

A modern progressive web application focused on voice-first journaling with AI-powered features. The app combines voice recording, real-time transcription, AI chat capabilities, and social sharing features into a mobile-optimized experience inspired by Notion's clean productivity interface and Instagram's media-rich social elements.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Mobile-First Design**: Progressive Web App (PWA) optimized for iOS with bottom navigation

### Component Structure
- **Design System**: Based on shadcn/ui components with custom theming
- **Layout**: Mobile-first with bottom navigation bar (Feed, Record, Search, AI Chat, Profile)
- **Core Components**: 
  - `RecordButton`: Voice recording with real-time audio visualization
  - `JournalEntryCard`: Social media-style entry display with privacy controls
  - `AiChatInterface`: Conversational AI interface for journal insights
  - `BottomNavigation`: iOS-style tab navigation

### Backend Architecture
- **Runtime**: Node.js with Express server
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Development**: Full-stack TypeScript with shared schema definitions
- **Session Management**: PostgreSQL-based session storage for authentication

### Data Models
- **Users**: Profile management with authentication support
- **Journal Entries**: Rich content with title, text, audio, media attachments, and tags
- **Privacy System**: Three-tier privacy model (private, shared with specific users, public)
- **AI Chat**: Message history with references to related journal entries

### Mobile Optimization
- **Progressive Web App**: Installable with native-like experience
- **iOS-Specific**: Safe area handling, status bar styling, and touch-optimized interactions
- **Responsive Design**: Mobile-first approach with desktop compatibility

### Voice & AI Features
- **Voice Recording**: Browser-based audio capture with real-time processing
- **Transcription**: OpenAI Whisper integration for real-time voice-to-text conversion
- **AI Chat**: Conversational interface for exploring journal entries and patterns
- **Audio Visualization**: Real-time waveform display during recording

### Camera, Photo & Video Features
- **Native Camera Access**: Direct device camera integration using Web APIs (getUserMedia)
- **Live Camera Preview**: Real-time video stream with capture functionality
- **Apple Photos Integration**: Seamless access to device photo library including Apple Photos
- **Dual Upload Options**: "Take Photo" (camera) and "Choose from Photos" (library) buttons
- **Smart Camera Selection**: Automatic preference for back camera on mobile devices
- **High-Quality Capture**: 1280x720 resolution with optimized JPEG compression
- **Cross-Platform Support**: Works on iOS, Android, and desktop browsers with graceful fallbacks
- **Video Attachment Support**: Upload and display video files (MP4, WebM, MOV, AVI) alongside photos
- **Shared Media Utilities**: Consistent video/image detection across all components using shared library functions
- **HTML5 Video Player**: Proper video controls, autoplay (muted), and responsive display in modal views

## External Dependencies

### Core Framework Dependencies
- **React Ecosystem**: React 18, TypeScript, Vite for modern development experience
- **UI Components**: Radix UI primitives with shadcn/ui styling system
- **Database**: PostgreSQL with Neon serverless, Drizzle ORM for type safety
- **State Management**: TanStack Query for server state and caching

### Styling & Design
- **CSS Framework**: Tailwind CSS with custom design tokens
- **Component Library**: shadcn/ui for consistent, accessible components
- **Typography**: Inter font via Google Fonts CDN
- **Icons**: Lucide React for consistent iconography

### Development Tools
- **Build System**: Vite with TypeScript compilation and hot reload
- **Database Migrations**: Drizzle Kit for schema management
- **Development Server**: Express with Vite integration for full-stack development

### Authentication System
- **Web Authentication**: Session-based OAuth using Replit Auth with cookie storage
- **Mobile Authentication**: Token-based OAuth using Authorization Code Flow with PKCE
  - **OAuth Plugin**: @capacitor-community/generic-oauth2 for native OAuth handling
  - **Token Storage**: Secure storage using capacitor-secure-storage-plugin
  - **Token Validation**: Backend JWT validation using jose library with JWKS endpoint
  - **User Sync**: Automatic user upsert on first token authentication
  - **URL Scheme**: `com.voicejournal.app://oauth-callback` for iOS/Android redirect handling
  
### Implementation Details
- **Backend**: Dual authentication support via `authenticateEither` middleware
  - Session auth: Uses OpenID Connect client with automatic token refresh
  - Token auth: Validates JWT ID tokens with Replit's JWKS endpoint
- **Frontend**: Platform-aware authentication
  - Web: Redirects to `/api/login` for session-based OAuth
  - Mobile: Uses OAuth plugin to open system browser, captures tokens via URL scheme
- **API Client**: Automatically attaches Bearer tokens for mobile requests
  - Detects Capacitor environment via `window.location.protocol`
  - Retrieves tokens from secure storage for each API call

### Planned Integrations
- **AI Transcription**: Distil-Whisper or similar for voice-to-text conversion
- **Push Notifications**: For journaling reminders and social interactions

### Recent Implementation: Video Support
- **Status**: Basic video attachment functionality completed (Sept 2025)
- **Current Capabilities**: Upload video files via ObjectUploader, display videos in MediaModal and entry contexts
- **Components Updated**: ObjectUploader, Record page, RecordDialog, PublicEntry page, MediaModal (PhotoModal)
- **File Types Supported**: MP4, WebM, MOV, AVI with 50MB size limit (vs 10MB for images)
- **Known Limitations**: Video detection relies on file extensions; may not work reliably with opaque object storage URLs

### Recommended Architectural Improvements for Production
1. **MIME Type Storage**: Extend database schema to store media MIME types alongside URLs for reliable video detection
2. **Backend Enhancement**: Update upload endpoints to persist and return MIME types with media objects
3. **Component Migration**: Update all media display components to use stored MIME types instead of URL-based heuristics
4. **Complete Adoption**: Audit and update remaining components (JournalEntryCard, etc.) to use shared media utilities
5. **Comprehensive Testing**: Add automated tests for video upload/display with opaque URLs

### Hosting & Infrastructure
- **Database**: Neon PostgreSQL for serverless database hosting
- **Session Storage**: Database-backed sessions with connect-pg-simple
- **Static Assets**: Vite build output for optimized client-side delivery