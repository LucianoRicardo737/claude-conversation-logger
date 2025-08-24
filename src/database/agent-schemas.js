/**
 * MongoDB Schemas for Advanced Agent System
 * Defines collections, indexes, and data structures for agent-powered features
 */

/**
 * Collection: conversation_patterns
 * Stores detected patterns across conversations for reuse and analysis
 */
export const ConversationPatterns = {
    collection: 'conversation_patterns',
    
    // Document structure
    schema: {
        _id: 'ObjectId', // MongoDB auto-generated
        pattern_id: 'String', // Unique pattern identifier
        title: 'String', // Human-readable pattern title
        description: 'String', // Detailed pattern description
        
        // Pattern classification
        pattern_type: 'String', // 'error', 'solution', 'workflow', 'question'
        category: 'String', // 'technical', 'business', 'support'
        complexity_level: 'String', // 'low', 'medium', 'high'
        
        // Pattern content
        pattern_signature: 'String', // Normalized pattern signature for matching
        keywords: ['String'], // Key terms associated with pattern
        context_indicators: ['String'], // Contextual clues for pattern detection
        
        // Pattern metrics
        frequency: 'Number', // How often this pattern appears
        confidence: 'Number', // Detection confidence (0.0-1.0)
        success_rate: 'Number', // Resolution success rate for solution patterns
        
        // Associated data
        example_sessions: ['String'], // Session IDs where pattern was found
        common_solution: 'String', // Common solution for problem patterns
        related_patterns: ['String'], // Related pattern IDs
        
        // Metadata
        first_detected: 'Date', // When pattern was first identified
        last_seen: 'Date', // Most recent occurrence
        created_by: 'String', // Agent that created pattern
        projects: ['String'], // Associated projects
        
        // Analysis data
        semantic_vectors: 'Object', // Semantic embedding vectors (optional)
        trend_data: 'Object', // Usage trends over time
        
        created_at: 'Date',
        updated_at: 'Date'
    },
    
    // Optimized indexes
    indexes: [
        { key: { pattern_type: 1, frequency: -1 }, name: 'type_frequency' },
        { key: { category: 1, last_seen: -1 }, name: 'category_recent' },
        { key: { keywords: 1 }, name: 'keywords_array' },
        { key: { projects: 1, frequency: -1 }, name: 'projects_frequency' },
        { key: { confidence: -1, frequency: -1 }, name: 'confidence_frequency' },
        { key: { first_detected: -1 }, name: 'detection_chronological' },
        { 
            key: { 
                title: 'text', 
                description: 'text', 
                keywords: 'text' 
            }, 
            name: 'pattern_search',
            weights: {
                title: 10,
                description: 5,
                keywords: 8
            }
        }
    ],
    
    // TTL settings
    ttl: {
        field: 'last_seen',
        expireAfterSeconds: 7776000 // 90 days if not seen
    }
};

/**
 * Collection: conversation_relationships
 * Maps relationships and connections between conversations
 */
