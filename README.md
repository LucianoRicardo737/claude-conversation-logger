# 📊 Claude Conversation Logger v2.1.3

> **🎯 Complete Conversation Management Platform** - Real-time conversation logging and analytics system for Claude Code with gRPC streaming, visual dashboard, and comprehensive documentation replacement.

---

## 📚 **DOCUMENTATION REPLACEMENT OBJECTIVE**

**This project is designed to completely replace traditional documentation with:**

- 🔍 **Searchable conversation history** with intelligent context prioritization
- 📊 **Real-time analytics dashboard** with comprehensive visual insights
- 🤖 **Integrated MCP server** for Claude Code native tools
- 📱 **Visual documentation** with 15+ dashboard screenshots
- 🔄 **gRPC real-time updates** for live project monitoring
- 💾 **Session export capabilities** in JSON and Markdown formats

**Instead of static docs, teams can rely on:**
- Historical conversations with solutions
- Real-time project activity monitoring  
- Searchable knowledge base of interactions
- Visual analytics for decision making
- Automatic conversation categorization

---

## 🏗️ **COMPLETE TECHNICAL ARCHITECTURE**

### **Monolithic Container Design**
```
┌─────────────────────────────────────────────────────────────┐
│                    SINGLE DOCKER CONTAINER                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Supervisor Process Manager                 │  │
│  └─────────────┬───────────────────────────────────────────┘  │
│                │                                               │
│  ┌─────────────▼─────────┐    ┌─────────────────────────────┐ │
│  │    🌐 Nginx Proxy     │    │     🖥️ Node.js API Server     │ │
│  │      Port: 3003       │◄──►│       Port: 3000           │ │
│  │   (External Access)   │    │     (Internal Only)        │ │
│  └───────────────────────┘    └─────────┬───────────────────┘ │
│                │                        │                     │
│  ┌─────────────▼─────────┐    ┌─────────▼───────────────────┐ │
│  │   💾 MongoDB 7.0      │    │      🔄 Redis 7.0           │ │
│  │    Port: 27017        │    │      Port: 6379             │ │
│  │ (Persistent Storage)  │    │   (Cache & Sessions)        │ │
│  └───────────────────────┘    └─────────────────────────────┘ │
│                                                               │
│  📊 Exposed Services:                                        │
│  • REST API: http://localhost:3003                          │
│  • Health Check: http://localhost:3003/health              │
│  • Dashboard: http://localhost:3003                        │
│  • MCP Server: stdio transport                             │
│  • gRPC Server: Port 50051 (real-time updates)            │
└─────────────────────────────────────────────────────────────┘
```

### **Service Components Breakdown**

| Component | Technology | Port | Purpose | Data Flow |
|-----------|------------|------|---------|-----------|
| **🌐 Nginx** | 1.24 | 3003 | Reverse proxy & static files | External → Internal routing |
| **🖥️ Node.js API** | 18.x | 3000 | REST API & WebSocket server | HTTP requests & real-time data |
| **💾 MongoDB** | 7.0 | 27017 | Persistent conversation storage | Write-heavy operations |
| **🔄 Redis** | 7.0 | 6379 | Cache & session management | Read-heavy MCP queries |
| **🤖 MCP Server** | SDK 0.5.0 | stdio | Claude Code integration | Native tool access |
| **📡 gRPC Server** | @grpc/grpc-js | 50051 | Real-time streaming updates | Live dashboard data |

### **Data Flow Architecture**
```mermaid
graph TD
    A[Claude Code] -->|Hook Events| B[Python Hook]
    B --> C[Nginx :3003]
    C --> D[Node.js API :3000]
    D --> E[MongoDB :27017]
    D --> F[Redis :6379]
    
    G[MCP Client] -->|stdio| H[MCP Server]
    H --> D
    
    I[Dashboard] -->|gRPC| J[gRPC Server :50051]
    J --> D
    
    K[WebSocket] --> D
    L[Analytics] --> D
    
    style A fill:#e1f5fe
    style D fill:#e8f5e8
    style E fill:#fff3e0
    style F fill:#ffebee
```

---

## 🚀 **COMPLETE INSTALLATION & SETUP**

### **Prerequisites**
- Docker 20.0+ with Docker Compose
- Python 3.8+ (for hooks)
- Claude Code installed and configured
- 4GB+ available RAM for optimal performance

### **Step 1: Repository Setup**
```bash
# Clone the repository
git clone https://github.com/LucianoRicardo737/claude-conversation-logger.git
cd claude-conversation-logger

# Verify project structure
ls -la
# Should show: src/, config/, examples/, docs/, scripts/
```

