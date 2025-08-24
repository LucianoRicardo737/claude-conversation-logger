/**
 * Conversation Orchestrator
 * Main agent that coordinates all other agents with intelligent decision making
 */

import BaseAgent from './BaseAgent.js';
import SemanticAnalyzer from '../analyzers/SemanticAnalyzer.js';
import SessionStateAnalyzer from '../analyzers/SessionStateAnalyzer.js';
import RelationshipMapper from '../analyzers/RelationshipMapper.js';
import AgentConfig from '../config/AgentConfig.js';

export default class ConversationOrchestrator extends BaseAgent {
    constructor(config = {}) {
        // Load configuration
        const agentConfig = new AgentConfig();
        const orchestratorConfig = agentConfig.getAgentConfig('orchestrator');
        
        super({ ...config, ...orchestratorConfig });
        
        this.agentConfig = agentConfig;
        this.semanticAnalyzer = new SemanticAnalyzer(orchestratorConfig);
        this.sessionStateAnalyzer = new SessionStateAnalyzer(orchestratorConfig);
        this.relationshipMapper = new RelationshipMapper(orchestratorConfig);
        
        // Decision tree and patterns
        this.decisionPatterns = this.buildDecisionPatterns();
        this.actionTemplates = this.buildActionTemplates();
        
        // Context cache and session tracking
        this.contextCache = new Map();
        this.sessionTracker = new Map();
        
        // Initialize orchestrator
        this.initialize();
    }

    /**
     * Initialize orchestrator-specific settings
     */
    initialize() {
        super.initialize();
        
        // Set up periodic cleanup
        setInterval(() => {
            this.cleanupCaches();
        }, 5 * 60 * 1000); // Every 5 minutes
        
        this.log('🎭 Conversation Orchestrator ready with multi-agent coordination');
    }

    /**
     * Main entry point for processing requests
     * @param {Object} request - The orchestrator request
     * @returns {Object} Orchestration result
     */
    async execute(request) {
        const { type, data, options = {} } = request;
        
        if (!type) {
            throw new Error('Request type is required');
        }

        // Build comprehensive context
        const context = await this.buildContext(request);
        
        // Make intelligent decision
        const decision = await this.makeIntelligentDecision(context);
        
        // Execute the decision
        const result = await this.executeDecision(decision, context);
        
        // Post-process and optimize
        const optimizedResult = this.optimizeResult(result, context);
        
        return optimizedResult;
    }

    /**
     * Build comprehensive context for decision making
     * @param {Object} request - Original request
     * @returns {Object} Built context
     */
    async buildContext(request) {
        const startTime = Date.now();
        const logger = this.createLogger('context-building');
        
        const context = {
            request,
            session: null,
            relatedSessions: [],
            patterns: [],
            insights: [],
            semanticAnalysis: null,
            sessionState: null,
            relationships: null,
            metadata: {
                buildTime: 0,
                complexity: 'low',
                confidence: 0
            }
        };

        try {
            // Load session data if provided
            if (request.data?.session_id || request.data?.session) {
                context.session = await this.loadSessionData(request.data.session_id || request.data.session);
                logger('Session data loaded');
            }

            // Perform semantic analysis if session has messages
            if (context.session?.messages && this.agentConfig.isFeatureEnabled('enableSemanticAnalysis')) {
                logger('Performing semantic analysis');
                context.semanticAnalysis = await this.semanticAnalyzer.execute({
                    messages: context.session.messages,
                    options: request.options?.semantic || {}
                });
            }

            // Analyze session state
            if (context.session && this.agentConfig.isFeatureEnabled('enableSessionStateAnalysis')) {
                logger('Analyzing session state');
                context.sessionState = await this.sessionStateAnalyzer.execute({
                    session: context.session,
                    options: request.options?.sessionState || {}
                });
            }

            // Find related sessions if enabled
            if (request.type === 'find_relationships' || 
                request.options?.includeRelationships) {
                logger('Mapping relationships');
                
                const candidateSessions = await this.findCandidateSessions(context.session);
                if (candidateSessions.length > 0) {
                    context.relationships = await this.relationshipMapper.execute({
                        targetSession: context.session,
                        candidateSessions,
                        options: request.options?.relationships || {}
                    });
                }
            }

            // Detect patterns
            context.patterns = await this.detectPatterns(context);
            
            // Generate initial insights
            context.insights = this.generateContextInsights(context);

            // Calculate context complexity and confidence
            context.metadata.complexity = this.assessContextComplexity(context);
            context.metadata.confidence = this.calculateContextConfidence(context);
            context.metadata.buildTime = Date.now() - startTime;

            logger(`Context built in ${context.metadata.buildTime}ms`);
            return context;

        } catch (error) {
            logger(`Context building failed: ${error.message}`, 'error');
            throw new Error(`Failed to build context: ${error.message}`);
        }
    }

