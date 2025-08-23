import express from 'express';
import { MongoClient } from 'mongodb';
import Redis from 'redis';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGrpcServer } from './grpc/grpc-server.js';
import { injectDependencies, broadcastNewMessage } from './grpc/grpc-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration constants
const REDIS_MESSAGE_LIMIT = parseInt(process.env.REDIS_MESSAGE_LIMIT) || 5000;

// Redis connection
const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis'));

// MongoDB connection
let mongoClient;
let messagesCollection;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:claude_logger_2024@localhost:27017/conversations?authSource=admin';

// Session tracking for analytics
const inMemorySessions = new Map();

// Middleware - Configuración abierta para desarrollo local
app.use(compression());
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*']
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// API Key middleware
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.API_SECRET || 'claude_api_secret_2024_change_me';
    
    if (apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }
    
    next();
};

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: uptime
    });
});

// Helper function to save token usage (OpenTelemetry compliant)
async function saveTokenUsage(data) {
    const tokenId = uuidv4();
    const tokenRecord = {
        _id: tokenId,
        id: tokenId,
        session_id: data.session_id,
        project_name: data.project_name,
        message_type: 'token_metric',
        content: data.content || '',
        hook_event: 'TokenUsage',
        timestamp: new Date(),
        created_at: new Date(),
        metadata: {
            ...data.metadata,
            // OpenTelemetry standard fields
            token_type: data.metadata?.token_type || 'unknown',
            token_count: data.metadata?.token_count || 0,
            model: data.metadata?.model || 'unknown',
            cost_usd: data.metadata?.cost_usd || 0,
            duration_ms: data.metadata?.duration_ms || 0
        }
    };

    return await saveToStorage(tokenRecord);
}

// Helper function to save message
async function saveMessage(data) {
    const messageId = uuidv4();
    const message = {
        _id: messageId,
        id: messageId,
        session_id: data.session_id,
        project_name: data.project_name,
        message_type: data.message_type || 'user',
        content: data.content || '',
        hook_event: data.hook_event || 'unknown',
        timestamp: new Date(),
        created_at: new Date(),
        metadata: {
            ...data.metadata,
            // Enhanced metadata for OpenTelemetry compatibility
            cost_usd: data.metadata?.cost_usd || 0,
            duration_ms: data.metadata?.duration_ms || 0
        }
    };

    return await saveToStorage(message);
}

// Helper function to save with optimized flow: MongoDB → Redis (configurable limit for MCP)
async function saveToStorage(record) {
    let mongoSaveSuccess = false;
    
    // 1. FIRST: Save to MongoDB (PERSISTENT STORAGE)
    try {
        if (messagesCollection) {
            await messagesCollection.insertOne(record);
            mongoSaveSuccess = true;
            console.log(`💾 Saved to MongoDB: ${record.session_id} (${record.message_type})`);
        }
    } catch (error) {
        console.warn('❌ MongoDB save failed:', error.message);
    }

    // 2. SECOND: Update Redis cache for high-availability MCP queries (configurable limit)
    try {
        if (redisClient.isOpen) {
            const recordForCache = {
                ...record,
                timestamp: record.timestamp.toISOString(),
                created_at: record.created_at.toISOString()
            };
            
            // Save individual message
            await redisClient.setEx(`msg:${record.id}`, 86400, JSON.stringify(recordForCache)); // 24h TTL
            
            // Update recent messages list for fast MCP queries (configurable capacity)
            await redisClient.lPush('messages:recent', JSON.stringify(recordForCache));
            await redisClient.lTrim('messages:recent', 0, REDIS_MESSAGE_LIMIT - 1); // Keep last N messages
            
            // Invalidate dashboard cache to force refresh
            await redisClient.del('dashboard:stats');
            
            console.log(`⚡ Cached in Redis: ${record.id}`);
            
            // Broadcast nuevo mensaje via gRPC para tiempo real
            broadcastNewMessage(record);
        }
    } catch (error) {
        console.warn('⚠️  Redis cache update failed:', error.message);
    }

    return record;
}

