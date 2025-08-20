# 🤖 MCP Usage Examples

The Claude Conversation Logger includes an integrated MCP server that provides intelligent conversation search and analysis tools.

## Quick Setup

Add to your `~/.claude/settings.json`:

```json
{
  "mcp": {
    "mcpServers": {
      "conversation-logger": {
        "command": "node",
        "args": ["/absolute/path/to/claude-conversation-logger/src/mcp-server.js"],
        "env": {
          "API_URL": "http://localhost:3003",
          "API_KEY": "claude_api_secret_2024_change_me"
        }
      }
    }
  }
}
```

> Replace `/absolute/path/to/` with your actual project path (`pwd` output).

## Available Tools

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| `search_conversations` | Search with freshness priority | "Find discussions about Docker from last week" |
| `get_recent_conversations` | Recent activity analysis | "Show me my last 3 days of coding sessions" |
| `analyze_conversation_patterns` | Pattern recognition | "What topics have I been working on recently?" |
| `export_conversation` | Export to Markdown | "Export my conversation about the payment system" |

## Example Prompts

### 🔍 **Search Examples**
```
"Search for conversations about authentication in the last 7 days"
"Find discussions about MongoDB that don't include resolved issues"
"Look for recent conversations about the front-commerce service"
```

### 📊 **Analysis Examples**
```
"Analyze my conversation patterns from the last 2 weeks"
"What projects have I been most active on?"
"Show me conversations grouped by topic"
```

### 📋 **Recent Activity**
```
"Show me my most recent conversations"
"What did I work on yesterday?"
"Get conversations from the uniCommerce project in the last 24 hours"
```

### 📤 **Export Examples**
```
"Export the conversation about setting up Docker containers"
"Create a markdown report of my MongoDB troubleshooting session"
```

## Smart Features

### 🧠 **Intelligent Filtering**
- **Freshness Priority**: Recent conversations ranked higher
- **Resolution Detection**: Automatically detects and deprioritizes solved problems
- **Project Context**: Filters by working directory/project
- **Content Relevance**: Semantic matching beyond simple keyword search

### ⚡ **Performance Optimized**
- **Triple Storage**: Instant access via Memory → Redis → MongoDB
- **Efficient Queries**: Optimized for conversation context
- **Smart Caching**: Frequently accessed data stays in fast storage
- **Minimal Latency**: Sub-second response times

## Integration Examples

### Daily Workflow
```
# Morning standup
"What did I work on yesterday that's still pending?"

# During development
"Find similar problems I solved before with this error message"

# End of day review
"Summarize my conversations about the payment integration today"
```

### Project Management
```
# Sprint planning
"Show me all conversations about the authentication service this month"

# Bug tracking
"Find conversations where we discussed this specific error"

# Knowledge sharing
"Export our conversation about the deployment process for documentation"
```

### Learning & Documentation
```
# Knowledge retention
"What solutions did we discover for Redis performance issues?"

# Documentation creation
"Export our database schema discussions for the team wiki"

# Pattern recognition
"What are the most common problems I encounter with Docker?"
```

## Troubleshooting

### MCP Server Not Found
```bash
# Check if container is running
docker compose ps

# Verify MCP server path
node /absolute/path/to/claude-conversation-logger/src/mcp-server.js

# Check API connectivity
curl -H "X-API-Key: claude_api_secret_2024_change_me" http://localhost:3003/api/messages?limit=1
```

### Connection Issues
```bash
# Verify container is running
docker compose logs conversation-logger

# Test API manually
curl -H "X-API-Key: claude_api_secret_2024_change_me" http://localhost:3003/health

# Check MCP server status
node /absolute/path/to/claude-conversation-logger/src/mcp-server.js
```

### Permission Errors
```bash
# Fix hook permissions
chmod +x ~/.claude/hooks/api-logger.py

# Check Python path
which python3
```

### No Conversations Found
- Ensure hooks are configured in `~/.claude/settings.json`
- Check that API key matches in both hook and MCP server config
- Verify container has been running during conversations
- Test with: `curl http://localhost:3003/api/messages?limit=1`

## Performance Tips

### Optimizing Search Queries
```
# More specific = better results
"Find Docker authentication errors from last week" 
# vs generic: "search docker"

# Use project context
"Show conversations about MongoDB in the uniCommerce project"
# vs: "show MongoDB talks"

# Leverage temporal filters  
"Recent conversations about deployment failures"
# vs: "all deployment conversations"
```

### Efficient MCP Usage
- Use specific time ranges to reduce search scope
- Include project names for better filtering
- Combine multiple criteria: "Docker + error + last 3 days"
- Export frequently referenced conversations for offline use

---

## 📚 Additional Resources

- **[Full Setup Guide](../README.md)** - Complete installation and configuration
- **[Quick Start](../QUICK_START.md)** - 5-minute setup guide
- **[Minimal Settings](./minimal-settings.json)** - Copy-paste configuration
- **[API Documentation](../src/api-server.js)** - Direct API usage examples