    /**
     * Make intelligent decision based on context
     * @param {Object} context - Built context
     * @returns {Object} Decision object
     */
    async makeIntelligentDecision(context) {
        const logger = this.createLogger('decision-making');
        
        const decision = {
            action: null,
            agents: [],
            priority: 'medium',
            confidence: 0,
            reasoning: [],
            executionPlan: [],
            tokenBudget: this.agentConfig.getTokenBudget('default'),
            estimatedTime: 0
        };

        try {
            // Evaluate multiple decision factors
            const factors = await this.evaluateDecisionFactors(context);
            
            // Apply decision tree logic
            const decisionPath = this.applyDecisionTree(factors, context);
            
            decision.action = decisionPath.action;
            decision.agents = decisionPath.agents;
            decision.priority = decisionPath.priority;
            decision.confidence = decisionPath.confidence;
            decision.reasoning = decisionPath.reasoning;

            // Build execution plan
            decision.executionPlan = this.buildExecutionPlan(decision, context);
            
            // Estimate resources
            decision.tokenBudget = this.estimateTokenBudget(decision, context);
            decision.estimatedTime = this.estimateExecutionTime(decision, context);

            logger(`Decision made: ${decision.action} (confidence: ${decision.confidence.toFixed(2)})`);
            return decision;

        } catch (error) {
            logger(`Decision making failed: ${error.message}`, 'error');
            throw new Error(`Failed to make decision: ${error.message}`);
        }
    }

    /**
     * Evaluate decision factors
     * @param {Object} context - Context to evaluate
     * @returns {Object} Evaluated factors
     */
    async evaluateDecisionFactors(context) {
        const factors = {
            sessionState: { score: 0, evidence: [] },
            userIntent: { score: 0, evidence: [] },
            semanticComplexity: { score: 0, evidence: [] },
            patternValue: { score: 0, evidence: [] },
            documentationNeed: { score: 0, evidence: [] },
            relationshipValue: { score: 0, evidence: [] },
            temporal: { score: 0, evidence: [] }
        };

        // Evaluate session state
        if (context.sessionState) {
            const state = context.sessionState;
            
            if (state.state === 'completed' && state.documentationReady) {
                factors.sessionState.score = 90;
                factors.sessionState.evidence.push('session_completed', 'documentation_ready');
            } else if (state.state === 'active') {
                factors.sessionState.score = 60;
                factors.sessionState.evidence.push('session_active');
            } else if (state.state === 'abandoned' && state.quality.overall > 0.6) {
                factors.sessionState.score = 40;
                factors.sessionState.evidence.push('abandoned_but_valuable');
            }
        }

        // Evaluate user intent (from request)
        if (context.request.type === 'find_patterns') {
            factors.userIntent.score = 80;
            factors.userIntent.evidence.push('explicit_pattern_request');
        } else if (context.request.type === 'find_relationships') {
            factors.userIntent.score = 85;
            factors.userIntent.evidence.push('explicit_relationship_request');
        } else if (context.request.type === 'document_session') {
            factors.userIntent.score = 90;
            factors.userIntent.evidence.push('explicit_documentation_request');
        }

        // Evaluate semantic complexity
        if (context.semanticAnalysis) {
            const semantic = context.semanticAnalysis.result;
            
            if (semantic.complexity?.complexity === 'high') {
                factors.semanticComplexity.score = 80;
                factors.semanticComplexity.evidence.push('high_complexity');
            }
            
            if (semantic.structure?.codeBlocks?.length > 0) {
                factors.semanticComplexity.score += 10;
                factors.semanticComplexity.evidence.push('contains_code');
            }
            
            if (semantic.structure?.errors?.length > 0) {
                factors.semanticComplexity.score += 15;
                factors.semanticComplexity.evidence.push('contains_errors');
            }
        }

        // Evaluate pattern value
        if (context.patterns.length > 0) {
            const avgFrequency = context.patterns.reduce((sum, p) => sum + (p.frequency || 1), 0) / context.patterns.length;
            
            if (avgFrequency >= 3) {
                factors.patternValue.score = 85;
                factors.patternValue.evidence.push('recurring_patterns');
            } else if (avgFrequency >= 2) {
                factors.patternValue.score = 60;
                factors.patternValue.evidence.push('emerging_patterns');
            }
        }

        // Evaluate documentation need
        if (context.sessionState?.documentationValue > 70) {
            factors.documentationNeed.score = context.sessionState.documentationValue;
            factors.documentationNeed.evidence.push('high_documentation_value');
        }

        // Evaluate relationship value
        if (context.relationships?.relationships?.length > 0) {
            const avgConfidence = context.relationships.relationships.reduce(
                (sum, rel) => sum + rel.confidence, 0
            ) / context.relationships.relationships.length;
            
            factors.relationshipValue.score = avgConfidence * 100;
            factors.relationshipValue.evidence.push('strong_relationships_found');
        }

        return factors;
    }

