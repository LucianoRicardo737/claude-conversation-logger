/**
 * Claude Conversation Logger - Advanced Agent System
 * Main entry point for the agent system
 */

import AgentConfig from './config/AgentConfig.js';
import ConversationOrchestrator from './core/ConversationOrchestrator.js';
import SemanticAnalyzer from './analyzers/SemanticAnalyzer.js';
import SessionStateAnalyzer from './analyzers/SessionStateAnalyzer.js';
import RelationshipMapper from './analyzers/RelationshipMapper.js';

/**
 * Agent System Factory
 * Creates and configures agent instances
 */
export class AgentSystemFactory {
    constructor() {
        this.config = new AgentConfig();
        this.instances = new Map();
        this.dependencies = {
            mongodb: null,
            redis: null
        };
    }

    /**
     * Get the main orchestrator instance
     * @returns {ConversationOrchestrator} Orchestrator instance
     */
    getOrchestrator() {
        if (!this.instances.has('orchestrator')) {
            const orchestrator = new ConversationOrchestrator(this.config.getAgentConfig('orchestrator'));
            if (this.dependencies.mongodb || this.dependencies.redis) {
                orchestrator.injectDependencies?.(this.dependencies);
            }
            this.instances.set('orchestrator', orchestrator);
        }
        return this.instances.get('orchestrator');
    }

    /**
     * Get semantic analyzer instance
     * @returns {SemanticAnalyzer} SemanticAnalyzer instance
     */
    getSemanticAnalyzer() {
        if (!this.instances.has('semantic')) {
            const analyzer = new SemanticAnalyzer(this.config.getAgentConfig('semantic'));
            if (this.dependencies.mongodb || this.dependencies.redis) {
                analyzer.injectDependencies?.(this.dependencies);
            }
            this.instances.set('semantic', analyzer);
        }
        return this.instances.get('semantic');
    }

    /**
     * Get session state analyzer instance
     * @returns {SessionStateAnalyzer} SessionStateAnalyzer instance
     */
    getSessionStateAnalyzer() {
        if (!this.instances.has('sessionState')) {
            const analyzer = new SessionStateAnalyzer(this.config.getAgentConfig('sessionState'));
            if (this.dependencies.mongodb || this.dependencies.redis) {
                analyzer.injectDependencies?.(this.dependencies);
            }
            this.instances.set('sessionState', analyzer);
        }
        return this.instances.get('sessionState');
    }

    /**
     * Get relationship mapper instance
     * @returns {RelationshipMapper} RelationshipMapper instance
     */
    getRelationshipMapper() {
        if (!this.instances.has('relationship')) {
            const mapper = new RelationshipMapper(this.config.getAgentConfig('relationship'));
            if (this.dependencies.mongodb || this.dependencies.redis) {
                mapper.injectDependencies?.(this.dependencies);
            }
            this.instances.set('relationship', mapper);
        }
        return this.instances.get('relationship');
    }

    /**
     * Get configuration instance
     * @returns {AgentConfig} Configuration instance
     */
    getConfig() {
        return this.config;
    }

    /**
     * Inject dependencies into the agent system
     * @param {Object} dependencies - Dependencies to inject
     * @param {MongoDBAgentExtension} dependencies.mongodb - MongoDB instance with agent support
     * @param {RedisManager} dependencies.redis - Redis manager instance
     */
    injectDependencies(dependencies) {
        this.dependencies = { ...this.dependencies, ...dependencies };
        
        // Inject dependencies into existing agent instances
        this.instances.forEach((agent, name) => {
            if (typeof agent.injectDependencies === 'function') {
                agent.injectDependencies(this.dependencies);
                console.log(`🔌 Dependencies injected into ${name} agent`);
            }
        });
        
        console.log('✅ Agent system dependencies injected successfully');
    }

