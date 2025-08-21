# Claude Conversation Logger

🔍 **Complete conversation logging system for Claude Code** with a single monolithic container that includes everything needed.

> **⚡ Quick Start**: [QUICK_START.md](./QUICK_START.md) | **🏗️ Estructura**: [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | **🤖 Ejemplos MCP**: [examples/mcp-usage-examples.md](./examples/mcp-usage-examples.md)

## 📋 Features

- 🔄 **Automatic logging** of all Claude Code conversations
- 💾 **Optimized Storage Architecture** MongoDB + Redis with Docker volumes
- 🔄 **Data Flow**: MongoDB (persistent) → Redis (cache) for optimal performance
- 🔍 **Intelligent search** with freshness prioritization and resolved issue detection
- 🤖 **Integrated MCP server** for efficient queries from Claude
- 🏗️ **Monolithic architecture** with integrated MongoDB, Redis, Node.js and Nginx
- ⚡ **REST API** for integration with other tools
- 🛡️ **Health checks** and robust error handling
- 🐳 **Single container** - Simple deployment with all services integrated
- ⚡ **Data persistence** - Survives container restarts and system reboots

## 🚀 Quick Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd claude-conversation-logger
```

### 2. Start the monolithic container

```bash
# Build and start single container with all services integrated
docker compose up -d --build

# Verify the system is healthy
curl http://localhost:3003/health

# The system includes one container with all services:
# - MongoDB 7.0: Internal database (port 27017)
# - Redis 7: Internal cache (port 6379) 
# - Node.js 18: API server (internal port 3000)
# - Nginx: Reverse proxy (exposed port 3003)
# - Supervisor: Process manager for all services
#
# Data Flow:
# 1. MongoDB: Persistent storage with Docker volume
# 2. Redis: Cache for MCP queries (24h TTL)
# 3. All services communicate internally via localhost
```

### 3. Configure Claude Code Hook

```bash
# Create hooks directory if it doesn't exist
mkdir -p ~/.claude/hooks

# The hook is ready, just copy it
cp .claude/hooks/api-logger.py ~/.claude/hooks/api-logger.py
chmod +x ~/.claude/hooks/api-logger.py

# Test that it works
./examples/hook-test.sh
```

### 4. Configure Claude Code settings.json

Copy the example configuration:

```bash
# Create base configuration
cp examples/claude-settings.json ~/.claude/settings.json
# Or add the corresponding sections if you already have settings.json
```

**Content of `~/.claude/settings.json`:**

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "python3 ~/.claude/hooks/api-logger.py"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "python3 ~/.claude/hooks/api-logger.py"
      }]
    }],
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "python3 ~/.claude/hooks/api-logger.py"
      }]
    }]
  },
  "mcp": {
    "mcpServers": {
      "conversation-logger": {
        "command": "node",
        "args": ["/ruta/absoluta/claude-conversation-logger/src/mcp-server.js"],
        "env": {
          "API_URL": "http://localhost:3003",
          "API_KEY": "claude_api_secret_2024_change_me"
        }
      }
    }
  }
}
```

> **⚠️ Important**: Replace `/absolute/path/` with the actual path to the project directory.

## 📖 Detailed Configuration

### Hook Configuration

The system works through Claude Code hooks that automatically capture:

- ✅ **UserPromptSubmit**: Every prompt you send to Claude  
- ✅ **Stop**: Complete Claude responses with precise tokens (accumulates streaming chunks)
- ✅ **SessionStart**: New session initialization
- ⚠️ **PostToolUse**: Tool usage (optional)
- 🔧 **Enhanced Token Parsing**: Correct capture of usage statistics and complete content
- 🎯 **OpenTelemetry Compliant**: Token metrics separated by type for accurate monitoring

⚠️ **IMPORTANT**: The hook structure must be exactly as shown. Claude Code requires an array with objects containing an internal `"hooks"` field.

#### File: `~/.claude/hooks/api-logger.py`

```python
#!/usr/bin/env python3
import json
import sys
import requests
import os

# Configuration
API_BASE_URL = 'http://localhost:3003'
API_KEY = 'claude_api_secret_2024_change_me'

# (see examples/hook-setup.py for complete code)
```

#### File: `~/.claude/settings.json`

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/api-logger.py"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command", 
            "command": "python3 ~/.claude/hooks/api-logger.py"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/api-logger.py"
          }
        ]
      }
    ]
  }
}
```

## 📊 Example of Captured Conversation

Here's a real example of what gets stored in MongoDB when the hooks are working correctly:

```javascript
// Session initialization
{
  _id: '2d8f3a92-4b51-4e8a-9c3d-f5e6d7a8b9c0',
  session_id: 'a4b5c6d7-8e9f-4a5b-9c8d-7e6f5a4b3c2d',
  project_name: 'claude-conversation-logger',
  message_type: 'system',
  content: 'Session started (source: startup)',
  hook_event: 'SessionStart',
  timestamp: ISODate('2025-01-20T14:32:15.742Z')
}