    /**
     * Apply decision tree logic
     * @param {Object} factors - Evaluated factors
     * @param {Object} context - Context object
     * @returns {Object} Decision path
     */
    applyDecisionTree(factors, context) {
        const decisionPath = {
            action: 'monitor',
            agents: [],
            priority: 'low',
            confidence: 0.5,
            reasoning: []
        };

        // Documentation Decision Path
        if (factors.sessionState.score > 80 || factors.documentationNeed.score > 70) {
            decisionPath.action = 'document_session';
            decisionPath.agents = ['writer'];
            decisionPath.priority = 'high';
            decisionPath.confidence = Math.max(factors.sessionState.score, factors.documentationNeed.score) / 100;
            decisionPath.reasoning.push('high_documentation_value');
        }
        
        // Pattern Analysis Decision Path
        else if (factors.patternValue.score > 70 || factors.userIntent.score > 75) {
            decisionPath.action = 'analyze_patterns';
            decisionPath.agents = ['writer', 'assistant'];
            decisionPath.priority = 'high';
            decisionPath.confidence = 0.85;
            decisionPath.reasoning.push('pattern_analysis_needed');
        }
        
        // Relationship Discovery Decision Path
        else if (factors.relationshipValue.score > 60 || context.request.type === 'find_relationships') {
            decisionPath.action = 'find_relationships';
            decisionPath.agents = ['assistant'];
            decisionPath.priority = 'medium';
            decisionPath.confidence = 0.80;
            decisionPath.reasoning.push('relationship_analysis');
        }
        
        // Complex Analysis Decision Path
        else if (factors.semanticComplexity.score > 70) {
            decisionPath.action = 'deep_analysis';
            decisionPath.agents = ['semantic', 'assistant'];
            decisionPath.priority = 'medium';
            decisionPath.confidence = 0.75;
            decisionPath.reasoning.push('complex_content_detected');
        }
        
        // Active Session Monitoring
        else if (context.sessionState?.state === 'active') {
            decisionPath.action = 'monitor_session';
            decisionPath.agents = [];
            decisionPath.priority = 'low';
            decisionPath.confidence = 0.70;
            decisionPath.reasoning.push('active_session_monitoring');
        }

        return decisionPath;
    }

