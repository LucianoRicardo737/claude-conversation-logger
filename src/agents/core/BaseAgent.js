/**
 * Base Agent Class
 * Provides common functionality for all conversation agents
 */

import EventEmitter from 'events';

export default class BaseAgent extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.name = this.constructor.name;
        this.startTime = Date.now();
        this.metrics = {
            requestsProcessed: 0,
            totalTokensUsed: 0,
            averageResponseTime: 0,
            successRate: 0,
            errors: []
        };
        
        // Dependencies injection support
        this.dependencies = {
            mongodb: null,
            redis: null
        };
        
        this.initialize();
    }

    /**
     * Initialize agent-specific settings
     * Override in child classes
     */
    initialize() {
        this.log(`🤖 ${this.name} initialized`);
    }

    /**
     * Inject dependencies into the agent
     * @param {Object} dependencies - Dependencies to inject
     * @param {MongoDBAgentExtension} dependencies.mongodb - MongoDB instance
     * @param {RedisManager} dependencies.redis - Redis instance
     */
    injectDependencies(dependencies) {
        this.dependencies = { ...this.dependencies, ...dependencies };
        this.log(`🔌 Dependencies injected: ${Object.keys(dependencies).join(', ')}`);
        
        // Allow child classes to react to dependency injection
        if (typeof this.onDependenciesInjected === 'function') {
            this.onDependenciesInjected(dependencies);
        }
    }

    /**
     * Process a request with common error handling and metrics
     * @param {Object} request - The request to process
     * @returns {Object} Response object
     */
    async processRequest(request) {
        const startTime = Date.now();
        let tokenCount = 0;

        try {
            this.metrics.requestsProcessed++;
            this.emit('request_started', { request, agent: this.name });

            // Pre-process the request
            const validatedRequest = await this.validateRequest(request);
            
            // Main processing (implemented by child classes)
            const result = await this.execute(validatedRequest);

            // Post-process the result
            const processedResult = await this.postProcess(result);

            // Calculate metrics
            const duration = Date.now() - startTime;
            tokenCount = this.estimateTokenUsage(request, processedResult);
            
            this.updateMetrics(duration, tokenCount, true);
            
            this.emit('request_completed', { 
                request, 
                result: processedResult, 
                duration, 
                tokens: tokenCount,
                agent: this.name 
            });

            return {
                success: true,
                agent: this.name,
                result: processedResult,
                metadata: {
                    duration,
                    tokens: tokenCount,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updateMetrics(duration, tokenCount, false);
            this.metrics.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                request: request
            });

            this.emit('request_failed', { 
                request, 
                error, 
                duration,
                agent: this.name 
            });

            return {
                success: false,
                agent: this.name,
                error: error.message,
                metadata: {
                    duration,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    /**
     * Validate incoming request
     * Override in child classes for specific validation
     * @param {Object} request
     * @returns {Object} Validated request
     */
    async validateRequest(request) {
        if (!request || typeof request !== 'object') {
            throw new Error('Invalid request: must be an object');
        }

        return request;
    }

    /**
     * Execute the main agent logic
     * Must be implemented by child classes
     * @param {Object} request
     * @returns {Object} Result
     */
    async execute(request) {
        throw new Error(`execute() method must be implemented by ${this.name}`);
    }

    /**
     * Post-process results before returning
     * Override in child classes for specific post-processing
     * @param {Object} result
     * @returns {Object} Processed result
     */
    async postProcess(result) {
        return result;
    }

    /**
     * Estimate token usage for metrics
     * Basic implementation - override for more accurate estimates
     * @param {Object} request
     * @param {Object} result
     * @returns {number} Estimated tokens
     */
    estimateTokenUsage(request, result) {
        const requestText = JSON.stringify(request);
        const resultText = JSON.stringify(result);
        
        // Rough estimation: ~4 characters per token
        return Math.ceil((requestText.length + resultText.length) / 4);
    }

    /**
     * Update internal metrics
     * @param {number} duration - Request duration in ms
     * @param {number} tokens - Tokens used
     * @param {boolean} success - Whether request was successful
     */
    updateMetrics(duration, tokens, success) {
        this.metrics.totalTokensUsed += tokens;
        
        // Update average response time
        const total = this.metrics.averageResponseTime * (this.metrics.requestsProcessed - 1);
        this.metrics.averageResponseTime = (total + duration) / this.metrics.requestsProcessed;
        
        // Update success rate
        const successes = success ? 1 : 0;
        const currentSuccesses = this.metrics.successRate * (this.metrics.requestsProcessed - 1);
        this.metrics.successRate = (currentSuccesses + successes) / this.metrics.requestsProcessed;

        // Keep only last 100 errors
        if (this.metrics.errors.length > 100) {
            this.metrics.errors = this.metrics.errors.slice(-100);
        }
    }

    /**
     * Get current agent metrics
     * @returns {Object} Metrics object
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.startTime,
            avgTokensPerRequest: this.metrics.requestsProcessed > 0 
                ? Math.round(this.metrics.totalTokensUsed / this.metrics.requestsProcessed)
                : 0
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            requestsProcessed: 0,
            totalTokensUsed: 0,
            averageResponseTime: 0,
            successRate: 0,
            errors: []
        };
        this.startTime = Date.now();
    }

    /**
     * Log messages with agent context
     * @param {string} message
     * @param {string} level - log level (info, warn, error)
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.name}]`;
        
        switch (level) {
            case 'error':
                console.error(`${prefix} ❌ ${message}`);
                break;
            case 'warn':
                console.warn(`${prefix} ⚠️  ${message}`);
                break;
            default:
                console.log(`${prefix} ℹ️  ${message}`);
        }
    }

    /**
     * Create a child logger for specific operations
     * @param {string} operation - Operation name
     * @returns {Function} Logger function
     */
    createLogger(operation) {
        return (message, level = 'info') => {
            this.log(`[${operation}] ${message}`, level);
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.log(`🛑 ${this.name} shutting down...`);
        this.emit('shutdown', { agent: this.name, metrics: this.getMetrics() });
        
        // Give time for pending operations
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        this.removeAllListeners();
        this.log(`✅ ${this.name} shutdown complete`);
    }
}