// User message captured
{
  _id: 'f3e4d5c6-b7a8-4f3e-8d9c-2b1a0f9e8d7c',
  session_id: 'a4b5c6d7-8e9f-4a5b-9c8d-7e6f5a4b3c2d',
  project_name: 'claude-conversation-logger',
  message_type: 'user',
  content: 'Necesito revisar el README completo y ajustarlo porque hay partes que aun muestran la memoria temporal',
  hook_event: 'UserPromptSubmit',
  timestamp: ISODate('2025-01-20T14:32:18.156Z')
}

// Assistant response with complete token usage
{
  _id: '8c9b0a1f-2e3d-4c5b-a6f9-8e7d6c5b4a39',
  session_id: 'a4b5c6d7-8e9f-4a5b-9c8d-7e6f5a4b3c2d',
  project_name: 'claude-conversation-logger',
  message_type: 'assistant',
  content: 'Revisaré el README completo para eliminar todas las referencias obsoletas a características que ya no existen. Comenzaré identificando menciones a "memory buffer", "Triple Storage System" y otros elementos de la arquitectura anterior.',
  hook_event: 'Stop',
  timestamp: ISODate('2025-01-20T14:32:23.891Z'),
  metadata: {
    source: 'stop_hook_assistant',
    model: 'claude-sonnet-4-20250514',
    usage: {
      input_tokens: 47,
      cache_creation_input_tokens: 52847,  // Created once per session
      cache_read_input_tokens: 0,          // Will be used in subsequent turns
      output_tokens: 38,                   // Realistic response length
      service_tier: 'standard'
    }
  }
}
```

### 💡 Token Usage Explained

- **cache_creation_input_tokens**: Context loaded at session start (CLAUDE.md, project files)
- **cache_read_input_tokens**: Reused cached context (90% discount)
- **output_tokens**: May seem low due to internal Claude Code processing
- **input_tokens**: Actual user message tokens

### Environment Variables

Variables are pre-configured in the monolithic container:

```env
# API Configuration (pre-configured)
NODE_ENV=production
PORT=3000
API_SECRET=claude_api_secret_2024_change_me

# Database (internal to container)
MONGODB_URI=mongodb://admin:claude_logger_2024@localhost:27017/conversations?authSource=admin
REDIS_URL=redis://localhost:6379

# Storage System:
# - MongoDB: Main persistence (indefinite by default)
# - Redis: Fast cache for queries
# - Optional: MONGODB_TTL_SECONDS env var for auto-expiration

# Optional TTL Configuration (uncomment to enable)
# MONGODB_TTL_SECONDS=7776000   # 90 days (7776000 seconds)
# MONGODB_TTL_SECONDS=2592000   # 30 days (2592000 seconds)  
# MONGODB_TTL_SECONDS=604800    # 7 days (604800 seconds)
# If not set, conversations persist indefinitely

