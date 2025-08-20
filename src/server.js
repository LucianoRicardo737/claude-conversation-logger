import express from 'express';
import { MongoClient } from 'mongodb';
import Redis from 'redis';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3000;

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

// In-memory storage as fallback
const inMemoryMessages = [];
const inMemorySessions = new Map();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
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

// Helper function to save to all storage systems
async function saveToStorage(record) {
    // Save to MongoDB if available
    try {
        if (messagesCollection) {
            await messagesCollection.insertOne(record);
            console.log(`💾 Saved to MongoDB: ${record.session_id} (${record.message_type})`);
        }
    } catch (error) {
        console.warn('MongoDB save failed:', error.message);
    }

    // Save to memory as backup/cache
    inMemoryMessages.push({
        ...record,
        timestamp: record.timestamp.toISOString(),
        created_at: record.created_at.toISOString()
    });
    
    // Keep only last 1000 messages to prevent memory overflow
    if (inMemoryMessages.length > 1000) {
        inMemoryMessages.shift();
    }

    // Try to save to Redis as secondary backup
    try {
        if (redisClient.isOpen) {
            await redisClient.lPush('messages', JSON.stringify({
                ...record,
                timestamp: record.timestamp.toISOString(),
                created_at: record.created_at.toISOString()
            }));
            await redisClient.lTrim('messages', 0, 999);
        }
    } catch (error) {
        console.warn('Redis save failed:', error.message);
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

// Get recent messages
app.get('/api/messages', validateApiKey, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const project = req.query.project;
        const session = req.query.session;

        let messages = [];

        // Try MongoDB first
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
                console.log(`📚 Retrieved ${messages.length} messages from MongoDB`);
            }
        } catch (error) {
            console.warn('MongoDB read failed:', error.message);
        }

        // Fallback to memory if MongoDB failed
        if (messages.length === 0) {
            messages = [...inMemoryMessages];

            // Try Redis if memory is empty
            if (messages.length === 0) {
                try {
                    if (redisClient.isOpen) {
                        const redisMessages = await redisClient.lRange('messages', 0, limit - 1);
                        messages = redisMessages.map(msg => JSON.parse(msg));
                    }
                } catch (error) {
                    console.warn('Redis read failed:', error.message);
                }
            }
        }

        // Filter by project if specified
        if (project) {
            messages = messages.filter(msg => msg.project_name === project);
        }

        // Filter by session if specified
        if (session) {
            messages = messages.filter(msg => msg.session_id === session);
        }

        // Sort by timestamp and limit
        messages = messages
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);

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

// Search messages
app.get('/api/search', validateApiKey, async (req, res) => {
    try {
        const query = req.query.q || '';
        const days = parseInt(req.query.days) || 7;
        const limit = parseInt(req.query.limit) || 10;

        let messages = [...inMemoryMessages];

        // Try Redis if memory is empty
        if (messages.length === 0) {
            try {
                if (redisClient.isOpen) {
                    const redisMessages = await redisClient.lRange('messages', 0, 999);
                    messages = redisMessages.map(msg => JSON.parse(msg));
                }
            } catch (error) {
                console.warn('Redis read failed:', error.message);
            }
        }

        // Filter by time
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        messages = messages.filter(msg => 
            new Date(msg.timestamp) > cutoffDate
        );

        // Search in content and project name
        if (query) {
            const searchTerm = query.toLowerCase();
            messages = messages.filter(msg => 
                msg.content.toLowerCase().includes(searchTerm) ||
                msg.project_name.toLowerCase().includes(searchTerm)
            );
        }

        // Sort by relevance and limit
        messages = messages
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);

        res.json({
            query,
            count: messages.length,
            messages: messages.map(msg => ({
                session_id: msg.session_id.substring(0, 8) + '...',
                project_name: msg.project_name,
                content: msg.content.substring(0, 300) + (msg.content.length > 300 ? '...' : ''),
                timestamp: msg.timestamp,
                created_at: msg.created_at
            }))
        });
    } catch (error) {
        console.error('Error searching messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// System stats
app.get('/api/stats', validateApiKey, async (req, res) => {
    try {
        const messageCount = inMemoryMessages.length;
        const projectCounts = {};
        const tokenMetrics = inMemoryMessages.filter(msg => msg.message_type === 'token_metric');
        const recentMessages = inMemoryMessages
            .filter(msg => new Date(msg.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000));

        inMemoryMessages.forEach(msg => {
            projectCounts[msg.project_name] = (projectCounts[msg.project_name] || 0) + 1;
        });

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
        
        // Filter token metrics
        let tokenMetrics = inMemoryMessages.filter(msg => msg.message_type === 'token_metric');
        
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
        await messagesCollection.createIndex({ created_at: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL
        
        console.log('✅ Connected to MongoDB');
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

// Start server
async function startServer() {
    const mongoConnected = await initializeMongoDB();
    const redisConnected = await initializeRedis();
    
    let storageInfo = 'In-Memory';
    if (mongoConnected) storageInfo = 'MongoDB + ' + storageInfo;
    if (redisConnected) storageInfo += ' + Redis';
    
    app.listen(PORT, () => {
        console.log(`🚀 Claude Conversation Logger API running on port ${PORT}`);
        console.log(`📊 Storage: ${storageInfo}`);
        console.log(`🏥 Health: http://localhost:${PORT}/health`);
        console.log(`📝 API: http://localhost:${PORT}/api/messages`);
        console.log(`🔢 Tokens: http://localhost:${PORT}/api/token-usage`);
        console.log('✅ Server ready to receive hooks');
        
        if (mongoConnected) {
            console.log('💾 MongoDB: Full persistence with 90-day TTL');
        }
        if (redisConnected) {
            console.log('🔄 Redis: Secondary backup active');
        }
        console.log('🚀 Memory: Fast cache (1000 messages)');
    });
}

startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});