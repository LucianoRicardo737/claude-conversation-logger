#!/usr/bin/env node
/**
 * MCP Server for Claude Conversation Logger
 * Provides native tools for Claude Code to query conversations
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuración
const API_URL = process.env.API_URL || 'http://localhost:3003';
const API_KEY = process.env.API_KEY || 'claude_api_secret_2024_change_me';

/**
 * Make API request
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_URL}/api/${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Calculate freshness score to prioritize recent conversations
 */
function calculateFreshnessScore(timestamp) {
  const now = Date.now();
  const messageTime = new Date(timestamp).getTime();
  const hoursDiff = (now - messageTime) / (1000 * 60 * 60);
  
  // Higher score for more recent messages
  if (hoursDiff < 1) return 100;
  if (hoursDiff < 24) return 90;
  if (hoursDiff < 168) return 70; // 1 semana
  if (hoursDiff < 720) return 50; // 1 mes
  return 20;
}

/**
 * Detect if a conversation is resolved
 */
function isResolved(messages) {
  const resolvedKeywords = [
    'resuelto', 'solucionado', 'funcionando', 'completado',
    'gracias', 'perfecto', 'excelente', 'listo'
  ];
  
  const lastMessages = messages.slice(-3);
  return lastMessages.some(msg => 
    resolvedKeywords.some(keyword => 
      msg.content.toLowerCase().includes(keyword)
    )
  );
}

// Crear servidor MCP
const server = new Server(
  {
    name: "conversation-logger",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Herramienta: Buscar conversaciones
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_conversations",
        description: "Search conversation history with dual-layer strategy (Redis for recent, MongoDB for historical)",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search terms"
            },
            days: {
              type: "number",
              description: "Limit search to last N days (default: 7)",
              default: 7
            },
            deep: {
              type: "boolean",
              description: "Force deep search in MongoDB (slower but complete historical data). Default: false",
              default: false
            },
            include_resolved: {
              type: "boolean",
              description: "Include already resolved conversations (default: false)",
              default: false
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 10)",
              default: 10
            },
            project: {
              type: "string",
              description: "Filter by specific project name (optional)"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_recent_conversations",
        description: "Get recent conversations prioritized by freshness",
        inputSchema: {
          type: "object",
          properties: {
            hours: {
              type: "number",
              description: "Hours back (default: 24)",
              default: 24
            },
            project: {
              type: "string",
              description: "Filter by specific project (optional)"
            },
            limit: {
              type: "number",
              description: "Maximum number of conversations (default: 5)",
              default: 5
            }
          }
        }
      },
      {
        name: "analyze_conversation_patterns",
        description: "Analyze conversation patterns to identify recurring themes",
        inputSchema: {
          type: "object",
          properties: {
            days: {
              type: "number", 
              description: "Analyze last N days (default: 7)",
              default: 7
            },
            project: {
              type: "string",
              description: "Filter by project (optional)"
            }
          }
        }
      },
      {
        name: "export_conversation",
        description: "Export a complete conversation in Markdown format",
        inputSchema: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "Session ID to export"
            }
          },
          required: ["session_id"]
        }
      }
    ]
  };
});

