import { getGrpcServer } from './grpc-server.js';

// Referencias externas que se inyectarán desde server.js
let messagesCollection = null;
let redisClient = null;

// Inyectar dependencias desde el servidor principal
export function injectDependencies(mongoCollection, redis) {
    messagesCollection = mongoCollection;
    redisClient = redis;
}

// Handler para streaming de mensajes en tiempo real
export function handleStreamMessages(call) {
    const grpcServer = getGrpcServer();
    grpcServer.registerClient(call);
    
    // Enviar evento de conexión inicial
    call.write({
        type: 'connection',
        message: null,
        timestamp: Date.now()
    });

    // El streaming continuo se maneja desde el broadcast del servidor
}

// Handler para obtener el árbol de conversaciones
export async function handleGetConversationTree(call, callback) {
    try {
        const { project_filter, limit = 50, hours_back = 24 } = call.request;
        
        if (!messagesCollection) {
            return callback(new Error('Database not available'));
        }

        const hoursAgo = new Date(Date.now() - (hours_back * 60 * 60 * 1000));
        
        // Query base con filtro de tiempo
        const baseQuery = {
            timestamp: { $gte: hoursAgo }
        };
        
        if (project_filter) {
            baseQuery.project_name = project_filter;
        }

        // Agregación para obtener estructura de árbol
        const pipeline = [
            { $match: baseQuery },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: {
                        project: '$project_name',
                        session: '$session_id'
                    },
                    messages: { $push: '$$ROOT' },
                    message_count: { $sum: 1 },
                    start_time: { $min: '$timestamp' },
                    last_activity: { $max: '$timestamp' }
                }
            },
            {
                $group: {
                    _id: '$_id.project',
                    sessions: {
                        $push: {
                            session_id: '$_id.session',
                            short_id: { $substr: ['$_id.session', 0, 8] },
                            message_count: '$message_count',
                            start_time: { $toLong: '$start_time' },
                            last_activity: { $toLong: '$last_activity' },
                            is_active: {
                                $gt: ['$last_activity', new Date(Date.now() - 30 * 60 * 1000)]
                            },
                            recent_messages: { $slice: ['$messages', 3] }
                        }
                    },
                    total_messages: { $sum: '$message_count' },
                    last_activity: { $max: '$last_activity' }
                }
            },
            { $sort: { last_activity: -1 } },
            { $limit: limit }
        ];

        const results = await messagesCollection.aggregate(pipeline).toArray();
        
        // Transformar a formato del protocolo
        const projects = results.map(project => ({
            name: project._id,
            message_count: project.total_messages,
            sessions: project.sessions.map(session => ({
                ...session,
                is_marked: false, // TODO: Implementar marcadores
                recent_messages: session.recent_messages.map(formatMessage)
            })),
            last_activity: project.last_activity.getTime()
        }));

        const totalMessages = projects.reduce((sum, p) => sum + p.message_count, 0);
        const totalSessions = projects.reduce((sum, p) => sum + p.sessions.length, 0);

        callback(null, {
            projects,
            total_messages: totalMessages,
            total_sessions: totalSessions
        });

    } catch (error) {
        console.error('❌ Error in GetConversationTree:', error);
        callback(error);
    }
}