# Optional Redis Cache Configuration (uncomment to customize)
# REDIS_MESSAGE_LIMIT=5000      # 5000 messages (default)
# REDIS_MESSAGE_LIMIT=10000     # 10000 messages (more cache)
# REDIS_MESSAGE_LIMIT=1000      # 1000 messages (less memory)
```

## 🏗️ Monolithic Architecture

```
┌─────────────────┐    ┌─────────────────┐    
│   Claude Code   │───▶│      Hook       │    
│                 │    │   (Python)      │    
└─────────────────┘    └─────────────────┘    
                                │
                                ▼
        ╔═══════════════════════════════════════════════╗
        ║              MONOLITHIC CONTAINER             ║
        ║  ┌─────────────┐                             ║
        ║  │   Nginx     │ :3003 (Exposed port)         ║
        ║  │ (Proxy)     │                             ║
        ║  └──────┬──────┘                             ║
        ║         │                                    ║
        ║         ▼                                    ║
        ║  ┌─────────────┐    ┌─────────────┐         ║
        ║  │  Node.js    │───▶│ MCP Server  │         ║
        ║  │ API :3000   │    │ (Integrated)│         ║
        ║  └──────┬──────┘    └─────────────┘         ║
        ║         │                                    ║
        ║  ┌──────▼──────┐    ┌─────────────┐         ║
        ║  │  MongoDB    │    │    Redis    │         ║
        ║  │  :27017     │    │    :6379    │         ║
        ║  │(Persistent) │    │   (Cache)   │         ║
        ║  └─────────────┘    └─────────────┘         ║
        ║                                              ║
        ║                                              ║
        ║         Managed by Supervisor               ║
        ╚═══════════════════════════════════════════════╝
```

## 📡 API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health check |
| **`/dashboard`** | **GET** | **📊 NEW: Visual HTML dashboard with real-time stats** |
| `/api/log` | POST | Save conversation message |
| `/api/token-usage` | POST | **NEW**: Save OpenTelemetry token metrics |
| `/api/messages` | GET | Get recent messages |
| `/api/sessions` | GET | List sessions |
| `/api/search` | GET | Search conversations |
| `/api/stats` | GET | System statistics with token metrics |
| `/api/token-stats` | GET | **NEW**: Detailed token usage analytics |
| `/api/cleanup` | DELETE | Clean old data |

### Usage Examples

```bash
# Health Check
curl http://localhost:3003/health

# Search conversations
curl "http://localhost:3003/api/search?q=docker&days=7"

# View recent messages
curl http://localhost:3003/api/messages

# Get token statistics
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     "http://localhost:3003/api/token-stats?days=7"

# Get system stats with token metrics
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/stats
```

### 🎯 OpenTelemetry Token Metrics

The system now provides **OpenTelemetry-compliant** token tracking:

#### **Automatic Token Separation**
Each assistant response generates separate records for:
- **`input`**: Input tokens from user prompts
- **`output`**: Output tokens in assistant responses  
- **`cacheRead`**: Tokens read from prompt cache (90% discount)
- **`cacheCreation`**: Tokens used to create prompt cache

#### **Enhanced Metadata**
```javascript
// Example token record
{
  message_type: 'token_metric',
  hook_event: 'TokenUsage',
  metadata: {
    token_type: 'output',           // OpenTelemetry compliant
    token_count: 125,               // Exact count for this type
    model: 'claude-sonnet-4-20250514',
    cost_usd: 0.001875,            // Estimated cost
    duration_ms: 1500,             // Response time
    source: 'opentelemetry_token_tracking'
  }
}
```

#### **Token Analytics Dashboard**
```bash
# Get detailed token breakdown
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     "http://localhost:3003/api/token-stats?days=7&project=uniCommerce"

# Example response:
{
  "period_days": 7,
  "total_records": 45,
  "token_breakdown": {
    "input": 1200,
    "output": 3500,
    "cacheRead": 850,
    "cacheCreation": 2100
  },
  "cost_analysis": {
    "total_usd": 0.15,
    "by_type": {
      "input": 0.0036,
      "output": 0.0525,
      "cacheRead": 0.000255,
      "cacheCreation": 0.0063
    }
  }
}
```

## 📊 **Visual Dashboard - Complete Feature Showcase**

The system includes a **comprehensive HTML dashboard** with **real-time gRPC updates**, complete analytics and interactive visualizations showcasing all conversation logging capabilities.

### 🚀 **Accessing the Dashboard**

```bash
# Open the dashboard in your browser
http://localhost:3003/dashboard