    /**
     * Initialize all agents
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('🤖 Initializing Advanced Agent System...');
        
        try {
            // Validate configuration first
            this.config.validateConfiguration();
            console.log('✅ Configuration validated successfully');

            // Pre-initialize core agents
            this.getOrchestrator();
            console.log('✅ Conversation Orchestrator initialized');

            if (this.config.isFeatureEnabled('enableSemanticAnalysis')) {
                this.getSemanticAnalyzer();
                console.log('✅ Semantic Analyzer initialized');
            }

            if (this.config.isFeatureEnabled('enableSessionStateAnalysis')) {
                this.getSessionStateAnalyzer();
                console.log('✅ Session State Analyzer initialized');
            }

            if (this.config.isFeatureEnabled('enableRelationshipMapping')) {
                this.getRelationshipMapper();
                console.log('✅ Relationship Mapper initialized');
            }

            console.log('🎉 Agent System initialized successfully');
            console.log(`📊 Features enabled: ${this.getEnabledFeatures().join(', ')}`);
            console.log(`🌍 Language support: ${this.config.getSection('language').primary}${this.config.getSection('language').mixedMode ? '+' + this.config.getSection('language').secondary : ''}`);

        } catch (error) {
            console.error('❌ Failed to initialize Agent System:', error.message);
            throw error;
        }
    }

    /**
     * Get list of enabled features
     * @returns {Array<string>} Enabled features
     */
    getEnabledFeatures() {
        const features = this.config.getSection('features');
        return Object.entries(features)
            .filter(([key, value]) => value === true)
            .map(([key]) => key.replace('enable', '').replace(/([A-Z])/g, ' $1').trim());
    }

    /**
     * Process a high-level request through the orchestrator
     * @param {Object} request - Request object
     * @returns {Promise<Object>} Processing result
     */
    async processRequest(request) {
        const orchestrator = this.getOrchestrator();
        return await orchestrator.processRequest(request);
    }

    /**
     * Get system health status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        const health = {
            status: 'healthy',
            agents: {},
            configuration: {
                valid: true,
                featuresEnabled: this.getEnabledFeatures().length,
                languageSupport: `${this.config.getSection('language').primary}${this.config.getSection('language').mixedMode ? '+' + this.config.getSection('language').secondary : ''}`,
                tokenBudget: this.config.getSection('performance').maxTokenBudget
            },
            metrics: {}
        };

        // Check agent instances
        this.instances.forEach((agent, name) => {
            try {
                const metrics = agent.getMetrics();
                health.agents[name] = {
                    status: 'healthy',
                    requestsProcessed: metrics.requestsProcessed,
                    successRate: metrics.successRate,
                    avgResponseTime: metrics.averageResponseTime,
                    avgTokensPerRequest: metrics.avgTokensPerRequest
                };
            } catch (error) {
                health.agents[name] = {
                    status: 'error',
                    error: error.message
                };
                health.status = 'degraded';
            }
        });

        return health;
    }

    /**
     * Shutdown all agents gracefully
     * @returns {Promise<void>}
     */
    async shutdown() {
        console.log('🛑 Shutting down Agent System...');

        const shutdownPromises = [];
        
        this.instances.forEach((agent, name) => {
            console.log(`🛑 Shutting down ${name}...`);
            if (typeof agent.shutdown === 'function') {
                shutdownPromises.push(agent.shutdown());
            }
        });

        await Promise.all(shutdownPromises);
        this.instances.clear();
        
        console.log('✅ Agent System shutdown complete');
    }
}

/**
 * Default factory instance
 */
const defaultFactory = new AgentSystemFactory();

/**
 * Quick access functions for common operations
 */

/**
 * Process a request through the default orchestrator
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Processing result
 */
export async function processRequest(request) {
    return await defaultFactory.processRequest(request);
}

/**
 * Get the default orchestrator instance
 * @returns {ConversationOrchestrator} Orchestrator instance
 */
export function getOrchestrator() {
    return defaultFactory.getOrchestrator();
}

/**
 * Get the agent system configuration
 * @returns {AgentConfig} Configuration instance
 */
export function getConfig() {
    return defaultFactory.getConfig();
}

/**
 * Initialize the agent system
 * @returns {Promise<void>}
 */
export async function initialize() {
    return await defaultFactory.initialize();
}

/**
 * Get system health status
 * @returns {Object} Health status
 */
export function getHealthStatus() {
    return defaultFactory.getHealthStatus();
}

/**
 * Shutdown the agent system
 * @returns {Promise<void>}
 */
export async function shutdown() {
    return await defaultFactory.shutdown();
}

/**
 * Export individual classes for advanced usage
 */
export {
    ConversationOrchestrator,
    SemanticAnalyzer,
    SessionStateAnalyzer,
    RelationshipMapper,
    AgentConfig
};

/**
 * Export the default factory instance
 */
export { defaultFactory as agentSystem };

/**
 * Module metadata
 */
export const metadata = {
    name: 'Claude Conversation Logger - Agent System',
    version: '2.0.0',
    description: 'Advanced multi-agent system for conversation analysis and documentation',
    features: [
        'Semantic Analysis',
        'Session State Detection',
        'Relationship Mapping',
        'Auto-Documentation',
        'Pattern Recognition',
        'Multi-Language Support',
        'Token Optimization'
    ],
    author: 'UniCorp Development Team'
};