/**
 * MongoDB Agent Extension
 * Extends the base MongoDB class with agent-specific collections and operations
 */

import MongoDB from './mongodb.js';
import { AgentSchemaIndexes, SchemaValidators, SchemaDefaults } from './agent-schemas.js';

class MongoDBAgentExtension extends MongoDB {
    constructor() {
        super();
        
        // Agent collections
        this.agentCollections = {
            patterns: null,
            relationships: null,
            insights: null,
            sessionStates: null,
            metrics: null
        };
        
        this.agentIndexesCreated = false;
    }

    async connect() {
        // Connect using parent method
        const connected = await super.connect();
        
        if (connected) {
            // Initialize agent collections
            await this.initializeAgentCollections();
        }
        
        return connected;
    }

    async initializeAgentCollections() {
        try {
            // Initialize collection references
            this.agentCollections.patterns = this.db.collection('conversation_patterns');
            this.agentCollections.relationships = this.db.collection('conversation_relationships');
            this.agentCollections.insights = this.db.collection('conversation_insights');
            this.agentCollections.sessionStates = this.db.collection('session_states');
            this.agentCollections.metrics = this.db.collection('agent_metrics');
            
            // Create agent-specific indexes
            if (!this.agentIndexesCreated) {
                await AgentSchemaIndexes.createAllIndexes(this.db);
                this.agentIndexesCreated = true;
            }
            
            console.log('🤖 Agent collections initialized successfully');
            
        } catch (error) {
            console.warn('⚠️  Failed to initialize agent collections:', error.message);
        }
    }

    // ========================================
    // CONVERSATION PATTERNS OPERATIONS
    // ========================================