# Or via curl to check status
curl -I http://localhost:3003/dashboard
```

## 🎬 **Complete Dashboard Walkthrough**

### **1. 📊 Dashboard Overview - Real-time gRPC Updates**

![Dashboard Overview Light](./docs/screenshots/01-dashboard-overview-light.png)

![Dashboard Overview Dark](./docs/screenshots/16-dashboard-overview-dark.png)

**Key Features:**
- **🔄 Real-time gRPC Stats**: Updates every 5 seconds via gRPC streaming
- **💬 Total Messages**: Live count with real-time increments
- **💰 Cost Tracking**: Real-time cost calculation with 4-decimal USD precision
- **🎯 Token Metrics**: Live token consumption across all types (OpenTelemetry compliant)
- **🏗️ Active Projects**: Multi-tenant project tracking with live activity indicators
- **🌓 Dark/Light Mode**: Seamless theme switching with persistent state

### **2. 🔄 Real-time Statistics & Active Sessions**

![Real-time Stats Light](./docs/screenshots/02-realtime-stats-light.png)

**Real-time gRPC Features:**
- **📡 Live Session Monitoring**: Active sessions with "En vivo" indicators
- **⚡ Instant Updates**: New messages appear immediately via gRPC streaming
- **🎬 Animated Counters**: Numbers animate when updated via real-time data
- **🔔 Activity Notifications**: Visual feedback for new conversation activity

### **3. 📈 Projects Overview & Activity Tracking**

![Active Projects Light](./docs/screenshots/03-active-projects-light.png)

![Projects List Light](./docs/screenshots/05-projects-list-light.png)

![Projects List Dark](./docs/screenshots/18-projects-list-dark.png)

**Project Management Features:**
- **🏷️ Project Categorization**: Automatic organization by working directory
- **📊 Activity Metrics**: Messages, sessions, tokens, and costs per project
- **🔍 Advanced Filtering**: Search by project, type, date range, and marked conversations
- **📅 Last Activity**: Real-time timestamps with gRPC updates
- **💡 Project Insights**: Active session indicators and usage patterns

### **4. 🎯 Session Analysis & Management**

![Active Sessions Light](./docs/screenshots/04-active-sessions-light.png)

![Sessions Overview Light](./docs/screenshots/07-sessions-overview-light.png)

![Sessions Analysis Dark](./docs/screenshots/19-sessions-analysis-dark.png)

**Session Features:**
- **📊 Session Statistics**: Total sessions, active sessions, average messages per session
- **⏱️ Real-time Status**: Live "En vivo" indicators for active sessions via gRPC
- **📈 Activity Rate**: Real-time calculation of session activity percentage
- **🏆 Session Rankings**: Longest sessions with message counts and project association
- **⏰ Duration Metrics**: Average, minimum, and maximum session durations
- **📅 Weekly Patterns**: Activity ranking by day of the week

### **5. 📊 Advanced Analytics Suite**

#### **Messages Analysis - Real-time Token Tracking**

![Messages Analysis Light](./docs/screenshots/10-messages-analysis-light.png)

![Messages Analysis Dark](./docs/screenshots/17-messages-analysis-dark.png)

**Message Analytics:**
- **📈 Total Messages**: Real-time count with gRPC updates
- **🎯 Token Distribution**: OpenTelemetry-compliant breakdown (Input/Output/System)
- **📊 Message Types**: User/Assistant/System distribution with live updates
- **🏆 Project Rankings**: Top projects by message count with real-time token and cost data
- **⚡ Activity Periods**: Recent activity breakdown (last hour, 24h, week)
- **📏 Message Length Analysis**: Short/Medium/Long message categorization
- **⚡ Performance Metrics**: Response speed, efficiency rate, peak activity times

#### **Projects Analysis - Complete Insights**

![Projects Analysis Light](./docs/screenshots/14-projects-analysis-light.png)

**Project Analytics:**
- **📋 Comprehensive Ranking**: Activity-based project ranking with detailed metrics
- **💰 Cost Analysis**: Per-project cost breakdown with percentage distribution
- **📊 Type Distribution**: Project categorization (Development/Research/Documentation)
- **🏆 Productivity Metrics**: Messages per session average for each project
- **⏰ Recent Activity**: Latest activity tracking with real-time updates
- **📈 Efficiency Scoring**: Project productivity analysis

#### **Costs Analysis - Financial Tracking**

![Costs Analysis Light](./docs/screenshots/15-costs-analysis-light.png)

![Costs Analysis Dark](./docs/screenshots/20-costs-analysis-dark.png)

**Cost Management:**
- **💰 Total Cost Tracking**: Real-time cost accumulation with gRPC updates
- **📊 Cost per Session/Message**: Efficiency metrics with live calculations
- **📈 Monthly Projections**: Predictive cost analysis
- **🎯 Project Breakdown**: Detailed cost distribution by project with percentages
- **📊 Cost Trends**: Weekly/Monthly/Yearly cost analysis with growth indicators
- **💡 Efficiency Rankings**: Most/least cost-efficient projects
- **💰 Savings Projections**: Optimization recommendations and potential savings
- **📅 Weekly Cost Distribution**: Daily cost breakdown with pattern analysis

### **6. 🔍 Project Deep Dive & Conversation Exploration**

![Project Details Light](./docs/screenshots/06-project-details-light.png)

**Project Exploration:**
- **🔍 Session Navigation**: Click any project to explore individual sessions
- **💬 Conversation Threading**: View complete conversation flows
- **📊 Session Metrics**: Detailed statistics for each conversation session
- **⏰ Timeline View**: Chronological conversation progression
- **🔍 Content Search**: Full-text search within conversations

### 🎯 **Real-time gRPC Features Throughout**

**🔄 Live Data Streaming:**
- **📡 gRPC Updates**: All statistics update every 5 seconds via gRPC streaming
- **🎬 Animated Transitions**: Smooth number animations when data changes
- **⚡ Instant Notifications**: Real-time visual feedback for new activities
- **📊 Live Charts**: Dynamic chart updates without page refresh
- **🔔 Activity Indicators**: "En vivo" badges for active sessions

**🎨 Enhanced User Experience:**
- **🌓 Smart Theme Switching**: Persistent dark/light mode with CSS transitions
- **📱 Mobile Responsive**: Optimized for all screen sizes with touch-friendly interfaces
- **⚡ Performance Optimized**: Efficient real-time updates with minimal resource usage
- **🎯 Visual Hierarchy**: Clear information architecture with intuitive navigation

### 🎨 **Design & Technology**

- **🎨 TailwindCSS**: Modern, responsive design via CDN with custom dark mode
- **📈 Chart.js**: Interactive, animated charts with real-time data updates
- **🔄 gRPC Streaming**: Real-time data updates every 5 seconds
- **📱 Responsive Design**: Mobile-first approach with touch-optimized interactions
- **⚡ Performance**: Optimized rendering with efficient DOM updates
- **🎯 Accessibility**: WCAG-compliant design with keyboard navigation support

### 🛡️ **Security & Access**

- **🌐 Public Dashboard**: No authentication required for dashboard viewing
- **🔒 Read-Only Interface**: Dashboard only displays data, cannot modify conversations
- **🎯 Safe Aggregation**: Shows statistics without exposing sensitive conversation content
- **🏥 Error Handling**: Graceful fallback when services are unavailable
- **🔐 API Protection**: Core API endpoints remain protected with API key authentication

## 🤖 Integrated MCP Server

The MCP server provides native tools for Claude to access stored conversations:

### 🛠️ Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| **`search_conversations`** | Search history with freshness prioritization | `query`, `days`, `include_resolved`, `limit` |
| **`get_recent_conversations`** | Get recent prioritized conversations | `hours`, `project`, `limit` |
| **`analyze_conversation_patterns`** | Analyze patterns and themes in conversations | `days`, `project` |
| **`export_conversation`** | Export complete conversation in Markdown | `session_id` |

### 🚀 MCP Configuration

1. **Ensure the container is running**:
   ```bash
   docker compose ps  # Should show healthy container
   ```

2. **Configure MCP Server** (two options available):

   **🎯 Option A: Use project .mcp.json (recommended)**
   
   The project already includes pre-configured `.mcp.json`:

   ```json
   {
     "mcpServers": {
       "conversation-logger": {
         "command": "node",
         "args": ["/home/uni/Escritorio/unicorp/unicorp/uniCommerce/claude-conversation-logger/src/mcp-server.js"],
         "env": {
           "API_URL": "http://localhost:3003",
           "API_KEY": "claude_api_secret_2024_change_me"
         }
       }
     }
   }
   ```

   **🔧 Option B: Global settings.json configuration**
   
   If you prefer global configuration, add to `~/.claude/settings.json`:

   ```json
   {
     "mcp": {
       "mcpServers": {
         "conversation-logger": {
           "command": "node",
           "args": ["/your/complete/path/claude-conversation-logger/src/mcp-server.js"],
           "env": {
             "API_URL": "http://localhost:3003",
             "API_KEY": "claude_api_secret_2024_change_me"
           }
         }
       }
     }
   }
   ```

   > **💡 Advantage of .mcp.json**: Claude Code detects it automatically without editing global configuration.

4. **Restart Claude Code** to load the configuration

5. **Test the MCP** - Now you can use commands like:
   - "Search conversations about docker in the last 3 days"
   - "Show me the most recent conversations"
   - "Analyze my conversation patterns"
   - "Export session XYZ in markdown"

## 💾 **Data Persistence & Storage Architecture**

The system uses a **dual storage architecture** within a single container to ensure data persistence and optimal performance:

### 🏗️ **Storage Hierarchy**

```mermaid
graph LR
    A[New Message] --> B[MongoDB Internal]
    B --> C[Redis Internal]  
    B --> E[Docker Volume]
    C --> D[MCP Queries]
    B --> F[Dashboard Direct]
    E --> G[Survives Restart]
    
    style B fill:#4caf50,stroke:#2e7d32
    style C fill:#2196f3,stroke:#1565c0
    style E fill:#ff9800,stroke:#ef6c00
