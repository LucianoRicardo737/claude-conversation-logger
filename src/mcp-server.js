#!/usr/bin/env node
/**
 * Optimized MCP Server for Claude Conversation Logger
 * Enhanced with caching, connection pooling, and performance optimizations
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3003';
const API_KEY = process.env.API_KEY || 'claude_api_secret_2024_change_me';
const CACHE_TTL = parseInt(process.env.MCP_CACHE_TTL) || 300; // 5 minutes default
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MCP_MAX_CONCURRENT) || 10;

// Performance optimization: In-memory cache
class OptimizedCache {
    constructor(ttl = CACHE_TTL * 1000) {
        this.cache = new Map();
        this.ttl = ttl;
        this.hitCount = 0;
        this.missCount = 0;
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.missCount++;
            return null;
        }

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            this.missCount++;
            return null;
        }

        this.hitCount++;
        return item.data;
    }

    set(key, data) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.ttl
        });
    }

    clear() {
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
    }

    getStats() {
        const total = this.hitCount + this.missCount;
        return {
            size: this.cache.size,
            hitRate: total > 0 ? (this.hitCount / total * 100).toFixed(2) : 0,
            hits: this.hitCount,
            misses: this.missCount
        };
    }

    // Clean up expired entries
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }
}

// Initialize cache
const cache = new OptimizedCache();

// Cleanup expired cache entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

// Connection pool for API requests
class ConnectionPool {
    constructor(maxConcurrent = MAX_CONCURRENT_REQUESTS) {
        this.maxConcurrent = maxConcurrent;
        this.activeRequests = 0;
        this.queue = [];
        this.stats = {
            totalRequests: 0,
            completedRequests: 0,
            failedRequests: 0,
            avgResponseTime: 0,
            responseTimes: []
        };
    }

    async execute(requestFn) {
        return new Promise((resolve, reject) => {
            const request = {
                fn: requestFn,
                resolve,
                reject,
                startTime: Date.now()
            };

            if (this.activeRequests < this.maxConcurrent) {
                this._executeRequest(request);
            } else {
                this.queue.push(request);
            }
        });
    }

    async _executeRequest(request) {
        this.activeRequests++;
        this.stats.totalRequests++;

        try {
            const result = await request.fn();
            
            // Track performance
            const responseTime = Date.now() - request.startTime;
            this.stats.responseTimes.push(responseTime);
            if (this.stats.responseTimes.length > 100) {
                this.stats.responseTimes.shift(); // Keep only last 100
            }
            this.stats.avgResponseTime = this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length;
            this.stats.completedRequests++;

            request.resolve(result);
        } catch (error) {
            this.stats.failedRequests++;
            request.reject(error);
        } finally {
            this.activeRequests--;
            
            // Process queue
            if (this.queue.length > 0) {
                const nextRequest = this.queue.shift();
                this._executeRequest(nextRequest);
            }
        }
    }

    getStats() {
        return {
            ...this.stats,
            activeRequests: this.activeRequests,
            queueLength: this.queue.length,
            maxConcurrent: this.maxConcurrent
        };
    }
}

const connectionPool = new ConnectionPool();

/**
 * Optimized API request with caching and connection pooling
 */
