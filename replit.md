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
- **Transcription**: Placeholder for AI transcription integration (Distil-Whisper recommended)
- **AI Chat**: Conversational interface for exploring journal entries and patterns
- **Audio Visualization**: Real-time waveform display during recording

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

### Planned Integrations
- **AI Transcription**: Distil-Whisper or similar for voice-to-text conversion
- **Authentication**: Session-based authentication (structure in place)
- **File Storage**: Media attachment handling for photos/videos
- **Push Notifications**: For journaling reminders and social interactions

### Hosting & Infrastructure
- **Database**: Neon PostgreSQL for serverless database hosting
- **Session Storage**: Database-backed sessions with connect-pg-simple
- **Static Assets**: Vite build output for optimized client-side delivery