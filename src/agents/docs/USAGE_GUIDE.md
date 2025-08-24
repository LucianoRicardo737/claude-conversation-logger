# 📖 Agent Usage Guide for Claude Code

## 🎯 **How to Use the Agent System in Claude Code**

The Claude Conversation Logger includes 6 specialized agents that work automatically to enhance your Claude Code experience. This guide shows you exactly how to use them.

---

## 🤖 **The 6 Agents Available**

| Agent | Trigger Words | What It Does | Example Use |
|-------|---------------|--------------|-------------|
| **🎭 ConversationOrchestrator** | "analyze this conversation", "need insights" | Coordinates all other agents | Complex analysis requests |
| **🧠 SemanticAnalyzer** | "extract topics", "analyze content" | Deep content understanding | Technical discussion analysis |
| **📊 SessionStateAnalyzer** | "is this complete?", "session status" | Determines conversation state | Session completion detection |
| **🔗 RelationshipMapper** | "find similar", "related conversations" | Maps conversation relationships | Finding duplicate issues |
| **🔍 PatternDiscoveryAgent** | "recurring patterns", "common problems" | Discovers historical patterns | Trend analysis |
| **📝 AutoDocumentationAgent** | "generate docs", "create summary" | Auto-generates documentation | Problem-solution docs |

---

## 🚀 **How to Activate Agents**

### **Method 1: Direct MCP Tools (Recommended)**
Claude Code has 5 built-in MCP tools that use the agents automatically:

```bash
# Available MCP tools in Claude Code:
search_conversations()          # Uses SemanticAnalyzer + RelationshipMapper
get_recent_conversations()      # Uses SessionStateAnalyzer + filters
analyze_conversation_patterns() # Uses PatternDiscoveryAgent
export_conversation()          # Uses AutoDocumentationAgent
analyze_conversation_intelligence() # Uses ConversationOrchestrator + all agents
```

### **Method 2: Natural Language (Auto-Detection)**
Simply describe what you need, and the system will activate the right agents:

**Examples:**
```
User: "I want to analyze this conversation for technical topics and sentiment"
→ Automatically activates: ConversationOrchestrator → SemanticAnalyzer

User: "Find conversations similar to this API debugging session"  
→ Automatically activates: ConversationOrchestrator → RelationshipMapper

User: "What are the most common problems in the last 30 days?"
→ Automatically activates: ConversationOrchestrator → PatternDiscoveryAgent

User: "Generate documentation from this troubleshooting session"
→ Automatically activates: ConversationOrchestrator → AutoDocumentationAgent
```

---

## 📋 **Practical Use Cases**

### **🔍 1. Finding Similar Conversations**
**Scenario:** You have a new bug and want to see if it was solved before.

**How to use:**
```
User: "Find conversations similar to this React component error"
```

**What happens:**
1. ConversationOrchestrator activates RelationshipMapper
2. RelationshipMapper analyzes your current conversation
3. Searches database for similar technical content
4. Returns ranked list of related conversations with similarity scores

**Expected output:**
- List of 5-10 similar conversations
- Similarity scores (0.75-0.95)
- Brief summaries of each related conversation
- Links to full conversation details

### **🎯 2. Pattern Analysis**
**Scenario:** You want to understand recurring issues in your project.

**How to use:**
```
User: "What are the most common authentication problems in the last 60 days?"
```

**What happens:**
1. ConversationOrchestrator activates PatternDiscoveryAgent
2. Analyzes historical conversations for authentication keywords
3. Groups similar problems by frequency
4. Identifies most effective solutions

**Expected output:**
- Top 5 authentication problems with frequencies
- Success rates of different solutions
- Time trends (increasing/decreasing problems)
- Recommended preventive actions

### **📝 3. Auto-Documentation**
**Scenario:** You just solved a complex issue and want to document it.

**How to use:**
```
User: "Generate documentation for this API integration troubleshooting session"
```

**What happens:**
1. ConversationOrchestrator activates SessionStateAnalyzer (confirms completion)
2. Activates SemanticAnalyzer (extracts key content)
3. Activates AutoDocumentationAgent (generates structured docs)

**Expected output:**
- Structured Markdown document with:
  - Problem description
  - Step-by-step solution
  - Code examples
  - Verification steps
  - Related issues and prevention tips

### **🧠 4. Content Analysis**
**Scenario:** You want to understand what topics were covered in a long conversation.

**How to use:**
```
User: "Analyze the content of this conversation and extract main topics"
```

**What happens:**
1. ConversationOrchestrator activates SemanticAnalyzer
2. Performs multi-layer analysis: structural, semantic, temporal
3. Extracts topics, entities, sentiment, and key phrases