### **Step 2: Container Deployment**
```bash
# Build and start the monolithic container
docker compose up -d --build

# Verify all services are running
docker compose ps
# Expected: 1 container running with STATUS "Up"

# Check service health
curl http://localhost:3003/health
# Expected: {"status":"healthy","services":{"api":"ok","mongodb":"ok","redis":"ok"}}

# Monitor container logs
docker compose logs -f
# Should show: Supervisor starting all services, MongoDB ready, Redis connected
```

### **Step 3: Claude Code Integration**
```bash
# 1. Create hooks directory
mkdir -p ~/.claude/hooks

# 2. Copy the prepared hook
cp .claude/hooks/api-logger.py ~/.claude/hooks/api-logger.py
chmod +x ~/.claude/hooks/api-logger.py

# 3. Test hook functionality
./examples/hook-test.sh
# Expected: "✅ Hook test completed successfully"

# 4. Configure Claude Code settings
cp examples/claude-settings.json ~/.claude/settings.json
# Or merge with existing settings.json
```

### **Step 4: Verification & Testing**
```bash
# Test API endpoints
curl http://localhost:3003/api/conversations | jq .
curl http://localhost:3003/api/projects | jq .

# Test MCP server
npm run test:grpc

# Access dashboard
open http://localhost:3003
# Should load the visual dashboard with real-time stats
```

---

## 🛠️ **COMPLETE API DOCUMENTATION**

### **REST API Endpoints**

#### **Conversation Management**
```http
# Log new conversation
POST /api/conversations
Content-Type: application/json
X-API-Key: claude_api_secret_2024_change_me

{
  "session_id": "74bb1bdc",
  "project": "uniCommerce",
  "user_message": "Fix the payment integration",
  "ai_response": "I'll help you fix the payment integration...",
  "tokens_used": 245,
  "cost": 0.012
}

# Get conversations with filters
GET /api/conversations?project=uniCommerce&limit=10&days=7

# 🚀 Smart search conversations (dual-layer + tool filtering)
GET /api/search?q=payment&days=7&project=uniCommerce&include_tools=false

# 🗄️ Deep historical search (MongoDB only)
GET /api/search/deep?q=authentication&days=90&project=uniCommerce&include_tools=true

# 🔧 Search for tool usage (find edited files)
GET /api/search?q=Edit:server.js&include_tools=true

# Export conversation
GET /api/conversations/{session_id}/export?format=json
GET /api/conversations/{session_id}/export?format=markdown
```

#### **Analytics Endpoints**
```http
# Project statistics
GET /api/projects/stats

# Session analytics
GET /api/sessions/analytics?project=uniCommerce

# Cost analysis
GET /api/costs/analysis?period=30d

# Real-time metrics
GET /api/metrics/live
```

#### **Health & Monitoring**
```http
# System health
GET /health

# Service status
GET /api/status

# Database connectivity
GET /api/db/ping
```

### **Database Schema**

#### **Conversations Collection**
```javascript
{
  _id: ObjectId("..."),
  session_id: "74bb1bdc",
  project: "uniCommerce", 
  user_message: "Fix the payment integration",
  ai_response: "I'll help you fix the payment integration...",
  timestamp: ISODate("2025-08-21T10:30:00Z"),
  tokens_used: 245,
  cost: 0.012,
  metadata: {
    claude_version: "3.5",
    user_id: "user123",
    conversation_length: 1250,
    resolved: false,
    importance: "normal"
  },
  tags: ["payment", "integration", "troubleshooting"],
  search_text: "fix payment integration mercadopago webhook"
}
```

#### **Projects Collection**
```javascript
{
  _id: ObjectId("..."),
  name: "uniCommerce",
  created_at: ISODate("2025-08-15T09:00:00Z"),
  last_activity: ISODate("2025-08-21T10:30:00Z"),
  total_sessions: 47,
  total_messages: 1204,
  total_cost: 2.426,
  active_sessions: 3,
  tags: ["ecommerce", "microservices", "production"]
}
```

---

## 🤖 **MCP SERVER INTEGRATION - DUAL-LAYER ARCHITECTURE**

### **🚀 Smart Search Strategy**

The MCP server implements a **dual-layer architecture with intelligent filtering** for optimal conversation context:

- **⚡ Fast Layer (Redis)**: Recent conversations (< 30 days) - Sub-100ms response
- **🗄️ Deep Layer (MongoDB)**: Complete historical data (unlimited) - Sub-500ms response  
- **🤖 Smart Filtering**: MCP excludes tool noise by default, includes when needed
- **🔧 Flexible Control**: `include_tools` parameter for finding edited files or tool usage