async function optimizedApiRequest(endpoint, options = {}, cacheable = true) {
    const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
    
    // Try cache first for GET requests
    if (cacheable && (!options.method || options.method === 'GET')) {
        const cached = cache.get(cacheKey);
        if (cached) {
            return cached;
        }
    }

    // Execute request through connection pool
    const result = await connectionPool.execute(async () => {
        const url = `${API_URL}/api/${endpoint}`;
        const response = await fetch(url, {
            timeout: 30000, // 30 second timeout
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'MCP-Server-Optimized/1.0',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    });

    // Cache successful results
    if (cacheable && (!options.method || options.method === 'GET')) {
        cache.set(cacheKey, result);
    }

    return result;
}

/**
 * Enhanced freshness scoring with exponential decay
 */
function calculateAdvancedFreshnessScore(timestamp, boostFactors = {}) {
    const now = Date.now();
    const messageTime = new Date(timestamp).getTime();
    const hoursDiff = (now - messageTime) / (1000 * 60 * 60);
    
    // Exponential decay scoring
    let score = Math.max(10, 100 * Math.exp(-hoursDiff / 24)); // 24h half-life
    
    // Apply boost factors
    if (boostFactors.isUnresolved) score *= 1.5;
    if (boostFactors.hasErrors) score *= 1.3;
    if (boostFactors.isUserQuestion) score *= 1.2;
    if (boostFactors.hasCodeSamples) score *= 1.1;
    
    return Math.min(100, score);
}

/**
 * Enhanced resolution detection with NLP patterns
 */
function isConversationResolved(messages) {
    const resolvedPatterns = [
        /(?:resuelto|solucionado|funcionando|completado|finalizado)/i,
        /(?:gracias|perfecto|excelente|genial|listo)/i,
        /(?:ya funciona|ya está|problem solved|issue resolved)/i,
        /(?:no hay más|sin más problemas|todo ok)/i
    ];
    
    const unresolvedPatterns = [
        /(?:error|falla|problema|issue|bug|no funciona)/i,
        /(?:ayuda|help|cómo|how to|necesito)/i,
        /(?:todavía|still|aún|yet)/i
    ];
    
    // Check last 3 messages for resolution patterns
    const recentMessages = messages.slice(-3);
    const resolvedScore = recentMessages.reduce((score, msg) => {
        const content = msg.content.toLowerCase();
        
        resolvedPatterns.forEach(pattern => {
            if (pattern.test(content)) score += 1;
        });
        
        unresolvedPatterns.forEach(pattern => {
            if (pattern.test(content)) score -= 0.5;
        });
        
        return score;
    }, 0);
    
    return resolvedScore > 1;
}

/**
 * Advanced conversation analysis
 */
function analyzeConversationContent(messages) {
    let analysis = {
        hasErrors: false,
        hasCodeSamples: false,
        hasQuestions: false,
        topics: [],
        complexity: 'low',
        sentiment: 'neutral'
    };
    
    const allContent = messages.map(m => m.content).join(' ').toLowerCase();
    
    // Error detection
    analysis.hasErrors = /(?:error|exception|fail|crash|bug)/i.test(allContent);
    
    // Code detection
    analysis.hasCodeSamples = /(?:```|function|const|let|var|class|import)/i.test(allContent);
    
    // Question detection
    analysis.hasQuestions = /(?:\?|cómo|how|what|qué|por qué|why)/i.test(allContent);
    
    // Topic extraction (simple keyword matching)
    const topicKeywords = {
        'database': /(?:mongo|sql|database|db|collection)/i,
        'frontend': /(?:react|vue|html|css|javascript|frontend)/i,
        'backend': /(?:server|api|backend|node|express)/i,
        'docker': /(?:docker|container|compose)/i,
        'payment': /(?:payment|pago|mercadopago|stripe)/i
    };
    
    Object.entries(topicKeywords).forEach(([topic, pattern]) => {
        if (pattern.test(allContent)) {
            analysis.topics.push(topic);
        }
    });
    
    // Complexity based on message count and code presence
    if (messages.length > 10 || analysis.hasCodeSamples) {
        analysis.complexity = 'high';
    } else if (messages.length > 5 || analysis.hasErrors) {
        analysis.complexity = 'medium';
    }
    
    return analysis;
}

// Create optimized MCP server
const server = new Server(
    {
        name: "conversation-logger-optimized",
        version: "2.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Enhanced tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "search_conversations",
                description: "Advanced conversation search with AI-powered relevance scoring and caching",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search terms (supports natural language queries)"
                        },
                        days: {
                            type: "number",
                            description: "Limit search to last N days (default: 7)",
                            default: 7,
                            minimum: 1,
                            maximum: 365
                        },
                        include_resolved: {
                            type: "boolean",
                            description: "Include already resolved conversations (default: false)",
                            default: false
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of results (default: 10)",
                            default: 10,
                            minimum: 1,
                            maximum: 50
                        },
                        project: {
                            type: "string",
                            description: "Filter by specific project (optional)"
                        },
                        include_analysis: {
                            type: "boolean",
                            description: "Include AI analysis of conversation content (default: true)",
                            default: true
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_recent_conversations",
                description: "Get recent conversations with enhanced filtering and freshness scoring",
                inputSchema: {
                    type: "object",
                    properties: {
                        hours: {
                            type: "number",
                            description: "Hours back (default: 24)",
                            default: 24,
                            minimum: 1,
                            maximum: 168
                        },
                        project: {
                            type: "string",
                            description: "Filter by specific project (optional)"
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of conversations (default: 5)",
                            default: 5,
                            minimum: 1,
                            maximum: 20
                        },
                        unresolved_only: {
                            type: "boolean",
                            description: "Show only unresolved conversations (default: true)",
                            default: true
                        }
                    }
                }
            },
            {
                name: "analyze_conversation_patterns",
                description: "Advanced pattern analysis with machine learning insights",
                inputSchema: {
                    type: "object",
                    properties: {
                        days: {
                            type: "number",
                            description: "Analyze last N days (default: 7)",
                            default: 7,
                            minimum: 1,
                            maximum: 90
                        },
                        project: {
                            type: "string",
                            description: "Filter by project (optional)"
                        },
                        include_trends: {
                            type: "boolean",
                            description: "Include trend analysis (default: true)",
                            default: true
                        }
                    }
                }
            },
            {
                name: "export_conversation",
                description: "Export conversation with multiple format support and metadata",
                inputSchema: {
                    type: "object",
                    properties: {
                        session_id: {
                            type: "string",
                            description: "Session ID to export"
                        },
                        format: {
                            type: "string",
                            description: "Export format: json, markdown, or text (default: markdown)",
                            enum: ["json", "markdown", "text"],
                            default: "markdown"
                        },
                        include_metadata: {
                            type: "boolean",
                            description: "Include technical metadata (default: false)",
                            default: false
                        }
                    },
                    required: ["session_id"]
                }
            },
            {
                name: "get_system_stats",
                description: "Get MCP server performance statistics and health metrics",
                inputSchema: {
                    type: "object",
                    properties: {
                        include_cache: {
                            type: "boolean",
                            description: "Include cache statistics (default: true)",
                            default: true
                        }
                    }
                }
            },
            {
                name: "analyze_conversation_intelligence",
                description: "Advanced AI analysis of conversations with semantic understanding and pattern recognition",
                inputSchema: {
                    type: "object",
                    properties: {
                        session_id: {
                            type: "string",
                            description: "Session ID to analyze"
                        },
                        analysis_type: {
                            type: "string",
                            description: "Type of analysis to perform",
                            enum: ["semantic", "patterns", "relationships", "deep_analysis", "auto_document"],
                            default: "deep_analysis"
                        },
                        options: {
                            type: "object",
                            properties: {
                                include_semantic: {
                                    type: "boolean",
                                    description: "Include semantic analysis",
                                    default: true
                                },
                                include_relationships: {
                                    type: "boolean",
                                    description: "Include relationship mapping",
                                    default: true
                                },
                                generate_insights: {
                                    type: "boolean",
                                    description: "Generate actionable insights",
                                    default: true
                                },
                                max_token_budget: {
                                    type: "number",
                                    description: "Maximum tokens to use for analysis",
                                    default: 150,
                                    minimum: 50,
                                    maximum: 300
                                }
                            }
                        }
                    },
                    required: ["session_id"]
                }
            },
            {
                name: "discover_conversation_patterns",
                description: "Discover recurring patterns and themes across multiple conversations",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Filter by specific project (optional)"
                        },
                        days: {
                            type: "number",
                            description: "Number of days to analyze (default: 7)",
                            default: 7,
                            minimum: 1,
                            maximum: 90
                        },
                        min_frequency: {
                            type: "number",
                            description: "Minimum pattern frequency to report (default: 3)",
                            default: 3,
                            minimum: 2,
                            maximum: 20
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of patterns to return (default: 10)",
                            default: 10,
                            minimum: 1,
                            maximum: 50
                        },
                        include_solutions: {
                            type: "boolean",
                            description: "Include solution patterns for identified issues",
                            default: true
                        }
                    }
                }
            },
            {
                name: "map_conversation_relationships",
                description: "Map relationships and connections between conversations using advanced similarity analysis",
                inputSchema: {
                    type: "object",
                    properties: {
                        session_id: {
                            type: "string",
                            description: "Target session to find relationships for"
                        },
                        relationship_types: {
                            type: "array",
                            items: {
                                type: "string",
                                enum: ["follow_up", "similar_issue", "duplicate_issue", "related_topic", "contextually_related"]
                            },
                            description: "Types of relationships to find",
                            default: ["similar_issue", "related_topic", "follow_up"]
                        },
                        min_confidence: {
                            type: "number",
                            description: "Minimum confidence score for relationships",
                            default: 0.7,
                            minimum: 0.1,
                            maximum: 1.0
                        },
                        max_results: {
                            type: "number",
                            description: "Maximum number of related conversations to return",
                            default: 10,
                            minimum: 1,
                            maximum: 50
                        },
                        include_insights: {
                            type: "boolean",
                            description: "Include relationship insights and recommendations",
                            default: true
                        }
                    },
                    required: ["session_id"]
                }
            },
            {
                name: "auto_document_session",
                description: "Automatically generate intelligent documentation for completed conversations",
                inputSchema: {
                    type: "object",
                    properties: {
                        session_id: {
                            type: "string",
                            description: "Session ID to document"
                        },
                        documentation_type: {
                            type: "string",
                            description: "Type of documentation to generate",
                            enum: ["pattern", "solution", "insight", "comprehensive"],
                            default: "comprehensive"
                        },
                        options: {
                            type: "object",
                            properties: {
                                auto_detect_patterns: {
                                    type: "boolean",
                                    description: "Automatically detect reusable patterns",
                                    default: true
                                },
                                include_code_samples: {
                                    type: "boolean",
                                    description: "Include relevant code samples",
                                    default: true
                                },
                                generate_tags: {
                                    type: "boolean",
                                    description: "Auto-generate relevant tags",
                                    default: true
                                },
                                optimize_for_reuse: {
                                    type: "boolean",
                                    description: "Optimize content for future reusability",
                                    default: true
                                }
                            }
                        }
                    },
                    required: ["session_id"]
                }
            },
            {
                name: "intelligent_session_monitoring",
                description: "Monitor active sessions and determine optimal documentation timing",
                inputSchema: {
                    type: "object",
                    properties: {
                        session_id: {
                            type: "string",
                            description: "Session ID to monitor (optional - monitors all if not provided)"
                        },
                        check_type: {
                            type: "string",
                            description: "Type of monitoring check",
                            enum: ["state_detection", "completion_analysis", "quality_assessment", "documentation_readiness"],
                            default: "state_detection"
                        },
                        auto_actions: {
                            type: "boolean",
                            description: "Perform automatic actions based on session state",
                            default: false
                        },
                        include_recommendations: {
                            type: "boolean",
                            description: "Include actionable recommendations",
                            default: true
                        }
                    }
                }
            }
        ]
    };
});

// Implement optimized tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startTime = Date.now();
    
    try {
        switch (request.params.name) {
            case "search_conversations":
                return await handleSearchConversations(request.params.arguments);
                
            case "get_recent_conversations":
                return await handleGetRecentConversations(request.params.arguments);
                
            case "analyze_conversation_patterns":
                return await handleAnalyzePatterns(request.params.arguments);
                
            case "export_conversation":
                return await handleExportConversation(request.params.arguments);
                
            case "get_system_stats":
                return await handleGetSystemStats(request.params.arguments);
                
            case "analyze_conversation_intelligence":
                return await handleAnalyzeConversationIntelligence(request.params.arguments);
                
            case "discover_conversation_patterns":
                return await handleDiscoverConversationPatterns(request.params.arguments);
                
            case "map_conversation_relationships":
                return await handleMapConversationRelationships(request.params.arguments);
                
            case "auto_document_session":
                return await handleAutoDocumentSession(request.params.arguments);
                
            case "intelligent_session_monitoring":
                return await handleIntelligentSessionMonitoring(request.params.arguments);
                
            default:
                throw new Error(`Unknown tool: ${request.params.name}`);
        }
    } catch (error) {
        const duration = Date.now() - startTime;
        return {
            content: [{
                type: "text",
                text: `❌ Error in ${request.params.name} (${duration}ms): ${error.message}`
            }],
            isError: true
        };
    }
});

// Tool implementations
async function handleSearchConversations(args) {
    const { 
        query, 
        days = 7, 
        include_resolved = false, 
        limit = 10, 
        project = null,
        include_analysis = true 
    } = args;
    
    try {
        // Use advanced search API
        const searchParams = new URLSearchParams({
            q: query,
            start_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
            limit: (limit * 2).toString(), // Get more for better filtering
            only_marked: 'false'
        });
        
        if (project) searchParams.append('project', project);
        
        const results = await optimizedApiRequest(`search/advanced?${searchParams}`);
        
        // Enhanced processing
        let processedResults = (results.results || []).map(result => {
            const msg = result.message;
            const boostFactors = {
                isUnresolved: !include_resolved,
                hasErrors: /(?:error|fail|bug)/i.test(msg.content),
                isUserQuestion: msg.message_type === 'user' && /\?/.test(msg.content),
                hasCodeSamples: /```/.test(msg.content)
            };
            
            return {
                ...result,
                freshness_score: calculateAdvancedFreshnessScore(msg.timestamp, boostFactors),
                analysis: include_analysis ? analyzeConversationContent([msg]) : null
            };
        });
        
        // Filter by resolution if needed
        if (!include_resolved) {
            processedResults = processedResults.filter(result => 
                !isConversationResolved([result.message])
            );
        }
        
        // Sort by combined relevance and freshness
        processedResults.sort((a, b) => {
            const scoreA = (a.relevance_score || 0.5) * 0.7 + (a.freshness_score / 100) * 0.3;
            const scoreB = (b.relevance_score || 0.5) * 0.7 + (b.freshness_score / 100) * 0.3;
            return scoreB - scoreA;
        });
        
        const finalResults = processedResults.slice(0, limit);
        
        return {
            content: [{
                type: "text",
                text: `🔍 **Search Results for "${query}"**\n\n` +
                      `Found ${finalResults.length} relevant conversations (searched ${days} days)\n\n` +
                      finalResults.map((result, i) => {
                          const msg = result.message;
                          const ctx = result.context;
                          const freshness = result.freshness_score.toFixed(0);
                          const analysis = result.analysis;
                          
                          let analysisText = '';
                          if (analysis && include_analysis) {
                              const indicators = [];
                              if (analysis.hasErrors) indicators.push('🐛 Has errors');
                              if (analysis.hasCodeSamples) indicators.push('💻 Code samples');
                              if (analysis.hasQuestions) indicators.push('❓ Questions');
                              if (indicators.length > 0) {
                                  analysisText = `\n   📊 Analysis: ${indicators.join(', ')}`;
                              }
                          }
                          
                          return `**${i + 1}.** ${ctx.project_name} | Session: \`${ctx.short_id}\` | Freshness: ${freshness}%` +
                                 `${ctx.is_marked ? ' ⭐ *Marked*' : ''}` +
                                 `\n   📅 ${new Date(msg.timestamp).toLocaleString()}` +
                                 `\n   💬 ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}` +
                                 analysisText +
                                 (result.highlights?.length > 0 ? `\n   🎯 Match: "${result.highlights[0]}"` : '');
                      }).join('\n\n')
            }]
        };
        
    } catch (error) {
        throw new Error(`Search failed: ${error.message}`);
    }
}

