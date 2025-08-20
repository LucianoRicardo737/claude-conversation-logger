# Claude Conversation Logger

🔍 **Complete conversation logging system for Claude Code** with a monolithic container that includes everything needed.

> **⚡ Quick Start**: [QUICK_START.md](./QUICK_START.md) | **🏗️ Estructura**: [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | **🤖 Ejemplos MCP**: [examples/mcp-usage-examples.md](./examples/mcp-usage-examples.md)

## 📋 Features

- 🔄 **Automatic logging** of all Claude Code conversations
- 💾 **Triple Storage System** MongoDB + Redis + Memory (maximum reliability)
- 🔍 **Intelligent search** with freshness prioritization and resolved issue detection
- 🤖 **Integrated MCP server** for efficient queries from Claude
- 🏗️ **Monolithic container** with MongoDB, Redis, Node.js and Nginx included
- ⚡ **REST API** for integration with other tools
- 🛡️ **Health checks** and robust error handling
- 🐳 **Single container** - easy deployment and management
- ⚡ **Ultra-reliable** - Automatic triple redundancy

## 🚀 Quick Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd claude-conversation-logger
```

### 2. Start the monolithic container

```bash
# Build and start the container with all services
docker compose up -d --build

# Verify it's working
curl http://localhost:3003/health

# The container automatically includes:
# - MongoDB (internal port 27017) - Main persistence with 90-day TTL
# - Redis (internal port 6379) - Secondary cache
# - Node.js API (internal port 3000) - Main server
# - Nginx proxy (exposed port 3003) - Access point
# - Supervisor for process management
# - Triple Storage: MongoDB → Redis → Memory (total redundancy)
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
  _id: '77f04828-71ad-4033-8078-e184f86df1ea',
  session_id: '97e025af-1920-4734-b1dc-2abe06a41230',
  project_name: 'uniCommerce',
  message_type: 'system',
  content: 'Session started (source: startup)',
  hook_event: 'SessionStart',
  timestamp: ISODate('2025-08-20T11:44:38.349Z')
}

// User message captured
{
  _id: 'e6c10e47-de16-49f8-9aaa-56e7249da2c3',
  session_id: '97e025af-1920-4734-b1dc-2abe06a41230',
  project_name: 'uniCommerce',
  message_type: 'user',
  content: 'Hola, probando, 1 2 3',
  hook_event: 'UserPromptSubmit',
  timestamp: ISODate('2025-08-20T11:44:42.388Z')
}

// Assistant response with complete token usage
{
  _id: '0b5e0ff9-598c-46eb-b2d1-17f4b83e26dd',
  session_id: '97e025af-1920-4734-b1dc-2abe06a41230',
  project_name: 'uniCommerce',
  message_type: 'assistant',
  content: 'Hola! Te recibo perfectamente. ¿En qué puedo ayudarte hoy con el proyecto uniCommerce?',
  hook_event: 'Stop',
  timestamp: ISODate('2025-08-20T11:44:47.757Z'),
  metadata: {
    source: 'stop_hook_assistant',
    model: 'claude-opus-4-1-20250805',
    usage: {
      input_tokens: 3,
      cache_creation_input_tokens: 44348,  // Created once per session
      cache_read_input_tokens: 0,           // Will be used in subsequent turns
      output_tokens: 8,                     // Includes internal processing overhead
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

# Triple Storage System:
# - MongoDB: Main persistence (90-day TTL)
# - Redis: Fast secondary cache
# - Memory: Ultra-fast buffer (1000 msgs)
# - Auto-failover: If MongoDB fails → Redis → Memory
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
        ║  ┌─────────────────────────────────────┐    ║
        ║  │        Memory Buffer (1000 msgs)    │    ║
        ║  │         Ultra-fast Access           │    ║
        ║  └─────────────────────────────────────┘    ║
        ║                                              ║
        ║         Managed by Supervisor               ║
        ╚═══════════════════════════════════════════════╝
```

## 📡 API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System health check |
| `/api/log` | POST | Save conversation message |
| `/api/messages` | GET | Get recent messages |
| `/api/sessions` | GET | List sessions |
| `/api/search` | GET | Search conversations |
| `/api/cleanup` | DELETE | Clean old data |

### Usage Examples

```bash
# Health Check
curl http://localhost:3003/health

# Search conversations
curl "http://localhost:3003/api/search?q=docker&days=7"

# View recent messages
curl http://localhost:3003/api/messages
```

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

### ⚡ Smart Features

- 🔥 **Freshness prioritization**: Dynamic scoring based on time
- ✅ **Resolution detection**: Automatically identifies resolved problems
- 🎯 **Intelligent filtering**: Excludes resolved conversations by default
- 📊 **Pattern analysis**: Identifies active projects, keywords and schedules
- 🏷️ **Automatic categorization**: By project, session and message type
- 📈 **Real-time metrics**: Activity by hours and projects

### 🚀 **Optimized Performance**

- **⚡ Ultra-fast**: Instant access to messages in RAM
- **💾 Persistent**: Automatic Redis backup without performance impact
- **🔄 Auto-scaling**: Automatically adapts to data volume
- **🧹 Self-cleaning**: Automatic cleanup to prevent overflow
- **📈 Efficient**: Minimal resource usage (~50MB base RAM)
- **🔒 Stable**: No complex database dependencies

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

#### ❌ **Token counts seem incorrect**

**Explanation**: Claude Code includes internal processing overhead in token counts:
- `output_tokens` includes formatting and internal processing
- Actual visible response may be longer than reported tokens
- Cache tokens are created once per session, then reused

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
| **MongoDB** | 27017 | ✅ Running | Main database (90-day TTL) |
| **Redis** | 6379 | ✅ Running | Fast secondary cache |
| **Memory Buffer** | - | ✅ Running | Ultra-fast buffer (1000 msgs) |
| **Supervisor** | - | ✅ Running | Process management |

### 💾 **Triple Storage System**

- **🗄️ MongoDB**: Main persistence with automatic 90-day TTL
- **🚀 Redis**: Fast secondary cache for frequent queries  
- **⚡ Memory**: Ultra-fast RAM buffer (1000 messages)
- **🔄 Auto-failover**: MongoDB → Redis → Memory (complete redundancy)
- **🧹 Auto-cleanup**: Automatic cleanup at all levels
- **📊 Smart routing**: Read from MongoDB, cache in Memory

## 🔧 Advanced Configuration

### Customize Storage

The system uses optimized hybrid storage:

```javascript
// Configure memory limits
const MAX_MESSAGES = 1000;  // Messages in RAM
const REDIS_BACKUP_INTERVAL = 5000;  // ms for sync

// Customize auto-cleanup
const CLEANUP_OLDER_THAN = 7 * 24 * 60 * 60 * 1000;  // 7 days
```

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

# Hybrid storage statistics
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
# Check container is running
docker compose ps

# Review logs
docker compose logs api

# Check connectivity
curl http://localhost:3003/health
```

#### Storage and performance

```bash
# Check hybrid storage
docker exec claude-logger-monolith curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3000/api/stats

# View memory usage
docker exec claude-logger-monolith ps aux | grep node

# Check Redis
docker exec claude-logger-monolith redis-cli ping
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
- Integration with MongoDB, Redis, and Docker

---

**⚡ Pro Tip**: This system is designed to be invisible. Once configured, it will work automatically in the background, capturing all your Claude conversations for future search and analysis.