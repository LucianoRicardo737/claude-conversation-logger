import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Datos simulados para testing del dashboard
const mockData = {
    projects: [
        {
            name: 'claude-conversation-logger',
            message_count: 45,
            sessions: [
                {
                    session_id: 'session_123456789abcdef',
                    short_id: '12345678',
                    message_count: 15,
                    start_time: Date.now() - 3600000, // 1 hour ago
                    last_activity: Date.now() - 300000, // 5 minutes ago
                    is_active: true,
                    is_marked: false,
                    recent_messages: [
                        {
                            id: 'msg_1',
                            message_type: 'user',
                            content: 'actualiza el ejemplo de conversacion que esta en el readme, hace commit y push',
                            timestamp: Date.now() - 600000
                        },
                        {
                            id: 'msg_2',
                            message_type: 'assistant',
                            content: 'Voy a actualizar el ejemplo de conversación en el README con datos más realistas',
                            timestamp: Date.now() - 580000
                        }
                    ]
                },
                {
                    session_id: 'session_987654321fedcba',
                    short_id: '98765432',
                    message_count: 30,
                    start_time: Date.now() - 7200000, // 2 hours ago
                    last_activity: Date.now() - 1800000, // 30 minutes ago
                    is_active: false,
                    is_marked: true,
                    recent_messages: [
                        {
                            id: 'msg_3',
                            message_type: 'user',
                            content: 'vamos a trabajar un poco mas en el dashboard',
                            timestamp: Date.now() - 1900000
                        }
                    ]
                }
            ],
            last_activity: Date.now() - 300000
        },
        {
            name: 'uniCommerce',
            message_count: 120,
            sessions: [
                {
                    session_id: 'session_uniCommerce123',
                    short_id: 'uniComm1',
                    message_count: 60,
                    start_time: Date.now() - 14400000, // 4 hours ago
                    last_activity: Date.now() - 7200000, // 2 hours ago
                    is_active: false,
                    is_marked: false,
                    recent_messages: [
                        {
                            id: 'msg_4',
                            message_type: 'assistant',
                            content: 'Voy a implementar el sistema de sincronización con NewBytes',
                            timestamp: Date.now() - 7300000
                        }
                    ]
                }
            ],
            last_activity: Date.now() - 7200000
        }
    ]
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API endpoints para el dashboard
app.get('/api/conversations/tree', (req, res) => {
    const { project, hours_back = 24, limit = 50 } = req.query;
    
    let filteredProjects = [...mockData.projects];
    
    if (project) {
        filteredProjects = filteredProjects.filter(p => p.name === project);
    }
    
    const totalMessages = filteredProjects.reduce((sum, p) => sum + p.message_count, 0);
    const totalSessions = filteredProjects.reduce((sum, p) => sum + p.sessions.length, 0);
    
    res.json({
        projects: filteredProjects,
        total_messages: totalMessages,
        total_sessions: totalSessions
    });
});

app.get('/api/conversations/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    // Buscar la sesión en los datos simulados
    for (const project of mockData.projects) {
        const session = project.sessions.find(s => s.session_id === sessionId);
        if (session) {
            return res.json({
                session_id: session.session_id,
                project_name: project.name,
                messages: [
                    ...session.recent_messages,
                    {
                        id: 'msg_detailed_1',
                        message_type: 'user',
                        content: 'Este es un mensaje detallado de la conversación completa',
                        timestamp: session.start_time + 30000
                    },
                    {
                        id: 'msg_detailed_2',
                        message_type: 'assistant',
                        content: 'Respuesta detallada del asistente con información completa sobre la implementación realizada',
                        timestamp: session.start_time + 60000
                    }
                ],
                metadata: {
                    start_time: session.start_time,
                    last_activity: session.last_activity,
                    message_count: session.message_count,
                    is_marked: session.is_marked
                }
            });
        }
    }
    
    res.status(404).json({ error: 'Session not found' });
});

app.post('/api/search/advanced', (req, res) => {
    const { query, project_filter, message_type_filter, limit = 10 } = req.body;
    
    const mockResults = [
        {
            message: {
                id: 'search_result_1',
                session_id: 'session_123456789abcdef',
                project_name: 'claude-conversation-logger',
                message_type: 'user',
                content: `Resultado de búsqueda que contiene "${query}" en el contenido del mensaje`,
                timestamp: Date.now() - 3600000
            },
            highlights: [`...contiene "${query}" en el contenido...`],
            relevance_score: 0.95,
            context: {
                session_id: 'session_123456789abcdef',
                project_name: 'claude-conversation-logger',
                total_messages: 15,
                session_start: Date.now() - 7200000,
                is_marked: false
            }
        }
    ].filter(result => {
        if (project_filter && result.context.project_name !== project_filter) return false;
        if (message_type_filter && result.message.message_type !== message_type_filter) return false;
        return true;
    });
    
    res.json({
        results: mockResults.slice(0, limit),
        total_count: mockResults.length,
        returned_count: Math.min(mockResults.length, limit),
        has_more: mockResults.length > limit
    });
});

app.post('/api/conversations/:sessionId/mark', (req, res) => {
    const { sessionId } = req.params;
    const { is_marked, note, tags } = req.body;
    
    // Buscar y actualizar la sesión
    for (const project of mockData.projects) {
        const session = project.sessions.find(s => s.session_id === sessionId);
        if (session) {
            session.is_marked = is_marked;
            return res.json({
                success: true,
                message: is_marked ? 'Conversación marcada como importante' : 'Marca removida'
            });
        }
    }
    
    res.status(404).json({ error: 'Session not found' });
});

app.get('/api/conversations/:sessionId/export', (req, res) => {
    const { sessionId } = req.params;
    const { format = 'json' } = req.query;
    
    // Buscar la sesión
    for (const project of mockData.projects) {
        const session = project.sessions.find(s => s.session_id === sessionId);
        if (session) {
            const exportData = {
                session_id: sessionId,
                project_name: project.name,
                messages: session.recent_messages,
                exported_at: new Date().toISOString()
            };
            
            if (format === 'json') {
                return res.json(exportData);
            } else if (format === 'markdown') {
                const markdownContent = `# Conversación: ${project.name}

**Session ID**: \`${sessionId}\`
**Exportada**: ${new Date().toLocaleString()}

${session.recent_messages.map(msg => 
`## ${msg.message_type.charAt(0).toUpperCase() + msg.message_type.slice(1)}
*${new Date(msg.timestamp).toLocaleString()}*

${msg.content}
`).join('\n---\n\n')}`;
                
                return res.json({
                    content: markdownContent,
                    filename: `conversation_${session.short_id}.md`,
                    mime_type: 'text/markdown',
                    message_count: session.message_count
                });
            }
        }
    }
    
    res.status(404).json({ error: 'Session not found' });
});

// Dashboard routes (servir archivos estáticos del dashboard)
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Redirigir / al dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Claude Conversation Logger (Demo) running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`📝 API: http://localhost:${PORT}/api/conversations/tree`);
    console.log('✅ Demo server ready with mock data');
});