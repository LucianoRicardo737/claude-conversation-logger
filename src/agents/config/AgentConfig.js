/**
 * Agent Configuration Management
 * Handles all environment variables and configuration for agents
 */

export default class AgentConfig {
    constructor() {
        this.config = this.loadConfiguration();
        this.validateConfiguration();
    }

    /**
     * Load configuration from environment variables
     * @returns {Object} Configuration object
     */
    loadConfiguration() {
        return {
            // Language Configuration
            language: {
                primary: process.env.AGENT_PRIMARY_LANGUAGE || 'es',
                secondary: process.env.AGENT_SECONDARY_LANGUAGE || 'en',
                mixedMode: process.env.AGENT_MIXED_LANGUAGE_MODE === 'true',
                
                writeKeywords: this.parseJsonEnv('AGENT_WRITE_KEYWORDS', [
                    'documentar', 'guardar', 'registrar', 'crear doc',
                    'document', 'save', 'record', 'store'
                ]),
                
                readKeywords: this.parseJsonEnv('AGENT_READ_KEYWORDS', [
                    'buscar', 'encontrar', 'similar', 'relacionado',
                    'search', 'find', 'similar', 'related'
                ]),
                
                resolutionKeywords: this.parseJsonEnv('AGENT_RESOLUTION_KEYWORDS', [
                    'resuelto', 'solucionado', 'funcionando', 'completado',
                    'resolved', 'fixed', 'working', 'solved', 'completed'
                ]),
                
                problemKeywords: this.parseJsonEnv('AGENT_PROBLEM_KEYWORDS', [
                    'error', 'falla', 'problema', 'bug', 'issue',
                    'fail', 'crash', 'broken', 'not working'
                ]),
                
                activeSessionIndicators: this.parseJsonEnv('AGENT_ACTIVE_SESSION_INDICATORS', [
                    'pregunta', 'ayuda', 'cómo', 'necesito', 'no sé',
                    'question', 'help', 'how', 'need', "don't know"
                ]),
                
                completedSessionIndicators: this.parseJsonEnv('AGENT_COMPLETED_SESSION_INDICATORS', [
                    'gracias', 'perfecto', 'listo', 'excelente', 'genial',
                    'thanks', 'perfect', 'done', 'excellent', 'great'
                ])
            },

            // Pattern Detection
            patterns: {
                minFrequency: parseInt(process.env.AGENT_MIN_PATTERN_FREQUENCY) || 3,
                detectionWindowDays: parseInt(process.env.AGENT_PATTERN_DETECTION_WINDOW_DAYS) || 7,
                similarityThreshold: parseFloat(process.env.AGENT_SIMILARITY_THRESHOLD) || 0.75,
                confidenceThreshold: parseFloat(process.env.AGENT_CONFIDENCE_THRESHOLD) || 0.80
            },

            // Session State Analysis
            session: {
                activeTimeoutMinutes: parseInt(process.env.AGENT_ACTIVE_SESSION_TIMEOUT_MINUTES) || 30,
                relationshipSearchDays: parseInt(process.env.AGENT_RELATIONSHIP_SEARCH_DAYS) || 14,
                minDocumentationValue: parseInt(process.env.AGENT_MIN_DOCUMENTATION_VALUE) || 50
            },

            // Performance Settings
            performance: {
                maxTokenBudget: parseInt(process.env.AGENT_MAX_TOKEN_BUDGET) || 100,
                cacheTtlSeconds: parseInt(process.env.AGENT_CACHE_TTL_SECONDS) || 300,
                maxConcurrentAnalysis: parseInt(process.env.AGENT_MAX_CONCURRENT_ANALYSIS) || 5,
                batchProcessingSize: parseInt(process.env.AGENT_BATCH_PROCESSING_SIZE) || 10,
                tokenOptimizationLevel: process.env.AGENT_TOKEN_OPTIMIZATION_LEVEL || 'high',
                cacheMaxSize: parseInt(process.env.AGENT_CACHE_MAX_SIZE) || 1000
            },

            // Feature Flags
            features: {
                enableSemanticAnalysis: process.env.AGENT_ENABLE_SEMANTIC_ANALYSIS === 'true',
                enableIntentDetection: process.env.AGENT_ENABLE_INTENT_DETECTION === 'true',
                enableAutoDocumentation: process.env.AGENT_ENABLE_AUTO_DOCUMENTATION === 'true',
                enableRelationshipMapping: process.env.AGENT_ENABLE_RELATIONSHIP_MAPPING === 'true',
                enablePatternPrediction: process.env.AGENT_ENABLE_PATTERN_PREDICTION === 'true',
                enableAdvancedCaching: process.env.AGENT_ENABLE_ADVANCED_CACHING === 'true'
            },

            // Analysis Thresholds
            thresholds: {
                highComplexityMessageCount: parseInt(process.env.AGENT_HIGH_COMPLEXITY_THRESHOLD) || 15,
                mediumComplexityMessageCount: parseInt(process.env.AGENT_MEDIUM_COMPLEXITY_THRESHOLD) || 5,
                minRelationshipConfidence: parseFloat(process.env.AGENT_MIN_RELATIONSHIP_CONFIDENCE) || 0.7,
                patternFrequencyWeight: parseFloat(process.env.AGENT_PATTERN_FREQUENCY_WEIGHT) || 0.3,
                temporalWeight: parseFloat(process.env.AGENT_TEMPORAL_WEIGHT) || 0.2,
                semanticWeight: parseFloat(process.env.AGENT_SEMANTIC_WEIGHT) || 0.5
            },

            // API Configuration
            api: {
                timeout: parseInt(process.env.AGENT_API_TIMEOUT_MS) || 30000,
                retryAttempts: parseInt(process.env.AGENT_API_RETRY_ATTEMPTS) || 3,
                retryDelay: parseInt(process.env.AGENT_API_RETRY_DELAY_MS) || 1000
            },

            // Logging Configuration
            logging: {
                level: process.env.AGENT_LOG_LEVEL || 'info',
                enableMetrics: process.env.AGENT_ENABLE_METRICS === 'true',
                enablePerformanceLogging: process.env.AGENT_ENABLE_PERFORMANCE_LOGGING === 'true'
            }
        };
    }