export const ConversationRelationships = {
    collection: 'conversation_relationships',
    
    schema: {
        _id: 'ObjectId',
        relationship_id: 'String', // Unique relationship identifier
        
        // Relationship participants
        source_session: 'String', // Source session ID
        target_session: 'String', // Related session ID
        
        // Relationship classification
        relationship_type: 'String', // 'follow_up', 'duplicate_issue', 'similar_issue', 'related_topic', 'contextually_related'
        bidirectional: 'Boolean', // Whether relationship works both ways
        
        // Confidence and quality
        confidence_score: 'Number', // Relationship confidence (0.0-1.0)
        similarity_score: 'Number', // Content similarity (0.0-1.0)
        quality_score: 'Number', // Overall relationship quality
        
        // Analysis dimensions
        content_similarity: 'Number', // Semantic content similarity
        temporal_proximity: 'Number', // Time-based relationship strength
        structural_similarity: 'Number', // Conversation structure similarity
        participant_overlap: 'Number', // User/project overlap
        
        // Evidence and context
        evidence: ['String'], // Evidence supporting the relationship
        common_elements: ['String'], // Shared keywords, topics, etc.
        differentiating_factors: ['String'], // What makes them different
        
        // Metadata
        source_project: 'String',
        target_project: 'String',
        detected_by: 'String', // Agent that detected relationship
        validation_status: 'String', // 'pending', 'validated', 'rejected'
        
        // Usage tracking
        reference_count: 'Number', // How often this relationship was used
        last_referenced: 'Date',
        
        created_at: 'Date',
        updated_at: 'Date'
    },
    
    indexes: [
        { key: { source_session: 1, relationship_type: 1 }, name: 'source_type' },
        { key: { target_session: 1, relationship_type: 1 }, name: 'target_type' },
        { key: { confidence_score: -1, quality_score: -1 }, name: 'quality_scores' },
        { key: { relationship_type: 1, confidence_score: -1 }, name: 'type_confidence' },
        { key: { source_project: 1, target_project: 1 }, name: 'project_relationships' },
        { key: { created_at: -1 }, name: 'chronological' },
        { key: { last_referenced: -1 }, name: 'recent_usage' },
        // Compound index for bidirectional queries
        { key: { source_session: 1, target_session: 1 }, name: 'session_pair', unique: true }
    ]
};

/**
 * Collection: conversation_insights
 * Stores generated insights, recommendations, and analysis results
 */
export const ConversationInsights = {
    collection: 'conversation_insights',
    
    schema: {
        _id: 'ObjectId',
        insight_id: 'String',
        
        // Source information
        source_session: 'String', // Session that generated the insight
        source_type: 'String', // 'session_analysis', 'pattern_detection', 'relationship_mapping'
        
        // Insight classification
        insight_type: 'String', // 'recommendation', 'pattern', 'anomaly', 'trend', 'prediction'
        category: 'String', // 'performance', 'quality', 'efficiency', 'user_behavior'
        priority: 'String', // 'low', 'medium', 'high', 'critical'
        
        // Content
        title: 'String',
        description: 'String',
        details: 'Object', // Detailed analysis data
        
        // Recommendations
        recommendations: [{
            action: 'String',
            priority: 'String',
            estimated_impact: 'String',
            effort_required: 'String'
        }],
        
        // Quality metrics
        confidence: 'Number', // Insight confidence (0.0-1.0)
        relevance: 'Number', // Relevance score
        actionability: 'Number', // How actionable is this insight
        
        // Context
        affected_projects: ['String'],
        related_sessions: ['String'],
        related_patterns: ['String'],
        
        // Status tracking
        status: 'String', // 'new', 'reviewed', 'acted_upon', 'dismissed'
        assigned_to: 'String', // Who should act on this insight
        
        // Impact tracking
        implementation_status: 'String',
        measured_impact: 'Object', // Actual impact measurements
        
        // Metadata
        generated_by: 'String', // Agent that generated insight
        generation_context: 'Object', // Context during generation
        
        created_at: 'Date',
        updated_at: 'Date',
        expires_at: 'Date' // When insight becomes stale
    },
    
    indexes: [
        { key: { source_session: 1, insight_type: 1 }, name: 'session_type' },
        { key: { priority: -1, confidence: -1 }, name: 'priority_confidence' },
        { key: { category: 1, status: 1 }, name: 'category_status' },
        { key: { affected_projects: 1, priority: -1 }, name: 'projects_priority' },
        { key: { created_at: -1 }, name: 'recent_insights' },
        { key: { expires_at: 1 }, name: 'expiration_ttl' },
        { 
            key: { 
                title: 'text', 
                description: 'text' 
            }, 
            name: 'insight_search'
        }
    ],
    
    // TTL for automatic cleanup
    ttl: {
        field: 'expires_at',
        expireAfterSeconds: 0 // Use document's expires_at field
    }
};

