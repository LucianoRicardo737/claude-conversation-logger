# 🚀 Quick Start Guide

## 1. Start System (2 minutes)

```bash
# Clone and enter
git clone <repository-url>
cd claude-conversation-logger

# Start monolithic container (includes MongoDB, Redis, Node.js, Nginx)
docker compose up -d --build

# Verify it works (should show "healthy")
curl http://localhost:3003/health

# ✅ System ready: Triple Storage System (MongoDB + Redis + Memory)
```

## 2. Configure Hook (1 minute)

```bash
# Copy hook
cp .claude/hooks/api-logger.py ~/.claude/hooks/
chmod +x ~/.claude/hooks/api-logger.py

# Test hook
./examples/hook-test.sh
```

## 3. Configure Claude Code (2 minutes)

**Option A: Project-specific .mcp.json (recommended)**

The project includes a pre-configured `.mcp.json` file that Claude Code automatically detects:

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

**Option B: Global settings.json**

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
        ]
      }
    ]
  },
  "mcp": {
    "mcpServers": {
      "conversation-logger": {
        "command": "node",
        "args": ["ABSOLUTE_PATH/claude-conversation-logger/src/mcp-server.js"],
        "env": {
          "API_URL": "http://localhost:3003",
          "API_KEY": "claude_api_secret_2024_change_me"
        }
      }
    }
  }
}
```

> **💡 Benefit of .mcp.json**: Claude Code automatically detects it without modifying global settings

## 4. Use It! (Immediate)

- **Automatic**: All your conversations are saved
- **MCP**: "Search conversations about docker"
- **API**: `curl http://localhost:3003/api/messages`

## ✅ Verification

```bash
# System running
docker compose ps  # STATUS: Up (healthy)

# Hook working  
./examples/hook-test.sh  # Should show ✅ and JSON data

# Storage working
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/stats  # View statistics

# MCP working (after configuration)
# In Claude Code: "Show me recent conversations"
```

---

**⏱️ Total: 5 minutes** | **📚 Complete documentation**: [README.md](./README.md)