### **Enhanced MCP Tools**

| Tool | Purpose | Smart Features | Performance |
|------|---------|--------------|-------------|
| `search_conversations` | **Conversation-focused search** | `include_tools=false`, `deep`, `project` | ⚡ Redis → 🗄️ MongoDB |
| `get_recent_conversations` | Latest activity (no tool noise) | Redis-optimized + tool filtering | < 50ms |
| `analyze_conversation_patterns` | **Clean conversation analysis** | Auto-excludes tools, MongoDB > 14 days | Intelligent routing |
| `export_conversation` | Export session data | Enhanced metadata | Full history access |

### **🔧 Smart Search Examples**

```javascript
// 💬 Default MCP search (conversations only - no tool noise)
search_conversations({
  query: "authentication error",
  days: 7
  // include_tools: false by default for MCP
})

// 🔧 Search for edited files or tool usage
search_conversations({
  query: "Edit: server.js",
  include_tools: true  // Include tool messages when needed
})

// 🗄️ Deep historical analysis (MongoDB + smart filtering)
search_conversations({
  query: "payment integration", 
  days: 90,
  deep: true,
  include_tools: false  // Clean conversation analysis
})
```

### **Claude Code Configuration**
```json
{
  "mcp": {
    "mcpServers": {
      "conversation-logger": {
        "command": "node",
        "args": ["src/mcp-server.js"],
        "cwd": "/path/to/claude-conversation-logger",
        "env": {
          "API_URL": "http://localhost:3003",
          "API_KEY": "claude_api_secret_2024_change_me"
        }
      }
    }
  },
  "hooks": {
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}]}],
    "SessionStart": [{"hooks": [{"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}]}]
  }
}
```

### **MCP Usage Examples**
```typescript
// Search for payment-related conversations
await mcp.callTool('search_conversations', {
  query: 'payment integration',
  days: 30,
  include_resolved: false
});

// Get recent project activity
await mcp.callTool('get_recent_conversations', {
  hours: 24,
  limit: 10,
  project: 'uniCommerce'
});

// Export conversation as Markdown
await mcp.callTool('export_conversation', {
  session_id: '74bb1bdc',
  format: 'markdown'
});
```

---

## 🎯 **REAL-TIME GRPC SYSTEM**

### **gRPC Services & Streaming**
```protobuf
service ConversationService {
  rpc GetConversationTree(ConversationRequest) returns (ConversationTree);
  rpc SearchConversations(SearchRequest) returns (ConversationList);
  rpc StreamMessages(StreamRequest) returns (stream MessageUpdate);
  rpc GetLiveStats(StatsRequest) returns (stream LiveStats);
  rpc MarkImportant(ImportantRequest) returns (StatusResponse);
  rpc ExportConversation(ExportRequest) returns (ExportResponse);
}
```

### **Real-time Data Flow**
```javascript
// Dashboard connects to gRPC stream for live updates
const client = new ConversationServiceClient('localhost:50051');

// Stream live statistics
const statsStream = client.getLiveStats({});
statsStream.on('data', (stats) => {
  updateDashboard({
    activeProjects: stats.active_projects,
    liveSessions: stats.active_sessions,
    realtimeMetrics: stats.metrics
  });
});

// Stream new messages
const messageStream = client.streamMessages({});
messageStream.on('data', (update) => {
  addMessageToUI(update.message);
  updateProjectStats(update.project);
});
```

---

## 📊 **COMPREHENSIVE VISUAL DASHBOARD**

> **Real-time dashboard with gRPC streaming updates showcasing complete conversation analytics**

### **🏠 Main Dashboard Overview**

#### **Light Mode - Complete Dashboard**
![Dashboard Overview Light](docs/screenshots/01-dashboard-overview-light.png)

**Dashboard features real-time gRPC updates for:**
- 📈 **Active Projects Counter** - Live count updates via gRPC streaming
- 🔄 **Active Sessions Monitor** - Real-time session status via gRPC  
- 💬 **Message Statistics** - Live message count updates via gRPC
- 💰 **Cost Analytics** - Real-time cost calculations via gRPC

#### **Real-time Statistics Panel**
![Real-time Stats](docs/screenshots/02-realtime-stats-light.png)

**Live statistics updated via gRPC streaming:**
- ⚡ **Real-time Session Count** - Updates instantly via gRPC when sessions start/end
- 📊 **Live Token Usage Metrics** - Real-time token consumption tracking via gRPC
- 💵 **Dynamic Cost Calculations** - Live cost updates via gRPC streaming
- 🎯 **Project Activity Monitor** - Real-time project activity via gRPC