    /**
     * Build execution plan
     * @param {Object} decision - Decision object
     * @param {Object} context - Context object
     * @returns {Array} Execution plan
     */
    buildExecutionPlan(decision, context) {
        const plan = [];

        switch (decision.action) {
            case 'document_session':
                plan.push({
                    step: 1,
                    action: 'analyze_session_content',
                    agent: 'semantic',
                    estimated_tokens: 40,
                    dependencies: []
                });
                plan.push({
                    step: 2,
                    action: 'generate_documentation',
                    agent: 'writer',
                    estimated_tokens: 60,
                    dependencies: [1]
                });
                break;

            case 'analyze_patterns':
                plan.push({
                    step: 1,
                    action: 'detect_patterns',
                    agent: 'assistant',
                    estimated_tokens: 30,
                    dependencies: []
                });
                plan.push({
                    step: 2,
                    action: 'document_patterns',
                    agent: 'writer',
                    estimated_tokens: 50,
                    dependencies: [1]
                });
                break;

            case 'find_relationships':
                plan.push({
                    step: 1,
                    action: 'map_relationships',
                    agent: 'relationship_mapper',
                    estimated_tokens: 35,
                    dependencies: []
                });
                plan.push({
                    step: 2,
                    action: 'analyze_clusters',
                    agent: 'assistant',
                    estimated_tokens: 25,
                    dependencies: [1]
                });
                break;

            case 'deep_analysis':
                plan.push({
                    step: 1,
                    action: 'semantic_analysis',
                    agent: 'semantic',
                    estimated_tokens: 50,
                    dependencies: []
                });
                plan.push({
                    step: 2,
                    action: 'relationship_analysis',
                    agent: 'relationship_mapper',
                    estimated_tokens: 35,
                    dependencies: []
                });
                plan.push({
                    step: 3,
                    action: 'synthesize_insights',
                    agent: 'assistant',
                    estimated_tokens: 30,
                    dependencies: [1, 2]
                });
                break;

            case 'monitor_session':
                plan.push({
                    step: 1,
                    action: 'check_session_state',
                    agent: 'session_state',
                    estimated_tokens: 15,
                    dependencies: []
                });
                break;
        }

        return plan;
    }

    /**
     * Execute the decision
     * @param {Object} decision - Decision to execute
     * @param {Object} context - Context object
     * @returns {Object} Execution result
     */
    async executeDecision(decision, context) {
        const logger = this.createLogger('decision-execution');
        const startTime = Date.now();
        
        const result = {
            action: decision.action,
            success: true,
            results: [],
            insights: [],
            metadata: {
                executionTime: 0,
                tokensUsed: 0,
                stepsCompleted: 0
            }
        };

        try {
            logger(`Executing decision: ${decision.action}`);

            // Execute each step in the plan
            for (const step of decision.executionPlan) {
                logger(`Executing step ${step.step}: ${step.action}`);
                
                const stepResult = await this.executeStep(step, context, result);
                result.results.push(stepResult);
                result.metadata.tokensUsed += stepResult.metadata?.tokensUsed || 0;
                result.metadata.stepsCompleted++;
                
                // Check if step failed
                if (!stepResult.success) {
                    logger(`Step ${step.step} failed: ${stepResult.error}`, 'warn');
                    result.success = false;
                    break;
                }
            }

            // Generate final insights
            result.insights = this.synthesizeFinalInsights(result, context);
            
            result.metadata.executionTime = Date.now() - startTime;
            logger(`Execution completed in ${result.metadata.executionTime}ms`);

            return result;

        } catch (error) {
            logger(`Execution failed: ${error.message}`, 'error');
            result.success = false;
            result.error = error.message;
            return result;
        }
    }

    /**
     * Execute individual step
     * @param {Object} step - Step to execute
     * @param {Object} context - Context object
     * @param {Object} currentResult - Current execution result
     * @returns {Object} Step result
     */
    async executeStep(step, context, currentResult) {
        const stepResult = {
            step: step.step,
            action: step.action,
            success: true,
            data: null,
            metadata: {
                tokensUsed: 0,
                executionTime: 0
            }
        };

        const startTime = Date.now();

        try {
            switch (step.agent) {
                case 'semantic':
                    if (!context.semanticAnalysis) {
                        stepResult.data = await this.semanticAnalyzer.execute({
                            messages: context.session?.messages || [],
                            options: {}
                        });
                    } else {
                        stepResult.data = context.semanticAnalysis;
                    }
                    break;

                case 'session_state':
                    if (!context.sessionState) {
                        stepResult.data = await this.sessionStateAnalyzer.execute({
                            session: context.session,
                            options: {}
                        });
                    } else {
                        stepResult.data = context.sessionState;
                    }
                    break;

                case 'relationship_mapper':
                    if (!context.relationships && context.session) {
                        const candidates = await this.findCandidateSessions(context.session);
                        stepResult.data = await this.relationshipMapper.execute({
                            targetSession: context.session,
                            candidateSessions: candidates,
                            options: {}
                        });
                    } else {
                        stepResult.data = context.relationships;
                    }
                    break;

                case 'writer':
                    stepResult.data = await this.executeWriterAction(step, context, currentResult);
                    break;

                case 'assistant':
                    stepResult.data = await this.executeAssistantAction(step, context, currentResult);
                    break;

                default:
                    throw new Error(`Unknown agent: ${step.agent}`);
            }

            stepResult.metadata.executionTime = Date.now() - startTime;
            stepResult.metadata.tokensUsed = this.estimateStepTokens(step, stepResult.data);

        } catch (error) {
            stepResult.success = false;
            stepResult.error = error.message;
        }

        return stepResult;
    }