```

### 🔄 **Data Flow Process**

1. **📝 Message Received** → Triggers optimized storage flow in single container
2. **💾 MongoDB Internal** → Persistent storage with Docker volume (localhost:27017)
3. **⚡ Redis Internal** → Message cache for MCP queries (localhost:6379, 24h TTL)
4. **📊 Dashboard** → Reads directly from internal MongoDB (~50ms response)
5. **🔄 Auto-Recovery** → All services restart together via Supervisor

### 🐳 **Docker Volumes Configuration**

```yaml
volumes:
  claude_logger_data:    # Single volume for all persistent data
    driver: local
    # Contains: MongoDB data + Redis data + Application logs
```

### ✅ **Data Persistence Guarantee**

- **✅ Container Restart**: All data preserved via single Docker volume
- **✅ System Reboot**: MongoDB and Redis data survives automatically within container
- **✅ Docker Volume Backup**: Standard Docker volume backup procedures apply
- **✅ Recovery**: Supervisor restarts all services and loads from persistent storage

### 📊 **Storage Performance**

| Operation | Source | Speed | Persistence |
|-----------|--------|-------|-------------|
| MCP Claude Code Query | Redis Internal | ~10ms | ✅ 24h cache |
| Dashboard Load | MongoDB Internal | ~50ms | ✅ Permanent |
| Historical Search | MongoDB Internal | ~50ms | ✅ Permanent |
| System Recovery | Supervisor + MongoDB | ~500ms | ✅ Full restore |

### 🔧 **Verifying Persistence**

```bash
# Test data persistence after restart
docker compose down
docker compose up -d