/**
 * Collection: session_states
 * Tracks detected session states for documentation and monitoring
 */
export const SessionStates = {
    collection: 'session_states',
    
    schema: {
        _id: 'ObjectId',
        session_id: 'String', // Primary key
        project_name: 'String',
        
        // State classification
        current_state: 'String', // 'active', 'paused', 'completed', 'abandoned'
        previous_state: 'String',
        state_confidence: 'Number', // Confidence in state detection
        
        // State analysis
        completion_indicators: ['String'], // Signals indicating completion
        activity_patterns: 'Object', // Activity analysis
        quality_assessment: 'Object', // Session quality metrics
        
        // Documentation readiness
        documentation_ready: 'Boolean',
        documentation_value: 'Number', // Value score for documentation (0-100)
        documentation_type: 'String', // Recommended documentation type
        
        // Temporal data
        last_activity: 'Date',
        state_detected_at: 'Date',
        state_changed_at: 'Date',
        estimated_completion: 'Date', // Predicted completion time
        
        // Context
        complexity_level: 'String', // 'low', 'medium', 'high'
        message_count: 'Number',
        participant_count: 'Number',
        
        // Monitoring data
        monitoring_alerts: ['String'], // Active alerts for this session
        automated_actions: ['String'], // Actions taken automatically
        
        // Agent tracking
        analyzed_by: ['String'], // Agents that analyzed this session
        last_analysis: 'Date',
        
        created_at: 'Date',
        updated_at: 'Date'
    },
    
    indexes: [
        { key: { session_id: 1 }, name: 'session_unique', unique: true },
        { key: { current_state: 1, last_activity: -1 }, name: 'state_activity' },
        { key: { project_name: 1, current_state: 1 }, name: 'project_state' },
        { key: { documentation_ready: 1, documentation_value: -1 }, name: 'doc_readiness' },
        { key: { last_activity: -1 }, name: 'recent_activity' },
        { key: { estimated_completion: 1 }, name: 'completion_timeline' }
    ]
};

/**
 * Collection: agent_metrics
 * Performance metrics and analytics for agent system
 */
export const AgentMetrics = {
    collection: 'agent_metrics',
    
    schema: {
        _id: 'ObjectId',
        metric_id: 'String',
        
        // Agent identification
        agent_name: 'String', // 'semantic_analyzer', 'orchestrator', etc.
        agent_version: 'String',
        
        // Metric classification
        metric_type: 'String', // 'performance', 'accuracy', 'usage', 'error'
        metric_name: 'String', // 'response_time', 'token_usage', 'confidence_score'
        
        // Metric data
        value: 'Number',
        unit: 'String', // 'ms', 'tokens', 'percentage', 'count'
        
        // Context
        operation_type: 'String', // Operation that generated this metric
        session_id: 'String', // Associated session (if applicable)
        project_name: 'String',
        
        // Quality indicators
        success: 'Boolean', // Whether operation was successful
        error_type: 'String', // Error classification if failed
        
        // Performance context
        input_size: 'Number', // Size of input data
        processing_time: 'Number', // Processing duration
        memory_usage: 'Number', // Memory consumed
        
        // Aggregation support
        measurement_window: 'String', // 'minute', 'hour', 'day' for aggregated metrics
        sample_count: 'Number', // Number of samples in aggregated metric
        
        timestamp: 'Date',
        created_at: 'Date'
    },
    
    indexes: [
        { key: { agent_name: 1, metric_type: 1, timestamp: -1 }, name: 'agent_metrics_time' },
        { key: { metric_name: 1, timestamp: -1 }, name: 'metric_timeline' },
        { key: { project_name: 1, timestamp: -1 }, name: 'project_metrics' },
        { key: { success: 1, timestamp: -1 }, name: 'success_timeline' },
        { key: { timestamp: -1 }, name: 'recent_metrics' }
    ],
    
    // TTL for metric cleanup
    ttl: {
        field: 'timestamp',
        expireAfterSeconds: 2592000 // 30 days
    }
};

