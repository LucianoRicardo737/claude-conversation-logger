# 🔌 MCP Integration Guide

## 🎯 **MCP Server Integration with Agent System**

The Claude Conversation Logger provides **native MCP (Model Context Protocol) integration** that makes all 6 agents available as built-in tools in Claude Code. This means you can use the advanced agent system directly within your Claude Code conversations.

---

## 🛠️ **Available MCP Tools**

### **1. `search_conversations`**
**Agent Used:** ConversationOrchestrator → SemanticAnalyzer → RelationshipMapper  
**Purpose:** Intelligent conversation search with semantic understanding

#### **Parameters:**
```javascript
{
  query: string,           // Search query (required)
  project?: string,        // Filter by project name
  days?: number,          // Time range in days (default: 7)  
  limit?: number,         // Max results (default: 10)
  include_resolved?: boolean // Include resolved conversations (default: false)
}
```

#### **Example Usage:**
```bash
# In Claude Code
search_conversations({
  query: "authentication JWT token issues",
  project: "my-api-project", 
  days: 30,
  limit: 15
})
```

#### **Agent Processing:**
1. **SemanticAnalyzer**: Analyzes query for topics and entities
2. **RelationshipMapper**: Finds semantically similar conversations
3. Returns ranked results with similarity scores and context

---

### **2. `get_recent_conversations`**
**Agent Used:** SessionStateAnalyzer + intelligent filtering  
**Purpose:** Get recent conversations with smart context filtering

#### **Parameters:**
```javascript
{
  hours?: number,         // Hours back (default: 24)
  limit?: number,         // Max conversations (default: 5)
  project?: string        // Filter by project (optional)
}
```

#### **Example Usage:**
```bash
# In Claude Code  
get_recent_conversations({
  hours: 48,
  limit: 10,
  project: "backend-service"
})
```

#### **Agent Processing:**
1. **SessionStateAnalyzer**: Filters by completion status and quality
2. Prioritizes conversations with meaningful resolutions
3. Excludes noise and tool-only interactions

---

### **3. `analyze_conversation_patterns`**
**Agent Used:** ConversationOrchestrator → PatternDiscoveryAgent → SemanticAnalyzer  
**Purpose:** Analyze patterns and trends in historical conversations

#### **Parameters:**
```javascript
{
  days?: number,          // Analysis timeframe (default: 7)
  project?: string        // Filter by project (optional)
}
```

#### **Example Usage:**
```bash
# In Claude Code
analyze_conversation_patterns({
  days: 30,
  project: "authentication-service"
})
```

#### **Agent Processing:**
1. **PatternDiscoveryAgent**: Identifies recurring problems, solutions, and trends
2. **SemanticAnalyzer**: Validates pattern semantic consistency
3. Returns actionable insights with frequency data and solution effectiveness

---

### **4. `export_conversation`**
**Agent Used:** ConversationOrchestrator → AutoDocumentationAgent + SemanticAnalyzer  
**Purpose:** Export conversations with intelligent formatting and structure

#### **Parameters:**
```javascript
{
  session_id: string      // Session ID to export (required)
}
```

#### **Example Usage:**
```bash
# In Claude Code
export_conversation({
  session_id: "conv_12345"
})
```

#### **Agent Processing:**
1. **SemanticAnalyzer**: Extracts key technical content and topics
2. **AutoDocumentationAgent**: Generates structured Markdown with:
   - Executive summary
   - Key topics and technologies
   - Problem-solution pairs
   - Code examples
   - Cross-references to related conversations

---

### **5. `analyze_conversation_intelligence`**
**Agent Used:** ConversationOrchestrator → ALL AGENTS  
**Purpose:** Complete conversation analysis using all available agents

#### **Parameters:**
```javascript
{
  session_id: string      // Session ID to analyze (required)
}
```

#### **Example Usage:**
```bash
# In Claude Code
analyze_conversation_intelligence({
  session_id: "conv_12345"
})
```

#### **Agent Processing:**
1. **ConversationOrchestrator**: Coordinates all agents
2. **SemanticAnalyzer**: Deep content analysis
3. **SessionStateAnalyzer**: State and quality assessment
4. **RelationshipMapper**: Find related conversations
5. **PatternDiscoveryAgent**: Identify recurring patterns
6. **AutoDocumentationAgent**: Generate comprehensive summary

**Output includes:**
- Complete semantic analysis
- Session state and resolution status
- Related conversation recommendations
- Pattern insights
- Structured documentation
- Actionable recommendations

---

## ⚙️ **MCP Server Configuration**

