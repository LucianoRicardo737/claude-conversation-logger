import { v4 as uuidv4 } from 'uuid';

class ConversationService {
    constructor(mongodb, redis) {
        this.mongodb = mongodb;
        this.redis = redis;
    }

    /**
     * Save a message with optimized flow: MongoDB → Redis
     */
    async saveMessage(data) {
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
                cost_usd: data.metadata?.cost_usd || 0,
                duration_ms: data.metadata?.duration_ms || 0
            }
        };

        let mongoSaveSuccess = false;
        
        // 1. Save to MongoDB (persistent storage)
        try {
            if (this.mongodb?.isConnected) {
                await this.mongodb.insertMessage(message);
                mongoSaveSuccess = true;
                console.log(`💾 Saved to MongoDB: ${message.session_id} (${message.message_type})`);
            }
        } catch (error) {
            console.warn('❌ MongoDB save failed:', error.message);
        }

        // 2. Cache in Redis for fast queries
        try {
            if (this.redis?.isConnected) {
                await this.redis.cacheMessage(message);
                await this.redis.invalidateCache('dashboard:stats');
                console.log(`⚡ Cached in Redis: ${message.id}`);
            }
        } catch (error) {
            console.warn('⚠️  Redis cache update failed:', error.message);
        }

        return message;
    }

    /**
     * Save token usage metrics
     */
    async saveTokenUsage(data) {
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
                token_type: data.metadata?.token_type || 'unknown',
                token_count: data.metadata?.token_count || 0,
                model: data.metadata?.model || 'unknown',
                cost_usd: data.metadata?.cost_usd || 0,
                duration_ms: data.metadata?.duration_ms || 0
            }
        };

        return await this.saveMessage({ ...tokenRecord, message_type: 'token_metric' });
    }

    /**
     * Get messages with optimized flow: Redis → MongoDB
     */
    async getMessages(options = {}) {
        const {
            limit = 50,
            project = null,
            session = null,
            messageType = null,
            startDate = null,
            endDate = null
        } = options;

        // Try Redis cache first
        try {
            if (this.redis?.isConnected && !project && !session && !messageType && !startDate && !endDate) {
                const cacheKey = `messages:query:${limit}:recent`;
                const cached = await this.redis.getCachedQuery(cacheKey);
                
                if (cached) {
                    console.log(`⚡ Retrieved ${cached.length} messages from Redis cache`);
                    return cached;
                }
            }
        } catch (error) {
            console.warn('⚠️  Redis read failed:', error.message);
        }

        // Query MongoDB
        try {
            if (this.mongodb?.isConnected) {
                const query = this.buildMessageQuery({ project, session, messageType, startDate, endDate });
                const options = { sort: { timestamp: -1 }, limit };
                
                const messages = await this.mongodb.findMessages(query, options);
                
                const formattedMessages = messages.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp.toISOString(),
                    created_at: msg.created_at.toISOString()
                }));

                // Cache result if it's a simple query
                if (this.redis?.isConnected && !project && !session && !messageType && !startDate && !endDate) {
                    const cacheKey = `messages:query:${limit}:recent`;
                    await this.redis.cacheQuery(cacheKey, formattedMessages, 300);
                }

                console.log(`💾 Retrieved ${formattedMessages.length} messages from MongoDB`);
                return formattedMessages;
            }
        } catch (error) {
            console.warn('❌ MongoDB read failed:', error.message);
        }

        return [];
    }

    /**
     * Get conversation tree with project/session hierarchy
     */
    async getConversationTree(options = {}) {
        const {
            project = '',
            limit = 50,
            hoursBack = 24
        } = options;

        if (!this.mongodb?.isConnected) {
            throw new Error('Database not available');
        }

        const hoursAgo = new Date(Date.now() - (parseInt(hoursBack) * 60 * 60 * 1000));
        const baseQuery = {
            timestamp: { $gte: hoursAgo },
            ...this.getFilterQuery()
        };

        if (project) {
            baseQuery.project_name = project;
        }

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
                            start_time: '$start_time',
                            last_activity: '$last_activity',
                            is_active: {
                                $gt: ['$last_activity', new Date(Date.now() - 30 * 60 * 1000)]
                            },
                            recent_messages: { $slice: ['$messages', -3] }
                        }
                    },
                    total_messages: { $sum: '$message_count' },
                    last_activity: { $max: '$last_activity' }
                }
            },
            { $sort: { last_activity: -1 } },
            { $limit: parseInt(limit) }
        ];

        const results = await this.mongodb.aggregateMessages(pipeline);
        
        // Enrich with Redis data
        const enrichedResults = await this.enrichWithRedisData(results);

        const totalMessages = enrichedResults.reduce((sum, p) => sum + p.message_count, 0);
        const totalSessions = enrichedResults.reduce((sum, p) => sum + p.sessions.length, 0);

        return {
            projects: enrichedResults,
            total_messages: totalMessages,
            total_sessions: totalSessions,
            filters: { project, hours_back: parseInt(hoursBack) }
        };
    }

    /**
     * Get detailed conversation by session ID
     */
    async getConversationDetails(sessionId, includeMetadata = true) {
        if (!this.mongodb?.isConnected) {
            throw new Error('Database not available');
        }

        const query = {
            session_id: sessionId,
            ...this.getFilterQuery()
        };

        const messages = await this.mongodb.findMessages(query, {
            sort: { timestamp: 1 },
            limit: 1000
        });

        if (messages.length === 0) {
            throw new Error('Session not found');
        }

        // Get mark info from Redis
        let markInfo = null;
        if (this.redis?.isConnected) {
            try {
                markInfo = await this.redis.getSessionMark(sessionId);
            } catch (error) {
                // Ignore Redis errors
            }
        }

        const formattedMessages = messages.map(msg => {
            const base = {
                id: msg._id,
                message_type: msg.message_type,
                content: msg.content,
                hook_event: msg.hook_event,
                timestamp: msg.timestamp
            };

            if (includeMetadata && msg.metadata) {
                base.metadata = msg.metadata;
            }

            return base;
        });

        return {
            session_id: sessionId,
            short_id: sessionId.substring(0, 8),
            project_name: messages[0].project_name,
            message_count: messages.length,
            start_time: messages[0].timestamp,
            end_time: messages[messages.length - 1].timestamp,
            is_marked: !!markInfo,
            mark_info: markInfo,
            messages: formattedMessages
        };
    }

    /**
     * Advanced search with text, filters, and pagination
     */
    async searchConversations(options = {}) {
        const {
            query = '',
            project = '',
            session = '',
            messageType = '',
            startDate = '',
            endDate = '',
            onlyMarked = false,
            limit = 50,
            offset = 0
        } = options;

        if (!this.mongodb?.isConnected) {
            throw new Error('Database not available');
        }

        let searchQuery = { ...this.getFilterQuery() };

        // Text search
        if (query) {
            if (this.mongodb.messagesCollection) {
                // Use MongoDB text search if available
                searchQuery.$text = { $search: query };
            } else {
                // Fallback to regex
                searchQuery.$or = [
                    { content: { $regex: query, $options: 'i' } },
                    { project_name: { $regex: query, $options: 'i' } }
                ];
            }
        }

        // Apply filters
        if (project) searchQuery.project_name = project;
        if (session) searchQuery.session_id = session;
        if (messageType) searchQuery.message_type = messageType;

        // Date range
        if (startDate || endDate) {
            searchQuery.timestamp = {};
            if (startDate) searchQuery.timestamp.$gte = new Date(startDate);
            if (endDate) searchQuery.timestamp.$lte = new Date(endDate);
        }

        const totalCount = await this.mongodb.countMessages(searchQuery);
        const messages = await this.mongodb.findMessages(searchQuery, {
            sort: { timestamp: -1 },
            limit: parseInt(limit),
            skip: parseInt(offset)
        });

        let filteredResults = messages;

        // Filter by marked sessions if requested
        if (onlyMarked && this.redis?.isConnected) {
            const sessionIds = [...new Set(messages.map(m => m.session_id))];
            const markedSessions = new Set();

            for (const sessionId of sessionIds) {
                try {
                    const markData = await this.redis.getSessionMark(sessionId);
                    if (markData) {
                        markedSessions.add(sessionId);
                    }
                } catch (error) {
                    // Ignore errors
                }
            }

            filteredResults = messages.filter(msg => markedSessions.has(msg.session_id));
        }

        // Format results with context
        const results = await Promise.all(filteredResults.map(async msg => {
            let isMarked = false;
            if (this.redis?.isConnected) {
                try {
                    const markData = await this.redis.getSessionMark(msg.session_id);
                    isMarked = !!markData;
                } catch (error) {
                    // Ignore errors
                }
            }

            const highlights = this.generateHighlights(msg.content, query);

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
                context: {
                    session_id: msg.session_id,
                    short_id: msg.session_id.substring(0, 8),
                    project_name: msg.project_name,
                    is_marked: isMarked
                },
                relevance_score: query ? this.calculateRelevanceScore(msg, query) : 1.0
            };
        }));

        return {
            results,
            pagination: {
                total_count: totalCount,
                returned_count: results.length,
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: parseInt(offset) + results.length < totalCount
            },
            filters: {
                query,
                project,
                session,
                message_type: messageType,
                start_date: startDate,
                end_date: endDate,
                only_marked: onlyMarked
            }
        };
    }

    /**
     * Export conversation in different formats
     */
    async exportConversation(sessionId, format = 'json', includeMetadata = true) {
        const conversation = await this.getConversationDetails(sessionId, includeMetadata);
        
        let content, filename, mimeType;

        switch (format) {
            case 'json':
                content = JSON.stringify(conversation.messages, null, 2);
                filename = `conversation_${sessionId.substring(0, 8)}.json`;
                mimeType = 'application/json';
                break;

            case 'markdown':
                content = this.formatAsMarkdown(conversation, includeMetadata);
                filename = `conversation_${sessionId.substring(0, 8)}.md`;
                mimeType = 'text/markdown';
                break;

            case 'txt':
                content = this.formatAsText(conversation, includeMetadata);
                filename = `conversation_${sessionId.substring(0, 8)}.txt`;
                mimeType = 'text/plain';
                break;

            default:
                throw new Error('Unsupported format');
        }

        return { content, filename, mimeType };
    }

    /**
     * Get comprehensive dashboard statistics
     */
    async getDashboardStats() {
        // Try Redis cache first
        if (this.redis?.isConnected) {
            try {
                const cached = await this.redis.getCachedQuery('dashboard:stats');
                if (cached) {
                    console.log('⚡ Retrieved dashboard stats from Redis cache');
                    return cached;
                }
            } catch (error) {
                console.warn('⚠️  Redis stats cache failed:', error.message);
            }
        }

        // Generate stats from MongoDB
        if (!this.mongodb?.isConnected) {
            return this.getEmptyStats();
        }

        try {
            const filterQuery = this.getFilterQuery();
            const allMessages = await this.mongodb.findMessages(filterQuery, { limit: 10000 });
            
            const stats = {
                messageCount: allMessages.length,
                tokenMetrics: allMessages.filter(msg => msg.message_type === 'token_metric'),
                projectCounts: {},
                recentMessages: [],
                totalCost: 0,
                totalTokens: 0
            };

            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            stats.recentMessages = allMessages.filter(msg => new Date(msg.timestamp) > oneDayAgo);

            // Count by project
            allMessages.forEach(msg => {
                stats.projectCounts[msg.project_name] = (stats.projectCounts[msg.project_name] || 0) + 1;
            });

            // Calculate costs and tokens
            stats.totalCost = stats.tokenMetrics.reduce((sum, metric) => {
                return sum + (metric.metadata?.cost_usd || 0);
            }, 0);

            stats.totalTokens = stats.tokenMetrics.reduce((sum, metric) => {
                return sum + (metric.metadata?.token_count || 0);
            }, 0);

            // Cache results
            if (this.redis?.isConnected) {
                await this.redis.cacheQuery('dashboard:stats', stats, 60);
            }

            console.log(`💾 Generated dashboard stats from MongoDB: ${stats.messageCount} messages`);
            return stats;
        } catch (error) {
            console.warn('❌ MongoDB stats failed:', error.message);
            return this.getEmptyStats();
        }
    }

    // Helper methods
    buildMessageQuery(options) {
        const query = { ...this.getFilterQuery() };
        
        if (options.project) query.project_name = options.project;
        if (options.session) query.session_id = options.session;
        if (options.messageType) query.message_type = options.messageType;
        
        if (options.startDate || options.endDate) {
            query.timestamp = {};
            if (options.startDate) query.timestamp.$gte = new Date(options.startDate);
            if (options.endDate) query.timestamp.$lte = new Date(options.endDate);
        }

        return query;
    }

    getFilterQuery() {
        // Exclude "Session started" messages from most queries
        return {
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
    }

    async enrichWithRedisData(results) {
        if (!this.redis?.isConnected) {
            return results.map(project => ({
                name: project._id,
                message_count: project.total_messages,
                sessions: project.sessions.map(session => ({
                    ...session,
                    is_marked: false,
                    description: "Sin descripción",
                    category: "📝 General",
                    recent_messages: session.recent_messages.map(msg => ({
                        id: msg._id,
                        message_type: msg.message_type,
                        content: msg.content.substring(0, 150) + (msg.content.length > 150 ? '...' : ''),
                        timestamp: msg.timestamp
                    }))
                })),
                last_activity: project.last_activity
            }));
        }

        return await Promise.all(results.map(async project => {
            const sessionsWithMarks = await Promise.all(project.sessions.map(async session => {
                let isMarked = false;
                let sessionDescription = "Sin descripción";
                let sessionCategory = "📝 General";

                try {
                    const markInfo = await this.redis.getSessionMark(session.session_id);
                    isMarked = !!markInfo;

                    const descInfo = await this.redis.getSessionDescription(session.session_id);
                    if (descInfo) {
                        sessionDescription = descInfo.description || "Sin descripción";
                        sessionCategory = descInfo.category || "📝 General";
                    }
                } catch (error) {
                    // Ignore Redis errors
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
    }

    generateHighlights(content, query) {
        if (!query) return [];
        
        const highlights = [];
        const contentLower = content.toLowerCase();
        const queryLower = query.toLowerCase();
        const index = contentLower.indexOf(queryLower);
        
        if (index !== -1) {
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + query.length + 50);
            highlights.push(content.substring(start, end));
        }
        
        return highlights;
    }

    calculateRelevanceScore(message, query) {
        if (!query) return 1.0;
        
        const queryLower = query.toLowerCase();
        const contentLower = message.content.toLowerCase();
        const projectLower = message.project_name.toLowerCase();
        
        let score = 0;
        
        // Content match
        if (contentLower.includes(queryLower)) score += 0.5;
        
        // Project match
        if (projectLower.includes(queryLower)) score += 0.3;
        
        // Exact phrase match
        if (contentLower === queryLower) score += 0.2;
        
        return Math.min(score, 1.0);
    }

    formatAsMarkdown(conversation, includeMetadata) {
        const { project_name, session_id, start_time, messages } = conversation;
        const startTime = new Date(start_time).toLocaleString();
        
        let content = `# Conversación: ${project_name}\n\n`;
        content += `**Session ID**: \`${session_id}\`\n`;
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

    formatAsText(conversation, includeMetadata) {
        const { project_name, session_id, start_time, messages } = conversation;
        const startTime = new Date(start_time).toLocaleString();
        
        let content = `CONVERSACIÓN: ${project_name}\n`;
        content += `Session ID: ${session_id}\n`;
        content += `Iniciada: ${startTime}\n`;
        content += `Mensajes: ${messages.length}\n`;
        content += '='.repeat(60) + '\n\n';

        messages.forEach((msg) => {
            const time = new Date(msg.timestamp).toLocaleString();
            content += `[${time}] ${msg.message_type.toUpperCase()}: ${msg.content}\n`;
            
            if (includeMetadata && msg.metadata) {
                content += `METADATA: ${JSON.stringify(msg.metadata, null, 2)}\n`;
            }
            
            content += '\n' + '-'.repeat(40) + '\n\n';
        });

        return content;
    }

    getEmptyStats() {
        return {
            messageCount: 0,
            tokenMetrics: [],
            projectCounts: {},
            recentMessages: [],
            totalCost: 0,
            totalTokens: 0
        };
    }
}

export default ConversationService;