// Handler para búsqueda de conversaciones
export async function handleSearchConversations(call, callback) {
    try {
        const {
            query,
            project_filter,
            session_filter,
            message_type_filter,
            start_date,
            end_date,
            only_marked,
            limit = 50,
            offset = 0
        } = call.request;

        if (!messagesCollection) {
            return callback(new Error('Database not available'));
        }

        // Construir query de búsqueda
        const searchQuery = {};

        // Búsqueda de texto
        if (query) {
            searchQuery.$text = { $search: query };
        }

        // Filtros
        if (project_filter) {
            searchQuery.project_name = project_filter;
        }

        if (session_filter) {
            searchQuery.session_id = session_filter;
        }

        if (message_type_filter) {
            searchQuery.message_type = message_type_filter;
        }

        // Filtro de fechas
        if (start_date || end_date) {
            searchQuery.timestamp = {};
            if (start_date) {
                searchQuery.timestamp.$gte = new Date(parseInt(start_date));
            }
            if (end_date) {
                searchQuery.timestamp.$lte = new Date(parseInt(end_date));
            }
        }

        // Contar total
        const totalCount = await messagesCollection.countDocuments(searchQuery);
        
        // Obtener resultados paginados
        const messages = await messagesCollection
            .find(searchQuery)
            .sort({ timestamp: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        // Formatear resultados
        const results = messages.map(msg => ({
            message: formatMessage(msg),
            highlights: query ? extractHighlights(msg.content, query) : [],
            relevance_score: 1.0, // TODO: Implementar scoring real
            context: {
                session_id: msg.session_id,
                project_name: msg.project_name,
                total_messages: 0, // TODO: Contar mensajes de la sesión
                session_start: msg.timestamp.getTime(),
                is_marked: false // TODO: Implementar marcadores
            }
        }));

        callback(null, {
            results,
            total_count: totalCount,
            returned_count: results.length,
            has_more: offset + results.length < totalCount
        });

    } catch (error) {
        console.error('❌ Error in SearchConversations:', error);
        callback(error);
    }
}

// Handler para marcar conversaciones como importantes
export async function handleMarkImportant(call, callback) {
    try {
        const { session_id, is_marked, note, tags } = call.request;
        
        // TODO: Implementar sistema de marcadores
        // Por ahora, guardamos en Redis como ejemplo
        if (redisClient && redisClient.isOpen) {
            const key = `marked:${session_id}`;
            if (is_marked) {
                await redisClient.setEx(key, 86400 * 30, JSON.stringify({ // 30 días
                    marked: true,
                    note: note || '',
                    tags: tags || [],
                    marked_at: Date.now()
                }));
            } else {
                await redisClient.del(key);
            }
        }

        callback(null, {
            success: true,
            message: is_marked ? 'Conversación marcada como importante' : 'Marca removida'
        });

    } catch (error) {
        console.error('❌ Error in MarkImportant:', error);
        callback(error);
    }
}

// Handler para exportar conversaciones
export async function handleExportConversation(call, callback) {
    try {
        const { session_id, format = 'json', include_metadata = true } = call.request;

        if (!messagesCollection) {
            return callback(new Error('Database not available'));
        }

        // Obtener todos los mensajes de la sesión
        const messages = await messagesCollection
            .find({ session_id })
            .sort({ timestamp: 1 })
            .toArray();

        if (messages.length === 0) {
            return callback(new Error('Session not found'));
        }

        let content, filename, mimeType;

        switch (format) {
            case 'json':
                content = JSON.stringify(messages, null, 2);
                filename = `conversation_${session_id.substring(0, 8)}.json`;
                mimeType = 'application/json';
                break;

            case 'markdown':
                content = formatAsMarkdown(messages, include_metadata);
                filename = `conversation_${session_id.substring(0, 8)}.md`;
                mimeType = 'text/markdown';
                break;

            case 'txt':
                content = formatAsText(messages, include_metadata);
                filename = `conversation_${session_id.substring(0, 8)}.txt`;
                mimeType = 'text/plain';
                break;

            default:
                return callback(new Error('Unsupported format'));
        }

        callback(null, {
            content,
            filename,
            mime_type: mimeType,
            message_count: messages.length
        });

    } catch (error) {
        console.error('❌ Error in ExportConversation:', error);
        callback(error);
    }
}

// Handler para estadísticas en tiempo real
export function handleGetLiveStats(call) {
    const grpcServer = getGrpcServer();
    grpcServer.registerClient(call);
    
    // Enviar estadísticas iniciales
    sendLiveStats(call);
    
    // Configurar actualizaciones periódicas
    const interval = setInterval(() => {
        sendLiveStats(call);
    }, 5000); // Cada 5 segundos

    call.on('cancelled', () => {
        clearInterval(interval);
    });
}

// Funciones auxiliares
function formatMessage(msg) {
    return {
        id: msg._id?.toString() || msg.id,
        session_id: msg.session_id,
        project_name: msg.project_name,
        message_type: msg.message_type,
        content: msg.content,
        hook_event: msg.hook_event,
        timestamp: msg.timestamp.getTime ? msg.timestamp.getTime() : msg.timestamp,
        metadata: msg.metadata ? {
            source: msg.metadata.source || '',
            model: msg.metadata.model || '',
            usage: msg.metadata.usage ? {
                input_tokens: msg.metadata.usage.input_tokens || 0,
                output_tokens: msg.metadata.usage.output_tokens || 0,
                cache_creation_input_tokens: msg.metadata.usage.cache_creation_input_tokens || 0,
                cache_read_input_tokens: msg.metadata.usage.cache_read_input_tokens || 0,
                service_tier: msg.metadata.usage.service_tier || ''
            } : null,
            cost_usd: msg.metadata.cost_usd || 0,
            duration_ms: msg.metadata.duration_ms || 0
        } : null
    };
}

function extractHighlights(content, query) {
    if (!content || !query) return [];
    
    const words = query.toLowerCase().split(' ').filter(word => word.length > 2);
    const highlights = [];
    
    words.forEach(word => {
        const regex = new RegExp(`(.{0,50})${word}(.{0,50})`, 'gi');
        const matches = content.match(regex);
        if (matches) {
            highlights.push(...matches.slice(0, 3)); // Max 3 highlights
        }
    });
    
    return highlights;
}

function formatAsMarkdown(messages, includeMetadata) {
    const project = messages[0]?.project_name || 'Unknown';
    const sessionId = messages[0]?.session_id || 'Unknown';
    const startTime = new Date(messages[0]?.timestamp || Date.now()).toLocaleString();
    
    let content = `# Conversación: ${project}\n\n`;
    content += `**Session ID**: \`${sessionId}\`\n`;
    content += `**Iniciada**: ${startTime}\n`;
    content += `**Mensajes**: ${messages.length}\n\n---\n\n`;

    messages.forEach((msg, index) => {
        const time = new Date(msg.timestamp).toLocaleString();
        const icon = msg.message_type === 'user' ? '👤' : 
                    msg.message_type === 'assistant' ? '🤖' : '🔧';
        
        content += `## ${icon} ${msg.message_type.charAt(0).toUpperCase() + msg.message_type.slice(1)}\n`;
        content += `*${time}*\n\n`;
        content += `${msg.content}\n\n`;
        
        if (includeMetadata && msg.metadata) {
            content += `<details>\n<summary>Metadata</summary>\n\n`;
            content += `\`\`\`json\n${JSON.stringify(msg.metadata, null, 2)}\n\`\`\`\n\n</details>\n\n`;
        }
        
        if (index < messages.length - 1) {
            content += '---\n\n';
        }
    });

    return content;
}

function formatAsText(messages, includeMetadata) {
    const project = messages[0]?.project_name || 'Unknown';
    const sessionId = messages[0]?.session_id || 'Unknown';
    const startTime = new Date(messages[0]?.timestamp || Date.now()).toLocaleString();
    
    let content = `CONVERSACIÓN: ${project}\n`;
    content += `Session ID: ${sessionId}\n`;
    content += `Iniciada: ${startTime}\n`;
    content += `Mensajes: ${messages.length}\n`;
    content += '='.repeat(60) + '\n\n';

    messages.forEach((msg, index) => {
        const time = new Date(msg.timestamp).toLocaleString();
        content += `[${time}] ${msg.message_type.toUpperCase()}: ${msg.content}\n`;
        
        if (includeMetadata && msg.metadata) {
            content += `METADATA: ${JSON.stringify(msg.metadata, null, 2)}\n`;
        }
        
        content += '\n' + '-'.repeat(40) + '\n\n';
    });

    return content;
}

async function sendLiveStats(call) {
    try {
        // TODO: Implementar obtención de estadísticas reales
        const stats = {
            type: 'live_update',
            stats: {
                total_messages: 0,
                total_sessions: 0,
                active_projects: 0,
                total_cost_usd: 0,
                total_tokens: 0,
                project_stats: [],
                recent_activity: {
                    last_messages: [],
                    messages_last_hour: 0,
                    active_sessions: 0
                }
            },
            timestamp: Date.now()
        };

        call.write(stats);
    } catch (error) {
        console.error('❌ Error sending live stats:', error);
    }
}

// Función para broadcast de nuevos mensajes (llamada desde server.js)
export function broadcastNewMessage(message) {
    const grpcServer = getGrpcServer();
    const event = {
        type: 'new_message',
        message: formatMessage(message),
        timestamp: Date.now()
    };
    
    grpcServer.broadcast(event);
}

export function broadcastStatsUpdate() {
    const grpcServer = getGrpcServer();
    // Se podría implementar broadcast de estadísticas aquí
}