# Wait for startup and verify data is preserved  
sleep 30 && curl http://localhost:3003/dashboard
```

### ⚡ Smart Features

- 🔥 **Freshness prioritization**: Dynamic scoring based on time
- ✅ **Resolution detection**: Automatically identifies resolved problems
- 🎯 **Intelligent filtering**: Excludes resolved conversations by default
- 📊 **Pattern analysis**: Identifies active projects, keywords and schedules
- 🏷️ **Automatic categorization**: By project, session and message type
- 📈 **Real-time metrics**: Activity by hours and projects

### 🚀 **Monolithic Performance**

- **⚡ Internal Speed**: No network latency between services (localhost communication)
- **💾 Unified Persistence**: Single Docker volume with MongoDB + Redis data
- **🔄 Supervisor Management**: All processes managed centrally in one container  
- **🧹 Self-contained**: MongoDB, Redis, Node.js, Nginx all integrated
- **📈 Resource Efficient**: Single container overhead vs multiple containers
- **🔒 Simple Architecture**: No container networking or orchestration complexity

## 🔧 Troubleshooting

### Common Issues and Solutions

#### ❌ **Hooks not triggering / Messages not being saved**

**Problem**: Configuration structure is incorrect.

**Solution**: Ensure your hooks have the exact nested structure:

```json
// ✅ CORRECT - Nested structure with "hooks" field
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
        ]
      }
    ]
  }
}

