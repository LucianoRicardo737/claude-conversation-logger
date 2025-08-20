#!/usr/bin/env node
/**
 * MCP Server para Claude Conversation Logger
 * Proporciona herramientas nativas para Claude Code para consultar conversaciones
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
 * Realizar petición a la API
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
 * Calcular score de frescura para priorizar conversaciones recientes
 */
function calculateFreshnessScore(timestamp) {
  const now = Date.now();
  const messageTime = new Date(timestamp).getTime();
  const hoursDiff = (now - messageTime) / (1000 * 60 * 60);
  
  // Score más alto para mensajes más recientes
  if (hoursDiff < 1) return 100;
  if (hoursDiff < 24) return 90;
  if (hoursDiff < 168) return 70; // 1 semana
  if (hoursDiff < 720) return 50; // 1 mes
  return 20;
}

/**
 * Detectar si una conversación está resuelta
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
        description: "Buscar en el historial de conversaciones con priorización por frescura",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Términos de búsqueda"
            },
            days: {
              type: "number",
              description: "Limitar búsqueda a los últimos N días (default: 7)",
              default: 7
            },
            include_resolved: {
              type: "boolean",
              description: "Incluir conversaciones ya resueltas (default: false)",
              default: false
            },
            limit: {
              type: "number",
              description: "Número máximo de resultados (default: 10)",
              default: 10
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_recent_conversations",
        description: "Obtener conversaciones recientes priorizadas por frescura",
        inputSchema: {
          type: "object",
          properties: {
            hours: {
              type: "number",
              description: "Horas hacia atrás (default: 24)",
              default: 24
            },
            project: {
              type: "string",
              description: "Filtrar por proyecto específico (opcional)"
            },
            limit: {
              type: "number",
              description: "Número máximo de conversaciones (default: 5)",
              default: 5
            }
          }
        }
      },
      {
        name: "analyze_conversation_patterns",
        description: "Analizar patrones en las conversaciones para identificar temas recurrentes",
        inputSchema: {
          type: "object",
          properties: {
            days: {
              type: "number", 
              description: "Analizar últimos N días (default: 7)",
              default: 7
            },
            project: {
              type: "string",
              description: "Filtrar por proyecto (opcional)"
            }
          }
        }
      },
      {
        name: "export_conversation",
        description: "Exportar una conversación completa en formato Markdown",
        inputSchema: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "ID de la sesión a exportar"
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
        const { query, days = 7, include_resolved = false, limit = 10 } = request.params.arguments;
        
        // Buscar en la API
        const searchParams = new URLSearchParams({
          q: query,
          days: days.toString(),
          limit: (limit * 2).toString() // Obtener más para filtrar
        });

        const results = await apiRequest(`search?${searchParams}`);
        
        // Filtrar y priorizar resultados
        let filteredResults = results.messages || [];
        
        if (!include_resolved) {
          filteredResults = filteredResults.filter(msg => !isResolved([msg]));
        }
        
        // Agregar score de frescura y ordenar
        filteredResults = filteredResults
          .map(msg => ({
            ...msg,
            freshness_score: calculateFreshnessScore(msg.created_at || msg.timestamp)
          }))
          .sort((a, b) => b.freshness_score - a.freshness_score)
          .slice(0, limit);

        return {
          content: [
            {
              type: "text",
              text: `🔍 Encontradas ${filteredResults.length} conversaciones para "${query}":\n\n` +
                filteredResults.map((msg, i) => 
                  `${i + 1}. **${msg.project_name}** (${new Date(msg.created_at || msg.timestamp).toLocaleString()})\n` +
                  `   Score: ${msg.freshness_score}/100\n` +
                  `   ${msg.content.substring(0, 150)}...\n`
                ).join('\n')
            }
          ]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `❌ Error buscando conversaciones: ${error.message}`
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
        
        // Filtrar por tiempo y calcular frescura
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
            text: `📅 Conversaciones recientes (últimas ${hours}h):\n\n` +
              recentMessages.map((msg, i) =>
                `${i + 1}. **${msg.project_name}** - ${msg.session_id}\n` +
                `   ${new Date(msg.created_at || msg.timestamp).toLocaleString()}\n` +
                `   ${msg.content.substring(0, 200)}...\n`
              ).join('\n') +
              (recentMessages.length === 0 ? 'No hay conversaciones recientes.' : '')
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text", 
            text: `❌ Error obteniendo conversaciones recientes: ${error.message}`
          }]
        };
      }

    case "analyze_conversation_patterns":
      try {
        const { days = 7, project } = request.params.arguments;
        
        const params = new URLSearchParams({
          days: days.toString(),
          limit: '100' // Obtener más datos para análisis
        });
        
        if (project) params.set('project', project);

        const results = await apiRequest(`messages?${params}`);
        const messages = results.messages || [];
        
        // Análisis de patrones
        const projectCounts = {};
        const sessionCounts = {};
        const hourlyActivity = Array(24).fill(0);
        const keywords = {};
        
        messages.forEach(msg => {
          // Conteo por proyecto
          projectCounts[msg.project_name] = (projectCounts[msg.project_name] || 0) + 1;
          
          // Conteo por sesión
          sessionCounts[msg.session_id] = (sessionCounts[msg.session_id] || 0) + 1;
          
          // Actividad por hora
          const hour = new Date(msg.created_at || msg.timestamp).getHours();
          hourlyActivity[hour]++;
          
          // Análisis de palabras clave
          const words = msg.content.toLowerCase().match(/\b[a-záéíóúñ]+\b/g) || [];
          words.forEach(word => {
            if (word.length > 4) { // Solo palabras significativas
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

        return {
          content: [{
            type: "text",
            text: `📊 Análisis de conversaciones (últimos ${days} días):\n\n` +
              `**Proyectos más activos:**\n${topProjects.map(([proj, count]) => `• ${proj}: ${count} mensajes`).join('\n')}\n\n` +
              `**Palabras clave frecuentes:**\n${topKeywords.map(([word, count]) => `• ${word}: ${count} veces`).join('\n')}\n\n` +
              `**Hora más activa:** ${mostActiveHour}:00 (${hourlyActivity[mostActiveHour]} mensajes)\n\n` +
              `**Total de sesiones únicas:** ${Object.keys(sessionCounts).length}\n` +
              `**Total de mensajes:** ${messages.length}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `❌ Error analizando patrones: ${error.message}`
          }]
        };
      }

    case "export_conversation":
      try {
        const { session_id } = request.params.arguments;
        
        const params = new URLSearchParams({
          session: session_id,
          limit: '1000' // Obtener toda la conversación
        });

        const results = await apiRequest(`messages?${params}`);
        const messages = results.messages || [];
        
        if (messages.length === 0) {
          return {
            content: [{
              type: "text",
              text: `❌ No se encontraron mensajes para la sesión: ${session_id}`
            }]
          };
        }
        
        // Generar Markdown
        const project = messages[0]?.project_name || 'Unknown';
        const startTime = messages[0]?.created_at || messages[0]?.timestamp;
        const endTime = messages[messages.length - 1]?.created_at || messages[messages.length - 1]?.timestamp;
        
        const markdown = `# Conversación: ${project}\n\n` +
          `**Sesión:** ${session_id}\n` +
          `**Inicio:** ${new Date(startTime).toLocaleString()}\n` +
          `**Fin:** ${new Date(endTime).toLocaleString()}\n` +
          `**Total de mensajes:** ${messages.length}\n\n` +
          `---\n\n` +
          messages.map(msg => {
            const time = new Date(msg.created_at || msg.timestamp).toLocaleString();
            const type = msg.message_type || msg.hook_event || 'message';
            return `## ${time} - ${type}\n\n${msg.content}\n`;
          }).join('\n');

        return {
          content: [{
            type: "text",
            text: `📄 Conversación exportada:\n\n\`\`\`markdown\n${markdown}\n\`\`\``
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `❌ Error exportando conversación: ${error.message}`
          }]
        };
      }

    default:
      throw new Error(`Herramienta desconocida: ${request.params.name}`);
  }
});

// Iniciar servidor MCP
const transport = new StdioServerTransport();
server.connect(transport);

console.error("🤖 MCP Server de Claude Conversation Logger iniciado");