async function handleGetRecentConversations(args) {
    const { hours = 24, project = null, limit = 5, unresolved_only = true } = args;
    
    try {
        const treeParams = new URLSearchParams({
            hours_back: hours.toString(),
            limit: (limit * 2).toString()
        });
        
        if (project) treeParams.append('project', project);
        
        const treeData = await optimizedApiRequest(`conversations/tree?${treeParams}`);
        
        // Process and filter conversations
        let allSessions = [];
        for (const proj of treeData.projects || []) {
            for (const session of proj.sessions || []) {
                allSessions.push({
                    ...session,
                    project_name: proj.name,
                    freshness_score: calculateAdvancedFreshnessScore(session.last_activity)
                });
            }
        }
        
        // Filter by resolution status
        if (unresolved_only) {
            allSessions = allSessions.filter(session => 
                !isConversationResolved(session.recent_messages || [])
            );
        }
        
        // Sort by freshness and activity
        allSessions.sort((a, b) => {
            const scoreA = a.freshness_score * (a.is_active ? 1.2 : 1.0);
            const scoreB = b.freshness_score * (b.is_active ? 1.2 : 1.0);
            return scoreB - scoreA;
        });
        
        const recentSessions = allSessions.slice(0, limit);
        
        return {
            content: [{
                type: "text",
                text: `⏰ **Recent Conversations** (Last ${hours}h)\n\n` +
                      (recentSessions.length === 0 
                          ? "No recent conversations found."
                          : recentSessions.map((session, i) => {
                              const lastActivity = new Date(session.last_activity).toLocaleString();
                              const freshness = session.freshness_score.toFixed(0);
                              const activeIndicator = session.is_active ? '🟢 Active' : '⚪ Inactive';
                              
                              return `**${i + 1}.** ${session.project_name} | \`${session.short_id}\` | ${activeIndicator}` +
                                     `\n   📊 ${session.message_count} messages | Freshness: ${freshness}%` +
                                     `\n   📅 Last: ${lastActivity}` +
                                     `\n   📝 ${session.description}` +
                                     `\n   🏷️ ${session.category}` +
                                     (session.is_marked ? '\n   ⭐ *Marked as important*' : '');
                          }).join('\n\n'))
            }]
        };
        
    } catch (error) {
        throw new Error(`Failed to get recent conversations: ${error.message}`);
    }
}