// Implementar herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "search_conversations":
      try {
        const { query, days = 7, deep = false, include_resolved = false, limit = 10, project } = request.params.arguments;
        
        // Choose endpoint based on deep parameter
        const endpoint = deep ? 'search/deep' : 'search';
        
        // Build search parameters
        const searchParams = new URLSearchParams({
          q: query,
          days: days.toString(),
          limit: (limit * 2).toString(), // Get more to filter
          deep: deep.toString()
        });

        if (project) {
          searchParams.set('project', project);
        }

        const results = await apiRequest(`${endpoint}?${searchParams}`);
        
        // Filter and prioritize results
        let filteredResults = results.messages || [];
        
        if (!include_resolved) {
          filteredResults = filteredResults.filter(msg => !isResolved([msg]));
        }
        
        // Add freshness score and sort
        filteredResults = filteredResults
          .map(msg => ({
            ...msg,
            freshness_score: calculateFreshnessScore(msg.created_at || msg.timestamp)
          }))
          .sort((a, b) => b.freshness_score - a.freshness_score)
          .slice(0, limit);

        // Build response with search strategy info
        const searchStrategy = deep ? '🗄️ Deep MongoDB' : days > 30 ? '🗄️ MongoDB' : '⚡ Redis+MongoDB';
        const resultSource = results.source || (deep ? 'mongodb_deep' : 'smart');
        
        return {
          content: [
            {
              type: "text",
              text: `🔍 **Search Results** (${searchStrategy})\n` +
                `Query: "${query}" | Days: ${days} | Project: ${project || 'all'} | Deep: ${deep}\n` +
                `Found: ${filteredResults.length} conversations | Source: ${resultSource}\n\n` +
                filteredResults.map((msg, i) => 
                  `**${i + 1}. ${msg.project_name}** (${new Date(msg.created_at || msg.timestamp).toLocaleString()})\n` +
                  `   📊 Freshness: ${msg.freshness_score}/100 | Type: ${msg.message_type || 'message'}\n` +
                  `   💬 ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}\n\n`
                ).join('')
            }
          ]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `❌ Error searching conversations: ${error.message}\nTip: Try with 'deep: true' for comprehensive MongoDB search`
          }]
        };
      }

    case "get_recent_conversations":
      try {
        const { hours = 24, project, limit = 5 } = request.params.arguments;
        
        const params = new URLSearchParams({
          limit: limit.toString()
        });
        
        if (project) params.set('project', project);

        const results = await apiRequest(`messages?${params}`);
        const messages = results.messages || [];
        
        // Filter by time and calculate freshness
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        const recentMessages = messages
          .filter(msg => {
            const msgTime = new Date(msg.created_at || msg.timestamp).getTime();
            return msgTime > cutoffTime;
          })
          .map(msg => ({
            ...msg,
            freshness_score: calculateFreshnessScore(msg.created_at || msg.timestamp)
          }))
          .sort((a, b) => b.freshness_score - a.freshness_score);

        return {
          content: [{
            type: "text",
            text: `📅 Recent conversations (last ${hours}h):\n\n` +
              recentMessages.map((msg, i) =>
                `${i + 1}. **${msg.project_name}** - ${msg.session_id}\n` +
                `   ${new Date(msg.created_at || msg.timestamp).toLocaleString()}\n` +
                `   ${msg.content.substring(0, 200)}...\n`
              ).join('\n') +
              (recentMessages.length === 0 ? 'No recent conversations.' : '')
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text", 
            text: `❌ Error getting recent conversations: ${error.message}`
          }]
        };
      }

    case "analyze_conversation_patterns":
      try {
        const { days = 7, project } = request.params.arguments;
        
        // Use deep search for comprehensive analysis when analyzing > 14 days
        const useDeepSearch = days > 14;
        const endpoint = useDeepSearch ? 'search/deep' : 'messages';
        
        const params = new URLSearchParams({
          days: days.toString(),
          limit: useDeepSearch ? '200' : '100' // More data for deep analysis
        });
        
        if (project) params.set('project', project);
        
        // For deep search, add a broad query to get all messages
        if (useDeepSearch) {
          params.set('q', ''); // Empty query gets all messages within time range
        }

        const results = await apiRequest(`${endpoint}?${params}`);
        const messages = results.messages || [];
        
        // Pattern analysis
        const projectCounts = {};
        const sessionCounts = {};
        const hourlyActivity = Array(24).fill(0);
        const keywords = {};
        
        messages.forEach(msg => {
          // Count by project
          projectCounts[msg.project_name] = (projectCounts[msg.project_name] || 0) + 1;
          
          // Count by session
          sessionCounts[msg.session_id] = (sessionCounts[msg.session_id] || 0) + 1;
          
          // Activity by hour
          const hour = new Date(msg.created_at || msg.timestamp).getHours();
          hourlyActivity[hour]++;
          
          // Keyword analysis
          const words = msg.content.toLowerCase().match(/\b[a-záéíóúñ]+\b/g) || [];
          words.forEach(word => {
            if (word.length > 4) { // Only significant words
              keywords[word] = (keywords[word] || 0) + 1;
            }
          });
        });
        
        // Top projects
        const topProjects = Object.entries(projectCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
          
        // Top keywords
        const topKeywords = Object.entries(keywords)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);
          
        // Hora más activa
        const mostActiveHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));

        // Build analysis results
        const analysisSource = useDeepSearch ? '🗄️ MongoDB Deep Analysis' : '⚡ Redis+MongoDB Analysis';
        const projectFilter = project ? ` (Project: ${project})` : ' (All projects)';
        
        return {
          content: [{
            type: "text",
            text: `📊 **Conversation Patterns Analysis** (${analysisSource})\n` +
              `Period: Last ${days} days${projectFilter} | Messages analyzed: ${messages.length}\n\n` +
              
              `**📈 Most Active Projects:**\n${topProjects.map(([proj, count]) => `• **${proj}**: ${count} messages`).join('\n')}\n\n` +
              
              `**🔤 Frequent Keywords:**\n${topKeywords.map(([word, count]) => `• ${word}: ${count} times`).join('\n')}\n\n` +
              
              `**⏰ Peak Activity:**\n• Most active hour: **${mostActiveHour}:00** (${hourlyActivity[mostActiveHour]} messages)\n` +
              `• Activity distribution: ${hourlyActivity.filter(h => h > 0).length}/24 hours active\n\n` +
              
              `**📊 Session Statistics:**\n• Unique sessions: **${Object.keys(sessionCounts).length}**\n` +
              `• Average messages per session: **${Math.round(messages.length / Object.keys(sessionCounts).length || 0)}**\n` +
              `• Total messages: **${messages.length}**\n\n` +
              
              `**💡 Data Source:** ${results.source || (useDeepSearch ? 'mongodb_deep' : 'combined')}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `❌ Error analyzing patterns: ${error.message}`
          }]
        };
      }

    case "export_conversation":
      try {
        const { session_id } = request.params.arguments;
        
        const params = new URLSearchParams({
          session: session_id,
          limit: '1000' // Get entire conversation
        });

        const results = await apiRequest(`messages?${params}`);
        const messages = results.messages || [];
        
        if (messages.length === 0) {
          return {
            content: [{
              type: "text",
              text: `❌ No messages found for session: ${session_id}`
            }]
          };
        }
        
        // Generate Markdown
        const project = messages[0]?.project_name || 'Unknown';
        const startTime = messages[0]?.created_at || messages[0]?.timestamp;
        const endTime = messages[messages.length - 1]?.created_at || messages[messages.length - 1]?.timestamp;
        
        const markdown = `# Conversation: ${project}\n\n` +
          `**Session:** ${session_id}\n` +
          `**Start:** ${new Date(startTime).toLocaleString()}\n` +
          `**End:** ${new Date(endTime).toLocaleString()}\n` +
          `**Total messages:** ${messages.length}\n\n` +
          `---\n\n` +
          messages.map(msg => {
            const time = new Date(msg.created_at || msg.timestamp).toLocaleString();
            const type = msg.message_type || msg.hook_event || 'message';
            return `## ${time} - ${type}\n\n${msg.content}\n`;
          }).join('\n');

        return {
          content: [{
            type: "text",
            text: `📄 Exported conversation:\n\n\`\`\`markdown\n${markdown}\n\`\`\``
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `❌ Error exporting conversation: ${error.message}`
          }]
        };
      }

    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// Iniciar servidor MCP
const transport = new StdioServerTransport();
server.connect(transport);

console.error("🤖 Claude Conversation Logger MCP Server started");