**Expected output:**
- Main topics (5-7 topics with confidence scores)
- Technical entities (services, APIs, technologies mentioned)
- Conversation sentiment evolution
- Key phrases for future searches
- Complexity assessment

### **📊 5. Session State Detection**
**Scenario:** You want to know if a conversation reached a resolution.

**How to use:**
```
User: "Is this troubleshooting session complete and resolved?"
```

**What happens:**
1. ConversationOrchestrator activates SessionStateAnalyzer
2. Analyzes conversation for completion indicators
3. Evaluates solution quality and user satisfaction

**Expected output:**
- Session state: Active/Complete/Paused
- Resolution confidence score
- Quality assessment
- Recommendations for next steps if incomplete

---

## ⚡ **Quick Reference Commands**

### **Analysis Commands**
```bash
"Analyze this conversation"                    # Complete multi-agent analysis
"Extract topics from this discussion"         # Semantic analysis
"Find the sentiment evolution"                # Sentiment tracking
"Is this conversation resolved?"              # State analysis
```

### **Search & Pattern Commands**
```bash
"Find similar conversations"                   # Relationship mapping
"Show me related issues"                      # Similar conversation search
"What are common patterns in [topic]?"       # Pattern discovery
"Analyze trends in [timeframe]"              # Temporal pattern analysis
```

### **Documentation Commands**
```bash
"Generate docs from this session"            # Auto-documentation
"Create a problem-solution summary"          # Structured documentation
"Export this conversation as markdown"       # Formatted export
"Document this troubleshooting process"      # Technical documentation
```

---

## 🎛️ **Configuration Options**

### **Language Settings**
```yaml
# In docker-compose.yml
environment:
  AGENT_PRIMARY_LANGUAGE: "en"     # Primary language for analysis
  AGENT_SECONDARY_LANGUAGE: "es"   # Secondary language support
  AGENT_MIXED_LANGUAGE_MODE: "true" # Enable mixed language detection
```

### **Performance Tuning**
```yaml
environment:
  AGENT_MAX_TOKEN_BUDGET: "100"    # Max tokens per agent operation
  AGENT_SIMILARITY_THRESHOLD: "0.75" # Minimum similarity for relationships
  AGENT_CACHE_TTL_SECONDS: "300"   # Cache timeout for faster responses
```

### **Feature Toggles**
```yaml
environment:
  AGENT_ENABLE_SEMANTIC_ANALYSIS: "true"     # Enable content analysis
  AGENT_ENABLE_AUTO_DOCUMENTATION: "true"    # Enable doc generation
  AGENT_ENABLE_RELATIONSHIP_MAPPING: "true"  # Enable similarity search
```

---

## 🚨 **Troubleshooting**

### **Agent Not Responding**
**Problem:** Agent doesn't activate when expected
**Solution:**
1. Check that the conversation logger is running
2. Verify MCP tools are loaded in Claude Code settings
3. Try more specific trigger words

### **Poor Analysis Quality**
**Problem:** Agent analysis isn't helpful
**Solution:**
1. Provide more context in your request
2. Use specific technical terms
3. Check if the conversation has enough content to analyze

### **Performance Issues**
**Problem:** Agent responses are slow
**Solution:**
1. Reduce AGENT_MAX_TOKEN_BUDGET in config
2. Increase AGENT_CACHE_TTL_SECONDS
3. Use simpler queries for faster results

---

## 📈 **Advanced Usage**

### **Chaining Multiple Agents**
```bash
User: "Analyze this conversation, find similar ones, and generate documentation"
```
This activates: ConversationOrchestrator → SemanticAnalyzer → RelationshipMapper → AutoDocumentationAgent

### **Custom Analysis Requests**
```bash
User: "I want deep semantic analysis with pattern discovery for API-related conversations from the last 14 days"
```
This creates a custom agent chain based on your specific requirements.

### **Bulk Operations**
```bash
User: "Analyze patterns across all conversations tagged with 'authentication' from this month"
```
This uses PatternDiscoveryAgent with custom filters and date ranges.

---

## 🎉 **Best Practices**

1. **Be Specific**: Use clear, descriptive language when requesting analysis
2. **Provide Context**: Mention relevant technologies, timeframes, or criteria
3. **Use Natural Language**: Don't worry about exact syntax - agents understand context
4. **Combine Operations**: Ask for multiple analyses in one request for efficiency
5. **Review Results**: Agent outputs include confidence scores - pay attention to them
6. **Iterate**: Refine your requests based on initial results for better outputs

The agent system is designed to understand your intent and provide actionable insights automatically. Experiment with different phrasings to discover the full potential of each agent!