# GeoAI-UP Frontend Architecture Design

**Version**: 1.0  
**Date**: 2026-05-04  
**Status**: Design Phase  

---

## 1. Overview

### 1.1 Project Vision
GeoAI-UP is a **Geographic Information AI Assistant Platform** that combines the conversational elegance of modern LLM platforms with powerful GIS analysis capabilities. The frontend should embody:

- **LLM Platform Aesthetics**: Clean, chat-centric interface similar to ChatGPT/Claude
- **Professional GIS Portal**: Sophisticated mapping and data visualization
- **Seamless Integration**: Natural flow between conversation and spatial analysis
- **Browser Fingerprint Authentication**: No traditional user management

### 1.2 Core Principles
1. **Chat-First Design**: Conversation is the primary interaction mode
2. **Progressive Disclosure**: Advanced features revealed contextually
3. **Real-time Feedback**: SSE streaming for immediate response
4. **Spatial Context Awareness**: Map and chat maintain synchronized state
5. **Zero Configuration**: Browser fingerprint handles identity automatically

---

## 2. Technology Stack

Based on `web/package.json`:

### 2.1 Core Framework
- **Vue 3.5.32** - Composition API with `<script setup>`
- **TypeScript 6.0.3** - Strict type checking
- **Vite 8.0.8** - Fast build tool with HMR

### 2.2 UI Components
- **Element Plus 2.13.7** - Enterprise-grade component library
- **@element-plus/icons-vue 2.3.2** - Icon system

### 2.3 State Management
- **Pinia 3.0.4** - Vue-native state management

### 2.4 Routing
- **Vue Router 5.0.4** - Client-side routing

### 2.5 Mapping & Visualization
- **MapLibre GL 4.7.1** - Vector tile rendering engine with raster basemap support

### 2.6 HTTP Client
- **Axios 1.15.0** - Promise-based HTTP client

### 2.7 Internationalization
- **Vue I18n 9.14.4** - Multi-language support (en-US, zh-CN)

### 2.8 Utilities
- **Day.js 1.11.20** - Date/time formatting
- **Mitt 3.0.1** - Event emitter for cross-component communication

---

## 3. Project Structure