    /**
     * Execute writer-specific actions
     * @param {Object} step - Step configuration
     * @param {Object} context - Context object
     * @param {Object} currentResult - Current result
     * @returns {Object} Writer result
     */
    async executeWriterAction(step, context, currentResult) {
        const writerResult = {
            action: step.action,
            output: null,
            insights: []
        };

        switch (step.action) {
            case 'generate_documentation':
                writerResult.output = {
                    title: this.generateDocumentationTitle(context),
                    content: this.generateDocumentationContent(context),
                    tags: this.generateDocumentationTags(context),
                    category: this.determineDocumentationCategory(context)
                };
                break;

            case 'document_patterns':
                const patterns = currentResult.results.find(r => r.action === 'detect_patterns')?.data || [];
                writerResult.output = {
                    patterns: patterns.map(pattern => ({
                        title: pattern.title,
                        description: pattern.description,
                        frequency: pattern.frequency,
                        evidence: pattern.evidence
                    }))
                };
                break;

            default:
                writerResult.output = { message: `Writer action ${step.action} executed` };
        }

        return writerResult;
    }

    /**
     * Execute assistant-specific actions
     * @param {Object} step - Step configuration
     * @param {Object} context - Context object
     * @param {Object} currentResult - Current result
     * @returns {Object} Assistant result
     */
    async executeAssistantAction(step, context, currentResult) {
        const assistantResult = {
            action: step.action,
            output: null,
            insights: []
        };

        switch (step.action) {
            case 'detect_patterns':
                assistantResult.output = await this.detectPatterns(context);
                break;

            case 'analyze_clusters':
                const relationships = currentResult.results.find(r => r.action === 'map_relationships')?.data?.relationships || [];
                assistantResult.output = this.analyzeClusters(relationships);
                break;

            case 'synthesize_insights':
                assistantResult.output = this.synthesizeInsights(currentResult.results);
                break;

            default:
                assistantResult.output = { message: `Assistant action ${step.action} executed` };
        }

        return assistantResult;
    }

    /**
     * Optimize result for token efficiency
     * @param {Object} result - Execution result
     * @param {Object} context - Context object
     * @returns {Object} Optimized result
     */
    optimizeResult(result, context) {
        const optimized = {
            success: result.success,
            action: result.action,
            summary: this.generateSummary(result),
            key_insights: this.extractKeyInsights(result),
            recommendations: this.generateRecommendations(result, context),
            metadata: result.metadata
        };

        // Include detailed results only if token budget allows
        const tokenBudget = this.agentConfig.getTokenBudget('default');
        if (result.metadata.tokensUsed < tokenBudget * 0.8) {
            optimized.detailed_results = result.results;
        }

        return optimized;
    }

    /**
     * Generate summary of results
     * @param {Object} result - Execution result
     * @returns {string} Summary
     */
    generateSummary(result) {
        if (!result.success) {
            return `❌ Execution failed: ${result.error}`;
        }

        const action = result.action;
        const stepsCompleted = result.metadata.stepsCompleted;
        const tokensUsed = result.metadata.tokensUsed;
        const executionTime = result.metadata.executionTime;

        return `✅ ${action} completed successfully in ${executionTime}ms (${stepsCompleted} steps, ${tokensUsed} tokens)`;
    }

    /**
     * Extract key insights from results
     * @param {Object} result - Execution result
     * @returns {Array} Key insights
     */
    extractKeyInsights(result) {
        const insights = [];

        result.results?.forEach(stepResult => {
            if (stepResult.data?.insights) {
                insights.push(...stepResult.data.insights);
            }
        });

        // Remove duplicates and sort by confidence
        const uniqueInsights = insights
            .filter((insight, index, self) => 
                index === self.findIndex(i => i.type === insight.type && i.description === insight.description)
            )
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 5); // Top 5 insights

