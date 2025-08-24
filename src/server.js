import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Import optimized modules
import { 
    setupSecurity, 
    setupParsing, 
    setupLogging, 
    setupErrorHandling,
    validateApiKey,
    timeoutMiddleware,
    rateLimitMiddleware
} from './middleware/index.js';
import MongoDBAgentExtension from './database/mongodb-agent-extension.js';
import RedisManager from './database/redis.js';
import ConversationService from './services/conversationService.js';
import { getOptimizedGrpcServer } from './grpc/grpc-server.js';
import { injectDependencies } from './grpc/grpc-handlers.js';
import { AgentSystemFactory } from './agents/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OptimizedServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.mongodb = new MongoDBAgentExtension();
        this.redis = new RedisManager();
        this.conversationService = null;
        this.grpcServer = null;
        this.agentSystem = new AgentSystemFactory();
    }

    setupMiddleware() {
        // Request timeout
        this.app.use(timeoutMiddleware(30000));

        // Rate limiting
        if (process.env.NODE_ENV === 'production') {
            this.app.use('/api', rateLimitMiddleware(200, 15 * 60 * 1000)); // 200 requests per 15 minutes
        }

        // Security middleware
        setupSecurity(this.app);

        // Request parsing
        setupParsing(this.app);

        // Logging
        setupLogging(this.app);
    }

    setupRoutes() {
        // Health check (no auth required)
        this.app.get('/health', async (req, res) => {
            const mongoHealth = await this.mongodb.ping();
            const redisHealth = await this.redis.healthCheck();
            
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                services: {
                    api: 'ok',
                    mongodb: mongoHealth ? 'ok' : 'down',
                    redis: redisHealth ? 'ok' : 'down'
                }
            });
        });

        // System info
        this.app.get('/api/system/info', validateApiKey, async (req, res) => {
            try {
                const mongoStats = await this.mongodb.getStats();
                const redisStats = await this.redis.getStats();
                
                res.json({
                    system: {
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        platform: process.platform,
                        nodeVersion: process.version
                    },
                    mongodb: mongoStats,
                    redis: redisStats
                });
            } catch (error) {
                console.error('Error getting system info:', error);
                res.status(500).json({ error: 'Failed to get system info' });
            }
        });

        // Conversation API endpoints
        this.setupConversationRoutes();

        // Agent System API endpoints
        this.setupAgentRoutes();

        // Dashboard routes
        this.app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
        this.app.get('/', (req, res) => res.redirect('/dashboard'));

        // Error handling
        setupErrorHandling(this.app);
    }

    setupConversationRoutes() {
        // Message logging
        this.app.post('/api/log', validateApiKey, async (req, res) => {
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
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'session_id and project_name are required' 
                    });
                }

                const message = await this.conversationService.saveMessage({
                    session_id,
                    project_name,
                    content,
                    hook_event,
                    message_type,
                    metadata
                });

                res.status(200).json({ 
                    success: true,
                    message: 'Message logged successfully',
                    id: message.id
                });

            } catch (error) {
                console.error('Error in /api/log:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to log message'
                });
            }
        });

        // Token usage logging
        this.app.post('/api/token-usage', validateApiKey, async (req, res) => {
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
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'session_id and project_name are required' 
                    });
                }

                if (!metadata?.token_type || !metadata?.token_count) {
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'metadata.token_type and metadata.token_count are required' 
                    });
                }

                const tokenRecord = await this.conversationService.saveTokenUsage({
                    session_id,
                    project_name,
                    content,
                    hook_event: hook_event || 'TokenUsage',
                    message_type: message_type || 'token_metric',
                    metadata
                });

                res.status(200).json({ 
                    success: true,
                    message: 'Token usage logged successfully',
                    id: tokenRecord.id,
                    token_type: metadata.token_type,
                    token_count: metadata.token_count
                });

            } catch (error) {
                console.error('Error in /api/token-usage:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to log token usage'
                });
            }
        });

        // Get messages
        this.app.get('/api/messages', validateApiKey, async (req, res) => {
            try {
                const options = {
                    limit: parseInt(req.query.limit) || 50,
                    project: req.query.project,
                    session: req.query.session,
                    messageType: req.query.message_type,
                    startDate: req.query.start_date,
                    endDate: req.query.end_date
                };

                const messages = await this.conversationService.getMessages(options);

                res.json({
                    success: true,
                    count: messages.length,
                    messages: messages.map(msg => ({
                        id: msg.id,
                        session_id: msg.session_id.substring(0, 12) + '...',
                        project_name: msg.project_name,
                        message_type: msg.message_type,
                        content: msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''),
                        timestamp: msg.timestamp,
                        hook_event: msg.hook_event
                    }))
                });
            } catch (error) {
                console.error('Error getting messages:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to get messages' 
                });
            }
        });

        // Get conversation tree
        this.app.get('/api/conversations/tree', validateApiKey, async (req, res) => {
            try {
                const options = {
                    project: req.query.project || '',
                    limit: parseInt(req.query.limit) || 50,
                    hoursBack: parseInt(req.query.hours_back) || 24
                };

                const tree = await this.conversationService.getConversationTree(options);
                res.json(tree);
            } catch (error) {
                console.error('Error getting conversation tree:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to get conversation tree' 
                });
            }
        });

        // Get conversation details
        this.app.get('/api/conversations/:sessionId', validateApiKey, async (req, res) => {
            try {
                const { sessionId } = req.params;
                const includeMetadata = req.query.include_metadata !== 'false';

                const conversation = await this.conversationService.getConversationDetails(sessionId, includeMetadata);
                res.json(conversation);
            } catch (error) {
                console.error('Error getting conversation:', error);
                if (error.message === 'Session not found') {
                    res.status(404).json({ 
                        error: 'Not Found',
                        message: 'Session not found' 
                    });
                } else {
                    res.status(500).json({ 
                        error: 'Internal Server Error',
                        message: 'Failed to get conversation' 
                    });
                }
            }
        });

        // Advanced search
        this.app.get('/api/search/advanced', validateApiKey, async (req, res) => {
            try {
                const options = {
                    query: req.query.q || '',
                    project: req.query.project || '',
                    session: req.query.session || '',
                    messageType: req.query.message_type || '',
                    startDate: req.query.start_date || '',
                    endDate: req.query.end_date || '',
                    onlyMarked: req.query.only_marked === 'true',
                    limit: parseInt(req.query.limit) || 50,
                    offset: parseInt(req.query.offset) || 0
                };

                const results = await this.conversationService.searchConversations(options);
                res.json(results);
            } catch (error) {
                console.error('Error in advanced search:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Search failed' 
                });
            }
        });

        // Mark/unmark conversation
        this.app.post('/api/conversations/:sessionId/mark', validateApiKey, async (req, res) => {
            try {
                const { sessionId } = req.params;
                const { is_marked = true, note = '', tags = [] } = req.body;

                const result = await this.redis.markSession(sessionId, is_marked, note, tags);

                res.json({
                    success: true,
                    message: is_marked ? 'Conversación marcada como importante' : 'Marca removida de la conversación',
                    data: result
                });
            } catch (error) {
                console.error('Error marking conversation:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to mark conversation' 
                });
            }
        });

        // Session description management
        this.app.post('/api/sessions/:sessionId/description', validateApiKey, async (req, res) => {
            try {
                const { sessionId } = req.params;
                const { description, category, project_name } = req.body;

                if (!description) {
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'Description is required' 
                    });
                }

                // Store in Redis
                const redisData = await this.redis.setSessionDescription(
                    sessionId, 
                    description, 
                    category || "📝 General"
                );

                // Also update in MongoDB if available
                if (this.mongodb.isConnected) {
                    try {
                        const updateData = {
                            session_description: description.substring(0, 200),
                            session_category: category || "📝 General",
                            description_updated_at: new Date()
                        };

                        await this.mongodb.updateMessages(
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
                    data: redisData
                });

            } catch (error) {
                console.error('Error updating session description:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to update description' 
                });
            }
        });

        this.app.get('/api/sessions/:sessionId/description', validateApiKey, async (req, res) => {
            try {
                const { sessionId } = req.params;

                // Try Redis first
                let description = null;
                if (this.redis.isConnected) {
                    try {
                        description = await this.redis.getSessionDescription(sessionId);
                    } catch (redisError) {
                        console.warn('⚠️  Redis description read failed:', redisError.message);
                    }
                }

                // Fallback to MongoDB
                if (!description && this.mongodb.isConnected) {
                    try {
                        const message = await this.mongodb.findOne(
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
                            description = {
                                session_id: sessionId,
                                description: message.session_description,
                                category: message.session_category || "📝 General",
                                project_name: message.project_name,
                                updated_at: message.description_updated_at
                            };
                        }
                    } catch (mongoError) {
                        console.warn('❌ MongoDB description read failed:', mongoError.message);
                    }
                }

                // Default response
                if (!description) {
                    description = {
                        session_id: sessionId,
                        description: "Sin descripción",
                        category: "📝 General"
                    };
                }

                res.json({
                    success: true,
                    data: description
                });

            } catch (error) {
                console.error('Error getting session description:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to get description' 
                });
            }
        });

        // Export conversation
        this.app.get('/api/conversations/:sessionId/export', validateApiKey, async (req, res) => {
            try {
                const { sessionId } = req.params;
                const { format = 'json', include_metadata = 'true' } = req.query;
                const includeMetadata = include_metadata === 'true';

                const result = await this.conversationService.exportConversation(sessionId, format, includeMetadata);

                res.setHeader('Content-Type', result.mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                res.send(result.content);

            } catch (error) {
                console.error('Error exporting conversation:', error);
                if (error.message === 'Session not found') {
                    res.status(404).json({ 
                        error: 'Not Found',
                        message: 'Session not found' 
                    });
                } else if (error.message === 'Unsupported format') {
                    res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'Unsupported format' 
                    });
                } else {
                    res.status(500).json({ 
                        error: 'Internal Server Error',
                        message: 'Export failed' 
                    });
                }
            }
        });

        // Get dashboard stats
        this.app.get('/api/stats', validateApiKey, async (req, res) => {
            try {
                const stats = await this.conversationService.getDashboardStats();

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

                res.json({
                    total_messages: stats.messageCount,
                    messages_last_24h: stats.recentMessages.length,
                    projects: Object.keys(stats.projectCounts).length,
                    project_activity: stats.projectCounts,
                    token_statistics: tokenStats,
                    storage: this.getStorageInfo(),
                    uptime: process.uptime()
                });
            } catch (error) {
                console.error('Error getting stats:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to get statistics' 
                });
            }
        });
    }

    setupAgentRoutes() {
        // Agent system health check
        this.app.get('/api/agents/health', validateApiKey, async (req, res) => {
            try {
                const healthStatus = this.agentSystem.getHealthStatus();
                res.json(healthStatus);
            } catch (error) {
                console.error('Error getting agent health:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to get agent health status' 
                });
            }
        });

        // Main orchestrator endpoint
        this.app.post('/api/agents/orchestrator', validateApiKey, async (req, res) => {
            try {
                const { type, data, options = {} } = req.body;
                
                if (!type) {
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'Request type is required' 
                    });
                }

                const result = await this.agentSystem.processRequest({
                    type,
                    data,
                    options
                });

                res.json(result);

            } catch (error) {
                console.error('Error in agent orchestrator:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Agent processing failed' 
                });
            }
        });

        // Pattern detection and analysis
        this.app.get('/api/agents/patterns', validateApiKey, async (req, res) => {
            try {
                const options = {
                    project: req.query.project,
                    timeRange: parseInt(req.query.days) || 7,
                    minFrequency: parseInt(req.query.min_frequency) || 3,
                    limit: parseInt(req.query.limit) || 10
                };

                const result = await this.agentSystem.processRequest({
                    type: 'analyze_patterns',
                    data: options,
                    options: { includeInsights: true }
                });

                res.json(result);

            } catch (error) {
                console.error('Error analyzing patterns:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Pattern analysis failed' 
                });
            }
        });

        // Document session
        this.app.post('/api/agents/document', validateApiKey, async (req, res) => {
            try {
                const { session_id, options = {} } = req.body;
                
                if (!session_id) {
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'session_id is required' 
                    });
                }

                const result = await this.agentSystem.processRequest({
                    type: 'document_session',
                    data: { session_id },
                    options: {
                        autoDetectPatterns: options.auto_detect_patterns !== false,
                        includeRelationships: options.include_relationships === true,
                        generateInsights: options.generate_insights !== false
                    }
                });

                res.json(result);

            } catch (error) {
                console.error('Error documenting session:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Session documentation failed' 
                });
            }
        });

        // Find relationships
        this.app.get('/api/agents/relationships/:sessionId', validateApiKey, async (req, res) => {
            try {
                const { sessionId } = req.params;
                const maxResults = parseInt(req.query.max_results) || 10;
                const minConfidence = parseFloat(req.query.min_confidence) || 0.7;

                const result = await this.agentSystem.processRequest({
                    type: 'find_relationships',
                    data: { session_id: sessionId },
                    options: { 
                        maxResults,
                        minConfidence,
                        includeInsights: true
                    }
                });

                res.json(result);

            } catch (error) {
                console.error('Error finding relationships:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Relationship analysis failed' 
                });
            }
        });

        // Deep analysis
        this.app.post('/api/agents/analyze', validateApiKey, async (req, res) => {
            try {
                const { session_id, analysis_type = 'deep_analysis', options = {} } = req.body;
                
                if (!session_id) {
                    return res.status(400).json({ 
                        error: 'Bad Request',
                        message: 'session_id is required' 
                    });
                }

                const result = await this.agentSystem.processRequest({
                    type: analysis_type,
                    data: { session_id },
                    options: {
                        includeSemanticAnalysis: options.include_semantic !== false,
                        includeRelationships: options.include_relationships !== false,
                        generateInsights: options.generate_insights !== false,
                        maxTokenBudget: options.max_token_budget || 150
                    }
                });

                res.json(result);

            } catch (error) {
                console.error('Error in deep analysis:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Deep analysis failed' 
                });
            }
        });

        // Configuration endpoint
        this.app.get('/api/agents/config', validateApiKey, async (req, res) => {
            try {
                const config = this.agentSystem.getConfig();
                res.json({
                    language: config.getSection('language'),
                    features: config.getSection('features'),
                    performance: config.getSection('performance'),
                    enabled_features: this.agentSystem.getEnabledFeatures()
                });
            } catch (error) {
                console.error('Error getting agent configuration:', error);
                res.status(500).json({ 
                    error: 'Internal Server Error',
                    message: 'Failed to get configuration' 
                });
            }
        });
    }

    async initializeDatabases() {
        console.log('🔌 Initializing database connections...');
        
        const mongoConnected = await this.mongodb.connect();
        const redisConnected = await this.redis.connect();
        
        if (mongoConnected && redisConnected) {
            // Initialize conversation service
            this.conversationService = new ConversationService(this.mongodb, this.redis);
            
            // Inject dependencies for gRPC
            injectDependencies(this.mongodb.messagesCollection, this.redis.client);
            
            // Initialize Agent System with MongoDB instance
            try {
                await this.agentSystem.initialize();
                // Inject MongoDB instance for agent operations
                this.agentSystem.injectDependencies({ mongodb: this.mongodb, redis: this.redis });
                console.log('🤖 Agent system initialized successfully');
            } catch (error) {
                console.warn('⚠️  Agent system failed to initialize:', error.message);
            }
            
            console.log('✅ All databases initialized successfully');
        } else if (mongoConnected) {
            this.conversationService = new ConversationService(this.mongodb, null);
            console.log('⚠️  Running with MongoDB only (Redis unavailable)');
        } else if (redisConnected) {
            this.conversationService = new ConversationService(null, this.redis);
            console.log('⚠️  Running with Redis only (MongoDB unavailable)');
        } else {
            throw new Error('No database connections available');
        }

        return { mongoConnected, redisConnected };
    }

    async startGrpcServer() {
        try {
            this.grpcServer = getOptimizedGrpcServer();
            const grpcPort = process.env.GRPC_PORT || 50051;
            this.grpcServer.start(grpcPort);
            console.log(`📡 gRPC server started on port ${grpcPort}`);
        } catch (error) {
            console.warn('⚠️  Failed to start gRPC server:', error.message);
        }
    }

    getStorageInfo() {
        const components = [];
        if (this.mongodb.isConnected) components.push('MongoDB');
        if (this.redis.isConnected) components.push('Redis');
        return components.length > 0 ? components.join(' + ') : 'Memory Only';
    }

    async gracefulShutdown() {
        console.log('🛑 Starting graceful shutdown...');
        
        try {
            // Shutdown agent system first
            if (this.agentSystem) {
                try {
                    await this.agentSystem.shutdown();
                    console.log('🤖 Agent system shut down successfully');
                } catch (error) {
                    console.warn('⚠️  Agent system shutdown warning:', error.message);
                }
            }
            
            if (this.grpcServer) {
                await this.grpcServer.stop();
            }
            
            if (this.mongodb) {
                await this.mongodb.disconnect();
            }
            
            if (this.redis) {
                await this.redis.disconnect();
            }
            
            console.log('✅ Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }

    async start() {
        try {
            // Setup middleware and routes
            this.setupMiddleware();
            this.setupRoutes();

            // Initialize databases
            const { mongoConnected, redisConnected } = await this.initializeDatabases();

            // Start HTTP server
            this.app.listen(this.port, () => {
                console.log('🚀 Claude Conversation Logger API - Optimized Version');
                console.log(`📍 Server running on port ${this.port}`);
                console.log(`🏥 Health: http://localhost:${this.port}/health`);
                console.log(`📊 Dashboard: http://localhost:${this.port}/dashboard`);
                console.log(`📝 API: http://localhost:${this.port}/api/messages`);
                console.log(`📊 Storage: ${this.getStorageInfo()}`);
                
                if (mongoConnected) {
                    const ttlSeconds = process.env.MONGODB_TTL_SECONDS;
                    if (ttlSeconds && parseInt(ttlSeconds) > 0) {
                        console.log(`💾 MongoDB: Data expires after ${Math.round(ttlSeconds/86400)} days`);
                    } else {
                        console.log('💾 MongoDB: Indefinite persistence');
                    }
                }
                
                if (redisConnected) {
                    console.log(`🔄 Redis: Cache active (${this.redis.messageLimit} message limit)`);
                }
                
                console.log('✅ Server ready to receive hooks');
            });

            // Start gRPC server
            await this.startGrpcServer();

            // Setup graceful shutdown
            process.on('SIGTERM', () => this.gracefulShutdown());
            process.on('SIGINT', () => this.gracefulShutdown());

        } catch (error) {
            console.error('❌ Failed to start server:', error);
            process.exit(1);
        }
    }
}

// Start the optimized server
const server = new OptimizedServer();
server.start();