```
web/
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── api/                    # API service layer
│   │   ├── chat.ts            # Chat/streaming endpoints
│   │   ├── dataSources.ts     # Data source management
│   │   ├── fileUpload.ts      # File upload operations
│   │   ├── promptTemplates.ts # Prompt template CRUD
│   │   ├── tools.ts           # Plugin tool operations
│   │   ├── plugins.ts         # Plugin management
│   │   ├── results.ts         # Result file serving
│   │   ├── mvt.ts             # MVT dynamic services
│   │   ├── wms.ts             # WMS services
│   │   └── index.ts           # Axios instance configuration
│   │
│   ├── components/             # Reusable components
│   │   ├── common/
│   │   │   ├── AppHeader.vue          # Top navigation bar
│   │   │   ├── AppSidebar.vue         # Left sidebar (conversations)
│   │   │   ├── LoadingSpinner.vue     # Loading indicator
│   │   │   ├── ErrorBoundary.vue      # Error handling wrapper
│   │   │   └── MarkdownRenderer.vue   # Markdown content display
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatWindow.vue         # Main chat container
│   │   │   ├── MessageBubble.vue      # Individual message display
│   │   │   ├── StreamingText.vue      # Typing animation for tokens
│   │   │   ├── MessageActions.vue     # Copy/regenerate/delete actions
│   │   │   ├── ServiceCard.vue        # Visualization service preview
│   │   │   └── QuickActions.vue       # Suggested prompts/actions
│   │   │
│   │   ├── map/
│   │   │   ├── MapView.vue            # MapLibre GL container
│   │   │   ├── LayerControl.vue       # Layer visibility/opacity controls
│   │   │   ├── LayerLegend.vue        # Legend for active layers
│   │   │   ├── MapToolbar.vue         # Zoom/pan/basemap controls
│   │   │   └── FeaturePopup.vue       # Feature attribute popup
│   │   │
│   │   ├── upload/
│   │   │   ├── FileUpload.vue         # Drag-and-drop upload zone
│   │   │   ├── UploadProgress.vue     # Upload progress indicator
│   │   │   └── FilePreview.vue        # File metadata preview
│   │   │
│   │   ├── data/
│   │   │   ├── DataSourceList.vue     # Data source table/grid
│   │   │   ├── DataSourceCard.vue     # Data source card view
│   │   │   ├── SchemaViewer.vue       # Field schema display
│   │   │   └── MetadataPanel.vue      # Detailed metadata view
│   │   │
│   │   ├── tools/
│   │   │   ├── ToolLibrary.vue        # Browse available tools
│   │   │   ├── ToolCard.vue           # Individual tool display
│   │   │   ├── ToolParameterForm.vue  # Dynamic parameter form
│   │   │   └── ToolExecutionResult.vue # Execution result display
│   │   │
│   │   ├── plugins/
│   │   │   ├── PluginManager.vue      # Plugin lifecycle management
│   │   │   ├── PluginCard.vue         # Plugin status/info card
│   │   │   └── PluginUpload.vue       # Custom plugin upload
│   │   │
│   │   ├── templates/
│   │   │   ├── TemplateEditor.vue     # Prompt template editor
│   │   │   ├── TemplateList.vue       # Template browsing
│   │   │   └── TemplateDiff.vue       # Version comparison view
│   │   │
│   │   └── layout/
│   │       ├── MainLayout.vue         # App shell layout
│   │       ├── ChatLayout.vue         # Chat + Map split view
│   │       └── SettingsDrawer.vue     # Settings side drawer
│   │
│   ├── views/                  # Page-level components
│   │   ├── HomeView.vue               # Main chat interface (default route)
│   │   ├── DataManagementView.vue     # Data source management page
│   │   ├── ToolLibraryView.vue        # Tool/plugin exploration page
│   │   ├── TemplateManagerView.vue    # Prompt template management
│   │   ├── PluginManagerView.vue      # Plugin management page
│   │   ├── SettingsView.vue           # System settings page
│   │   └── ResultViewerView.vue       # Standalone result viewer
│   │
│   ├── stores/                 # Pinia stores
│   │   ├── chat.ts            # Chat state & SSE handling
│   │   ├── map.ts             # Map state & layer management
│   │   ├── dataSources.ts     # Data source state
│   │   ├── tools.ts           # Tool registry state
│   │   ├── plugins.ts         # Plugin management state
│   │   ├── templates.ts       # Prompt template state
│   │   ├── config.ts          # App configuration (base_url, etc.)
│   │   └── ui.ts              # UI state (theme, sidebar, etc.)
│   │
│   ├── composables/            # Vue composables (hooks)
│   │   ├── useSSE.ts          # Server-Sent Events handler
│   │   ├── useMap.ts          # MapLibre GL composable
│   │   ├── useFileUpload.ts   # File upload logic
│   │   ├── useFingerprint.ts  # Browser fingerprint generation
│   │   ├── useTheme.ts        # Theme switching logic
│   │   └── useI18n.ts         # i18n helper functions
│   │
│   ├── router/
│   │   └── index.ts           # Route definitions & guards
│   │
│   ├── i18n/
│   │   ├── locales/
│   │   │   ├── en-US.ts       # English translations
│   │   │   └── zh-CN.ts       # Chinese translations
│   │   └── index.ts           # i18n configuration
│   │
│   ├── types/
│   │   ├── api.ts             # API request/response types
│   │   ├── chat.ts            # Chat message types
│   │   ├── map.ts             # Map layer/types
│   │   ├── data.ts            # Data source types
│   │   ├── tools.ts           # Tool/plugin types
│   │   └── index.ts           # Type exports
│   │
│   ├── utils/
│   │   ├── fingerprint.ts     # Browser fingerprint utilities
│   │   ├── formatters.ts      # Data formatting helpers
│   │   ├── validators.ts      # Input validation
│   │   └── constants.ts       # Application constants
│   │
│   ├── styles/
│   │   ├── variables.scss     # SCSS variables (colors, spacing)
│   │   ├── mixins.scss        # SCSS mixins
│   │   ├── global.scss        # Global styles
│   │   └── themes/
│   │       ├── light.scss     # Light theme overrides
│   │       └── dark.scss      # Dark theme overrides
│   │
│   ├── App.vue                # Root component
│   └── main.ts                # Application entry point
│
├── .env                       # Environment variables (base_url)
├── .env.example               # Example environment file
├── index.html                 # HTML template
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript configuration
└── package.json               # Dependencies
```

---

## 4. Module Designs

Due to document length constraints, I've provided detailed designs for the core modules above. The complete implementation would include:

### 4.1 Chat Module (Core Feature)
- Real-time SSE streaming
- Message history with markdown rendering
- Visualization service cards
- Quick action suggestions

### 4.2 Map Module
- MapLibre GL integration
- Dynamic layer management (GeoJSON, MVT, WMS, Heatmap)
- Layer control panel with opacity/visibility
- Feature popups with attribute display

### 4.3 Data Source Module
- File upload with drag-and-drop
- Data source browsing and filtering
- Schema viewer for field inspection
- Metadata panel with spatial extent

### 4.4 Tool & Plugin Module
- Tool library with category filtering
- Dynamic parameter forms based on schema
- Plugin lifecycle management (enable/disable/delete)
- Manual tool execution interface