/**
 * Collection indexes creation helper
 */
export const AgentSchemaIndexes = {
    async createAllIndexes(db) {
        const collections = [
            ConversationPatterns,
            ConversationRelationships, 
            ConversationInsights,
            SessionStates,
            AgentMetrics
        ];
        
        for (const collectionDef of collections) {
            const collection = db.collection(collectionDef.collection);
            
            // Create indexes
            for (const indexDef of collectionDef.indexes) {
                try {
                    await collection.createIndex(indexDef.key, {
                        name: indexDef.name,
                        background: true,
                        unique: indexDef.unique || false,
                        ...(indexDef.weights && { weights: indexDef.weights })
                    });
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        console.warn(`⚠️  Failed to create agent index ${indexDef.name}:`, error.message);
                    }
                }
            }
            
            // Create TTL indexes
            if (collectionDef.ttl) {
                try {
                    await collection.createIndex(
                        { [collectionDef.ttl.field]: 1 },
                        {
                            name: `${collectionDef.collection}_ttl`,
                            background: true,
                            expireAfterSeconds: collectionDef.ttl.expireAfterSeconds
                        }
                    );
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        console.warn(`⚠️  Failed to create TTL index for ${collectionDef.collection}:`, error.message);
                    }
                }
            }
            
            console.log(`✅ Agent indexes created/verified for ${collectionDef.collection}`);
        }
    }
};

/**
 * Schema validation helpers
 */
export const SchemaValidators = {
    validatePattern(pattern) {
        const required = ['pattern_id', 'title', 'pattern_type', 'frequency', 'confidence'];
        return required.every(field => pattern.hasOwnProperty(field) && pattern[field] !== undefined);
    },
    
    validateRelationship(relationship) {
        const required = ['source_session', 'target_session', 'relationship_type', 'confidence_score'];
        return required.every(field => relationship.hasOwnProperty(field) && relationship[field] !== undefined);
    },
    
    validateInsight(insight) {
        const required = ['insight_id', 'source_session', 'insight_type', 'title', 'confidence'];
        return required.every(field => insight.hasOwnProperty(field) && insight[field] !== undefined);
    },
    
    validateSessionState(state) {
        const required = ['session_id', 'current_state', 'state_confidence'];
        return required.every(field => state.hasOwnProperty(field) && state[field] !== undefined);
    },
    
    validateMetric(metric) {
        const required = ['agent_name', 'metric_type', 'metric_name', 'value', 'timestamp'];
        return required.every(field => metric.hasOwnProperty(field) && metric[field] !== undefined);
    }
};

/**
 * Default values for new documents
 */
export const SchemaDefaults = {
    pattern: {
        frequency: 1,
        confidence: 0.0,
        success_rate: 0.0,
        created_at: () => new Date(),
        updated_at: () => new Date()
    },
    
    relationship: {
        bidirectional: false,
        reference_count: 0,
        validation_status: 'pending',
        created_at: () => new Date(),
        updated_at: () => new Date()
    },
    
    insight: {
        status: 'new',
        created_at: () => new Date(),
        updated_at: () => new Date(),
        expires_at: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    },
    
    sessionState: {
        state_confidence: 0.0,
        documentation_ready: false,
        documentation_value: 0,
        complexity_level: 'medium',
        created_at: () => new Date(),
        updated_at: () => new Date()
    },
    
    metric: {
        success: true,
        sample_count: 1,
        created_at: () => new Date()
    }
};

export default {
    ConversationPatterns,
    ConversationRelationships,
    ConversationInsights,
    SessionStates,
    AgentMetrics,
    AgentSchemaIndexes,
    SchemaValidators,
    SchemaDefaults
};