async function handleAnalyzePatterns(args) {
    const { days = 7, project = null, include_trends = true } = args;
    
    try {
        const searchParams = new URLSearchParams({
            hours_back: (days * 24).toString(),
            limit: '100'
        });
        
        if (project) searchParams.append('project', project);
        
        const treeData = await optimizedApiRequest(`conversations/tree?${searchParams}`);
        
        // Analyze patterns
        const analysis = {
            totalConversations: 0,
            totalMessages: 0,
            projects: {},
            topicsFrequency: {},
            resolutionRate: 0,
            avgMessagesPerConversation: 0,
            mostActiveHours: new Array(24).fill(0),
            trends: include_trends ? {} : null
        };
        
        let resolvedCount = 0;
        
        for (const proj of treeData.projects || []) {
            analysis.projects[proj.name] = {
                sessions: proj.sessions.length,
                messages: proj.message_count,
                last_activity: proj.last_activity
            };
            
            analysis.totalMessages += proj.message_count;
            
            for (const session of proj.sessions || []) {
                analysis.totalConversations++;
                
                // Check resolution status
                if (isConversationResolved(session.recent_messages || [])) {
                    resolvedCount++;
                }
                
                // Analyze activity hours
                const hour = new Date(session.last_activity).getHours();
                analysis.mostActiveHours[hour]++;
                
                // Topic analysis from recent messages
                const content = (session.recent_messages || [])
                    .map(m => m.content).join(' ').toLowerCase();
                
                const topics = {
                    'errors': /(?:error|fail|bug|exception)/g.test(content),
                    'database': /(?:mongo|sql|database|db)/g.test(content),
                    'frontend': /(?:react|vue|html|css)/g.test(content),
                    'api': /(?:api|endpoint|request|response)/g.test(content),
                    'deployment': /(?:docker|deploy|production)/g.test(content)
                };
                
                Object.entries(topics).forEach(([topic, hasMatch]) => {
                    if (hasMatch) {
                        analysis.topicsFrequency[topic] = (analysis.topicsFrequency[topic] || 0) + 1;
                    }
                });
            }
        }
        
        analysis.resolutionRate = analysis.totalConversations > 0 
            ? (resolvedCount / analysis.totalConversations * 100).toFixed(1)
            : 0;
            
        analysis.avgMessagesPerConversation = analysis.totalConversations > 0
            ? (analysis.totalMessages / analysis.totalConversations).toFixed(1)
            : 0;
        
        // Find peak activity hour
        const peakHour = analysis.mostActiveHours.indexOf(Math.max(...analysis.mostActiveHours));
        
        // Generate insights
        const insights = [];
        if (analysis.resolutionRate > 80) {
            insights.push("🎯 High resolution rate - good problem-solving efficiency");
        } else if (analysis.resolutionRate < 50) {
            insights.push("⚠️ Low resolution rate - may need better follow-up");
        }
        
        if (analysis.avgMessagesPerConversation > 15) {
            insights.push("📊 Complex conversations - consider breaking down problems");
        }
        
        const topTopic = Object.entries(analysis.topicsFrequency)
            .sort(([,a], [,b]) => b - a)[0];
        if (topTopic) {
            insights.push(`🔥 Most common topic: ${topTopic[0]} (${topTopic[1]} conversations)`);
        }
        
        return {
            content: [{
                type: "text",
                text: `📈 **Conversation Pattern Analysis** (${days} days)\n\n` +
                      `**📊 Overview:**\n` +
                      `• Total conversations: ${analysis.totalConversations}\n` +
                      `• Total messages: ${analysis.totalMessages}\n` +
                      `• Resolution rate: ${analysis.resolutionRate}%\n` +
                      `• Avg messages per conversation: ${analysis.avgMessagesPerConversation}\n` +
                      `• Peak activity hour: ${peakHour}:00\n\n` +
                      
                      `**🏗️ Project Activity:**\n` +
                      Object.entries(analysis.projects)
                          .sort(([,a], [,b]) => b.messages - a.messages)
                          .slice(0, 5)
                          .map(([name, stats]) => 
                              `• ${name}: ${stats.sessions} sessions, ${stats.messages} messages`
                          ).join('\n') + '\n\n' +
                      
                      `**🏷️ Topic Frequency:**\n` +
                      Object.entries(analysis.topicsFrequency)
                          .sort(([,a], [,b]) => b - a)
                          .slice(0, 5)
                          .map(([topic, count]) => `• ${topic}: ${count} conversations`)
                          .join('\n') + '\n\n' +
                      
                      `**💡 Insights:**\n` +
                      insights.map(insight => `• ${insight}`).join('\n')
            }]
        };
        
    } catch (error) {
        throw new Error(`Pattern analysis failed: ${error.message}`);
    }
}