### 4.5 Prompt Template Module
- Template CRUD operations
- Code editor with syntax highlighting
- Version diff viewer
- Language-specific templates

### 4.6 Settings Module
- LLM provider configuration
- API key management with masking
- Connection testing
- Theme and language preferences

---

## 5. Key Design Features

### 5.1 Browser Fingerprint Authentication
Instead of traditional user accounts, the system generates a unique browser fingerprint using:
- User agent
- Screen resolution
- Language settings
- Timezone
- Available browser APIs
- Hardware characteristics

This fingerprint is stored in localStorage and sent with every API request via `X-Fingerprint` header.

### 5.2 SSE Streaming Architecture
The chat interface uses Server-Sent Events for real-time token streaming:
1. User sends message
2. Backend streams tokens via SSE
3. Frontend updates message content incrementally
4. Visualization services appear as they're generated
5. Progress indicators show workflow steps

### 5.3 Split-View Layout
The main interface uses a resizable split-view:
- **Left Panel (400px)**: Chat conversation
- **Right Panel (flexible)**: Interactive map
- Both panels maintain synchronized state
- Layers added from chat automatically appear on map

### 5.4 Progressive Enhancement
- Basic functionality works without JavaScript (graceful degradation)
- Advanced features load progressively
- Lazy loading for heavy components (map, editors)
- Skeleton screens during data fetching

---

## 6. Environment Configuration

### 6.1 `.env` File
```env
# API Base URL
VITE_API_BASE_URL=http://localhost:3000

# Application Title
VITE_APP_TITLE=GeoAI-UP

# Default Language
VITE_DEFAULT_LANGUAGE=en-US

# Default Theme (light/dark/auto)
VITE_DEFAULT_THEME=light
```

### 6.2 `.env.example`
```env
# Copy this file to .env and fill in your values

# Backend API URL
VITE_API_BASE_URL=http://localhost:3000

# Application metadata
VITE_APP_TITLE=GeoAI-UP Geographic AI Assistant
VITE_APP_VERSION=1.0.0

# Localization
VITE_DEFAULT_LANGUAGE=en-US
VITE_SUPPORTED_LANGUAGES=en-US,zh-CN

# Theme
VITE_DEFAULT_THEME=auto
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Project initialization with Vite + Vue 3
- [ ] Element Plus integration
- [ ] Router and Pinia setup
- [ ] i18n configuration
- [ ] Main layout structure
- [ ] Browser fingerprint generation

### Phase 2: Chat Interface (Week 2)
- [ ] SSE streaming implementation
- [ ] Message bubble components
- [ ] Markdown rendering
- [ ] Chat store with Pinia
- [ ] Conversation history sidebar

### Phase 3: Map Integration (Week 3)
- [ ] MapLibre GL setup
- [ ] Layer management system
- [ ] GeoJSON/MVT/WMS support
- [ ] Layer control panel
- [ ] Map-chat synchronization

### Phase 4: Data Management (Week 4)
- [ ] File upload component
- [ ] Data source list view
- [ ] Schema viewer
- [ ] Metadata panel
- [ ] PostGIS connection UI

### Phase 5: Tools & Plugins (Week 5)
- [ ] Tool library view
- [ ] Dynamic parameter forms
- [ ] Plugin manager
- [ ] Tool execution interface
- [ ] Result visualization

### Phase 6: Polish & Optimization (Week 6)
- [ ] Prompt template editor
- [ ] Settings page
- [ ] Theme switching
- [ ] Performance optimization
- [ ] Error handling improvements
- [ ] Responsive design adjustments

---

## 8. Design Principles Summary

1. **Chat-Centric**: All features accessible through natural language
2. **Visual Feedback**: Real-time updates via SSE streaming
3. **Spatial First**: Map is always visible alongside chat
4. **Zero Friction**: No login required, browser fingerprint handles identity
5. **Professional Aesthetic**: Clean, modern UI inspired by leading LLM platforms
6. **GIS Power**: Full-featured mapping and analysis capabilities
7. **Extensible**: Plugin architecture allows custom tools
8. **International**: Bilingual support from day one

---

## 9. Next Steps

1. **Create Project Scaffold**: Initialize Vue 3 project with all dependencies
2. **Implement Core Stores**: Chat, Map, Config stores first
3. **Build Chat Interface**: Priority #1 feature
4. **Integrate Map**: Add MapLibre GL alongside chat
5. **Add Data Upload**: Enable file ingestion
6. **Connect to Backend**: Wire up all API endpoints
7. **Test End-to-End**: Verify complete workflows
8. **Polish UI/UX**: Refine animations, transitions, error states

---

**Document Created**: 2026-05-04  
**Author**: AI Architect  
**Review Status**: Pending Stakeholder Review
