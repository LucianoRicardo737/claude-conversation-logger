/**
 * Session State Analyzer
 * Intelligent detection and analysis of conversation session states
 */

import BaseAgent from '../core/BaseAgent.js';

export default class SessionStateAnalyzer extends BaseAgent {
    constructor(config) {
        super(config);
        this.activeIndicators = config.language?.activeSessionIndicators || [];
        this.completedIndicators = config.language?.completedSessionIndicators || [];
        this.problemKeywords = config.language?.problemKeywords || [];
        this.resolutionKeywords = config.language?.resolutionKeywords || [];
        
        this.stateCache = new Map();
        this.patterns = this.buildStatePatterns();
    }

    /**
     * Analyze session state with comprehensive context
     * @param {Object} session - Session object with messages
     * @returns {Object} Session state analysis
     */
    async execute(request) {
        const { session, options = {} } = request;
        
        if (!session) {
            throw new Error('Session object is required for state analysis');
        }

        const cacheKey = this.generateSessionCacheKey(session);
        if (this.stateCache.has(cacheKey) && !options.forceRefresh) {
            this.log('Cache hit for session state analysis');
            return this.stateCache.get(cacheKey);
        }

        const analysis = await this.performStateAnalysis(session, options);
        
        // Cache the analysis
        this.stateCache.set(cacheKey, analysis);
        this.cleanupCache();

        return analysis;
    }

    /**
     * Perform comprehensive session state analysis
     * @param {Object} session - Session to analyze
     * @param {Object} options - Analysis options
     * @returns {Object} State analysis results
     */
    async performStateAnalysis(session, options) {
        const analysis = {
            // Core state determination
            state: 'unknown',
            confidence: 0,
            
            // Temporal analysis
            temporal: this.analyzeTemporalPatterns(session),
            
            // Content analysis
            content: this.analyzeContentPatterns(session),
            
            // Activity analysis
            activity: this.analyzeActivityPatterns(session),
            
            // Resolution analysis
            resolution: this.analyzeResolutionStatus(session),
            
            // Quality assessment
            quality: this.assessSessionQuality(session),
            
            // Recommendations
            recommendations: [],
            
            // Evidence for the state determination
            evidence: [],
            
            // Next suggested actions
            nextActions: [],
            
            // Documentation readiness
            documentationReady: false,
            documentationValue: 0,
            
            // Metadata
            metadata: {
                lastActivity: session.last_activity,
                messageCount: session.messages?.length || 0,
                analysisTimestamp: new Date().toISOString()
            }
        };

        // Determine primary state
        const stateDetermination = this.determineState(analysis);
        analysis.state = stateDetermination.state;
        analysis.confidence = stateDetermination.confidence;
        analysis.evidence = stateDetermination.evidence;

        // Generate recommendations based on state
        analysis.recommendations = this.generateRecommendations(analysis);
        
        // Determine next actions
        analysis.nextActions = this.determineNextActions(analysis);
        
        // Assess documentation readiness
        const docAssessment = this.assessDocumentationReadiness(analysis);
        analysis.documentationReady = docAssessment.ready;
        analysis.documentationValue = docAssessment.value;

        return analysis;
    }

    /**
     * Analyze temporal patterns in session
     * @param {Object} session - Session to analyze
     * @returns {Object} Temporal analysis
     */
    analyzeTemporalPatterns(session) {
        const temporal = {
            duration: 0,
            timeSinceLastActivity: 0,
            messageFrequency: 0,
            activityPeaks: [],
            inactivityPeriods: [],
            isRecent: false,
            isStale: false
        };

        if (!session.messages || session.messages.length === 0) {
            return temporal;
        }

        const messages = session.messages.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        const firstMessage = new Date(messages[0].timestamp);
        const lastMessage = new Date(messages[messages.length - 1].timestamp);
        const now = new Date();

        // Calculate duration and recency
        temporal.duration = lastMessage - firstMessage;
        temporal.timeSinceLastActivity = now - lastMessage;
        
        const timeoutMs = (this.config.session?.activeTimeoutMinutes || 30) * 60 * 1000;
        temporal.isRecent = temporal.timeSinceLastActivity < timeoutMs;
        temporal.isStale = temporal.timeSinceLastActivity > (timeoutMs * 4);

        // Calculate message frequency
        if (temporal.duration > 0) {
            temporal.messageFrequency = messages.length / (temporal.duration / 60000); // messages per minute
        }

        // Detect activity patterns
        const activityWindows = this.analyzeActivityWindows(messages);
        temporal.activityPeaks = activityWindows.peaks;
        temporal.inactivityPeriods = activityWindows.gaps;

        return temporal;
    }

