# ⚡ Agent System Quick Reference

## 🎯 **At a Glance**

| Agent | Trigger Words | Purpose | Output | Performance |
|-------|---------------|---------|---------|-------------|
| **🎭 ConversationOrchestrator** | "analyze", "need insights" | Coordinates all agents | Complete analysis | < 120 tokens |
| **🧠 SemanticAnalyzer** | "topics", "content analysis" | Deep content understanding | Topics, entities, sentiment | < 40 tokens |
| **📊 SessionStateAnalyzer** | "complete?", "session status" | Session state detection | Active/Complete/Paused | < 30 tokens |
| **🔗 RelationshipMapper** | "similar", "related" | Find conversation connections | Similar conversations | < 50 tokens |
| **🔍 PatternDiscoveryAgent** | "patterns", "trends" | Historical pattern analysis | Recurring issues/solutions | < 40 tokens |
| **📝 AutoDocumentationAgent** | "document", "generate docs" | Auto-documentation | Structured markdown | < 50 tokens |

---

## 🛠️ **MCP Tools (Claude Code)**

### **Quick Commands:**
```bash
# Search conversations intelligently
search_conversations({ query: "API error", days: 30 })

# Get recent quality conversations  
get_recent_conversations({ hours: 24, limit: 10 })

# Analyze patterns and trends
analyze_conversation_patterns({ days: 14 })

# Export with structure
export_conversation({ session_id: "conv_123" })

# Complete analysis
analyze_conversation_intelligence({ session_id: "conv_123" })
```

---

## 💬 **Natural Language Triggers**

### **🔍 Analysis Requests**
```
"Analyze this conversation for technical topics"
"What's the main problem being discussed here?"
"Extract key insights from this troubleshooting session"
"Is this conversation complete and resolved?"
```

### **🔗 Relationship Queries**
```
"Find conversations similar to this authentication issue"
"Show me related discussions about API errors"
"Are there duplicate conversations about this topic?"
"What other sessions discuss JWT token problems?"
```

### **📊 Pattern Discovery**
```
"What are the most common problems this month?"
"Show me trending issues in authentication"
"Analyze patterns in database connection errors"
"What solutions work best for deployment issues?"
```

### **📝 Documentation Generation**
```
"Generate documentation from this debugging session"
"Create a problem-solution summary for this conversation"
"Export this troubleshooting process as markdown"
"Document this implementation with code examples"
```

---

## ⚡ **Performance Cheat Sheet**

### **Token Budget Guidelines**
- **Simple queries**: 30-50 tokens
- **Complex analysis**: 80-120 tokens  
- **Pattern discovery**: 40-80 tokens
- **Documentation**: 50-100 tokens

### **Response Time Expectations**
- **Semantic Analysis**: 200-500ms
- **State Detection**: 100-300ms
- **Relationship Mapping**: 300-800ms
- **Pattern Discovery**: 500-1500ms
- **Documentation**: 300-1000ms

### **Cache Hit Rates**
- **Search results**: ~85%
- **Recent conversations**: ~95%
- **Pattern analysis**: ~60%
- **Export operations**: ~70%

---

## 🎛️ **Configuration Quick Setup**

### **Docker Compose Environment**
```yaml
environment:
  # Core settings
  AGENT_PRIMARY_LANGUAGE: "en"
  AGENT_MAX_TOKEN_BUDGET: "100"
  AGENT_SIMILARITY_THRESHOLD: "0.75"
  
  # Feature toggles
  AGENT_ENABLE_SEMANTIC_ANALYSIS: "true"
  AGENT_ENABLE_AUTO_DOCUMENTATION: "true"  
  AGENT_ENABLE_RELATIONSHIP_MAPPING: "true"
  
  # Performance
  AGENT_CACHE_TTL_SECONDS: "300"
```

### **Claude Code Settings**
```json
{
  "mcpServers": {
    "conversation-logger": {
      "command": "node",
      "args": ["./src/mcp-server.js"]
    }
  }
}
```

---

## 🔥 **Common Use Cases**

### **🐛 Debugging Support**
**Scenario:** New error appears  
**Command:** `search_conversations({ query: "TypeError cannot read property", days: 30 })`  
**Result:** Similar errors with solutions

### **📈 Trend Analysis**  
**Scenario:** Understanding project issues  
**Command:** `analyze_conversation_patterns({ days: 30, project: "api-service" })`  
**Result:** Top issues and solution success rates

### **📚 Knowledge Base Creation**
**Scenario:** Document solved problem  
**Command:** `export_conversation({ session_id: "current_session" })`  
**Result:** Structured problem-solution document

### **🔍 Quality Assurance**
**Scenario:** Review recent work  
**Command:** `get_recent_conversations({ hours: 48, limit: 5 })`  
**Result:** High-quality recent conversations

### **🧠 Deep Analysis**
**Scenario:** Comprehensive conversation review  
**Command:** `analyze_conversation_intelligence({ session_id: "complex_session" })`  
**Result:** Complete multi-dimensional analysis

---

## 🚨 **Quick Troubleshooting**

| Problem | Quick Fix |
|---------|-----------|
| **No MCP tools in Claude Code** | Check `~/.claude/settings.json` and restart Claude Code |
| **Slow responses** | Reduce `AGENT_MAX_TOKEN_BUDGET` to 50-75 |
| **Poor search results** | Lower `AGENT_SIMILARITY_THRESHOLD` to 0.65-0.70 |
| **Agents not activating** | Use more specific trigger words |
| **Memory issues** | Increase `AGENT_CACHE_TTL_SECONDS` to 600 |

---

## 📋 **Workflow Templates**

### **🔧 Problem Investigation**
```bash
1. search_conversations({ query: "error_description", days: 30 })
2. analyze_conversation_patterns({ days: 14 }) 
3. get_recent_conversations({ hours: 24 })
→ Find similar issues, understand patterns, check recent solutions
```

### **📝 Documentation Workflow**
```bash
1. analyze_conversation_intelligence({ session_id: "current" })
2. export_conversation({ session_id: "current" })  
→ Get complete analysis then generate structured docs
```

### **📊 Project Health Check**
```bash
1. analyze_conversation_patterns({ days: 30, project: "project_name" })
2. get_recent_conversations({ hours: 72, project: "project_name" })
→ Understand project trends and recent activity quality
```

---

## 🎯 **Best Practices**

### **✅ Do's**
- Use specific technical terms in queries
- Provide timeframes for pattern analysis  
- Combine multiple agents for comprehensive analysis
- Review confidence scores in results
- Use caching for repeated queries

### **❌ Don'ts**
- Don't use vague queries like "help"
- Don't ignore performance configuration
- Don't overload with simultaneous requests
- Don't skip context when asking for analysis
- Don't use agents for simple lookup tasks

---

## 📊 **Agent Collaboration Quick Guide**

### **Sequential Chains** (Context Dependent)
```
SemanticAnalyzer → RelationshipMapper → AutoDocumentationAgent
(Content analysis → Find similar → Generate docs)
```

### **Parallel Execution** (Independent)  
```
SemanticAnalyzer + SessionStateAnalyzer + PatternDiscoveryAgent
(Content + State + Patterns analyzed simultaneously)
```

### **Full Orchestration**
```
ConversationOrchestrator → ALL AGENTS
(Complete analysis using all available capabilities)
```

---

**🚀 Remember:** The agent system is designed to understand natural language. Don't overthink the syntax - describe what you need, and the orchestrator will coordinate the right agents automatically!