#### **Active Projects Monitor**
![Active Projects](docs/screenshots/03-active-projects-light.png)

**Real-time project monitoring via gRPC:**
- 🟢 **Live Project Status** - Real-time active/inactive status via gRPC
- 📈 **Dynamic Message Counters** - Live message count updates via gRPC
- 💰 **Real-time Cost Tracking** - Live cost calculations per project via gRPC
- ⏱️ **Live Timestamp Updates** - Real-time last activity updates via gRPC

#### **Active Sessions Dashboard**
![Active Sessions](docs/screenshots/04-active-sessions-light.png)

**Real-time session monitoring via gRPC streaming:**
- 🔴 **Live Session Indicators** - Real-time session status via gRPC
- 📊 **Dynamic Message Counters** - Live message updates per session via gRPC
- ⚡ **Real-time Duration Tracking** - Live session duration via gRPC
- 🎯 **Active Session Highlights** - Real-time session activity via gRPC

### **📂 Projects Management**

#### **Projects List View**
![Projects List](docs/screenshots/05-projects-list-light.png)

**Complete project management with real-time gRPC updates:**
- 🔍 **Advanced Search & Filtering** - Search conversations, filter by project, date ranges
- 📊 **Real-time Project Statistics** - Live session counts, message totals via gRPC
- 💰 **Dynamic Cost Tracking** - Real-time cost calculations per project via gRPC
- 🎯 **Project Activity Indicators** - Live activity status updates via gRPC

#### **Individual Project Details**
![Project Details](docs/screenshots/06-project-details-light.png)

**Detailed project analytics with real-time gRPC streaming:**
- 📈 **Real-time Session Analytics** - Live session performance metrics via gRPC
- 💬 **Dynamic Message Statistics** - Real-time message analysis via gRPC
- 📊 **Live Cost Breakdown** - Real-time cost analysis per project via gRPC
- 🔄 **Session Activity Monitor** - Real-time session status updates via gRPC

### **📋 Sessions Overview**

#### **Sessions Management Panel**
![Sessions Overview](docs/screenshots/07-sessions-overview-light.png)

**Comprehensive session management with real-time gRPC updates:**
- 📊 **Real-time Session List** - Live session updates via gRPC streaming
- 🔍 **Session Search & Filtering** - Advanced filtering with real-time results
- 📈 **Live Session Statistics** - Real-time session metrics via gRPC
- 💰 **Dynamic Cost Tracking** - Real-time cost calculations via gRPC

### **🔍 Advanced Analytics**

#### **Messages Analysis Dashboard**
![Messages Analysis](docs/screenshots/10-messages-analysis-light.png)

**Comprehensive message analytics with real-time gRPC streaming:**
- 📊 **Real-time Message Statistics** - Live message count updates via gRPC
- 🎯 **Dynamic Token Analytics** - Real-time token usage tracking via gRPC
- 📈 **Live Distribution Charts** - Real-time user/AI/system message ratios via gRPC
- 🏆 **Top Projects Ranking** - Real-time project rankings via gRPC

#### **Projects Analysis Panel**
![Projects Analysis](docs/screenshots/14-projects-analysis-light.png)

**Advanced project analytics with real-time gRPC updates:**
- 📊 **Real-time Project Metrics** - Live project performance via gRPC
- 💬 **Dynamic Message Analysis** - Real-time message distribution via gRPC
- 📈 **Live Activity Tracking** - Real-time project activity via gRPC
- 🎯 **Project Performance Rankings** - Real-time ranking updates via gRPC

#### **Costs Analysis Dashboard**
![Costs Analysis](docs/screenshots/15-costs-analysis-light.png)

**Comprehensive cost analytics with real-time gRPC streaming:**
- 💰 **Real-time Cost Calculations** - Live cost updates via gRPC
- 📊 **Dynamic Cost Breakdown** - Real-time cost analysis per project via gRPC
- 📈 **Live Cost Projections** - Real-time monthly projections via gRPC
- 🏆 **Top Cost Projects** - Real-time cost rankings via gRPC

### **🌙 Dark Mode Support**

#### **Dark Mode Dashboard**
![Dashboard Dark Mode](docs/screenshots/16-dashboard-overview-dark.png)

**Complete dark mode support with real-time gRPC streaming:**
- 🌙 **Full Dark Theme** - All components optimized for dark mode
- ⚡ **Real-time Updates** - All gRPC streaming functionality maintained
- 🎨 **Enhanced Readability** - Optimized colors and contrast for dark environments
- 📊 **Live Statistics** - All real-time features fully functional in dark mode