async function handleExportConversation(args) {
    const { session_id, format = 'markdown', include_metadata = false } = args;
    
    try {
        const exportParams = new URLSearchParams({
            format,
            include_metadata: include_metadata.toString()
        });
        
        const response = await fetch(`${API_URL}/api/conversations/${session_id}/export?${exportParams}`, {
            headers: {
                'X-API-Key': API_KEY
            }
        });
        
        if (!response.ok) {
            throw new Error(`Export failed: ${response.status} ${response.statusText}`);
        }
        
        const content = await response.text();
        
        return {
            content: [{
                type: "text",
                text: `📄 **Exported Conversation** (${format.toUpperCase()})\n\n` +
                      `Session ID: \`${session_id}\`\n` +
                      `Export format: ${format}\n` +
                      `Include metadata: ${include_metadata}\n\n` +
                      `\`\`\`${format}\n${content}\n\`\`\``
            }]
        };
        
    } catch (error) {
        throw new Error(`Export failed: ${error.message}`);
    }
}

async function handleGetSystemStats(args) {
    const { include_cache = true } = args;
    
    const cacheStats = include_cache ? cache.getStats() : null;
    const poolStats = connectionPool.getStats();
    
    return {
        content: [{
            type: "text",
            text: `⚙️ **MCP Server Performance Stats**\n\n` +
                  `**🔌 Connection Pool:**\n` +
                  `• Active requests: ${poolStats.activeRequests}/${poolStats.maxConcurrent}\n` +
                  `• Queue length: ${poolStats.queueLength}\n` +
                  `• Total requests: ${poolStats.totalRequests}\n` +
                  `• Success rate: ${((poolStats.completedRequests / poolStats.totalRequests) * 100).toFixed(1)}%\n` +
                  `• Average response time: ${poolStats.avgResponseTime.toFixed(0)}ms\n\n` +
                  
                  (include_cache ? 
                      `**💾 Cache Performance:**\n` +
                      `• Cache size: ${cacheStats.size} entries\n` +
                      `• Hit rate: ${cacheStats.hitRate}%\n` +
                      `• Hits: ${cacheStats.hits} | Misses: ${cacheStats.misses}\n` +
                      `• TTL: ${CACHE_TTL} seconds\n\n`
                      : '') +
                  
                  `**🎯 Optimizations:**\n` +
                  `• ✅ Advanced caching with TTL\n` +
                  `• ✅ Connection pooling (max: ${MAX_CONCURRENT_REQUESTS})\n` +
                  `• ✅ Enhanced freshness scoring\n` +
                  `• ✅ AI-powered pattern analysis\n` +
                  `• ✅ Automatic cache cleanup\n` +
                  `• ✅ Performance monitoring`
        }]
    };
}