    /**
     * Analyze activity windows to detect patterns
     * @param {Array} messages - Sorted messages array
     * @returns {Object} Activity windows analysis
     */
    analyzeActivityWindows(messages) {
        const windows = {
            peaks: [],
            gaps: []
        };

        if (messages.length < 3) return windows;

        // Create 5-minute windows
        const windowSize = 5 * 60 * 1000; // 5 minutes in milliseconds
        const messageWindows = new Map();

        messages.forEach(message => {
            const timestamp = new Date(message.timestamp);
            const windowStart = Math.floor(timestamp / windowSize) * windowSize;
            
            if (!messageWindows.has(windowStart)) {
                messageWindows.set(windowStart, []);
            }
            messageWindows.get(windowStart).push(message);
        });

        // Identify peaks (windows with many messages)
        const windowEntries = Array.from(messageWindows.entries()).sort((a, b) => a[0] - b[0]);
        const averageMessagesPerWindow = messages.length / windowEntries.length;

        windowEntries.forEach(([windowStart, windowMessages]) => {
            if (windowMessages.length > averageMessagesPerWindow * 1.5) {
                windows.peaks.push({
                    timestamp: new Date(windowStart),
                    messageCount: windowMessages.length,
                    intensity: windowMessages.length / averageMessagesPerWindow
                });
            }
        });

        // Identify gaps (long periods without messages)
        for (let i = 1; i < windowEntries.length; i++) {
            const gap = windowEntries[i][0] - windowEntries[i-1][0] - windowSize;
            if (gap > windowSize * 2) { // Gap larger than 10 minutes
                windows.gaps.push({
                    start: new Date(windowEntries[i-1][0] + windowSize),
                    end: new Date(windowEntries[i][0]),
                    duration: gap
                });
            }
        }

        return windows;
    }