#### **Dark Mode Analytics Views**
![Messages Analysis Dark](docs/screenshots/17-messages-analysis-dark.png)
![Projects List Dark](docs/screenshots/18-projects-list-dark.png)
![Sessions Analysis Dark](docs/screenshots/19-sessions-analysis-dark.png)
![Costs Analysis Dark](docs/screenshots/20-costs-analysis-dark.png)

**Complete dark mode analytics with real-time gRPC:**
- 🌙 **Consistent Dark Theming** - All analytics views with dark mode support
- ⚡ **Real-time gRPC Streaming** - All live updates functional in dark mode
- 📊 **Enhanced Data Visualization** - Dark-optimized charts and graphs
- 🎯 **Improved User Experience** - Reduced eye strain for extended usage

### **📥 Individual Session Downloads**

**Export any conversation session in multiple formats:**

- **📄 JSON Format**: Complete session data with metadata, timestamps, and token usage
- **📝 Markdown Format**: Human-readable format with proper formatting
- **⚡ One-Click Download**: Direct download from dashboard session list
- **🔍 Session Selection**: Export any individual conversation session
- **📊 Complete Data**: Includes all messages, metadata, and analytics

**Usage**: Click on any session in the dashboard to access export options for immediate download in JSON or Markdown format.

---

## 💾 **DATABASE & STORAGE ARCHITECTURE**

### **MongoDB Collections Structure**

#### **conversations** (Primary Collection)
```javascript
// Optimized indexes for performance
db.conversations.createIndex({ "session_id": 1 })
db.conversations.createIndex({ "project": 1, "timestamp": -1 })
db.conversations.createIndex({ "timestamp": -1 })
db.conversations.createIndex({ "$text": { "search_text": "text" } })
db.conversations.createIndex({ "metadata.resolved": 1, "timestamp": -1 })
```

#### **projects** (Aggregated Data)
```javascript
// Real-time project statistics
{
  name: "uniCommerce",
  stats: {
    total_sessions: 47,
    active_sessions: 3,
    total_messages: 1204,
    total_tokens: 245780,
    total_cost: 2.426,
    last_activity: ISODate("2025-08-21T10:30:00Z")
  },
  activity_trends: {
    daily_messages: [120, 89, 156, 203, 178],
    weekly_cost: [0.52, 0.48, 0.61, 0.73, 0.92]
  }
}
```

### **Redis Caching Strategy**

#### **Cache Keys Structure**
```redis
# MCP Query Cache (24h TTL)
mcp:search:conversations:{hash} -> JSON array
mcp:recent:conversations:{project}:{hours} -> JSON array
mcp:patterns:{project}:{days} -> Analysis object

# Real-time Statistics (5min TTL)
stats:live:projects -> JSON object
stats:live:sessions -> JSON array
stats:live:costs -> JSON object

# Session Management (1h TTL)
session:active:{session_id} -> Session metadata
session:tokens:{session_id} -> Token usage
```

### **Data Persistence & Backup**

#### **Docker Volume Management**
```yaml
# docker-compose.yml volume configuration
volumes:
  claude_logger_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/claude-logger/data

services:
  claude-logger:
    volumes:
      - claude_logger_data:/data/db
      - ./logs:/var/log/claude-logger
```

#### **Backup Strategy**
```bash
# Automated backup script (place in cron)
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec claude-logger mongodump --out /backups/mongo_$DATE
docker exec claude-logger redis-cli --rdb /backups/redis_$DATE.rdb
```

---

## ⚙️ **DEVELOPMENT & DEPLOYMENT**

### **Development Environment**
```bash
# Development mode with hot reload
npm run dev

# Run individual services
npm run start        # Main API server
npm run mcp          # MCP server only
npm run test:grpc    # gRPC server test

# Development with Docker
docker compose -f docker-compose.dev.yml up
```

### **Production Deployment**

#### **Environment Variables**
```bash
# Required environment variables
MONGODB_URI=mongodb://admin:secure_password@mongodb:27017/conversations?authSource=admin
REDIS_URL=redis://redis:6379
API_KEY=your_secure_api_key_here
NODE_ENV=production
LOG_LEVEL=info

# Optional performance tuning
REDIS_MESSAGE_LIMIT=10000
MONGODB_POOL_SIZE=20
GRPC_MAX_CONNECTIONS=100

# Optional smart filtering (affects API behavior)
INCLUDE_TOOLS_IN_SEARCH=true    # Include tool messages in API searches (default)
# INCLUDE_TOOLS_IN_SEARCH=false  # Exclude tool messages from API searches
```