        return uniqueInsights;
    }

    /**
     * Generate recommendations based on results
     * @param {Object} result - Execution result
     * @param {Object} context - Context object
     * @returns {Array} Recommendations
     */
    generateRecommendations(result, context) {
        const recommendations = [];

        // Add action-specific recommendations
        switch (result.action) {
            case 'document_session':
                recommendations.push({
                    type: 'follow_up',
                    priority: 'medium',
                    action: 'Monitor for similar patterns in future conversations'
                });
                break;

            case 'analyze_patterns':
                recommendations.push({
                    type: 'optimization',
                    priority: 'high',
                    action: 'Use identified patterns to improve response quality'
                });
                break;

            case 'find_relationships':
                if (result.results.some(r => r.data?.relationships?.length > 3)) {
                    recommendations.push({
                        type: 'clustering',
                        priority: 'medium',
                        action: 'Consider creating knowledge clusters from related conversations'
                    });
                }
                break;
        }

        return recommendations;
    }

    // Utility methods
    async loadSessionData(sessionId) {
        // This would integrate with the actual database
        // Placeholder implementation
        return {
            session_id: sessionId,
            messages: [],
            project_name: 'unknown',
            last_activity: new Date().toISOString()
        };
    }

    async findCandidateSessions(targetSession) {
        // This would query the database for similar sessions
        // Placeholder implementation
        return [];
    }

    async detectPatterns(context) {
        // Pattern detection logic
        return [];
    }

    generateContextInsights(context) {
        // Generate insights from context
        return [];
    }

    assessContextComplexity(context) {
        // Assess complexity level
        return 'medium';
    }

    calculateContextConfidence(context) {
        // Calculate confidence level
        return 0.8;
    }

    buildDecisionPatterns() {
        return {
            documentation: {
                triggers: ['session_completed', 'high_value_content'],
                confidence_threshold: 0.8
            },
            pattern_analysis: {
                triggers: ['recurring_issues', 'pattern_request'],
                confidence_threshold: 0.7
            },
            relationship_mapping: {
                triggers: ['related_sessions_found', 'cluster_analysis'],
                confidence_threshold: 0.75
            }
        };
    }

    buildActionTemplates() {
        return {
            document_session: {
                steps: ['analyze_content', 'generate_docs', 'tag_content'],
                estimated_tokens: 100
            },
            analyze_patterns: {
                steps: ['detect_patterns', 'cluster_similar', 'generate_insights'],
                estimated_tokens: 85
            },
            find_relationships: {
                steps: ['map_relationships', 'analyze_clusters'],
                estimated_tokens: 70
            }
        };
    }

    estimateTokenBudget(decision, context) {
        const baseTokens = this.agentConfig.getTokenBudget('default');
        const complexityMultiplier = context.metadata.complexity === 'high' ? 1.3 : 1.0;
        return Math.floor(baseTokens * complexityMultiplier);
    }

    estimateExecutionTime(decision, context) {
        const baseTime = decision.executionPlan.length * 1000; // 1 second per step
        const complexityMultiplier = context.metadata.complexity === 'high' ? 1.5 : 1.0;
        return Math.floor(baseTime * complexityMultiplier);
    }

    estimateStepTokens(step, data) {
        return step.estimated_tokens || 20;
    }

    cleanupCaches() {
        // Cleanup context cache
        if (this.contextCache.size > 100) {
            const entries = Array.from(this.contextCache.entries());
            for (let i = 0; i < 30; i++) {
                this.contextCache.delete(entries[i][0]);
            }
        }

        // Cleanup session tracker
        if (this.sessionTracker.size > 200) {
            const entries = Array.from(this.sessionTracker.entries());
            for (let i = 0; i < 50; i++) {
                this.sessionTracker.delete(entries[i][0]);
            }
        }

        this.log('Orchestrator caches cleaned up');
    }

    // Additional utility methods would go here...
    synthesizeFinalInsights(result, context) { return []; }
    analyzeClusters(relationships) { return {}; }
    synthesizeInsights(results) { return {}; }
    generateDocumentationTitle(context) { return 'Generated Documentation'; }
    generateDocumentationContent(context) { return 'Content generated by orchestrator'; }
    generateDocumentationTags(context) { return ['auto-generated']; }
    determineDocumentationCategory(context) { return 'general'; }
}