    /**
     * Analyze content patterns for state indicators
     * @param {Object} session - Session to analyze
     * @returns {Object} Content analysis
     */
    analyzeContentPatterns(session) {
        const content = {
            hasQuestions: false,
            hasErrors: false,
            hasResolutions: false,
            hasGratitude: false,
            hasConfusion: false,
            hasContinuation: false,
            dominantSentiment: 'neutral',
            languageIndicators: {
                active: 0,
                completed: 0,
                problem: 0,
                resolution: 0
            }
        };

        if (!session.messages || session.messages.length === 0) {
            return content;
        }

        const allText = session.messages.map(m => m.content || '').join(' ').toLowerCase();
        const lastMessages = session.messages.slice(-3);
        const recentText = lastMessages.map(m => m.content || '').join(' ').toLowerCase();

        // Check for question patterns
        content.hasQuestions = /[?¿]|how|what|why|when|where|cómo|qué|por qué|cuándo|dónde/.test(allText);

        // Check for error patterns
        const errorPatterns = this.problemKeywords.map(keyword => new RegExp(`\\b${keyword}\\b`, 'i'));
        content.hasErrors = errorPatterns.some(pattern => pattern.test(allText));

        // Check for resolution patterns
        const resolutionPatterns = this.resolutionKeywords.map(keyword => new RegExp(`\\b${keyword}\\b`, 'i'));
        content.hasResolutions = resolutionPatterns.some(pattern => pattern.test(allText));

        // Check for gratitude
        const gratitudePatterns = ['thanks', 'thank you', 'gracias', 'perfecto', 'perfect', 'excellent', 'excelente'];
        content.hasGratitude = gratitudePatterns.some(pattern => 
            new RegExp(`\\b${pattern}\\b`, 'i').test(recentText)
        );

        // Check for confusion
        const confusionPatterns = ['confused', 'confundido', 'no entiendo', "don't understand", 'unclear'];
        content.hasConfusion = confusionPatterns.some(pattern => 
            new RegExp(`\\b${pattern}\\b`, 'i').test(recentText)
        );

        // Check for continuation indicators
        const continuationPatterns = ['also', 'además', 'another', 'otro', 'next', 'siguiente'];
        content.hasContinuation = continuationPatterns.some(pattern => 
            new RegExp(`\\b${pattern}\\b`, 'i').test(recentText)
        );

        // Count language indicators
        this.activeIndicators.forEach(indicator => {
            const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
            const matches = (recentText.match(regex) || []).length;
            content.languageIndicators.active += matches;
        });

        this.completedIndicators.forEach(indicator => {
            const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
            const matches = (recentText.match(regex) || []).length;
            content.languageIndicators.completed += matches;
        });

        this.problemKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = (allText.match(regex) || []).length;
            content.languageIndicators.problem += matches;
        });

        this.resolutionKeywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = (allText.match(regex) || []).length;
            content.languageIndicators.resolution += matches;
        });

        // Determine dominant sentiment
        const sentimentScores = {
            positive: content.hasGratitude ? 2 : 0 + content.hasResolutions ? 1 : 0,
            negative: content.hasErrors ? 2 : 0 + content.hasConfusion ? 1 : 0,
            neutral: 1
        };

        content.dominantSentiment = Object.entries(sentimentScores)
            .sort((a, b) => b[1] - a[1])[0][0];

        return content;
    }

    /**
     * Analyze activity patterns
     * @param {Object} session - Session to analyze
     * @returns {Object} Activity analysis
     */
    analyzeActivityPatterns(session) {
        const activity = {
            isActive: false,
            isPaused: false,
            isAbandoned: false,
            userEngagement: 0,
            conversationFlow: 'unknown',
            lastUserAction: null,
            lastAssistantAction: null,
            responseLatency: []
        };

        if (!session.messages || session.messages.length === 0) {
            return activity;
        }

        const messages = session.messages.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        // Find last user and assistant messages
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            const role = message.message_type || message.role;
            
            if (role === 'user' && !activity.lastUserAction) {
                activity.lastUserAction = message;
            } else if (role === 'assistant' && !activity.lastAssistantAction) {
                activity.lastAssistantAction = message;
            }
            
            if (activity.lastUserAction && activity.lastAssistantAction) {
                break;
            }
        }

        // Calculate user engagement
        const userMessages = messages.filter(m => (m.message_type || m.role) === 'user');
        const totalMessages = messages.length;
        activity.userEngagement = totalMessages > 0 ? userMessages.length / totalMessages : 0;

        // Analyze conversation flow
        if (activity.lastUserAction && activity.lastAssistantAction) {
            const lastUserTime = new Date(activity.lastUserAction.timestamp);
            const lastAssistantTime = new Date(activity.lastAssistantAction.timestamp);
            
            if (lastUserTime > lastAssistantTime) {
                activity.conversationFlow = 'waiting_for_assistant';
            } else {
                activity.conversationFlow = 'waiting_for_user';
            }
        }

        // Calculate response latencies
        let userMessage = null;
        messages.forEach(message => {
            const role = message.message_type || message.role;
            if (role === 'user') {
                userMessage = message;
            } else if (role === 'assistant' && userMessage) {
                const latency = new Date(message.timestamp) - new Date(userMessage.timestamp);
                activity.responseLatency.push(latency);
                userMessage = null;
            }
        });

        // Determine activity state
        const timeoutMs = (this.config.session?.activeTimeoutMinutes || 30) * 60 * 1000;
        const timeSinceLastActivity = Date.now() - new Date(messages[messages.length - 1].timestamp);
        
        if (timeSinceLastActivity < timeoutMs) {
            activity.isActive = true;
        } else if (timeSinceLastActivity < timeoutMs * 2) {
            activity.isPaused = true;
        } else {
            activity.isAbandoned = true;
        }

        return activity;
    }

    /**
     * Analyze resolution status
     * @param {Object} session - Session to analyze
     * @returns {Object} Resolution analysis
     */
    analyzeResolutionStatus(session) {
        const resolution = {
            isResolved: false,
            confidence: 0,
            resolutionType: 'unknown',
            resolutionEvidence: [],
            problemsResolved: 0,
            openIssues: 0,
            resolutionPath: []
        };

        if (!session.messages || session.messages.length === 0) {
            return resolution;
        }

        const messages = session.messages.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        // Track problem-solution pairs
        let problemsFound = 0;
        let solutionsFound = 0;

        messages.forEach((message, index) => {
            const content = (message.content || '').toLowerCase();
            
            // Check for problems
            const hasProblem = this.problemKeywords.some(keyword => 
                new RegExp(`\\b${keyword}\\b`, 'i').test(content)
            );
            
            if (hasProblem) {
                problemsFound++;
                
                // Look for solutions in subsequent messages
                const nextMessages = messages.slice(index + 1, index + 4); // Look ahead 3 messages
                const hasSubsequentSolution = nextMessages.some(nextMsg => {
                    const nextContent = (nextMsg.content || '').toLowerCase();
                    return this.resolutionKeywords.some(keyword => 
                        new RegExp(`\\b${keyword}\\b`, 'i').test(nextContent)
                    );
                });
                
                if (hasSubsequentSolution) {
                    solutionsFound++;
                    resolution.resolutionPath.push({
                        problemIndex: index,
                        problem: content.substring(0, 100),
                        resolved: true
                    });
                } else {
                    resolution.resolutionPath.push({
                        problemIndex: index,
                        problem: content.substring(0, 100),
                        resolved: false
                    });
                }
            }
        });

        resolution.problemsResolved = solutionsFound;
        resolution.openIssues = problemsFound - solutionsFound;

        // Check last few messages for resolution indicators
        const lastMessages = messages.slice(-3);
        const recentText = lastMessages.map(m => m.content || '').join(' ').toLowerCase();
        
        let resolutionScore = 0;
        
        // Positive resolution indicators
        this.resolutionKeywords.forEach(keyword => {
            if (new RegExp(`\\b${keyword}\\b`, 'i').test(recentText)) {
                resolutionScore += 1;
            }
        });

        // Gratitude indicators (strong resolution signal)
        const gratitudeWords = ['thanks', 'gracias', 'perfect', 'perfecto', 'excellent', 'excelente'];
        gratitudeWords.forEach(word => {
            if (new RegExp(`\\b${word}\\b`, 'i').test(recentText)) {
                resolutionScore += 2;
            }
        });

        // Negative resolution indicators
        this.problemKeywords.forEach(keyword => {
            if (new RegExp(`\\b${keyword}\\b`, 'i').test(recentText)) {
                resolutionScore -= 1;
            }
        });

        // Calculate resolution confidence
        const maxPossibleScore = this.resolutionKeywords.length + gratitudeWords.length * 2;
        resolution.confidence = Math.max(0, Math.min(1, resolutionScore / maxPossibleScore));

        // Determine if resolved
        resolution.isResolved = resolutionScore > 2 || (problemsFound > 0 && solutionsFound / problemsFound > 0.7);

        // Determine resolution type
        if (resolution.isResolved) {
            if (gratitudeWords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(recentText))) {
                resolution.resolutionType = 'satisfied';
            } else if (resolutionScore > 0) {
                resolution.resolutionType = 'technical';
            } else {
                resolution.resolutionType = 'implicit';
            }
        } else if (resolution.openIssues > 0) {
            resolution.resolutionType = 'unresolved';
        }

        return resolution;
    }

    /**
     * Assess session quality
     * @param {Object} session - Session to analyze
     * @returns {Object} Quality assessment
     */
    assessSessionQuality(session) {
        const quality = {
            overall: 0,
            completeness: 0,
            clarity: 0,
            engagement: 0,
            outcome: 0,
            factors: []
        };

        if (!session.messages || session.messages.length === 0) {
            return quality;
        }

        // Completeness (based on conversation flow)
        const hasUserInput = session.messages.some(m => (m.message_type || m.role) === 'user');
        const hasAssistantResponse = session.messages.some(m => (m.message_type || m.role) === 'assistant');
        const hasResolution = session.messages.some(m => 
            this.resolutionKeywords.some(keyword => 
                new RegExp(`\\b${keyword}\\b`, 'i').test(m.content || '')
            )
        );

        quality.completeness = (hasUserInput ? 0.4 : 0) + 
                              (hasAssistantResponse ? 0.4 : 0) + 
                              (hasResolution ? 0.2 : 0);

        if (quality.completeness > 0.8) {
            quality.factors.push('complete_conversation');
        }

        // Clarity (based on message length and structure)
        const avgMessageLength = session.messages.reduce((sum, m) => sum + (m.content || '').length, 0) / session.messages.length;
        quality.clarity = Math.min(1, avgMessageLength / 100); // Normalize to reasonable message length

        // Engagement (based on message count and user participation)
        const userMessages = session.messages.filter(m => (m.message_type || m.role) === 'user');
        quality.engagement = Math.min(1, (userMessages.length * 2) / session.messages.length);

        if (session.messages.length > 5) {
            quality.factors.push('sustained_engagement');
        }

        // Outcome (based on resolution analysis)
        const resolutionAnalysis = this.analyzeResolutionStatus(session);
        quality.outcome = resolutionAnalysis.confidence;

        if (resolutionAnalysis.isResolved) {
            quality.factors.push('successful_resolution');
        }

        // Calculate overall quality
        quality.overall = (quality.completeness * 0.3 + 
                          quality.clarity * 0.2 + 
                          quality.engagement * 0.2 + 
                          quality.outcome * 0.3);

        return quality;
    }

    /**
     * Determine the primary session state
     * @param {Object} analysis - Complete analysis object
     * @returns {Object} State determination
     */
    determineState(analysis) {
        const determination = {
            state: 'unknown',
            confidence: 0,
            evidence: []
        };

        const { temporal, content, activity, resolution } = analysis;

        // Active state indicators
        if (temporal.isRecent && activity.isActive && !resolution.isResolved) {
            determination.state = 'active';
            determination.confidence = 0.9;
            determination.evidence.push('recent_activity', 'ongoing_conversation');
            
            if (content.hasQuestions) {
                determination.evidence.push('has_questions');
                determination.confidence = Math.min(0.95, determination.confidence + 0.05);
            }
        }
        
        // Completed state indicators
        else if (resolution.isResolved && resolution.confidence > 0.7) {
            determination.state = 'completed';
            determination.confidence = resolution.confidence;
            determination.evidence.push('resolution_detected');
            
            if (content.hasGratitude) {
                determination.evidence.push('gratitude_expressed');
                determination.confidence = Math.min(0.95, determination.confidence + 0.1);
            }
            
            if (content.languageIndicators.completed > 0) {
                determination.evidence.push('completion_language');
                determination.confidence = Math.min(0.95, determination.confidence + 0.05);
            }
        }
        
        // Paused state indicators
        else if (activity.isPaused && !temporal.isStale) {
            determination.state = 'paused';
            determination.confidence = 0.75;
            determination.evidence.push('inactive_but_recent');
            
            if (content.hasConfusion) {
                determination.evidence.push('confusion_detected');
                determination.confidence = Math.min(0.85, determination.confidence + 0.1);
            }
        }
        
        // Abandoned state indicators
        else if (activity.isAbandoned || temporal.isStale) {
            determination.state = 'abandoned';
            determination.confidence = 0.8;
            determination.evidence.push('long_inactivity');
            
            if (!resolution.isResolved && resolution.openIssues > 0) {
                determination.evidence.push('unresolved_issues');
                determination.confidence = Math.min(0.9, determination.confidence + 0.1);
            }
        }
        
        // Stuck state (special case)
        else if (content.hasConfusion && !temporal.isRecent && !resolution.isResolved) {
            determination.state = 'stuck';
            determination.confidence = 0.8;
            determination.evidence.push('confusion_and_stagnation');
        }

        return determination;
    }

    /**
     * Generate recommendations based on state analysis
     * @param {Object} analysis - State analysis
     * @returns {Array} Array of recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];

        switch (analysis.state) {
            case 'active':
                if (analysis.content.hasConfusion) {
                    recommendations.push({
                        type: 'clarification',
                        priority: 'high',
                        action: 'Provide clearer explanations or examples'
                    });
                }
                if (analysis.activity.responseLatency.length > 0) {
                    const avgLatency = analysis.activity.responseLatency.reduce((a, b) => a + b, 0) / 
                                     analysis.activity.responseLatency.length;
                    if (avgLatency > 60000) { // More than 1 minute
                        recommendations.push({
                            type: 'performance',
                            priority: 'medium',
                            action: 'Consider optimizing response time'
                        });
                    }
                }
                break;

            case 'completed':
                recommendations.push({
                    type: 'documentation',
                    priority: 'high',
                    action: 'Document successful resolution pattern'
                });
                if (analysis.quality.overall > 0.8) {
                    recommendations.push({
                        type: 'knowledge',
                        priority: 'medium',
                        action: 'Extract reusable knowledge from this conversation'
                    });
                }
                break;

            case 'paused':
                recommendations.push({
                    type: 'follow_up',
                    priority: 'medium',
                    action: 'Consider proactive follow-up'
                });
                break;

            case 'abandoned':
                if (analysis.resolution.openIssues > 0) {
                    recommendations.push({
                        type: 'analysis',
                        priority: 'low',
                        action: 'Analyze abandonment patterns to improve engagement'
                    });
                }
                break;

            case 'stuck':
                recommendations.push({
                    type: 'intervention',
                    priority: 'high',
                    action: 'Consider alternative approaches or escalation'
                });
                break;
        }

        return recommendations;
    }

    /**
     * Determine next actions based on analysis
     * @param {Object} analysis - State analysis
     * @returns {Array} Next actions
     */
    determineNextActions(analysis) {
        const actions = [];

        switch (analysis.state) {
            case 'active':
                actions.push({
                    action: 'monitor',
                    priority: 1,
                    description: 'Continue monitoring for completion or issues'
                });
                break;

            case 'completed':
                actions.push({
                    action: 'document',
                    priority: 1,
                    description: 'Document patterns and generate insights'
                });
                actions.push({
                    action: 'archive',
                    priority: 2,
                    description: 'Archive conversation after documentation'
                });
                break;

            case 'paused':
                actions.push({
                    action: 'wait',
                    priority: 1,
                    description: 'Wait for user activity'
                });
                actions.push({
                    action: 'follow_up',
                    priority: 2,
                    description: 'Consider follow-up if no activity within threshold'
                });
                break;

            case 'abandoned':
                actions.push({
                    action: 'analyze',
                    priority: 1,
                    description: 'Analyze for patterns and improvement opportunities'
                });
                actions.push({
                    action: 'archive',
                    priority: 2,
                    description: 'Archive as incomplete'
                });
                break;

            case 'stuck':
                actions.push({
                    action: 'intervene',
                    priority: 1,
                    description: 'Provide alternative approaches'
                });
                break;
        }

        return actions.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Assess documentation readiness
     * @param {Object} analysis - State analysis
     * @returns {Object} Documentation assessment
     */
    assessDocumentationReadiness(analysis) {
        let value = 0;
        let ready = false;

        // Base value factors
        if (analysis.resolution.isResolved) value += 30;
        if (analysis.metadata.messageCount > 5) value += 20;
        if (analysis.quality.overall > 0.7) value += 25;
        if (analysis.content.hasErrors && analysis.resolution.isResolved) value += 25;

        // Pattern value factors
        if (analysis.resolution.resolutionPath.length > 0) value += 15;
        if (analysis.content.languageIndicators.resolution > 0) value += 10;

        // Quality factors
        if (analysis.quality.completeness > 0.8) value += 10;
        if (analysis.quality.engagement > 0.6) value += 5;

        const threshold = this.config.session?.minDocumentationValue || 50;
        ready = value >= threshold;

        return { ready, value };
    }

    /**
     * Build state detection patterns
     * @returns {Object} State patterns
     */
    buildStatePatterns() {
        return {
            active: {
                temporal: ['recent_activity', 'ongoing_conversation'],
                content: ['has_questions', 'has_problems', 'continuation_indicators'],
                activity: ['high_engagement', 'regular_exchanges']
            },
            completed: {
                temporal: ['recent_completion'],
                content: ['resolution_language', 'gratitude', 'satisfaction'],
                activity: ['natural_ending', 'goal_achieved']
            },
            paused: {
                temporal: ['moderate_inactivity'],
                content: ['awaiting_response', 'partial_completion'],
                activity: ['engagement_drop', 'pending_clarification']
            },
            abandoned: {
                temporal: ['long_inactivity'],
                content: ['unresolved_issues', 'confusion'],
                activity: ['sudden_stop', 'no_closure']
            }
        };
    }

    /**
     * Generate cache key for session
     * @param {Object} session - Session object
     * @returns {string} Cache key
     */
    generateSessionCacheKey(session) {
        const lastActivity = session.last_activity || Date.now();
        const messageCount = session.messages?.length || 0;
        return `session_${session.session_id}_${lastActivity}_${messageCount}`;
    }

    /**
     * Clean up cache entries
     */
    cleanupCache() {
        if (this.stateCache.size > (this.config.performance?.cacheMaxSize || 500)) {
            // Remove 30% of oldest entries
            const entries = Array.from(this.stateCache.entries());
            const toRemove = Math.floor(entries.length * 0.3);
            
            for (let i = 0; i < toRemove; i++) {
                this.stateCache.delete(entries[i][0]);
            }
            
            this.log(`State cache cleaned up: removed ${toRemove} entries`);
        }
    }
}