### **Claude Code Settings Setup**
Add this to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "conversation-logger": {
      "command": "node",
      "args": ["/path/to/claude-conversation-logger/src/mcp-server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### **Docker Environment Variables**
Configure agent behavior via Docker environment:

```yaml
# docker-compose.yml
services:
  conversation-logger:
    environment:
      # === MCP INTEGRATION ===
      MCP_SERVER_PORT: "3001"
      MCP_ENABLE_AGENTS: "true"
      
      # === AGENT CONFIGURATION ===
      AGENT_PRIMARY_LANGUAGE: "en"
      AGENT_SECONDARY_LANGUAGE: "es"
      AGENT_MIXED_LANGUAGE_MODE: "true"
      
      # === PERFORMANCE TUNING ===
      AGENT_MAX_TOKEN_BUDGET: "100"
      AGENT_SIMILARITY_THRESHOLD: "0.75"
      AGENT_CACHE_TTL_SECONDS: "300"
      
      # === FEATURE FLAGS ===
      AGENT_ENABLE_SEMANTIC_ANALYSIS: "true"
      AGENT_ENABLE_AUTO_DOCUMENTATION: "true"
      AGENT_ENABLE_RELATIONSHIP_MAPPING: "true"
      AGENT_ENABLE_PATTERN_DISCOVERY: "true"
```

---

## 🚀 **Getting Started**

### **1. Start the System**
```bash
# Start the conversation logger with MCP server
docker-compose up -d

# Verify MCP server is running
curl http://localhost:3001/health
```

### **2. Configure Claude Code**
```bash
# Add to Claude Code settings
echo '{
  "mcpServers": {
    "conversation-logger": {
      "command": "node",
      "args": ["./src/mcp-server.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}' >> ~/.claude/settings.json
```

### **3. Test the Integration**
In Claude Code, try:
```
search_conversations({ query: "authentication", days: 7 })
```

You should see intelligent search results powered by the SemanticAnalyzer and RelationshipMapper agents.

---

## 📊 **MCP Tool Performance**

| Tool | Typical Response Time | Token Usage | Cache Hit Rate |
|------|----------------------|-------------|----------------|
| `search_conversations` | 200-800ms | 30-60 tokens | 85% |
| `get_recent_conversations` | 100-300ms | 15-30 tokens | 95% |
| `analyze_conversation_patterns` | 500-1500ms | 40-80 tokens | 60% |
| `export_conversation` | 300-1000ms | 50-100 tokens | 70% |
| `analyze_conversation_intelligence` | 1000-3000ms | 100-200 tokens | 40% |

---

## 🔧 **Advanced Configuration**

### **Custom Agent Chains**
You can configure custom agent chains for specific MCP tools:

```javascript
// In agent configuration
const customChains = {
  'search_conversations': [
    'semantic-analyzer-agent',
    'relationship-mapper-agent'
  ],
  'analyze_patterns': [
    'pattern-discovery-agent',
    'semantic-analyzer-agent',
    'relationship-mapper-agent'
  ]
};
```

### **Token Budget Management**
```yaml
environment:
  # Per-tool token budgets
  AGENT_SEARCH_TOKEN_BUDGET: "60"
  AGENT_PATTERNS_TOKEN_BUDGET: "80" 
  AGENT_EXPORT_TOKEN_BUDGET: "100"
  AGENT_INTELLIGENCE_TOKEN_BUDGET: "200"
```

### **Caching Strategy**
```yaml
environment:
  # Redis cache configuration
  AGENT_REDIS_CACHE_PREFIX: "agent:"
  AGENT_SEMANTIC_CACHE_TTL: "1800"    # 30 minutes
  AGENT_PATTERNS_CACHE_TTL: "3600"    # 1 hour
  AGENT_RELATIONSHIPS_CACHE_TTL: "900" # 15 minutes
```

---

## 🚨 **Troubleshooting**

### **MCP Tools Not Available**
**Problem:** Tools don't appear in Claude Code  
**Solution:**
1. Check MCP server status: `curl http://localhost:3001/health`
2. Verify Claude Code settings.json configuration
3. Restart Claude Code after configuration changes

### **Poor Agent Performance**
**Problem:** Agent responses are slow or unhelpful  
**Solution:**
1. Reduce `AGENT_MAX_TOKEN_BUDGET`
2. Increase cache TTL values
3. Enable specific feature flags only for needed functionality

### **Authentication Issues**
**Problem:** MCP server connection refused  
**Solution:**
1. Check Docker container status: `docker ps`
2. Verify port mapping in docker-compose.yml
3. Check firewall settings for port 3001

---

## 📈 **Usage Analytics**

The MCP server provides usage analytics for all agent tools:

```javascript
// Available at: GET /api/mcp/analytics
{
  "tools_usage": {
    "search_conversations": {
      "total_calls": 1247,
      "avg_response_time": "345ms",
      "success_rate": 0.97
    },
    "analyze_conversation_intelligence": {
      "total_calls": 89,
      "avg_response_time": "1.8s",
      "success_rate": 0.94
    }
  },
  "agent_performance": {
    "ConversationOrchestrator": {
      "activations": 1456,
      "avg_token_usage": 45,
      "success_rate": 0.98
    },
    "SemanticAnalyzer": {
      "activations": 1123,
      "avg_token_usage": 38,
      "success_rate": 0.96
    }
  }
}
```

This integration makes the full power of the agent system available directly within Claude Code, providing intelligent conversation analysis, pattern discovery, and automated documentation generation as native tools.