// ❌ INCORRECT - Missing nested "hooks" field
{
  "hooks": {
    "UserPromptSubmit": [
      {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
    ]
  }
}
```

#### ❌ **Only assistant messages saved, user messages missing**

**Problem**: Hook structure is incorrect or Claude Code needs restart.

**Solution**: 
1. Fix hook structure as shown above
2. Restart Claude Code completely
3. Test with: `./examples/hook-test.sh`

#### ✅ **Fixed: Token Counting Accuracy (v2.1.2+)**

**Previous Issue**: Assistant responses showed severe token underreporting (99%+ error rate).

**Resolution**: Implemented OpenTelemetry-compliant token parsing that:
- ✅ **Accumulates streaming chunks**: Properly combines all response parts
- ✅ **Separates token types**: Individual records for input/output/cache tokens
- ✅ **Calculates costs**: Automatic cost estimation by model
- ✅ **Tracks duration**: Response time measurement

**Verification**:
```bash
# Check token metrics are working
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     "http://localhost:3003/api/token-stats?days=1"

# Should show realistic token counts matching response complexity
```

**Claude Code Details**: 
- `output_tokens` includes formatting and internal processing
- Cache tokens are created once per session, then reused with 90% discount
- Token separation allows accurate cost tracking per usage type

#### ❌ **Container not starting**

```bash
# Check logs
docker compose logs

# Rebuild if needed
docker compose down
docker compose up -d --build

# Verify health
curl http://localhost:3003/health
```

#### ❌ **MCP server not found**

**Solution A: Use project .mcp.json (easiest)**
```bash
# The project already includes .mcp.json with correct path
# Just restart Claude Code to detect it automatically
```

**Solution B: Fix global settings.json**
```bash
# Check absolute path in settings
pwd  # Copy this path

# Update settings.json with absolute path
"args": ["/absolute/path/to/claude-conversation-logger/src/mcp-server.js"]
```

**Verify MCP works:**
```bash
# Test MCP server directly
node src/mcp-server.js
# Should show: "🤖 MCP Server de Claude Conversation Logger iniciado"
```

## 🛠️ Development

### Project Structure

```
claude-conversation-logger/
├── src/
│   └── server.js          # API Server with integrated MCP
├── config/
│   ├── supervisord.conf   # Supervisor configuration
│   ├── mongod.conf        # MongoDB configuration
│   ├── redis.conf         # Redis configuration
│   └── nginx.conf         # Nginx proxy configuration
├── scripts/
│   └── start.sh           # Container initialization script
├── .claude/
│   └── hooks/
│       └── api-logger.py  # Ready-to-use hook
├── docker-compose.yml     # Monolithic container
├── Dockerfile            # Monolithic image with everything included
└── README.md             # This documentation
```

### Development Commands

```bash
# Start monolithic container
docker compose up --build

# View complete container logs
docker compose logs -f

# Rebuild container
docker compose up -d --build

# Check services within container
docker exec claude-logger-monolith supervisorctl status

# Access container
docker exec -it claude-logger-monolith bash

# Clean everything and start fresh
docker compose down -v
docker compose up -d --build
```

### Monolithic Container Advantages

✅ **Simplicity**: Single container to manage  
✅ **Performance**: Internal communication without network overhead  
✅ **Portability**: Easy deployment in any environment  
✅ **Management**: Supervisor handles all processes automatically  
✅ **Debug**: All logs in one place  
✅ **Resources**: Optimized memory and CPU usage  

### Included Services

| Service | Internal Port | Status | Function |
|----------|---------------|---------|----------|
| **Nginx** | 3003 (exposed) | ✅ Running | Reverse proxy and load balancer |
| **Node.js API** | 3000 | ✅ Running | REST API and MCP server |
| **MongoDB** | 27017 | ✅ Running | Main database (indefinite persistence) |
| **Redis** | 6379 | ✅ Running | Fast secondary cache |
| **Supervisor** | - | ✅ Running | Process management |

### 💾 **Storage System**

- **🗄️ MongoDB**: Main persistence (indefinite by default, configurable TTL)
- **🚀 Redis**: Fast cache for frequent queries (5000 messages by default, configurable)
- **🔄 Auto-failover**: MongoDB → Redis (redundancy)
- **⚙️ Configurable TTL**: Optional MONGODB_TTL_SECONDS environment variable  
- **📊 Configurable Cache**: Optional REDIS_MESSAGE_LIMIT environment variable
- **🧹 Auto-cleanup**: Automatic cleanup at all levels
- **📊 Smart routing**: Read from MongoDB, cache in Redis

## 🔧 Advanced Configuration

### Customize Storage

The system uses optimized dual storage:

#### **MongoDB Persistence Configuration**
```bash
# Default: Indefinite persistence (recommended)
# No environment variable needed

# Optional: Set TTL for automatic expiration
export MONGODB_TTL_SECONDS=7776000  # 90 days
export MONGODB_TTL_SECONDS=2592000  # 30 days
export MONGODB_TTL_SECONDS=604800   # 7 days

# Restart container to apply changes
docker compose down && docker compose up -d
```

#### **Redis Cache Configuration**
```bash
# Default: 5000 messages in Redis cache (recommended)
# No environment variable needed

# Optional: Customize cache size based on memory constraints
export REDIS_MESSAGE_LIMIT=5000   # Default (balanced performance/memory)
export REDIS_MESSAGE_LIMIT=10000  # High performance (more memory usage)
export REDIS_MESSAGE_LIMIT=1000   # Low memory (reduced performance)

# Restart container to apply changes  
docker compose down && docker compose up -d
```

**Redis Cache Guidelines:**
- **5000 messages**: Optimal balance (default)
- **10000 messages**: High-performance setup (~20MB extra memory)
- **1000 messages**: Memory-constrained environments
- **Individual message TTL**: 24 hours (hardcoded for efficiency)

### Customize Logging Hook

The hook in `examples/hook-setup.py` can be modified to:

- Filter certain message types
- Add custom metadata
- Send notifications
- Integrate with other systems

### Health Monitoring

```bash
# Check status of all services
curl http://localhost:3003/health

# Storage statistics
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/stats

# Check stored messages
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/messages
```

## 📊 Monitoring and Logs

### View real-time logs

```bash
# All services
docker compose logs -f

# API only
docker compose logs -f api

# MongoDB only
docker compose logs -f mongodb
```

### Metrics and Statistics

```bash
# System status
curl http://localhost:3003/api/stats

# Conversations by project
curl http://localhost:3003/api/analytics?group_by=project

# Recent activity
curl http://localhost:3003/api/activity?hours=24
```

## ❓ Advanced Troubleshooting

### Common Issues

#### Hook not working

```bash
# 1. Check permissions
chmod +x ~/.claude/hooks/api-logger.py

# 2. Verify API is available
curl http://localhost:3003/health

# 3. Test hook manually
./examples/hook-test.sh

# 4. Check Claude Code configuration
cat ~/.claude/settings.json

# 5. Debug hook
echo '{"session_id":"test","hook_event_name":"UserPromptSubmit","prompt":"test","cwd":"'$(pwd)'"}' | \
  python3 ~/.claude/hooks/api-logger.py
```

#### MCP server not connecting

```bash
# 1. Check absolute path in settings.json
pwd  # Compare with path in settings.json

# 2. Test MCP server directly
node src/mcp-server.js

# 3. Check environment variables
export API_URL="http://localhost:3003"
export API_KEY="claude_api_secret_2024_change_me"
node src/mcp-server.js

# 4. Debug connection
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/messages?limit=1
```

#### API not responding

```bash
# Check monolithic container is running
docker compose ps

# Review integrated logs (all services)
docker compose logs claude-logger

# Check connectivity
curl http://localhost:3003/health
```

#### Storage and performance

```bash
# Check internal storage (MongoDB + Redis)
docker exec claude-logger-monolith curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3000/api/stats

# View processes inside container
docker exec claude-logger-monolith ps aux

# Check internal Redis
docker exec claude-logger-monolith redis-cli ping

# Check internal MongoDB
docker exec claude-logger-monolith mongosh --eval "db.adminCommand('ping')"
```

### Debug Logs

To enable detailed logs:

```bash
# Configure in docker-compose.yml
environment:
  NODE_ENV: development
  DEBUG: "*"
```

## 🤝 Contributing

1. Fork the project
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

MIT License - see `LICENSE` for details.

## 🙏 Credits

- Built for [Claude Code](https://claude.ai/code)
- Uses [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- Monolithic architecture with MongoDB, Redis, Node.js, and Nginx integration

---

**⚡ Pro Tip**: This system is designed to be invisible. Once configured, it will work automatically in the background, capturing all your Claude conversations for future search and analysis.