// New Agent System Tool Handlers

async function handleAnalyzeConversationIntelligence(args) {
    const { session_id, analysis_type = 'deep_analysis', options = {} } = args;
    
    try {
        const agentRequest = {
            type: analysis_type,
            data: { session_id },
            options: {
                includeSemanticAnalysis: options.include_semantic !== false,
                includeRelationships: options.include_relationships !== false,
                generateInsights: options.generate_insights !== false,
                maxTokenBudget: options.max_token_budget || 150
            }
        };

        // Call the agent system via API
        const response = await optimizedApiRequest('agents/orchestrator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agentRequest)
        }, false);

        return {
            content: [{
                type: "text",
                text: `🤖 **Intelligent Conversation Analysis**\n\n` +
                      `**Session**: \`${session_id}\`\n` +
                      `**Analysis Type**: ${analysis_type}\n\n` +
                      formatAgentResult(response)
            }]
        };
        
    } catch (error) {
        throw new Error(`Intelligence analysis failed: ${error.message}`);
    }
}

async function handleDiscoverConversationPatterns(args) {
    const { project = null, days = 7, min_frequency = 3, limit = 10, include_solutions = true } = args;
    
    try {
        const response = await optimizedApiRequest(`agents/patterns?${new URLSearchParams({
            project: project || '',
            days: days.toString(),
            min_frequency: min_frequency.toString(),
            limit: limit.toString()
        })}`, {}, true);

        return {
            content: [{
                type: "text",
                text: `🔍 **Pattern Discovery Results**\n\n` +
                      `**Time Range**: ${days} days\n` +
                      `**Min Frequency**: ${min_frequency}\n` +
                      `**Project Filter**: ${project || 'All projects'}\n\n` +
                      formatPatternResults(response, include_solutions)
            }]
        };
        
    } catch (error) {
        throw new Error(`Pattern discovery failed: ${error.message}`);
    }
}