// Main logging endpoint
app.post('/api/log', validateApiKey, async (req, res) => {
    try {
        const {
            session_id,
            project_name,
            content,
            hook_event,
            message_type,
            metadata
        } = req.body;

        if (!session_id || !project_name) {
            return res.status(400).json({ error: 'session_id and project_name are required' });
        }

        const message = await saveMessage({
            session_id,
            project_name,
            content,
            hook_event,
            message_type,
            metadata
        });

        res.status(200).json({ 
            message: 'Message logged successfully',
            id: message.id
        });

    } catch (error) {
        console.error('Error in /api/log:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// OpenTelemetry token usage endpoint
app.post('/api/token-usage', validateApiKey, async (req, res) => {
    try {
        const {
            session_id,
            project_name,
            content,
            hook_event,
            message_type,
            metadata
        } = req.body;

        if (!session_id || !project_name) {
            return res.status(400).json({ error: 'session_id and project_name are required' });
        }

        if (!metadata?.token_type || !metadata?.token_count) {
            return res.status(400).json({ error: 'metadata.token_type and metadata.token_count are required' });
        }

        const tokenRecord = await saveTokenUsage({
            session_id,
            project_name,
            content,
            hook_event: hook_event || 'TokenUsage',
            message_type: message_type || 'token_metric',
            metadata
        });

        res.status(200).json({ 
            message: 'Token usage logged successfully',
            id: tokenRecord.id,
            token_type: metadata.token_type,
            token_count: metadata.token_count
        });

    } catch (error) {
        console.error('Error in /api/token-usage:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function to get messages with optimized flow: Redis → MongoDB (no memory fallback)
async function getMessagesFromStorage(limit = 10, project = null, session = null) {
    let messages = [];
    
    // 1. FIRST: Try Redis cache (FAST for Claude Code)
    try {
        if (redisClient.isOpen) {
            const cacheKey = `messages:query:${limit}:${project || 'all'}:${session || 'all'}`;
            const cached = await redisClient.get(cacheKey);
            
            if (cached) {
                messages = JSON.parse(cached);
                console.log(`⚡ Retrieved ${messages.length} messages from Redis cache`);
                return messages;
            }
        }
    } catch (error) {
        console.warn('⚠️  Redis read failed:', error.message);
    }
    
    // 2. SECOND: Try MongoDB (PERSISTENT storage)
    try {
        if (messagesCollection) {
            const query = {};
            if (project) query.project_name = project;
            if (session) query.session_id = session;

            const mongoMessages = await messagesCollection
                .find(query)
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
            
            messages = mongoMessages.map(msg => ({
                ...msg,
                timestamp: msg.timestamp.toISOString(),
                created_at: msg.created_at.toISOString()
            }));
            
            // Cache result in Redis for next query
            if (redisClient.isOpen && messages.length > 0) {
                const cacheKey = `messages:query:${limit}:${project || 'all'}:${session || 'all'}`;
                await redisClient.setEx(cacheKey, 300, JSON.stringify(messages)); // 5min TTL
            }
            
            console.log(`💾 Retrieved ${messages.length} messages from MongoDB`);
            return messages;
        }
    } catch (error) {
        console.warn('❌ MongoDB read failed:', error.message);
    }
    
    // Return empty array if both Redis and MongoDB failed
    console.log('⚠️  Returning empty messages array - both Redis cache and MongoDB unavailable');
    return [];
}

// Helper function to search in Redis (fast, recent messages)
async function searchInRedis(query, days = 7, limit = 10) {
    let messages = [];
    
    try {
        if (redisClient.isOpen) {
            // Get recent messages from Redis
            const redisMessages = await redisClient.lRange('messages:recent', 0, -1);
            messages = redisMessages.map(msg => JSON.parse(msg));
            console.log(`⚡ Retrieved ${messages.length} messages from Redis for search`);
        }
    } catch (error) {
        console.warn('⚠️  Redis search failed:', error.message);
        return [];
    }
    
    // Filter by time
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    messages = messages.filter(msg => 
        new Date(msg.timestamp || msg.created_at) > cutoffDate
    );
    
    // Search in content and project name
    if (query) {
        const searchTerm = query.toLowerCase();
        messages = messages.filter(msg => 
            (msg.content || '').toLowerCase().includes(searchTerm) ||
            (msg.project_name || '').toLowerCase().includes(searchTerm) ||
            (msg.session_id || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // Sort by relevance and limit
    messages = messages
        .sort((a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at))
        .slice(0, limit);
    
    return messages;
}

// Helper function to search in MongoDB (deep, historical search)
async function searchInMongoDB(query, days = 30, limit = 50, project = null) {
    let messages = [];
    
    try {
        if (messagesCollection) {
            // Build MongoDB query
            const mongoQuery = {};
            
            if (project) {
                mongoQuery.project_name = project;
            }
            
            // Time filter
            if (days) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);
                mongoQuery.timestamp = { $gte: cutoffDate };
            }
            
            // Text search
            if (query) {
                mongoQuery.$or = [
                    { content: { $regex: query, $options: 'i' } },
                    { project_name: { $regex: query, $options: 'i' } },
                    { session_id: { $regex: query, $options: 'i' } }
                ];
            }
            
            const mongoMessages = await messagesCollection
                .find(mongoQuery)
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();
            
            messages = mongoMessages.map(msg => ({
                ...msg,
                timestamp: msg.timestamp.toISOString(),
                created_at: msg.created_at.toISOString()
            }));
            
            console.log(`💾 Retrieved ${messages.length} messages from MongoDB deep search`);
        }
    } catch (error) {
        console.warn('❌ MongoDB search failed:', error.message);
        return [];
    }
    
    return messages;
}

// Get recent messages API endpoint
app.get('/api/messages', validateApiKey, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const project = req.query.project;
        const session = req.query.session;

        const messages = await getMessagesFromStorage(limit, project, session);

        res.json({
            count: messages.length,
            messages: messages.map(msg => ({
                id: msg.id,
                session_id: msg.session_id.substring(0, 12) + '...',
                project_name: msg.project_name,
                message_type: msg.message_type,
                content: msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''),
                timestamp: msg.timestamp,
                created_at: msg.created_at,
                hook_event: msg.hook_event
            }))
        });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Smart search messages - dual layer (Redis + MongoDB)
app.get('/api/search', validateApiKey, async (req, res) => {
    try {
        const query = req.query.q || '';
        const days = parseInt(req.query.days) || 7;
        const limit = parseInt(req.query.limit) || 10;
        const deep = req.query.deep === 'true' || req.query.deep === true;
        const project = req.query.project;

        let messages = [];
        
        // Choose search strategy based on parameters
        if (deep || days > 30) {
            // Deep search in MongoDB for historical data
            messages = await searchInMongoDB(query, days, limit * 2, project);
            console.log(`🔍 Deep search completed: ${messages.length} results from MongoDB`);
        } else {
            // Fast search in Redis for recent data
            messages = await searchInRedis(query, days, limit * 2);
            
            // Fallback to MongoDB if Redis has insufficient results
            if (messages.length < limit && query) {
                console.log(`⚡ Redis search returned ${messages.length} results, trying MongoDB fallback...`);
                const mongoResults = await searchInMongoDB(query, days, limit, project);
                
                // Merge results and remove duplicates
                const combinedMessages = [...messages];
                const existingIds = new Set(messages.map(m => m.id || m._id));
                
                mongoResults.forEach(msg => {
                    if (!existingIds.has(msg.id || msg._id)) {
                        combinedMessages.push(msg);
                    }
                });
                
                messages = combinedMessages;
                console.log(`🔄 Combined search: ${messages.length} total results`);
            }
        }

        // Final sort and limit
        messages = messages
            .sort((a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at))
            .slice(0, limit);

        res.json({
            query,
            days,
            deep,
            count: messages.length,
            source: deep || days > 30 ? 'mongodb' : 'redis+mongodb',
            messages: messages.map(msg => ({
                id: msg.id || msg._id,
                session_id: (msg.session_id || '').substring(0, 12) + '...',
                project_name: msg.project_name,
                content: (msg.content || '').substring(0, 300) + (msg.content && msg.content.length > 300 ? '...' : ''),
                timestamp: msg.timestamp || msg.created_at,
                created_at: msg.created_at || msg.timestamp,
                message_type: msg.message_type,
                hook_event: msg.hook_event
            }))
        });
    } catch (error) {
        console.error('Error in smart search:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            query,
            count: 0,
            messages: []
        });
    }
});

// Deep search endpoint - MongoDB only, for comprehensive historical search
app.get('/api/search/deep', validateApiKey, async (req, res) => {
    try {
        const query = req.query.q || '';
        const days = parseInt(req.query.days) || 90; // Default to 90 days for deep search
        const limit = parseInt(req.query.limit) || 50; // Higher limit for deep search
        const project = req.query.project;
        const session = req.query.session;
        const messageType = req.query.message_type;

        if (!messagesCollection) {
            return res.status(503).json({ 
                error: 'MongoDB not available for deep search',
                query,
                count: 0,
                messages: []
            });
        }

        // Build comprehensive MongoDB query
        const mongoQuery = {};
        
        // Project filter
        if (project) {
            mongoQuery.project_name = project;
        }
        
        // Session filter
        if (session) {
            mongoQuery.session_id = { $regex: session, $options: 'i' };
        }
        
        // Message type filter
        if (messageType) {
            mongoQuery.message_type = messageType;
        }
        
        // Time filter
        if (days && days > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            mongoQuery.timestamp = { $gte: cutoffDate };
        }
        
        // Text search with comprehensive fields
        if (query) {
            const searchRegex = { $regex: query, $options: 'i' };
            mongoQuery.$or = [
                { content: searchRegex },
                { project_name: searchRegex },
                { session_id: searchRegex },
                { hook_event: searchRegex },
                { 'metadata.source': searchRegex },
                { 'metadata.model': searchRegex }
            ];
        }
        
        console.log(`🔍 Deep search query:`, JSON.stringify(mongoQuery, null, 2));
        
        // Execute MongoDB search with comprehensive sorting
        const mongoMessages = await messagesCollection
            .find(mongoQuery)
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
        
        const messages = mongoMessages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
            created_at: msg.created_at.toISOString()
        }));
        
        console.log(`💾 Deep search completed: ${messages.length} results from MongoDB`);
        
        // Group results by session for better organization
        const sessionGroups = {};
        messages.forEach(msg => {
            const sessionKey = msg.session_id;
            if (!sessionGroups[sessionKey]) {
                sessionGroups[sessionKey] = {
                    session_id: sessionKey,
                    project_name: msg.project_name,
                    messages: [],
                    first_message: msg.timestamp,
                    last_message: msg.timestamp,
                    total_messages: 0
                };
            }
            sessionGroups[sessionKey].messages.push(msg);
            sessionGroups[sessionKey].total_messages++;
            
            // Update time range
            if (msg.timestamp < sessionGroups[sessionKey].first_message) {
                sessionGroups[sessionKey].first_message = msg.timestamp;
            }
            if (msg.timestamp > sessionGroups[sessionKey].last_message) {
                sessionGroups[sessionKey].last_message = msg.timestamp;
            }
        });

        res.json({
            query,
            days,
            project,
            session,
            message_type: messageType,
            count: messages.length,
            sessions_found: Object.keys(sessionGroups).length,
            source: 'mongodb_deep',
            messages: messages.map(msg => ({
                id: msg.id || msg._id,
                session_id: msg.session_id,
                project_name: msg.project_name,
                content: msg.content,
                timestamp: msg.timestamp,
                created_at: msg.created_at,
                message_type: msg.message_type,
                hook_event: msg.hook_event,
                metadata: msg.metadata
            })),
            session_groups: Object.values(sessionGroups).sort((a, b) => 
                new Date(b.last_message) - new Date(a.last_message)
            )
        });
    } catch (error) {
        console.error('Error in deep search:', error);
        res.status(500).json({ 
            error: 'Deep search failed',
            details: error.message,
            query: req.query.q || '',
            count: 0,
            messages: []
        });
    }
});

// New API endpoints for advanced dashboard

// Get conversation tree (projects → sessions → messages)
app.get('/api/conversations/tree', validateApiKey, async (req, res) => {
    try {
        const { 
            project = '', 
            limit = 50, 
            hours_back = 24 
        } = req.query;

        if (!messagesCollection) {
            return res.status(503).json({ error: 'Database not available' });
        }

        const hoursAgo = new Date(Date.now() - (parseInt(hours_back) * 60 * 60 * 1000));
        
        // Query base con filtro de tiempo
        const baseQuery = {
            timestamp: { $gte: hoursAgo }
        };
        
        if (project) {
            baseQuery.project_name = project;
        }

        // Agregación para obtener estructura de árbol
        const pipeline = [
            { 
                $match: {
                    ...baseQuery,
                    // Exclude "Session started" messages from tree view
                    $and: [
                        { $or: [
                            { content: { $not: /^Session started/ } },
                            { content: { $exists: false } }
                        ]},
                        { $or: [
                            { message_type: { $ne: 'system' } },
                            { message_type: { $exists: false } }
                        ]}
                    ]
                }
            },
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
                            start_time: '$start_time',
                            last_activity: '$last_activity',
                            is_active: {
                                $gt: ['$last_activity', new Date(Date.now() - 30 * 60 * 1000)]
                            },
                            recent_messages: { $slice: ['$messages', -3] } // Últimos 3 mensajes
                        }
                    },
                    total_messages: { $sum: '$message_count' },
                    last_activity: { $max: '$last_activity' }
                }
            },
            { $sort: { last_activity: -1 } },
            { $limit: parseInt(limit) }
        ];

        const results = await messagesCollection.aggregate(pipeline).toArray();
        
        // Obtener información de marcadores y descripciones desde Redis
        const enrichedResults = await Promise.all(results.map(async project => {
            const sessionsWithMarks = await Promise.all(project.sessions.map(async session => {
                let isMarked = false;
                let sessionDescription = "Sin descripción";
                let sessionCategory = "📝 General";
                
                if (redisClient?.isOpen) {
                    try {
                        // Check if marked
                        const markInfo = await redisClient.get(`marked:${session.session_id}`);
                        isMarked = !!markInfo;
                        
                        // Get session description
                        const descKey = `session:desc:${session.session_id}`;
                        const descInfo = await redisClient.get(descKey);
                        if (descInfo) {
                            const descData = JSON.parse(descInfo);
                            sessionDescription = descData.description || "Sin descripción";
                            sessionCategory = descData.category || "📝 General";
                        }
                    } catch (error) {
                        // Ignorar errores de Redis
                    }
                }
                
                return {
                    ...session,
                    is_marked: isMarked,
                    description: sessionDescription,
                    category: sessionCategory,
                    recent_messages: session.recent_messages.map(msg => ({
                        id: msg._id,
                        message_type: msg.message_type,
                        content: msg.content.substring(0, 150) + (msg.content.length > 150 ? '...' : ''),
                        timestamp: msg.timestamp
                    }))
                };
            }));

            return {
                name: project._id,
                message_count: project.total_messages,
                sessions: sessionsWithMarks,
                last_activity: project.last_activity
            };
        }));

        const totalMessages = enrichedResults.reduce((sum, p) => sum + p.message_count, 0);
        const totalSessions = enrichedResults.reduce((sum, p) => sum + p.sessions.length, 0);

        res.json({
            projects: enrichedResults,
            total_messages: totalMessages,
            total_sessions: totalSessions,
            filters: { project, hours_back: parseInt(hours_back) }
        });

    } catch (error) {
        console.error('Error getting conversation tree:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get detailed conversation by session ID
app.get('/api/conversations/:sessionId', validateApiKey, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { include_metadata = 'true' } = req.query;

        if (!messagesCollection) {
            return res.status(503).json({ error: 'Database not available' });
        }

        // Obtener todos los mensajes de la sesión (excluir "Session started")
        const messages = await messagesCollection
            .find({ 
                session_id: sessionId,
                // Exclude "Session started" messages from conversation details
                $and: [
                    { $or: [
                        { content: { $not: /^Session started/ } },
                        { content: { $exists: false } }
                    ]},
                    { $or: [
                        { message_type: { $ne: 'system' } },
                        { message_type: { $exists: false } }
                    ]}
                ]
            })
            .sort({ timestamp: 1 })
            .toArray();

        if (messages.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Obtener información de marcador
        let markInfo = null;
        if (redisClient?.isOpen) {
            try {
                const markData = await redisClient.get(`marked:${sessionId}`);
                if (markData) {
                    markInfo = JSON.parse(markData);
                }
            } catch (error) {
                // Ignorar errores de Redis
            }
        }

        // Formatear mensajes
        const formattedMessages = messages.map(msg => {
            const base = {
                id: msg._id,
                message_type: msg.message_type,
                content: msg.content,
                hook_event: msg.hook_event,
                timestamp: msg.timestamp
            };

            if (include_metadata === 'true' && msg.metadata) {
                base.metadata = msg.metadata;
            }

            return base;
        });

        res.json({
            session_id: sessionId,
            short_id: sessionId.substring(0, 8),
            project_name: messages[0].project_name,
            message_count: messages.length,
            start_time: messages[0].timestamp,
            end_time: messages[messages.length - 1].timestamp,
            is_marked: !!markInfo,
            mark_info: markInfo,
            messages: formattedMessages
        });

    } catch (error) {
        console.error('Error getting conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Advanced search endpoint
app.get('/api/search/advanced', validateApiKey, async (req, res) => {
    try {
        const {
            q = '',
            project = '',
            session = '',
            message_type = '',
            start_date = '',
            end_date = '',
            only_marked = 'false',
            limit = '50',
            offset = '0'
        } = req.query;

        if (!messagesCollection) {
            return res.status(503).json({ error: 'Database not available' });
        }

        // Construir query de búsqueda
        const searchQuery = {
            // Exclude "Session started" messages from search results
            $and: [
                { $or: [
                    { content: { $not: /^Session started/ } },
                    { content: { $exists: false } }
                ]},
                { $or: [
                    { message_type: { $ne: 'system' } },
                    { message_type: { $exists: false } }
                ]}
            ]
        };

        // Búsqueda de texto
        if (q) {
            searchQuery.$or = [
                { content: { $regex: q, $options: 'i' } },
                { project_name: { $regex: q, $options: 'i' } }
            ];
        }

        // Filtros específicos
        if (project) {
            searchQuery.project_name = project;
        }

        if (session) {
            searchQuery.session_id = session;
        }

        if (message_type) {
            searchQuery.message_type = message_type;
        }

        // Filtro de fechas
        if (start_date || end_date) {
            searchQuery.timestamp = {};
            if (start_date) {
                searchQuery.timestamp.$gte = new Date(start_date);
            }
            if (end_date) {
                searchQuery.timestamp.$lte = new Date(end_date);
            }
        }

        // Contar total
        const totalCount = await messagesCollection.countDocuments(searchQuery);
        
        // Obtener resultados paginados
        const messages = await messagesCollection
            .find(searchQuery)
            .sort({ timestamp: -1 })
            .skip(parseInt(offset))
            .limit(parseInt(limit))
            .toArray();

        // Filtrar por marcados si se solicita
        let filteredResults = messages;
        if (only_marked === 'true' && redisClient?.isOpen) {
            const sessionIds = [...new Set(messages.map(m => m.session_id))];
            const markedSessions = new Set();
            
            for (const sessionId of sessionIds) {
                try {
                    const markData = await redisClient.get(`marked:${sessionId}`);
                    if (markData) {
                        markedSessions.add(sessionId);
                    }
                } catch (error) {
                    // Ignorar errores
                }
            }
            
            filteredResults = messages.filter(msg => markedSessions.has(msg.session_id));
        }

        // Formatear resultados con contexto
        const results = await Promise.all(filteredResults.map(async msg => {
            let isMarked = false;
            if (redisClient?.isOpen) {
                try {
                    const markData = await redisClient.get(`marked:${msg.session_id}`);
                    isMarked = !!markData;
                } catch (error) {
                    // Ignorar errores
                }
            }

            // Obtener contexto de la sesión
            const sessionContext = {
                session_id: msg.session_id,
                short_id: msg.session_id.substring(0, 8),
                project_name: msg.project_name,
                is_marked: isMarked
            };

            // Crear highlights básicos si hay búsqueda de texto
            const highlights = [];
            if (q) {
                const content = msg.content.toLowerCase();
                const queryLower = q.toLowerCase();
                const index = content.indexOf(queryLower);
                if (index !== -1) {
                    const start = Math.max(0, index - 50);
                    const end = Math.min(content.length, index + q.length + 50);
                    highlights.push(msg.content.substring(start, end));
                }
            }

            return {
                message: {
                    id: msg._id,
                    session_id: msg.session_id,
                    project_name: msg.project_name,
                    message_type: msg.message_type,
                    content: msg.content,
                    timestamp: msg.timestamp
                },
                highlights,
                context: sessionContext,
                relevance_score: 1.0 // TODO: Implementar scoring real
            };
        }));

        res.json({
            results,
            pagination: {
                total_count: totalCount,
                returned_count: results.length,
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: parseInt(offset) + results.length < totalCount
            },
            filters: {
                query: q,
                project,
                session,
                message_type,
                start_date,
                end_date,
                only_marked: only_marked === 'true'
            }
        });

    } catch (error) {
        console.error('Error in advanced search:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark/unmark session as important
app.post('/api/conversations/:sessionId/mark', validateApiKey, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { is_marked = true, note = '', tags = [] } = req.body;

        if (!redisClient?.isOpen) {
            return res.status(503).json({ error: 'Redis not available' });
        }

        const key = `marked:${sessionId}`;
        
        if (is_marked) {
            const markData = {
                marked: true,
                note,
                tags: Array.isArray(tags) ? tags : [],
                marked_at: Date.now(),
                updated_at: Date.now()
            };
            
            await redisClient.setEx(key, 86400 * 30, JSON.stringify(markData)); // 30 días
            
            res.json({
                success: true,
                message: 'Conversación marcada como importante',
                data: markData
            });
        } else {
            await redisClient.del(key);
            
            res.json({
                success: true,
                message: 'Marca removida de la conversación'
            });
        }

    } catch (error) {
        console.error('Error marking conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update session description and category
app.post('/api/sessions/:sessionId/description', validateApiKey, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { description, category, project_name } = req.body;

        if (!description) {
            return res.status(400).json({ error: 'Description is required' });
        }

        // Store in Redis for fast access (with 30-day TTL)
        if (redisClient?.isOpen) {
            const descriptionData = {
                session_id: sessionId,
                description: description.substring(0, 200), // Limit length
                category: category || "📝 General",
                project_name: project_name || "unknown",
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            
            const key = `session:desc:${sessionId}`;
            await redisClient.setEx(key, 86400 * 30, JSON.stringify(descriptionData));
        }

        // Also update in MongoDB if available
        if (messagesCollection) {
            try {
                const updateData = {
                    session_description: description.substring(0, 200),
                    session_category: category || "📝 General",
                    description_updated_at: new Date()
                };

                // Update all messages in this session with the description
                await messagesCollection.updateMany(
                    { session_id: sessionId },
                    { $set: updateData }
                );

                console.log(`📝 Updated description for session ${sessionId.substring(0, 8)}: "${description.substring(0, 50)}..."`);
            } catch (mongoError) {
                console.warn('⚠️  MongoDB description update failed:', mongoError.message);
            }
        }

        res.json({
            success: true,
            message: 'Session description updated successfully',
            data: {
                session_id: sessionId,
                description: description.substring(0, 200),
                category: category || "📝 General"
            }
        });

    } catch (error) {
        console.error('Error updating session description:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get session description
app.get('/api/sessions/:sessionId/description', validateApiKey, async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Try Redis first
        if (redisClient?.isOpen) {
            try {
                const key = `session:desc:${sessionId}`;
                const cached = await redisClient.get(key);
                if (cached) {
                    const data = JSON.parse(cached);
                    return res.json({
                        success: true,
                        data: data
                    });
                }
            } catch (redisError) {
                console.warn('⚠️  Redis description read failed:', redisError.message);
            }
        }

        // Fallback to MongoDB
        if (messagesCollection) {
            try {
                const message = await messagesCollection.findOne(
                    { session_id: sessionId, session_description: { $exists: true, $ne: null } },
                    { 
                        projection: { 
                            session_description: 1, 
                            session_category: 1, 
                            description_updated_at: 1,
                            project_name: 1
                        } 
                    }
                );

                if (message) {
                    return res.json({
                        success: true,
                        data: {
                            session_id: sessionId,
                            description: message.session_description,
                            category: message.session_category || "📝 General",
                            project_name: message.project_name,
                            updated_at: message.description_updated_at
                        }
                    });
                }
            } catch (mongoError) {
                console.warn('❌ MongoDB description read failed:', mongoError.message);
            }
        }

        // No description found
        res.json({
            success: true,
            data: {
                session_id: sessionId,
                description: "Sin descripción",
                category: "📝 General"
            }
        });

    } catch (error) {
        console.error('Error getting session description:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Export conversation in different formats
app.get('/api/conversations/:sessionId/export', validateApiKey, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { format = 'json', include_metadata = 'true' } = req.query;

        if (!messagesCollection) {
            return res.status(503).json({ error: 'Database not available' });
        }

        // Obtener todos los mensajes de la sesión (excluir "Session started")
        const messages = await messagesCollection
            .find({ 
                session_id: sessionId,
                // Exclude "Session started" messages from conversation details
                $and: [
                    { $or: [
                        { content: { $not: /^Session started/ } },
                        { content: { $exists: false } }
                    ]},
                    { $or: [
                        { message_type: { $ne: 'system' } },
                        { message_type: { $exists: false } }
                    ]}
                ]
            })
            .sort({ timestamp: 1 })
            .toArray();

        if (messages.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const includeMetadata = include_metadata === 'true';
        let content, filename, mimeType;

        switch (format) {
            case 'json':
                content = JSON.stringify(messages, null, 2);
                filename = `conversation_${sessionId.substring(0, 8)}.json`;
                mimeType = 'application/json';
                break;

            case 'markdown':
                content = formatAsMarkdown(messages, includeMetadata);
                filename = `conversation_${sessionId.substring(0, 8)}.md`;
                mimeType = 'text/markdown';
                break;

            case 'txt':
                content = formatAsText(messages, includeMetadata);
                filename = `conversation_${sessionId.substring(0, 8)}.txt`;
                mimeType = 'text/plain';
                break;

            default:
                return res.status(400).json({ error: 'Unsupported format' });
        }

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);

    } catch (error) {
        console.error('Error exporting conversation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper functions for export formats
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

// Helper function to get dashboard stats from persistent storage
async function getDashboardStats() {
    let stats = {
        messageCount: 0,
        projectCounts: {},
        tokenMetrics: [],
        recentMessages: [],
        totalCost: 0,
        totalTokens: 0
    };
    
    // Try Redis cache first
    try {
        if (redisClient.isOpen) {
            const cached = await redisClient.get('dashboard:stats');
            if (cached) {
                console.log('⚡ Retrieved dashboard stats from Redis cache');
                return JSON.parse(cached);
            }
        }
    } catch (error) {
        console.warn('⚠️  Redis stats cache failed:', error.message);
    }
    
    // Get from MongoDB
    try {
        if (messagesCollection) {
            // Get all messages for comprehensive stats (exclude "Session started")
            const allMessages = await messagesCollection.find({
                // Exclude "Session started" messages from dashboard stats
                $and: [
                    { $or: [
                        { content: { $not: /^Session started/ } },
                        { content: { $exists: false } }
                    ]},
                    { $or: [
                        { message_type: { $ne: 'system' } },
                        { message_type: { $exists: false } }
                    ]}
                ]
            }).toArray();
            
            stats.messageCount = allMessages.length;
            stats.tokenMetrics = allMessages.filter(msg => msg.message_type === 'token_metric');
            
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            stats.recentMessages = allMessages.filter(msg => new Date(msg.timestamp) > oneDayAgo);
            
            // Count by project
            allMessages.forEach(msg => {
                stats.projectCounts[msg.project_name] = (stats.projectCounts[msg.project_name] || 0) + 1;
            });
            
            // Calculate token costs
            stats.totalCost = stats.tokenMetrics.reduce((sum, metric) => {
                return sum + (metric.metadata?.cost_usd || 0);
            }, 0);
            
            stats.totalTokens = stats.tokenMetrics.reduce((sum, metric) => {
                return sum + (metric.metadata?.token_count || 0);
            }, 0);
            
            // Cache in Redis for 1 minute
            if (redisClient.isOpen) {
                await redisClient.setEx('dashboard:stats', 60, JSON.stringify(stats));
            }
            
            console.log(`💾 Generated dashboard stats from MongoDB: ${stats.messageCount} messages`);
            return stats;
        }
    } catch (error) {
        console.warn('❌ MongoDB stats failed:', error.message);
    }
    
    // Return empty stats if both Redis and MongoDB failed
    console.log('⚠️  Returning empty stats - both Redis cache and MongoDB unavailable');
    return stats;
}

// System stats
app.get('/api/stats', validateApiKey, async (req, res) => {
    try {
        const stats = await getDashboardStats();

        // Token statistics
        const tokenStats = {
            total_token_records: tokenMetrics.length,
            token_types: {},
            total_tokens: 0,
            total_cost_usd: 0
        };

        tokenMetrics.forEach(token => {
            const tokenType = token.metadata?.token_type || 'unknown';
            const tokenCount = token.metadata?.token_count || 0;
            const costUsd = token.metadata?.cost_usd || 0;

            tokenStats.token_types[tokenType] = (tokenStats.token_types[tokenType] || 0) + tokenCount;
            tokenStats.total_tokens += tokenCount;
            tokenStats.total_cost_usd += costUsd;
        });

        res.json({
            total_messages: messageCount,
            messages_last_24h: recentMessages.length,
            projects: Object.keys(projectCounts).length,
            project_activity: projectCounts,
            token_statistics: tokenStats,
            storage: 'In-Memory + Redis',
            uptime: process.uptime()
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Token-specific statistics endpoint
app.get('/api/token-stats', validateApiKey, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const project = req.query.project;
        
        // Get messages and filter token metrics
        const messages = await getMessagesFromStorage(1000, project); // Get more messages for token analysis
        let tokenMetrics = messages.filter(msg => msg.message_type === 'token_metric');
        
        // Filter by time
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        tokenMetrics = tokenMetrics.filter(msg => new Date(msg.timestamp) > cutoffDate);
        
        // Filter by project if specified
        if (project) {
            tokenMetrics = tokenMetrics.filter(msg => msg.project_name === project);
        }

        const stats = {
            period_days: days,
            total_records: tokenMetrics.length,
            token_breakdown: {},
            models: {},
            sessions: new Set(),
            cost_analysis: {
                total_usd: 0,
                by_type: {}
            }
        };

        tokenMetrics.forEach(token => {
            const tokenType = token.metadata?.token_type || 'unknown';
            const tokenCount = token.metadata?.token_count || 0;
            const model = token.metadata?.model || 'unknown';
            const costUsd = token.metadata?.cost_usd || 0;
            const sessionId = token.session_id;

            // Token breakdown
            stats.token_breakdown[tokenType] = (stats.token_breakdown[tokenType] || 0) + tokenCount;
            
            // Model usage
            if (!stats.models[model]) {
                stats.models[model] = { tokens: 0, requests: 0, cost: 0 };
            }
            stats.models[model].tokens += tokenCount;
            stats.models[model].requests += 1;
            stats.models[model].cost += costUsd;
            
            // Sessions
            stats.sessions.add(sessionId);
            
            // Cost analysis
            stats.cost_analysis.total_usd += costUsd;
            stats.cost_analysis.by_type[tokenType] = (stats.cost_analysis.by_type[tokenType] || 0) + costUsd;
        });

        stats.unique_sessions = stats.sessions.size;
        delete stats.sessions;

        res.json(stats);
    } catch (error) {
        console.error('Error getting token stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Initialize MongoDB connection
async function initializeMongoDB() {
    try {
        mongoClient = new MongoClient(MONGODB_URI);
        await mongoClient.connect();
        const db = mongoClient.db('conversations');
        messagesCollection = db.collection('messages');
        
        // Create indexes for better performance
        await messagesCollection.createIndex({ timestamp: -1 });
        await messagesCollection.createIndex({ project_name: 1, timestamp: -1 });
        await messagesCollection.createIndex({ session_id: 1 });
        await messagesCollection.createIndex({ session_description: 1 });
        await messagesCollection.createIndex({ session_category: 1 });
        await messagesCollection.createIndex({ 
            session_description: "text", 
            content: "text", 
            project_name: "text" 
        }, { 
            name: "search_text_index" 
        });
        
        // Optional TTL configuration - by default, data persists indefinitely
        const ttlSeconds = process.env.MONGODB_TTL_SECONDS;
        if (ttlSeconds && ttlSeconds > 0) {
            await messagesCollection.createIndex({ created_at: 1 }, { expireAfterSeconds: parseInt(ttlSeconds) });
            console.log(`📅 MongoDB TTL: Data will expire after ${ttlSeconds} seconds (${Math.round(ttlSeconds/86400)} days)`);
        } else {
            console.log('♾️  MongoDB: Indefinite persistence (no TTL configured)');
        }
        
        console.log('✅ Connected to MongoDB');
        
        // Inyectar dependencias en los handlers de gRPC
        injectDependencies(messagesCollection, redisClient);
        
        return true;
    } catch (error) {
        console.warn('⚠️  MongoDB connection failed, using memory + Redis:', error.message);
        return false;
    }
}

// Initialize Redis connection
async function initializeRedis() {
    try {
        await redisClient.connect();
        console.log('✅ Connected to Redis');
        return true;
    } catch (error) {
        console.warn('⚠️  Redis connection failed, using memory only:', error.message);
        return false;
    }
}

// Legacy dashboard endpoint - moved to /dashboard/legacy to avoid conflict
app.get('/dashboard/legacy', async (req, res) => {
    try {
        // Get stats from persistent storage
        const stats = await getDashboardStats();
        
        // Token statistics
        const tokenStats = {
            total_token_records: stats.tokenMetrics.length,
            token_types: {},
            total_tokens: stats.totalTokens,
            total_cost_usd: stats.totalCost
        };

        stats.tokenMetrics.forEach(token => {
            const tokenType = token.metadata?.token_type || 'unknown';
            const tokenCount = token.metadata?.token_count || 0;
            tokenStats.token_types[tokenType] = (tokenStats.token_types[tokenType] || 0) + tokenCount;
        });

        // Model breakdown
        const models = {};
        stats.tokenMetrics.forEach(token => {
            const model = token.metadata?.model || 'unknown';
            if (!models[model]) {
                models[model] = { tokens: 0, requests: 0, cost: 0 };
            }
            models[model].tokens += token.metadata?.token_count || 0;
            models[model].requests += 1;
            models[model].cost += token.metadata?.cost_usd || 0;
        });

        const uptime = Math.floor(process.uptime());
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        const uptimeString = uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes}m` : `${uptimeMinutes}m`;

        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📊 Claude Conversation Logger Dashboard</title>
    <style>
        /* Minimalist CSS Reset & Base */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            min-height: 100vh;
            color: #374151;
            line-height: 1.6;
        }

        /* Container & Layout */
        .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
        
        /* Header Styles - Minimalist */
        .header {
            background: white;
            padding: 24px 0;
            border-bottom: 1px solid #e5e7eb;
            margin-bottom: 32px;
        }
        
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
        }
        
        .header h1 {
            color: #1f2937;
            font-size: 2rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .version-badge {
            background: #3b82f6;
            color: white;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .header-subtitle {
            color: #6b7280;
            margin-top: 4px;
            font-size: 0.9rem;
        }
        
        .header-stats {
            text-align: right;
            color: #374151;
        }
        
        .header-time {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 2px;
        }
        
        .header-uptime {
            color: #6b7280;
            font-size: 0.9rem;
        }

        /* Grid System */
        .grid { display: grid; gap: 20px; }
        .grid-cols-4 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .grid-cols-2 { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }

        /* Card Styles - Minimal */
        .card {
            background: white;
            border-radius: 8px;
            padding: 24px;
            border: 1px solid #e5e7eb;
            transition: all 0.2s ease;
        }
        
        .card:hover {
            border-color: #3b82f6;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        /* Clickeable Card Links */
        .card-link {
            text-decoration: none;
            color: inherit;
            display: block;
            transition: transform 0.2s ease;
        }
        
        .card-link:hover {
            transform: translateY(-2px);
        }
        
        .card-link:hover .card {
            border-color: #3b82f6;
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.15);
        }

        /* Metric Cards */
        .metric-card {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        
        .metric-info h3 {
            color: #6b7280;
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 8px;
        }
        
        .metric-value {
            font-size: 2.5rem;
            font-weight: 700;
            color: #1f2937;
            line-height: 1;
            margin-bottom: 8px;
        }
        
        .metric-icon {
            width: 48px;
            height: 48px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            background: #f3f4f6;
            color: #3b82f6;
        }
        
        .metric-change {
            font-size: 0.8rem;
            font-weight: 500;
            color: #6b7280;
        }

        /* Loading State */
        .loading {
            background: #f3f4f6;
            border-radius: 4px;
            height: 20px;
            animation: pulse 2s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-top: 16px;
        }
        
        .stat-item {
            display: flex;
            justify-content: space-between;
            padding: 12px 16px;
            background: #f8fafc;
            border-radius: 6px;
            border-left: 3px solid #3b82f6;
        }
        
        .stat-label {
            font-weight: 500;
            color: #374151;
            font-size: 0.9rem;
        }
        
        .stat-value {
            font-weight: 600;
            color: #1f2937;
            font-size: 0.9rem;
        }

        /* Table Styles - Minimal */
        .table-container {
            overflow: hidden;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th {
            background: #f9fafb;
            padding: 16px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            border-bottom: 1px solid #e5e7eb;
            font-size: 0.9rem;
        }
        
        td {
            padding: 16px;
            border-bottom: 1px solid #f3f4f6;
            font-size: 0.9rem;
        }
        
        tr:hover td {
            background: #f8fafc;
        }
        
        .model-name {
            font-weight: 600;
            color: #1f2937;
        }
        
        .cost-value {
            font-weight: 600;
            color: #3b82f6;
        }

        /* Project Progress Bars */
        .project-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding: 8px 0;
        }
        
        .project-name {
            font-weight: 500;
            color: #374151;
            flex: 1;
            font-size: 0.9rem;
        }
        
        .progress-container {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 2;
        }
        
        .progress-bar {
            flex: 1;
            height: 6px;
            background: #e5e7eb;
            border-radius: 3px;
            overflow: hidden;
        }
        
        .progress-fill {
            height: 100%;
            background: #3b82f6;
            border-radius: 3px;
            transition: width 0.3s ease;
        }
        
        .progress-value {
            font-weight: 600;
            color: #374151;
            min-width: 30px;
            text-align: right;
            font-size: 0.9rem;
        }

        /* Footer - Minimal */
        .footer {
            text-align: center;
            color: #6b7280;
            margin-top: 48px;
            padding: 24px 0;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer p {
            margin: 4px 0;
            font-size: 0.9rem;
        }

        /* Error State */
        .error {
            color: #ef4444;
            font-size: 0.9rem;
            text-align: center;
            padding: 16px;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .header-content { text-align: center; }
            .header h1 { font-size: 1.8rem; }
            .metric-value { font-size: 2rem; }
            .grid-cols-4 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
            .grid-cols-2 { grid-template-columns: 1fr; }
            .stats-grid { grid-template-columns: 1fr; }
            .container { padding: 0 16px; }
        }
    </style>
</head>
<body>
    <!-- Header -->
    <header class="header">
        <div class="container">
            <div class="header-content">
                <div>
                    <h1>
                        📊 Claude Conversation Logger
                        <span class="version-badge">v2.1.3</span>
                    </h1>
                    <p class="header-subtitle">Dashboard en tiempo real • Actualización automática</p>
                </div>
                <div class="header-stats">
                    <div class="header-time">${new Date().toLocaleTimeString('es-ES')}</div>
                    <div class="header-uptime">⏰ Uptime: ${uptimeString}</div>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Dashboard -->
    <div class="container">
        
        <!-- Key Metrics Cards -->
        <div class="grid grid-cols-4">
            <!-- Total Messages -->
            <a href="/dashboard/legacy/messages" class="card-link">
                <div class="card">
                    <div class="metric-card">
                        <div class="metric-info">
                            <h3>Total Mensajes</h3>
                            <div class="metric-value" id="totalMessages">${stats.messageCount.toLocaleString()}</div>
                            <div class="metric-change" id="messagesChange">📈 ${stats.recentMessages.length} en 24h</div>
                        </div>
                        <div class="metric-icon">💬</div>
                    </div>
                </div>
            </a>

            <!-- Total Cost -->
            <a href="/dashboard/legacy/costs" class="card-link">
                <div class="card">
                    <div class="metric-card">
                        <div class="metric-info">
                            <h3>Costo Total</h3>
                            <div class="metric-value" id="totalCost">$${tokenStats.total_cost_usd.toFixed(tokenStats.total_cost_usd < 1 ? 4 : 2)}</div>
                            <div class="metric-change" id="costChange">🎯 ${tokenStats.total_token_records} registros</div>
                        </div>
                        <div class="metric-icon">💰</div>
                    </div>
                </div>
            </a>

            <!-- Total Tokens -->
            <a href="/dashboard/legacy/tokens" class="card-link">
                <div class="card">
                    <div class="metric-card">
                        <div class="metric-info">
                            <h3>Total Tokens</h3>
                            <div class="metric-value" id="totalTokens">${tokenStats.total_tokens >= 1000 ? (tokenStats.total_tokens / 1000).toFixed(0) + 'k' : tokenStats.total_tokens}</div>
                            <div class="metric-change" id="tokensChange">📊 ${Object.keys(tokenStats.token_types).length} tipos</div>
                        </div>
                        <div class="metric-icon">🎯</div>
                    </div>
                </div>
            </a>

            <!-- Active Projects -->
            <a href="/dashboard/legacy/projects" class="card-link">
                <div class="card">
                    <div class="metric-card">
                        <div class="metric-info">
                            <h3>Proyectos Activos</h3>
                            <div class="metric-value" id="totalProjects">${Object.keys(stats.projectCounts).length}</div>
                            <div class="metric-change">📁 Multi-tenant</div>
                        </div>
                        <div class="metric-icon">🏗️</div>
                    </div>
                </div>
            </a>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-2" style="margin-top: 32px;">
            
            <!-- Token Breakdown -->
            <div class="card">
                <h3 style="font-size: 1.2rem; font-weight: 600; color: #1f2937; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    📈 Distribución de Tokens
                    <span style="background: #dbeafe; color: #3b82f6; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 500;">OpenTelemetry</span>
                </h3>
                <div class="stats-grid" id="tokenBreakdown">
                    ${Object.entries(tokenStats.token_types).map(([type, count]) => 
                        `<div class="stat-item">
                            <span class="stat-label">${type}:</span>
                            <span class="stat-value">${count.toLocaleString()}</span>
                        </div>`
                    ).join('')}
                </div>
            </div>

            <!-- Project Activity -->
            <div class="card">
                <h3 style="font-size: 1.2rem; font-weight: 600; color: #1f2937; margin-bottom: 20px;">
                    🏗️ Actividad por Proyecto
                </h3>
                <div id="projectActivity">
                    ${Object.entries(stats.projectCounts).map(([project, count]) => {
                        const percentage = ((count / stats.messageCount) * 100).toFixed(1);
                        return `<div class="project-item">
                            <div class="project-name">${project}:</div>
                            <div class="progress-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${percentage}%"></div>
                                </div>
                                <div class="progress-value">${count}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>

        <!-- Model Usage Table -->
        <div class="card" style="margin-top: 32px;">
            <h3 style="font-size: 1.2rem; font-weight: 600; color: #1f2937; margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                🤖 Uso por Modelo
                <span style="background: #dcfce7; color: #059669; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 500;">Costos en USD</span>
            </h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Modelo</th>
                            <th style="text-align: right;">Tokens</th>
                            <th style="text-align: right;">Requests</th>
                            <th style="text-align: right;">Costo</th>
                        </tr>
                    </thead>
                    <tbody id="modelsTable">
                        ${Object.keys(models).length === 0 ? 
                            '<tr><td colspan="4" style="text-align: center; color: #6b7280; padding: 20px;">No hay datos de modelos disponibles</td></tr>' :
                            Object.entries(models).map(([model, data]) => `
                                <tr>
                                    <td class="model-name">${model.replace('claude-', 'Claude ').replace('-', ' ')}</td>
                                    <td style="text-align: right;">${data.tokens.toLocaleString()}</td>
                                    <td style="text-align: right;">${data.requests}</td>
                                    <td style="text-align: right;" class="cost-value">$${data.cost.toFixed(data.cost < 1 ? 4 : 2)}</td>
                                </tr>
                            `).join('')
                        }
                    </tbody>
                </table>
            </div>
        </div>

    </div>

    <!-- Footer -->
    <div class="footer">
        <p>🚀 Claude Conversation Logger v2.1.3 • 📊 Dashboard en tiempo real • ⏱️ Uptime: ${uptimeString}</p>
        <p>💾 Storage: In-Memory + Redis + MongoDB</p>
    </div>



    <!-- Data is now rendered server-side for better performance and CSP compliance -->
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (error) {
        console.error('Error generating dashboard:', error);
        res.status(500).send(`
            <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Dashboard Error</h1>
                    <p>Error generating dashboard: ${error.message}</p>
                    <p><a href="/health">Check Health</a> | <a href="/dashboard">Retry</a></p>
                </body>
            </html>
        `);
    }
});

// Dashboard detail pages with persistent data
app.get('/dashboard/legacy/messages', async (req, res) => {
    const stats = await getDashboardStats();
    const messages = await getMessagesFromStorage(100); // Get more for detail view
    const projects = [...new Set(messages.map(msg => msg.project_name))];
    res.send(`<html><head><title>📝 Mensajes</title><style>body{font-family:system-ui;background:#f8fafc;margin:0;padding:24px}.container{max-width:1200px;margin:0 auto}.header{background:white;padding:20px;border-radius:8px;margin-bottom:24px}.list{background:white;border-radius:8px;padding:20px}.item{padding:12px 0;border-bottom:1px solid #e5e7eb}.tag{background:#dbeafe;color:#3b82f6;padding:2px 8px;border-radius:4px;font-size:0.8rem}.back{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin-top:20px}</style></head><body><div class="container"><div class="header"><a href="/dashboard">← Dashboard</a><h1>📝 Mensajes (${stats.messageCount})</h1><p>Mostrando últimos ${messages.length} mensajes</p></div><div class="list">${messages.slice(0,50).map(msg => `<div class="item"><span class="tag">${msg.project_name}</span> <small>${new Date(msg.timestamp).toLocaleString()}</small><br><strong>${msg.message_type}</strong> - ${msg.session_id.substring(0,8)}...</div>`).join('')}</div><a href="/dashboard" class="back">← Volver</a></div></body></html>`);
});

app.get('/dashboard/legacy/costs', async (req, res) => {
    const stats = await getDashboardStats();
    const tokenMetrics = stats.tokenMetrics;
    const totalCost = stats.totalCost;
    const models = {};
    tokenMetrics.forEach(token => {
        const model = token.metadata?.model || 'unknown';
        if (!models[model]) models[model] = { tokens: 0, requests: 0, cost: 0 };
        models[model].tokens += token.metadata?.token_count || 0;
        models[model].requests += 1;
        models[model].cost += token.metadata?.cost_usd || 0;
    });
    res.send(`<html><head><title>💰 Costos</title><style>body{font-family:system-ui;background:#f8fafc;margin:0;padding:24px}.container{max-width:1200px;margin:0 auto}.header{background:white;padding:20px;border-radius:8px;margin-bottom:24px}.card{background:white;border-radius:8px;padding:20px;margin-bottom:16px}.metric{font-size:2rem;font-weight:bold;color:#1f2937}.back{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin-top:20px}table{width:100%;border-collapse:collapse}th,td{padding:12px;text-align:left;border-bottom:1px solid #e5e7eb}</style></head><body><div class="container"><div class="header"><a href="/dashboard">← Dashboard</a><h1>💰 Análisis de Costos</h1></div><div class="card"><h3>Costo Total</h3><div class="metric">$${totalCost.toFixed(4)}</div><p>${tokenMetrics.length} registros de tokens</p></div><div class="card"><h3>Por Modelo</h3><table><tr><th>Modelo</th><th>Tokens</th><th>Requests</th><th>Costo</th></tr>${Object.entries(models).map(([model, data]) => `<tr><td>${model}</td><td>${data.tokens.toLocaleString()}</td><td>${data.requests}</td><td>$${data.cost.toFixed(4)}</td></tr>`).join('')}</table></div><a href="/dashboard" class="back">← Volver</a></div></body></html>`);
});

app.get('/dashboard/legacy/tokens', async (req, res) => {
    const stats = await getDashboardStats();
    const tokenMetrics = stats.tokenMetrics;
    const tokenTypes = {};
    let totalTokens = stats.totalTokens;
    tokenMetrics.forEach(token => {
        const type = token.metadata?.token_type || 'unknown';
        const count = token.metadata?.token_count || 0;
        tokenTypes[type] = (tokenTypes[type] || 0) + count;
        totalTokens += count;
    });
    res.send(`<html><head><title>🎯 Tokens</title><style>body{font-family:system-ui;background:#f8fafc;margin:0;padding:24px}.container{max-width:1200px;margin:0 auto}.header{background:white;padding:20px;border-radius:8px;margin-bottom:24px}.card{background:white;border-radius:8px;padding:20px;margin-bottom:16px}.metric{font-size:2rem;font-weight:bold;color:#1f2937}.stat{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f3f4f6}.back{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin-top:20px}</style></head><body><div class="container"><div class="header"><a href="/dashboard">← Dashboard</a><h1>🎯 Análisis de Tokens</h1></div><div class="card"><h3>Total de Tokens</h3><div class="metric">${totalTokens.toLocaleString()}</div><p>${Object.keys(tokenTypes).length} tipos diferentes</p></div><div class="card"><h3>Por Tipo</h3>${Object.entries(tokenTypes).map(([type, count]) => `<div class="stat"><span>${type}:</span><strong>${count.toLocaleString()}</strong></div>`).join('')}</div><a href="/dashboard" class="back">← Volver</a></div></body></html>`);
});

app.get('/dashboard/legacy/projects', async (req, res) => {
    const stats = await getDashboardStats();
    const projectCounts = stats.projectCounts;
    const recentProjects = {};
    stats.recentMessages.forEach(msg => recentProjects[msg.project_name] = (recentProjects[msg.project_name] || 0) + 1);
    res.send(`<html><head><title>🏗️ Proyectos</title><style>body{font-family:system-ui;background:#f8fafc;margin:0;padding:24px}.container{max-width:1200px;margin:0 auto}.header{background:white;padding:20px;border-radius:8px;margin-bottom:24px}.card{background:white;border-radius:8px;padding:20px;margin-bottom:16px}.project{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid #f3f4f6}.back{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin-top:20px}.tag{background:#dbeafe;color:#3b82f6;padding:4px 8px;border-radius:4px;font-size:0.8rem}</style></head><body><div class="container"><div class="header"><a href="/dashboard">← Dashboard</a><h1>🏗️ Proyectos Activos (${Object.keys(projectCounts).length})</h1></div><div class="card"><h3>Actividad Total</h3>${Object.entries(projectCounts).map(([project, count]) => `<div class="project"><span>${project}</span><div><span class="tag">${count} mensajes</span> <small>${recentProjects[project] || 0} en 24h</small></div></div>`).join('')}</div><a href="/dashboard" class="back">← Volver</a></div></body></html>`);
});

// Load initial data into memory from persistent storage
async function loadInitialDataToMemory() {
    try {
        if (messagesCollection) {
            // Load recent messages (last 500) to memory for fast dashboard access (exclude "Session started")
            const recentMessages = await messagesCollection
                .find({
                    // Exclude "Session started" messages from memory cache
                    $and: [
                        { $or: [
                            { content: { $not: /^Session started/ } },
                            { content: { $exists: false } }
                        ]},
                        { $or: [
                            { message_type: { $ne: 'system' } },
                            { message_type: { $exists: false } }
                        ]}
                    ]
                })
                .sort({ timestamp: -1 })
                .limit(500)
                .toArray();
            
            // Data initialization complete - Redis cache will handle recent messages automatically
            console.log(`🔄 Database initialization complete: ${recentMessages.length} recent messages available in MongoDB`);
        }
    } catch (error) {
        console.warn('⚠️  Failed to load initial data:', error.message);
    }
}

// Load messages from MongoDB to Redis cache on startup
async function loadMessagesToRedis() {
    try {
        if (!messagesCollection || !redisClient.isOpen) {
            console.log('⚠️  MongoDB or Redis not available, skipping Redis migration');
            return;
        }

        // Check if Redis already has data
        const existingCount = await redisClient.lLen('messages:recent');
        if (existingCount > 0) {
            console.log(`📦 Redis already has ${existingCount} messages, skipping migration`);
            return;
        }

        // Load last N messages from MongoDB (according to REDIS_MESSAGE_LIMIT)
        const recentMessages = await messagesCollection
            .find({})
            .sort({ timestamp: -1 })
            .limit(REDIS_MESSAGE_LIMIT)
            .toArray();

        if (recentMessages.length === 0) {
            console.log('📭 No messages found in MongoDB to migrate to Redis');
            return;
        }

        console.log(`🔄 Migrating ${recentMessages.length} messages from MongoDB to Redis...`);

        // Clear Redis messages list
        await redisClient.del('messages:recent');

        // Add messages to Redis in reverse order (oldest first, newest last)
        const messagesToCache = recentMessages.reverse().map(msg => JSON.stringify({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
            created_at: msg.created_at.toISOString()
        }));

        if (messagesToCache.length > 0) {
            await redisClient.lPush('messages:recent', ...messagesToCache);
            
            // Also cache individual messages with TTL
            for (const msg of recentMessages) {
                const msgForCache = {
                    ...msg,
                    timestamp: msg.timestamp.toISOString(),
                    created_at: msg.created_at.toISOString()
                };
                await redisClient.setEx(`msg:${msg.id}`, 86400, JSON.stringify(msgForCache)); // 24h TTL
            }
        }

        const finalCount = await redisClient.lLen('messages:recent');
        console.log(`✅ Successfully migrated ${finalCount} messages to Redis cache`);

    } catch (error) {
        console.warn('❌ Failed to load messages to Redis:', error.message);
    }
}

// Dashboard routes (servir archivos estáticos del dashboard)
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

// Redirigir / al dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// Start server
async function startServer() {
    const mongoConnected = await initializeMongoDB();
    const redisConnected = await initializeRedis();
    
    // Load initial data into memory if MongoDB is available
    if (mongoConnected) {
        await loadInitialDataToMemory();
    }

    // Load messages from MongoDB to Redis cache if both are available
    if (mongoConnected && redisConnected) {
        await loadMessagesToRedis();
    }
    
    let storageInfo = 'In-Memory';
    if (mongoConnected) storageInfo = 'MongoDB + ' + storageInfo;
    if (redisConnected) storageInfo += ' + Redis';
    
    app.listen(PORT, () => {
        console.log(`🚀 Claude Conversation Logger API running on port ${PORT}`);
        console.log(`📊 Storage: ${storageInfo}`);
        console.log(`🏥 Health: http://localhost:${PORT}/health`);
        console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
        console.log(`📝 API: http://localhost:${PORT}/api/messages`);
        console.log(`🔢 Tokens: http://localhost:${PORT}/api/token-usage`);
        console.log('✅ Server ready to receive hooks');
        
        // Inicializar servidor gRPC
        const grpcServer = getGrpcServer();
        const grpcPort = process.env.GRPC_PORT || 50051;
        grpcServer.start(grpcPort);
        
        if (mongoConnected) {
            const ttlSeconds = process.env.MONGODB_TTL_SECONDS;
            if (ttlSeconds && ttlSeconds > 0) {
                console.log(`💾 MongoDB: Full persistence with ${Math.round(ttlSeconds/86400)}-day TTL`);
            } else {
                console.log('💾 MongoDB: Full persistence (indefinite)');
            }
        }
        if (redisConnected) {
            console.log(`🔄 Redis: Secondary backup active (${REDIS_MESSAGE_LIMIT} message limit)`);
        }
        console.log('⚡ System: Ready for conversation logging');
    });
}

startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});