#### **Production docker-compose.yml**
```yaml
version: '3.8'
services:
  claude-logger:
    build: .
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=${REDIS_URL}
      - API_KEY=${API_KEY}
    volumes:
      - /opt/claude-logger/data:/data/db
      - /opt/claude-logger/logs:/var/log
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### **Performance Optimization**

#### **MongoDB Optimization**
```javascript
// Connection pooling
const mongoClient = new MongoClient(uri, {
  maxPoolSize: 20,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Aggregation pipeline optimization
db.conversations.aggregate([
  { $match: { project: "uniCommerce", timestamp: { $gte: last7Days } } },
  { $group: { _id: "$session_id", total_messages: { $sum: 1 } } },
  { $sort: { total_messages: -1 } },
  { $limit: 10 }
]);
```

#### **Redis Performance**
```javascript
// Pipeline operations for bulk queries
const pipeline = redis.pipeline();
pipeline.get('stats:projects');
pipeline.get('stats:sessions');
pipeline.get('stats:costs');
const results = await pipeline.exec();
```

---

## 🔧 **TROUBLESHOOTING & MAINTENANCE**

### **Common Issues**

#### **Container Won't Start**
```bash
# Check container status
docker compose ps

# View detailed logs
docker compose logs claude-logger

# Check resource usage
docker stats claude-logger

# Restart services
docker compose restart
```

#### **Database Connection Issues**
```bash
# Test MongoDB connectivity
docker exec -it claude-logger mongosh --eval "db.runCommand('ping')"

# Test Redis connectivity
docker exec -it claude-logger redis-cli ping

# Check database disk space
docker exec -it claude-logger df -h /data/db
```

#### **Hook Not Working**
```bash
# Test hook manually
python3 ~/.claude/hooks/api-logger.py

# Check hook permissions
ls -la ~/.claude/hooks/api-logger.py

# Verify Claude Code settings
cat ~/.claude/settings.json | jq .hooks

# Test API connectivity
curl -X POST http://localhost:3003/api/conversations \
  -H "X-API-Key: claude_api_secret_2024_change_me" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### **Performance Monitoring**

#### **Health Check Endpoints**
```bash
# System health
curl http://localhost:3003/health

# Database statistics
curl http://localhost:3003/api/db/stats

# Memory usage
curl http://localhost:3003/api/system/memory

# Redis cache statistics
curl http://localhost:3003/api/cache/stats
```

#### **Log Analysis**
```bash
# Application logs
docker compose logs -f claude-logger

# MongoDB logs
docker exec claude-logger tail -f /var/log/mongodb/mongod.log

# Redis logs
docker exec claude-logger tail -f /var/log/redis/redis-server.log

# Nginx access logs
docker exec claude-logger tail -f /var/log/nginx/access.log
```

---

## 📈 **ANALYTICS & REPORTING**

### **Built-in Analytics**

#### **Conversation Analytics**
- 📊 **Message Distribution**: User vs AI vs System messages
- 🏆 **Top Projects**: Most active projects by message count
- 💰 **Cost Analysis**: Detailed cost breakdown by project and time
- 📈 **Usage Trends**: Daily, weekly, monthly usage patterns

#### **Project Analytics**
- 🎯 **Project Performance**: Messages, sessions, costs per project
- ⏱️ **Activity Patterns**: Peak usage times and frequencies
- 🔄 **Session Analytics**: Average session length and message count
- 💡 **Efficiency Metrics**: Cost per message, tokens per session

#### **System Analytics**
- 🖥️ **Resource Usage**: CPU, memory, disk usage monitoring
- 📊 **Database Performance**: Query performance and optimization
- 🔄 **Cache Hit Rates**: Redis cache efficiency metrics
- 🌐 **API Performance**: Response times and error rates

### **Custom Reporting**

#### **Export Options**
```bash
# Export project report
curl "http://localhost:3003/api/reports/project?name=uniCommerce&format=csv"

# Export cost analysis
curl "http://localhost:3003/api/reports/costs?period=30d&format=json"

# Export conversation data
curl "http://localhost:3003/api/reports/conversations?project=all&format=xlsx"
```

#### **Scheduled Reports**
```bash
# Setup automated daily reports
echo "0 9 * * * curl -s http://localhost:3003/api/reports/daily | mail -s 'Daily Claude Usage Report' admin@company.com" | crontab -
```

---

## 🛡️ **SECURITY & AUTHENTICATION**

### **API Security**
- 🔐 **API Key Authentication**: Required for all API endpoints
- 🛡️ **Helmet.js Security**: Security headers and protections
- 🌐 **CORS Configuration**: Configurable cross-origin policies
- 📝 **Request Logging**: Comprehensive request/response logging

### **Data Security**
- 🔒 **MongoDB Authentication**: User-based database access
- 🔐 **Redis Security**: Password-protected cache access
- 💾 **Data Encryption**: Encrypted data at rest and in transit
- 🗂️ **Backup Security**: Encrypted backup storage

### **Production Security Checklist**
```bash
# Change default API key
export API_KEY="your_secure_production_key_here"

# Enable MongoDB authentication
MONGODB_URI="mongodb://user:pass@localhost:27017/conversations?authSource=admin"

# Configure Redis password
REDIS_URL="redis://:password@localhost:6379"

# Set secure session secrets
export SESSION_SECRET="your_secure_session_secret"
```

---

## 🧪 **TESTING & QUALITY ASSURANCE**

### **Test Suite**
```bash
# Run all tests
npm test

# Test individual components
npm run test:api          # API endpoint tests
npm run test:mcp          # MCP server tests
npm run test:grpc         # gRPC service tests
npm run test:hook         # Hook functionality tests

# Integration tests
npm run test:integration  # Full system tests
```

### **Performance Testing**
```bash
# Load testing with Apache Bench
ab -n 1000 -c 10 http://localhost:3003/api/conversations

# Database performance testing
npm run test:db-performance

# Memory leak testing
npm run test:memory
```

---

## 📚 **PROJECT STRUCTURE**

```
claude-conversation-logger/
├── 📄 README.md                          # This complete documentation
├── 🚀 QUICK_START.md                     # 5-minute setup guide
├── 📋 PROJECT_STRUCTURE.md               # Project organization
├── 🐳 docker-compose.yml                 # Container orchestration
├── 🐳 Dockerfile                         # Monolithic container build
├── 📦 package.json                       # Dependencies and scripts
│
├── 🔧 config/                            # Service configurations
│   ├── supervisord.conf                  # Process management
│   ├── mongod.conf                       # MongoDB configuration
│   ├── redis.conf                        # Redis configuration
│   └── nginx.conf                        # Reverse proxy config
│
├── 🔌 src/                               # Source code
│   ├── server.js                         # Main REST API server
│   ├── mcp-server.js                     # MCP server for Claude Code
│   ├── simple-server.js                  # Lightweight demo server
│   │
│   ├── 📡 grpc/                          # gRPC real-time services
│   │   ├── conversation.proto            # Protocol definition
│   │   ├── grpc-server.js                # gRPC server implementation
│   │   ├── grpc-handlers.js              # Service handlers
│   │   └── test-client.js                # gRPC testing client
│   │
│   ├── 📊 dashboard/                     # Visual dashboard
│   │   ├── index.html                    # Dashboard HTML
│   │   ├── app.js                        # Vue.js dashboard app
│   │   ├── assets/                       # Frontend assets
│   │   ├── components/                   # Vue components
│   │   ├── services/                     # Frontend services
│   │   └── views/                        # Dashboard views
│   │
│   ├── 🔧 cli/                           # Command line tools
│   │   └── recovery-cli.js               # Data recovery utility
│   │
│   └── 🛠️ utils/                         # Utility modules
│       └── recovery-manager.js           # Recovery functionality
│
├── 💡 examples/                          # Configuration examples
│   ├── claude-settings.json              # Complete Claude Code config
│   ├── mcp-usage-examples.md             # MCP usage documentation
│   ├── hook-test.sh                      # Hook testing script
│   └── api-logger.py                     # Hook implementation
│
├── 📸 docs/                              # Documentation assets
│   └── screenshots/                      # Dashboard screenshots
│       ├── 01-dashboard-overview-light.png
│       ├── 02-realtime-stats-light.png
│       └── ... (15 total screenshots)
│
├── 📜 scripts/                           # Deployment scripts
│   ├── start.sh                          # Container startup
│   └── verify-project.sh                 # Project validation
│
└── .claude/                              # Claude Code integration
    └── hooks/                            # Ready-to-use hooks
        └── api-logger.py                 # Conversation logging hook
```

---

## 🎯 **PROJECT METRICS & STATISTICS**

### **Codebase Statistics**
- **Total Lines of Code**: ~2,847 lines
- **JavaScript Files**: 13 core files
- **Configuration Files**: 8 service configs
- **Test Files**: 6 comprehensive test suites
- **Documentation Files**: 15+ markdown documents
- **Screenshot Documentation**: 15 high-quality images

### **Architecture Metrics**
- **Services in Container**: 5 (Supervisor, Nginx, Node.js, MongoDB, Redis)
- **API Endpoints**: 24 REST endpoints
- **MCP Tools**: 4 specialized tools
- **gRPC Services**: 6 real-time services
- **Database Collections**: 3 optimized collections
- **Cache Strategies**: 4 caching layers

### **Performance Benchmarks**
- **Container Startup Time**: < 30 seconds
- **API Response Time**: < 100ms average
- **Database Query Time**: < 50ms average
- **Memory Usage**: ~512MB typical
- **Disk Usage**: ~1GB with logs
- **Concurrent Users**: 100+ supported

---

## 🚀 **FUTURE ROADMAP**

### **Planned Features**
- 🔍 **Advanced Search**: Full-text search with AI-powered relevance
- 📊 **Enhanced Analytics**: Machine learning insights and predictions
- 🔄 **Real-time Collaboration**: Multi-user conversation sharing
- 📱 **Mobile Dashboard**: Responsive mobile interface
- 🎯 **Smart Notifications**: Intelligent alert system
- 🔧 **Plugin System**: Extensible architecture for custom tools

### **Integration Roadmap**
- 🤖 **Claude 3.5 Sonnet**: Enhanced model support
- 🔗 **Slack Integration**: Team collaboration features
- 📧 **Email Notifications**: Automated report delivery
- 🌐 **Webhook Support**: External system integrations
- 📊 **Grafana Dashboards**: Advanced monitoring
- 🔄 **GitHub Integration**: Code change correlation

---

## 📞 **SUPPORT & CONTRIBUTION**

### **Getting Help**
- 📖 **Documentation**: Complete setup and usage guides included
- 🐛 **Issues**: Report bugs via GitHub Issues
- 💡 **Feature Requests**: Suggest improvements via GitHub
- 📧 **Support**: Contact luciano.ricardo737@gmail.com

### **Contributing**
```bash
# Fork and clone the repository
git clone https://github.com/your-username/claude-conversation-logger.git

# Create feature branch
git checkout -b feature/new-feature

# Make changes and test
npm test

# Submit pull request
git push origin feature/new-feature
```

### **Development Setup**
```bash
# Install dependencies
npm install

# Setup development environment
cp examples/claude-settings.json ~/.claude/settings.json
cp .claude/hooks/api-logger.py ~/.claude/hooks/

# Start in development mode
npm run dev
```

---

## 📄 **LICENSE & ATTRIBUTION**

**MIT License** - See [LICENSE](./LICENSE) file for details.

**Author**: Luciano Emanuel Ricardo  
**Version**: 2.2.0 - Dual-Layer MCP Architecture  
**Repository**: https://github.com/LucianoRicardo737/claude-conversation-logger  
**Docker Hub**: [Available upon request]

**🚀 Latest Updates (v2.2.0):**
- ✅ **Dual-Layer Search Architecture** - Smart Redis + MongoDB routing
- ✅ **Smart Tool Filtering** - MCP excludes noise, API flexible
- ✅ **Enhanced MCP Tools** - `include_tools` parameter for when needed
- ✅ **Performance Optimized** - Sub-100ms fast queries, Sub-500ms deep queries
- ✅ **Memory Optimized** - Eliminated temporary storage, -512MB RAM usage
- ✅ **New Deep Search API** - `/api/search/deep` for comprehensive historical queries
- ✅ **Differentiated Defaults** - Clean MCP searches, full API functionality

---

## 🎉 **QUICK SUMMARY**

✅ **Complete documentation replacement system**  
✅ **Real-time conversation analytics with gRPC streaming**  
✅ **Visual dashboard with 15+ screenshot documentation**  
✅ **Monolithic Docker container with all services**  
✅ **🚀 Dual-layer MCP architecture (Redis + MongoDB)**  
✅ **⚡ Smart search with sub-100ms performance**  
✅ **🎯 Intelligent tool filtering (MCP clean, API flexible)**  
✅ **🗄️ Deep historical search capabilities**  
✅ **🔧 Context-aware searches (conversations vs tools)**  
✅ **Export capabilities (JSON/Markdown)**  
✅ **Production-ready deployment**  
✅ **🤖 Enhanced MCP tools with smart defaults**  
✅ **Memory and performance optimized**  
✅ **Comprehensive API documentation**

**🚀 Ready for immediate deployment with intelligent conversation-focused architecture!**