    /**
     * Parse JSON environment variable with fallback
     * @param {string} envVar - Environment variable name
     * @param {*} fallback - Fallback value
     * @returns {*} Parsed value or fallback
     */
    parseJsonEnv(envVar, fallback) {
        try {
            const value = process.env[envVar];
            return value ? JSON.parse(value) : fallback;
        } catch (error) {
            console.warn(`⚠️  Failed to parse ${envVar}, using fallback:`, error.message);
            return fallback;
        }
    }

    /**
     * Validate configuration
     * @throws {Error} If configuration is invalid
     */
    validateConfiguration() {
        const errors = [];

        // Validate thresholds
        if (this.config.patterns.similarityThreshold < 0 || this.config.patterns.similarityThreshold > 1) {
            errors.push('AGENT_SIMILARITY_THRESHOLD must be between 0 and 1');
        }

        if (this.config.patterns.confidenceThreshold < 0 || this.config.patterns.confidenceThreshold > 1) {
            errors.push('AGENT_CONFIDENCE_THRESHOLD must be between 0 and 1');
        }

        // Validate positive integers
        const positiveIntFields = [
            ['patterns.minFrequency', 'AGENT_MIN_PATTERN_FREQUENCY'],
            ['performance.maxTokenBudget', 'AGENT_MAX_TOKEN_BUDGET'],
            ['performance.cacheTtlSeconds', 'AGENT_CACHE_TTL_SECONDS'],
            ['session.activeTimeoutMinutes', 'AGENT_ACTIVE_SESSION_TIMEOUT_MINUTES']
        ];

        positiveIntFields.forEach(([path, envVar]) => {
            const value = this.getNestedValue(this.config, path);
            if (value <= 0) {
                errors.push(`${envVar} must be a positive integer`);
            }
        });

        // Validate language arrays
        if (!Array.isArray(this.config.language.writeKeywords) || this.config.language.writeKeywords.length === 0) {
            errors.push('AGENT_WRITE_KEYWORDS must be a non-empty array');
        }

        if (!Array.isArray(this.config.language.readKeywords) || this.config.language.readKeywords.length === 0) {
            errors.push('AGENT_READ_KEYWORDS must be a non-empty array');
        }

        if (errors.length > 0) {
            throw new Error(`Agent configuration validation failed:\n${errors.join('\n')}`);
        }
    }

