# GeoAI-UP - Out-of-the-Box GIS Application Agent

<div align="center">


**Intelligent Spatial Analysis Powered by Natural Language**

[![Node.js](https://img.shields.io/badge/node-%5E20.19.0%20%7C%7C%20%3E%3D22.12.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5+-brightgreen.svg)](https://vuejs.org/)
[![LangChain](https://img.shields.io/badge/LangChain-Integrated-orange.svg)](https://langchain.com/)
[![Blog](https://img.shields.io/badge/Blog-CSDN-red.svg)](https://blog.csdn.net/eqmaster)

</div>

---

## 🌟 Overview

**GeoAI-UP** is an **out-of-the-box GIS application agent** that combines Large Language Models (LLMs) with advanced spatial analysis capabilities. Simply describe your geospatial analysis needs in natural language, and the AI agent will intelligently plan, execute, and visualize results.

![首页](./screenshot_eng "screenshot")

> ⚠️ **Project Status**: GeoAI-UP is currently under **active development**. While core features are functional, you may encounter incomplete implementations or bugs as we continue to refine the architecture and expand capabilities. We welcome your feedback and contributions via [Issues](https://gitee.com/rzcgis/geo-ai-universal-platform/issues).

For any issues, please submit an [Issue](https://gitee.com/rzcgis/geo-ai-universal-platform/issues). We will respond uniformly there. No responses will be provided elsewhere. Thank you for your understanding.

### Core Advantages

🎯 **Out-of-the-Box** - No complex configuration, start spatial analysis immediately  
🚀 **MVT + WMS Visualization** - Native support for big data rendering with dynamic tile services  
✨ **Natural Language Interface** - Describe tasks in everyday language, no GIS expertise required  
🤖 **AI-Powered Workflows** - LangGraph-based intelligent task orchestration with intent classification  
📚 **Knowledge Base Integration** - RAG-powered document retrieval for policy and domain knowledge  
🔌 **Extensible Plugins** - Support for custom plugin development  
📊 **Multi-Format Support** - Shapefile, GeoJSON, PostGIS, GeoTIFF  

---

## 🎯 Use Cases

### Scenario 1: Spatial Analysis
> "Create a 500-meter buffer zone around all rivers and calculate the total area"

GeoAI-UP automatically:
- Identifies river data sources
- Executes buffer analysis using Turf.js
- Calculates statistics
- Visualizes results on interactive map

### Scenario 2: Heatmap Generation
> "Show me a heatmap of population density from this point dataset"

The system:
- Analyzes data schema automatically
- Applies Kernel Density Estimation (KDE)
- Generates dynamic MVT tiles
- Renders beautiful heatmap visualization

### Scenario 3: Raster Data Display
> "Display this GeoTIFF satellite imagery on the map"

GeoAI-UP:
- Extracts georeferencing metadata
- Creates WMS service on-the-fly
- Implements efficient tile rendering
- Supports multi-band RGB composites

---

## 🚀 Features

### Intelligent AI Assistant
- **Goal Splitting**: Breaks complex requests into manageable sub-tasks
- **Task Planning**: Generates executable workflows using LangGraph state machines
- **Intent Classification**: Smart routing based on query type (GIS analysis, knowledge query, hybrid, or general chat)
- **Knowledge Base Integration**: RAG-powered document retrieval for policy, regulation, and domain knowledge queries
- **Context Awareness**: Understands data schemas and available plugins
- **Conversational Memory**: Maintains context across multiple interactions
- **Streaming Output**: Real-time token-by-token response generation
- **Auto Report Generation**: Automatically generates comprehensive analysis reports with visualizations and insights

### Comprehensive Spatial Analysis
- **Buffer Analysis**: Create distance-based zones around features
- **Overlay Operations**: Intersection, union, difference operations
- **Statistical Analysis**: Aggregation, filtering, summary calculations
- **Heatmap Generation**: Kernel Density Estimation for point patterns
- **Choropleth Mapping**: Statistical classification and thematic mapping

### Advanced Visualization - MVT + WMS
- **Dynamic MVT Publishing**: On-demand vector tile generation for massive datasets
- **WMS Service Creation**: Real-time raster data serving with efficient caching
- **Big Data Ready**: Native support for large-scale spatial data rendering
- **Multiple Renderers**: Uniform color, categorical, graduated symbols, heatmaps
- **Interactive Maps**: MapLibre GL JS with smooth pan/zoom on millions of features

### Flexible Data Access
- **Shapefile Support**: Full .shp/.dbf/.shx parsing
- **GeoJSON Handling**: Native JSON-based spatial data
- **PostGIS Integration**: Direct PostgreSQL/PostGIS database access
- **GeoTIFF Processing**: Multi-band raster data with coordinate systems
- **Automatic Scanning**: Detects and registers data files on startup

### Extensible Plugin Architecture
- **Custom Plugin Support**: Develop and deploy your own analysis tools
- **Hot Reloading**: Load plugins without server restart
- **Automatic Discovery**: Seamless integration with LangChain tools

### Modern Web Interface
- **Chat Interface**: Conversational interaction with AI assistant
- **Data Management**: Browse, upload, and manage spatial datasets
- **Plugin Manager**: Install, configure, and monitor plugins
- **Template System**: Save and reuse prompt templates
- **Settings Panel**: Configure LLM providers and system preferences

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vue 3)                      │
│  Chat UI | Data Management | Map View | Plugin Manager      │
└───────────────────────┬─────────────────────────────────────┘
                        │ RESTful API + SSE
┌───────────────────────▼─────────────────────────────────────┐
│                   Backend (Express + TypeScript)             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         LLM Interaction Layer (LangChain)          │    │
│  │  Goal Splitter → Task Planner → Executor → Summary │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │        Plugin Orchestration Layer                  │    │
│  │  Tool Wrapper → Executor Registry → Result Handler │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐   │
│  │Data Access   │ │Spatial       │ │Visualization     │   │
│  │Layer         │ │Analysis      │ │Service Layer     │   │
│  └──────────────┘ └──────────────┘ └──────────────────┘   │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│                    Storage Layer                            │
│  File System | SQLite DB | Workspace | Temporary Files     │
└────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Node.js 20.19+ / 22.12+
- Express 5.x with TypeScript
- LangChain & LangGraph for AI workflows
- SQLite (better-sqlite3) for metadata
- PostgreSQL/PostGIS support

**GIS Libraries:**
- GDAL (gdal-async) - Raster processing
- Turf.js - Vector spatial analysis
- Proj4 - Coordinate transformations
- GeoTIFF.js - TIFF image reading
- geojson-vt & vt-pbf - Vector tile generation

**Frontend:**
- Vue 3.5+ with Composition API
- Element Plus UI components
- Pinia for state management
- MapLibre GL JS for maps
- Vue I18n for internationalization

---

## 📦 Installation

### Quick Start

```bash
# Clone repository
git clone https://gitee.com/rzcgis/geo-ai-universal-platform.git
cd geo-ai-universal-platform

# Install dependencies
npm install

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your LLM API key

# Start application
npm run dev:server   # Terminal 1: Backend
npm run dev:web      # Terminal 2: Frontend
```

Access at `http://localhost:5173`

### Standalone Package (Windows)

Create portable package with embedded Node.js runtime:

```bash
npm run package
```

Generated `package/` directory includes:
- Embedded Node.js runtime
- Compiled application
- Startup script (`start.bat`)

Copy to any Windows machine and run `start.bat` - no installation needed!

### Download v2.0 Release

**GeoAI-UP v2.0.0** is now available for download:

- **File**: GeoAI-UP-v2.0.0.zip
- **Download Link**: [Baidu Pan](https://pan.baidu.com/s/1mNR1fsKMkFW8subVFU_9iQ?pwd=xbst)
- **Password**: xbst

This standalone package includes everything you need to get started - just extract and run!

---

## 📖 Usage Guide

### 1. Upload Your Data

Navigate to **Data Management** view and:
- Drag & drop Shapefile (.shp), GeoJSON, or GeoTIFF files
- Files are automatically scanned and registered
- View metadata including extent, CRS, and field schema

### 2. Start a Conversation

Go to **Chat** view and describe your analysis goal:

```
User: "I have a shapefile of cities. Can you show me which ones 
       have population over 1 million?"

AI: I'll help you filter cities by population. Let me first check 
    the data schema...
    
    [Analyzing data source...]
    [Executing filter operation...]
    [Generating visualization...]
    
    Here are the 15 cities with population > 1M:
    [Interactive map displays filtered results]
```

### 3. Explore Results

- **Map View**: Pan, zoom, and click features to see attributes
- **Layer Control**: Toggle visibility and adjust opacity
- **Legend**: Understand color schemes and classifications
- **Download**: Export results as GeoJSON or other formats

### 4. Manage Plugins

Visit **Plugin Manager** to:
- View installed plugins and their status
- Install custom plugins from workspace directory
- Enable/disable specific capabilities
- Monitor plugin execution logs

---

## 🔌 Custom Plugins

GeoAI-UP supports custom plugin development. Create your own analysis tools by implementing the plugin interface and placing them in the `workspace/plugins/` directory. Plugins are automatically discovered and registered on startup.

---

## 📁 Project Structure

```
geoai-up/
├── server/                 # Backend application (Express + TypeScript)
├── web/                    # Frontend application (Vue 3)
├── docs/                   # Documentation
└── workspace/              # Runtime data (plugins, results, configs)
```



## 📚 Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Architecture Design](docs/architecture/OVERALL-DESIGN.md)** - System architecture and design decisions
- **[AI Knowledge Base Integration](docs/architecture/AI-KNOWLEDGE-BASE-INTEGRATION.md)** - RAG-based knowledge retrieval and intent routing
- **[API Specification](docs/architecture/API-SPECIFICATION.md)** - Complete API reference
- **[Plugin System](docs/architecture/PLUGIN-SYSTEM-DESIGN.md)** - Plugin development guide
- **[Implementation Guides](docs/implementation/)** - Step-by-step feature implementations
- **[Database Schema](docs/architecture/DATABASE-DESIGN.md)** - Database structure and migrations



## 🤝 Contributing

Contributions are welcome! Fork the repository, create a feature branch, and submit a pull request.

---

## 🙏 Acknowledgments

Built with amazing open-source technologies:

- [LangChain](https://langchain.com/) - LLM orchestration framework
- [MapLibre GL JS](https://maplibre.org/) - Interactive maps
- [Turf.js](https://turfjs.org/) - Geospatial analysis
- [Vue.js](https://vuejs.org/) - Progressive JavaScript framework
- [Element Plus](https://element-plus.org/) - UI component library

---

<div align="center">

**Made with ❤️ for the geospatial community**

[Website](https://gitee.com/rzcgis/geo-ai-universal-platform) | [Documentation](docs/)

</div>