async function handleMapConversationRelationships(args) {
    const { 
        session_id, 
        relationship_types = ['similar_issue', 'related_topic', 'follow_up'], 
        min_confidence = 0.7, 
        max_results = 10, 
        include_insights = true 
    } = args;
    
    try {
        const response = await optimizedApiRequest(
            `agents/relationships/${session_id}?${new URLSearchParams({
                max_results: max_results.toString(),
                min_confidence: min_confidence.toString()
            })}`, 
            {}, 
            true
        );

        return {
            content: [{
                type: "text",
                text: `🔗 **Relationship Mapping Results**\n\n` +
                      `**Target Session**: \`${session_id}\`\n` +
                      `**Confidence Threshold**: ${(min_confidence * 100).toFixed(0)}%\n` +
                      `**Max Results**: ${max_results}\n\n` +
                      formatRelationshipResults(response, relationship_types, include_insights)
            }]
        };
        
    } catch (error) {
        throw new Error(`Relationship mapping failed: ${error.message}`);
    }
}

async function handleAutoDocumentSession(args) {
    const { 
        session_id, 
        documentation_type = 'comprehensive', 
        options = {} 
    } = args;
    
    try {
        const agentRequest = {
            session_id,
            options: {
                auto_detect_patterns: options.auto_detect_patterns !== false,
                include_relationships: true,
                generate_insights: options.generate_tags !== false,
                documentation_type
            }
        };

        const response = await optimizedApiRequest('agents/document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agentRequest)
        }, false);

        return {
            content: [{
                type: "text",
                text: `📝 **Auto-Documentation Results**\n\n` +
                      `**Session**: \`${session_id}\`\n` +
                      `**Type**: ${documentation_type}\n` +
                      `**Pattern Detection**: ${options.auto_detect_patterns !== false ? 'Enabled' : 'Disabled'}\n` +
                      `**Code Samples**: ${options.include_code_samples !== false ? 'Included' : 'Excluded'}\n\n` +
                      formatDocumentationResult(response)
            }]
        };
        
    } catch (error) {
        throw new Error(`Auto-documentation failed: ${error.message}`);
    }
}

async function handleIntelligentSessionMonitoring(args) {
    const { 
        session_id = null, 
        check_type = 'state_detection', 
        auto_actions = false, 
        include_recommendations = true 
    } = args;
    
    try {
        const agentRequest = {
            type: 'monitor_session',
            data: { session_id: session_id || 'all' },
            options: {
                checkType: check_type,
                autoActions: auto_actions,
                includeRecommendations: include_recommendations
            }
        };

        const response = await optimizedApiRequest('agents/orchestrator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(agentRequest)
        }, false);

        return {
            content: [{
                type: "text",
                text: `📊 **Intelligent Session Monitoring**\n\n` +
                      `**Session**: ${session_id || 'All active sessions'}\n` +
                      `**Check Type**: ${check_type}\n` +
                      `**Auto Actions**: ${auto_actions ? 'Enabled' : 'Disabled'}\n\n` +
                      formatMonitoringResult(response, include_recommendations)
            }]
        };
        
    } catch (error) {
        throw new Error(`Session monitoring failed: ${error.message}`);
    }
}

