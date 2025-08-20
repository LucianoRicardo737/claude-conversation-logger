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

// Session tracking for analytics
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

// Helper function to save with optimized flow: MongoDB → Redis (5000 msgs for MCP)
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

    // 2. SECOND: Update Redis cache for high-availability MCP queries (5000 msgs)
    try {
        if (redisClient.isOpen) {
            const recordForCache = {
                ...record,
                timestamp: record.timestamp.toISOString(),
                created_at: record.created_at.toISOString()
            };
            
            // Save individual message
            await redisClient.setEx(`msg:${record.id}`, 86400, JSON.stringify(recordForCache)); // 24h TTL
            
            // Update recent messages list for fast MCP queries (increased capacity)
            await redisClient.lPush('messages:recent', JSON.stringify(recordForCache));
            await redisClient.lTrim('messages:recent', 0, 4999); // Keep last 5000 messages
            
            // Invalidate dashboard cache to force refresh
            await redisClient.del('dashboard:stats');
            
            console.log(`⚡ Cached in Redis: ${record.id}`);
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
            // Get all messages for comprehensive stats
            const allMessages = await messagesCollection.find({}).toArray();
            
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

// Dashboard endpoint - Visual HTML stats dashboard with persistent data
app.get('/dashboard', async (req, res) => {
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
            <a href="/dashboard/messages" class="card-link">
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
            <a href="/dashboard/costs" class="card-link">
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
            <a href="/dashboard/tokens" class="card-link">
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
            <a href="/dashboard/projects" class="card-link">
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
app.get('/dashboard/messages', async (req, res) => {
    const stats = await getDashboardStats();
    const messages = await getMessagesFromStorage(100); // Get more for detail view
    const projects = [...new Set(messages.map(msg => msg.project_name))];
    res.send(`<html><head><title>📝 Mensajes</title><style>body{font-family:system-ui;background:#f8fafc;margin:0;padding:24px}.container{max-width:1200px;margin:0 auto}.header{background:white;padding:20px;border-radius:8px;margin-bottom:24px}.list{background:white;border-radius:8px;padding:20px}.item{padding:12px 0;border-bottom:1px solid #e5e7eb}.tag{background:#dbeafe;color:#3b82f6;padding:2px 8px;border-radius:4px;font-size:0.8rem}.back{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;margin-top:20px}</style></head><body><div class="container"><div class="header"><a href="/dashboard">← Dashboard</a><h1>📝 Mensajes (${stats.messageCount})</h1><p>Mostrando últimos ${messages.length} mensajes</p></div><div class="list">${messages.slice(0,50).map(msg => `<div class="item"><span class="tag">${msg.project_name}</span> <small>${new Date(msg.timestamp).toLocaleString()}</small><br><strong>${msg.message_type}</strong> - ${msg.session_id.substring(0,8)}...</div>`).join('')}</div><a href="/dashboard" class="back">← Volver</a></div></body></html>`);
});

app.get('/dashboard/costs', async (req, res) => {
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

app.get('/dashboard/tokens', async (req, res) => {
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

app.get('/dashboard/projects', async (req, res) => {
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
            // Load recent messages (last 500) to memory for fast dashboard access
            const recentMessages = await messagesCollection
                .find({})
                .sort({ timestamp: -1 })
                .limit(500)
                .toArray();
            
            // Clear memory and load fresh data
            inMemoryMessages.splice(0, inMemoryMessages.length);
            
            recentMessages.reverse().forEach(msg => {
                inMemoryMessages.push({
                    ...msg,
                    timestamp: msg.timestamp.toISOString(),
                    created_at: msg.created_at.toISOString()
                });
            });
            
            console.log(`🔄 Loaded ${inMemoryMessages.length} recent messages into memory from MongoDB`);
        }
    } catch (error) {
        console.warn('⚠️  Failed to load initial data:', error.message);
    }
}

// Start server
async function startServer() {
    const mongoConnected = await initializeMongoDB();
    const redisConnected = await initializeRedis();
    
    // Load initial data into memory if MongoDB is available
    if (mongoConnected) {
        await loadInitialDataToMemory();
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