    /**
     * Get nested value from object using dot notation
     * @param {Object} obj - Object to search
     * @param {string} path - Dot notation path
     * @returns {*} Value at path
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    /**
     * Get configuration object
     * @returns {Object} Configuration
     */
    getConfig() {
        return this.config;
    }

    /**
     * Get specific configuration section
     * @param {string} section - Configuration section name
     * @returns {Object} Section configuration
     */
    getSection(section) {
        return this.config[section] || {};
    }

    /**
     * Check if a feature is enabled
     * @param {string} featureName - Feature name
     * @returns {boolean} Whether feature is enabled
     */
    isFeatureEnabled(featureName) {
        return this.config.features[featureName] || false;
    }

    /**
     * Get keywords for a specific language
     * @param {string} type - Keyword type (write, read, resolution, problem)
     * @param {string} language - Language code (optional)
     * @returns {Array} Keywords array
     */
    getKeywords(type, language = null) {
        const keywords = this.config.language[`${type}Keywords`] || [];
        
        if (!language || !this.config.language.mixedMode) {
            return keywords;
        }

        // If mixed mode is enabled and specific language requested,
        // filter keywords by language (basic implementation)
        // This could be extended with a more sophisticated language detection
        return keywords;
    }

    /**
     * Get token budget for specific operation
     * @param {string} operation - Operation type
     * @returns {number} Token budget
     */
    getTokenBudget(operation = 'default') {
        const budgets = {
            'semantic_analysis': Math.floor(this.config.performance.maxTokenBudget * 0.4),
            'pattern_detection': Math.floor(this.config.performance.maxTokenBudget * 0.3),
            'relationship_mapping': Math.floor(this.config.performance.maxTokenBudget * 0.3),
            'documentation': Math.floor(this.config.performance.maxTokenBudget * 0.6),
            'search': Math.floor(this.config.performance.maxTokenBudget * 0.4),
            'default': this.config.performance.maxTokenBudget
        };

        return budgets[operation] || budgets.default;
    }

    /**
     * Create configuration for child agent
     * @param {string} agentType - Type of agent
     * @returns {Object} Agent-specific configuration
     */
    getAgentConfig(agentType) {
        const baseConfig = { ...this.config };
        
        // Agent-specific overrides
        const agentOverrides = {
            'orchestrator': {
                performance: {
                    ...baseConfig.performance,
                    maxTokenBudget: this.getTokenBudget('default')
                }
            },
            'writer': {
                performance: {
                    ...baseConfig.performance,
                    maxTokenBudget: this.getTokenBudget('documentation')
                }
            },
            'assistant': {
                performance: {
                    ...baseConfig.performance,
                    maxTokenBudget: this.getTokenBudget('search')
                }
            }
        };

        const overrides = agentOverrides[agentType] || {};
        
        return this.deepMerge(baseConfig, overrides);
    }

    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * Print current configuration (debug)
     */
    printConfig() {
        console.log('🔧 Agent Configuration:');
        console.log(JSON.stringify(this.config, null, 2));
    }
}