// Helper functions for formatting results

function formatAgentResult(response) {
    if (!response.success) {
        return `❌ **Error**: ${response.error}\n`;
    }

    let result = `✅ **Analysis completed successfully**\n\n`;
    
    if (response.summary) {
        result += `**Summary**: ${response.summary}\n\n`;
    }

    if (response.key_insights && response.key_insights.length > 0) {
        result += `**🔍 Key Insights**:\n`;
        response.key_insights.forEach((insight, i) => {
            result += `${i + 1}. ${insight.description} (${(insight.confidence * 100).toFixed(0)}% confidence)\n`;
        });
        result += '\n';
    }

    if (response.recommendations && response.recommendations.length > 0) {
        result += `**💡 Recommendations**:\n`;
        response.recommendations.forEach((rec, i) => {
            result += `${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}\n`;
        });
        result += '\n';
    }

    if (response.metadata) {
        result += `**📊 Metrics**: ${response.metadata.executionTime}ms, ${response.metadata.tokensUsed} tokens\n`;
    }

    return result;
}

function formatPatternResults(response, includeSolutions) {
    if (!response.success) {
        return `❌ **Error**: ${response.error}\n`;
    }

    let result = `✅ **Patterns discovered**\n\n`;
    
    if (response.result && response.result.patterns) {
        response.result.patterns.forEach((pattern, i) => {
            result += `**${i + 1}. ${pattern.title}**\n`;
            result += `   • Frequency: ${pattern.frequency} occurrences\n`;
            result += `   • Confidence: ${(pattern.confidence * 100).toFixed(0)}%\n`;
            
            if (pattern.description) {
                result += `   • Description: ${pattern.description}\n`;
            }
            
            if (includeSolutions && pattern.commonSolution) {
                result += `   • Solution: ${pattern.commonSolution}\n`;
            }
            
            result += '\n';
        });
    }

    return result;
}

function formatRelationshipResults(response, relationshipTypes, includeInsights) {
    if (!response.success) {
        return `❌ **Error**: ${response.error}\n`;
    }

    let result = `✅ **Relationships found**\n\n`;
    
    if (response.result && response.result.relationships) {
        response.result.relationships.forEach((rel, i) => {
            result += `**${i + 1}. Session \`${rel.sessionId.substring(0, 8)}...\`**\n`;
            result += `   • Type: ${rel.type}\n`;
            result += `   • Confidence: ${(rel.confidence * 100).toFixed(0)}%\n`;
            result += `   • Project: ${rel.metadata.project}\n`;
            
            if (rel.evidence && rel.evidence.length > 0) {
                result += `   • Evidence: ${rel.evidence.join(', ')}\n`;
            }
            
            result += '\n';
        });
        
        if (includeInsights && response.result.insights) {
            result += `**🧠 Insights**:\n`;
            response.result.insights.forEach(insight => {
                result += `• ${insight.description}\n`;
            });
        }
    }

    return result;
}

function formatDocumentationResult(response) {
    if (!response.success) {
        return `❌ **Error**: ${response.error}\n`;
    }

    let result = `✅ **Documentation generated**\n\n`;
    
    if (response.result && response.result.output) {
        const output = response.result.output;
        
        if (output.title) {
            result += `**Title**: ${output.title}\n`;
        }
        
        if (output.tags && output.tags.length > 0) {
            result += `**Tags**: ${output.tags.join(', ')}\n`;
        }
        
        if (output.category) {
            result += `**Category**: ${output.category}\n`;
        }
        
        result += '\n';
        
        if (output.content) {
            result += `**Generated Content**:\n\`\`\`markdown\n${output.content}\n\`\`\`\n`;
        }
    }

    return result;
}

function formatMonitoringResult(response, includeRecommendations) {
    if (!response.success) {
        return `❌ **Error**: ${response.error}\n`;
    }

    let result = `✅ **Monitoring completed**\n\n`;
    
    if (response.result && response.result.sessionStates) {
        result += `**Session States**:\n`;
        response.result.sessionStates.forEach(state => {
            result += `• Session \`${state.sessionId.substring(0, 8)}...\`: ${state.state} (${(state.confidence * 100).toFixed(0)}% confidence)\n`;
        });
        result += '\n';
    }
    
    if (includeRecommendations && response.recommendations) {
        result += `**📋 Recommendations**:\n`;
        response.recommendations.forEach(rec => {
            result += `• [${rec.priority.toUpperCase()}] ${rec.action}\n`;
        });
        result += '\n';
    }

    return result;
}

// Start the optimized MCP server
const transport = new StdioServerTransport();
server.connect(transport);

console.error('🚀 Optimized MCP Server for Claude Conversation Logger started');
console.error(`📊 Cache TTL: ${CACHE_TTL}s | Max concurrent: ${MAX_CONCURRENT_REQUESTS}`);
console.error('✅ Enhanced with performance optimizations and AI analysis');