    async insertPattern(patternData) {
        if (!this.agentCollections.patterns) {
            throw new Error('Agent collections not initialized');
        }

        // Validate and apply defaults
        const pattern = { 
            ...SchemaDefaults.pattern, 
            ...patternData,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        if (!SchemaValidators.validatePattern(pattern)) {
            throw new Error('Invalid pattern data structure');
        }

        try {
            const result = await this.agentCollections.patterns.insertOne(pattern);
            console.log(`📊 Pattern inserted: ${pattern.title} (ID: ${result.insertedId})`);
            return result;
        } catch (error) {
            console.error('❌ Failed to insert pattern:', error.message);
            throw error;
        }
    }

    async findPatterns(query = {}, options = {}) {
        if (!this.agentCollections.patterns) {
            throw new Error('Agent collections not initialized');
        }

        const {
            sort = { frequency: -1, confidence: -1 },
            limit = 50,
            skip = 0,
            projection = {}
        } = options;

        try {
            return await this.agentCollections.patterns
                .find(query, { projection })
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('❌ Failed to find patterns:', error.message);
            throw error;
        }
    }

    async updatePattern(pattern_id, updateData) {
        if (!this.agentCollections.patterns) {
            throw new Error('Agent collections not initialized');
        }

        try {
            const result = await this.agentCollections.patterns.updateOne(
                { pattern_id },
                { 
                    $set: { 
                        ...updateData, 
                        updated_at: new Date() 
                    } 
                }
            );
            return result;
        } catch (error) {
            console.error('❌ Failed to update pattern:', error.message);
            throw error;
        }
    }

    async incrementPatternFrequency(pattern_id) {
        if (!this.agentCollections.patterns) {
            throw new Error('Agent collections not initialized');
        }

        try {
            return await this.agentCollections.patterns.updateOne(
                { pattern_id },
                { 
                    $inc: { frequency: 1 },
                    $set: { 
                        last_seen: new Date(),
                        updated_at: new Date()
                    }
                }
            );
        } catch (error) {
            console.error('❌ Failed to increment pattern frequency:', error.message);
            throw error;
        }
    }

    // ========================================
    // RELATIONSHIP OPERATIONS
    // ========================================

    async insertRelationship(relationshipData) {
        if (!this.agentCollections.relationships) {
            throw new Error('Agent collections not initialized');
        }

        const relationship = {
            ...SchemaDefaults.relationship,
            ...relationshipData,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        if (!SchemaValidators.validateRelationship(relationship)) {
            throw new Error('Invalid relationship data structure');
        }

        try {
            const result = await this.agentCollections.relationships.insertOne(relationship);
            console.log(`🔗 Relationship inserted: ${relationship.source_session} -> ${relationship.target_session}`);
            return result;
        } catch (error) {
            console.error('❌ Failed to insert relationship:', error.message);
            throw error;
        }
    }

    async findRelationships(query = {}, options = {}) {
        if (!this.agentCollections.relationships) {
            throw new Error('Agent collections not initialized');
        }

        const {
            sort = { confidence_score: -1 },
            limit = 50,
            skip = 0
        } = options;

        try {
            return await this.agentCollections.relationships
                .find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('❌ Failed to find relationships:', error.message);
            throw error;
        }
    }

    async findBidirectionalRelationships(session_id, relationship_types = [], min_confidence = 0.7) {
        if (!this.agentCollections.relationships) {
            throw new Error('Agent collections not initialized');
        }

        try {
            const query = {
                $or: [
                    { source_session: session_id },
                    { target_session: session_id }
                ],
                confidence_score: { $gte: min_confidence }
            };

            if (relationship_types.length > 0) {
                query.relationship_type = { $in: relationship_types };
            }

            return await this.agentCollections.relationships
                .find(query)
                .sort({ confidence_score: -1 })
                .toArray();
        } catch (error) {
            console.error('❌ Failed to find bidirectional relationships:', error.message);
            throw error;
        }
    }

    // ========================================
    // INSIGHTS OPERATIONS
    // ========================================

    async insertInsight(insightData) {
        if (!this.agentCollections.insights) {
            throw new Error('Agent collections not initialized');
        }

        const insight = {
            ...SchemaDefaults.insight,
            ...insightData,
            created_at: new Date(),
            updated_at: new Date(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days default
        };
        
        if (!SchemaValidators.validateInsight(insight)) {
            throw new Error('Invalid insight data structure');
        }

        try {
            const result = await this.agentCollections.insights.insertOne(insight);
            console.log(`💡 Insight inserted: ${insight.title} (Priority: ${insight.priority})`);
            return result;
        } catch (error) {
            console.error('❌ Failed to insert insight:', error.message);
            throw error;
        }
    }

    async findInsights(query = {}, options = {}) {
        if (!this.agentCollections.insights) {
            throw new Error('Agent collections not initialized');
        }

        const {
            sort = { priority: -1, confidence: -1, created_at: -1 },
            limit = 50,
            skip = 0
        } = options;

        try {
            return await this.agentCollections.insights
                .find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('❌ Failed to find insights:', error.message);
            throw error;
        }
    }

    async getActiveInsights(projects = [], priority = 'all') {
        if (!this.agentCollections.insights) {
            throw new Error('Agent collections not initialized');
        }

        try {
            const query = {
                status: { $in: ['new', 'reviewed'] },
                expires_at: { $gt: new Date() }
            };

            if (projects.length > 0) {
                query.affected_projects = { $in: projects };
            }

            if (priority !== 'all') {
                query.priority = priority;
            }

            return await this.agentCollections.insights
                .find(query)
                .sort({ priority: -1, confidence: -1 })
                .toArray();
        } catch (error) {
            console.error('❌ Failed to get active insights:', error.message);
            throw error;
        }
    }

    // ========================================
    // SESSION STATES OPERATIONS
    // ========================================

    async upsertSessionState(sessionStateData) {
        if (!this.agentCollections.sessionStates) {
            throw new Error('Agent collections not initialized');
        }

        const sessionState = {
            ...SchemaDefaults.sessionState,
            ...sessionStateData,
            updated_at: new Date()
        };

        if (!SchemaValidators.validateSessionState(sessionState)) {
            throw new Error('Invalid session state data structure');
        }

        try {
            const result = await this.agentCollections.sessionStates.updateOne(
                { session_id: sessionState.session_id },
                { 
                    $set: sessionState,
                    $setOnInsert: { created_at: new Date() }
                },
                { upsert: true }
            );
            
            console.log(`📊 Session state updated: ${sessionState.session_id} -> ${sessionState.current_state}`);
            return result;
        } catch (error) {
            console.error('❌ Failed to upsert session state:', error.message);
            throw error;
        }
    }

    async findSessionStates(query = {}, options = {}) {
        if (!this.agentCollections.sessionStates) {
            throw new Error('Agent collections not initialized');
        }

        const {
            sort = { last_activity: -1 },
            limit = 50,
            skip = 0
        } = options;

        try {
            return await this.agentCollections.sessionStates
                .find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('❌ Failed to find session states:', error.message);
            throw error;
        }
    }

    async getDocumentationCandidates(min_value = 50, max_results = 10) {
        if (!this.agentCollections.sessionStates) {
            throw new Error('Agent collections not initialized');
        }

        try {
            return await this.agentCollections.sessionStates
                .find({
                    documentation_ready: true,
                    documentation_value: { $gte: min_value },
                    current_state: { $in: ['completed', 'paused'] }
                })
                .sort({ documentation_value: -1 })
                .limit(max_results)
                .toArray();
        } catch (error) {
            console.error('❌ Failed to get documentation candidates:', error.message);
            throw error;
        }
    }

    // ========================================
    // METRICS OPERATIONS
    // ========================================

    async insertMetric(metricData) {
        if (!this.agentCollections.metrics) {
            throw new Error('Agent collections not initialized');
        }

        const metric = {
            ...SchemaDefaults.metric,
            ...metricData,
            created_at: new Date(),
            timestamp: metricData.timestamp || new Date()
        };

        if (!SchemaValidators.validateMetric(metric)) {
            throw new Error('Invalid metric data structure');
        }

        try {
            const result = await this.agentCollections.metrics.insertOne(metric);
            return result;
        } catch (error) {
            console.error('❌ Failed to insert metric:', error.message);
            throw error;
        }
    }

    async insertMetricsBatch(metricsArray) {
        if (!this.agentCollections.metrics) {
            throw new Error('Agent collections not initialized');
        }

        try {
            const validatedMetrics = metricsArray.map(metric => ({
                ...SchemaDefaults.metric,
                ...metric,
                created_at: new Date(),
                timestamp: metric.timestamp || new Date()
            }));

            const result = await this.agentCollections.metrics.insertMany(validatedMetrics, { ordered: false });
            console.log(`📊 Inserted ${result.insertedCount} metrics`);
            return result;
        } catch (error) {
            console.error('❌ Failed to insert metrics batch:', error.message);
            throw error;
        }
    }

    async getAgentMetrics(agent_name, metric_type = null, hours_back = 24) {
        if (!this.agentCollections.metrics) {
            throw new Error('Agent collections not initialized');
        }

        try {
            const query = {
                agent_name,
                timestamp: { $gte: new Date(Date.now() - hours_back * 60 * 60 * 1000) }
            };

            if (metric_type) {
                query.metric_type = metric_type;
            }

            return await this.agentCollections.metrics
                .find(query)
                .sort({ timestamp: -1 })
                .toArray();
        } catch (error) {
            console.error('❌ Failed to get agent metrics:', error.message);
            throw error;
        }
    }

    async getAggregatedMetrics(agent_name, metric_name, hours_back = 24) {
        if (!this.agentCollections.metrics) {
            throw new Error('Agent collections not initialized');
        }

        try {
            const pipeline = [
                {
                    $match: {
                        agent_name,
                        metric_name,
                        timestamp: { $gte: new Date(Date.now() - hours_back * 60 * 60 * 1000) }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avg_value: { $avg: '$value' },
                        max_value: { $max: '$value' },
                        min_value: { $min: '$value' },
                        count: { $sum: 1 },
                        success_rate: {
                            $avg: {
                                $cond: [{ $eq: ['$success', true] }, 1, 0]
                            }
                        }
                    }
                }
            ];

            const results = await this.agentCollections.metrics.aggregate(pipeline).toArray();
            return results[0] || null;
        } catch (error) {
            console.error('❌ Failed to get aggregated metrics:', error.message);
            throw error;
        }
    }

    // ========================================
    // MAINTENANCE OPERATIONS
    // ========================================

    async cleanupExpiredData() {
        const results = {};

        try {
            // Cleanup expired insights
            if (this.agentCollections.insights) {
                const expiredInsights = await this.agentCollections.insights.deleteMany({
                    expires_at: { $lt: new Date() },
                    status: { $nin: ['acted_upon'] } // Keep acted upon insights longer
                });
                results.expired_insights = expiredInsights.deletedCount;
            }

            // Cleanup old metrics (beyond TTL)
            if (this.agentCollections.metrics) {
                const oldMetrics = await this.agentCollections.metrics.deleteMany({
                    timestamp: { $lt: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000) } // 32 days
                });
                results.old_metrics = oldMetrics.deletedCount;
            }

            // Cleanup orphaned relationships (sessions that no longer exist)
            // This would require checking against the main messages collection
            
            console.log('🧹 Agent data cleanup completed:', results);
            return results;
        } catch (error) {
            console.error('❌ Failed to cleanup expired data:', error.message);
            throw error;
        }
    }

    async getAgentStats() {
        if (!this.isConnected || !this.db) {
            return null;
        }

        try {
            const stats = await super.getStats(); // Get base stats
            
            // Add agent collection stats
            const agentStats = {};
            
            for (const [name, collection] of Object.entries(this.agentCollections)) {
                if (collection) {
                    try {
                        const count = await collection.countDocuments();
                        const collectionStats = await collection.stats();
                        
                        agentStats[name] = {
                            count,
                            size: collectionStats.size || 0,
                            avgObjSize: collectionStats.avgObjSize || 0
                        };
                    } catch (statError) {
                        agentStats[name] = { count: 0, size: 0, error: statError.message };
                    }
                }
            }
            
            return {
                ...stats,
                agent_collections: agentStats
            };
        } catch (error) {
            console.warn('⚠️  Failed to get agent stats:', error.message);
            return null;
        }
    }
}

export default MongoDBAgentExtension;