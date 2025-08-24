/**
 * Semantic Analyzer
 * Advanced multi-layer analysis of conversation content
 */

import BaseAgent from '../core/BaseAgent.js';

export default class SemanticAnalyzer extends BaseAgent {
    constructor(config) {
        super(config);
        this.cache = new Map();
        this.intentPatterns = this.buildIntentPatterns();
        this.entityPatterns = this.buildEntityPatterns();
        this.complexityMetrics = this.buildComplexityMetrics();
    }

    /**
     * Analyze conversation with multi-layer approach
     * @param {Array} messages - Array of message objects
     * @returns {Object} Comprehensive analysis
     */
    async execute(request) {
        const { messages, options = {} } = request;
        
        if (!messages || !Array.isArray(messages)) {
            throw new Error('Messages array is required for semantic analysis');
        }

        const cacheKey = this.generateCacheKey(messages);
        if (this.cache.has(cacheKey)) {
            this.log('Cache hit for semantic analysis');
            return this.cache.get(cacheKey);
        }

        const analysis = await this.performMultiLayerAnalysis(messages, options);
        
        // Cache result
        this.cache.set(cacheKey, analysis);
        
        // Cleanup cache if it gets too large
        if (this.cache.size > this.config.performance?.cacheMaxSize || 1000) {
            this.cleanupCache();
        }

        return analysis;
    }

    /**
     * Perform comprehensive multi-layer analysis
     * @param {Array} messages - Messages to analyze
     * @param {Object} options - Analysis options
     * @returns {Object} Analysis results
     */
    async performMultiLayerAnalysis(messages, options) {
        const startTime = Date.now();
        
        const analysis = {
            // Layer 1: Structural Analysis
            structure: this.analyzeStructure(messages),
            
            // Layer 2: Semantic Analysis
            semantic: await this.analyzeSemantics(messages),
            
            // Layer 3: Intent Detection
            intent: this.detectIntent(messages),
            
            // Layer 4: Temporal Patterns
            temporal: this.analyzeTemporalPatterns(messages),
            
            // Layer 5: Resolution Path
            resolution: this.analyzeResolutionPath(messages),
            
            // Layer 6: Complexity Assessment
            complexity: this.calculateComplexity(messages),
            
            // Layer 7: Knowledge Extraction
            knowledge: this.extractKnowledge(messages),

            // Layer 8: Quality Assessment
            quality: this.assessConversationQuality(messages),

            // Metadata
            metadata: {
                analysisTime: Date.now() - startTime,
                messageCount: messages.length,
                tokensUsed: this.estimateAnalysisTokens(messages)
            }
        };

        // Synthesize all layers into insights
        analysis.insights = this.synthesizeInsights(analysis);

        return analysis;
    }

    /**
     * Analyze conversation structure
     * @param {Array} messages - Messages array
     * @returns {Object} Structural analysis
     */
    analyzeStructure(messages) {
        const structure = {
            messageCount: messages.length,
            userMessages: 0,
            assistantMessages: 0,
            toolMessages: 0,
            averageMessageLength: 0,
            turnTaking: [],
            questionAnswerPairs: [],
            codeBlocks: [],
            errors: [],
            links: [],
            mentions: []
        };

        let totalLength = 0;
        let currentSpeaker = null;
        let turnCount = 0;

        messages.forEach((message, index) => {
            const content = message.content || '';
            totalLength += content.length;

            // Count message types
            const role = message.message_type || message.role || 'unknown';
            if (role === 'user') structure.userMessages++;
            else if (role === 'assistant') structure.assistantMessages++;
            else if (role === 'tool') structure.toolMessages++;

            // Analyze turn-taking
            if (currentSpeaker !== role) {
                if (currentSpeaker !== null) {
                    turnCount++;
                }
                currentSpeaker = role;
                structure.turnTaking.push({
                    speaker: role,
                    messageIndex: index,
                    turnNumber: turnCount
                });
            }

            // Extract code blocks
            const codeMatches = content.match(/```[\s\S]*?```/g);
            if (codeMatches) {
                codeMatches.forEach(block => {
                    const language = (block.match(/```(\w+)/) || [])[1] || 'unknown';
                    structure.codeBlocks.push({
                        messageIndex: index,
                        language,
                        length: block.length
                    });
                });
            }

            // Extract errors
            const errorPatterns = [
                /error:?\s+(.+?)(?:\n|$)/gi,
                /exception:?\s+(.+?)(?:\n|$)/gi,
                /failed:?\s+(.+?)(?:\n|$)/gi
            ];

            errorPatterns.forEach(pattern => {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    structure.errors.push({
                        messageIndex: index,
                        error: match[1].trim(),
                        type: match[0].split(':')[0].toLowerCase()
                    });
                }
            });

            // Extract links
            const urlPattern = /https?:\/\/[^\s\)]+/g;
            const urls = content.match(urlPattern);
            if (urls) {
                urls.forEach(url => {
                    structure.links.push({
                        messageIndex: index,
                        url: url.trim()
                    });
                });
            }

            // Find question-answer pairs
            if (content.match(/[?¿]/)) {
                // This is a question, look for answer in next assistant message
                const nextAssistantMsg = messages
                    .slice(index + 1)
                    .find(m => (m.message_type || m.role) === 'assistant');
                
                if (nextAssistantMsg) {
                    structure.questionAnswerPairs.push({
                        questionIndex: index,
                        answerIndex: messages.indexOf(nextAssistantMsg),
                        question: content.substring(0, 200),
                        questionLength: content.length
                    });
                }
            }
        });

        structure.averageMessageLength = messages.length > 0 ? Math.round(totalLength / messages.length) : 0;
        structure.turnTakingFrequency = messages.length > 0 ? turnCount / messages.length : 0;

        return structure;
    }

    /**
     * Perform semantic analysis using pattern matching and heuristics
     * @param {Array} messages - Messages to analyze
     * @returns {Object} Semantic analysis results
     */
    async analyzeSemantics(messages) {
        const combinedText = messages.map(m => m.content || '').join(' ').toLowerCase();
        
        const semantic = {
            topics: this.extractTopics(combinedText),
            entities: this.extractEntities(combinedText),
            keyPhrases: this.extractKeyPhrases(combinedText),
            sentiment: this.analyzeSentiment(messages),
            coherence: this.calculateCoherence(messages),
            topicDrift: this.detectTopicDrift(messages),
            technicalDepth: this.assessTechnicalDepth(combinedText),
            languageComplexity: this.assessLanguageComplexity(combinedText)
        };

        return semantic;
    }

    /**
     * Extract topics from text using keyword clustering
     * @param {string} text - Combined text
     * @returns {Array} Detected topics with confidence scores
     */
    extractTopics(text) {
        const topicKeywords = {
            'database': ['mongo', 'mongodb', 'sql', 'database', 'db', 'collection', 'query', 'schema'],
            'frontend': ['react', 'vue', 'angular', 'html', 'css', 'javascript', 'jsx', 'ui', 'component'],
            'backend': ['server', 'api', 'endpoint', 'express', 'node', 'service', 'microservice'],
            'docker': ['docker', 'container', 'compose', 'dockerfile', 'image', 'pod', 'kubernetes'],
            'payment': ['payment', 'pago', 'mercadopago', 'stripe', 'transaction', 'billing'],
            'authentication': ['auth', 'login', 'token', 'jwt', 'oauth', 'session', 'user', 'password'],
            'synchronization': ['sync', 'synchronize', 'provider', 'integration', 'newbytes', 'api'],
            'error_handling': ['error', 'exception', 'fail', 'crash', 'bug', 'debug', 'fix'],
            'performance': ['slow', 'fast', 'optimize', 'performance', 'memory', 'cpu', 'cache'],
            'configuration': ['config', 'settings', 'environment', 'env', 'setup', 'install']
        };

        const topics = [];
        
        Object.entries(topicKeywords).forEach(([topic, keywords]) => {
            let score = 0;
            let matches = 0;
            
            keywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const keywordMatches = (text.match(regex) || []).length;
                if (keywordMatches > 0) {
                    matches++;
                    score += keywordMatches;
                }
            });

            if (score > 0) {
                const confidence = Math.min(score / 10, 1); // Normalize to 0-1
                const coverage = matches / keywords.length;
                
                topics.push({
                    topic,
                    confidence,
                    coverage,
                    mentions: score,
                    matchedKeywords: matches
                });
            }
        });

        return topics.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Extract named entities from text
     * @param {string} text - Text to analyze
     * @returns {Object} Extracted entities
     */
    extractEntities(text) {
        const entities = {
            files: [],
            functions: [],
            variables: [],
            services: [],
            technologies: [],
            errors: []
        };

        // Extract file paths and names
        const filePatterns = [
            /[\w\-\.\/]+\.(js|jsx|ts|tsx|py|java|php|rb|go|rs|cpp|c|h)/g,
            /src\/[\w\-\.\/]+/g,
            /components\/[\w\-\.\/]+/g
        ];

        filePatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                entities.files.push(...matches.map(m => m.trim()));
            }
        });

        // Extract function names
        const functionPatterns = [
            /function\s+(\w+)/g,
            /const\s+(\w+)\s*=/g,
            /(\w+)\s*\(/g
        ];

        functionPatterns.forEach(pattern => {
            const matches = [...text.matchAll(pattern)];
            matches.forEach(match => {
                if (match[1] && match[1].length > 2) {
                    entities.functions.push(match[1]);
                }
            });
        });

        // Extract service names
        const servicePattern = /(?:back_|front_)(\w+)/g;
        const serviceMatches = [...text.matchAll(servicePattern)];
        entities.services = serviceMatches.map(match => match[0]);

        // Extract technology mentions
        const technologies = ['react', 'node', 'express', 'mongodb', 'redis', 'docker', 'kubernetes'];
        technologies.forEach(tech => {
            if (text.includes(tech)) {
                entities.technologies.push(tech);
            }
        });

        // Remove duplicates
        Object.keys(entities).forEach(key => {
            entities[key] = [...new Set(entities[key])];
        });

        return entities;
    }

    /**
     * Extract key phrases using n-gram analysis
     * @param {string} text - Text to analyze
     * @returns {Array} Key phrases with frequency
     */
    extractKeyPhrases(text) {
        // Simple implementation - could be enhanced with TF-IDF
        const words = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
        const frequency = {};

        // Count word frequency
        words.forEach(word => {
            frequency[word] = (frequency[word] || 0) + 1;
        });

        // Convert to array and sort by frequency
        const keyPhrases = Object.entries(frequency)
            .filter(([word, freq]) => freq > 1 && word.length > 3)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, freq]) => ({ phrase: word, frequency: freq }));

        return keyPhrases;
    }

    /**
     * Analyze sentiment of conversation
     * @param {Array} messages - Messages to analyze
     * @returns {Object} Sentiment analysis
     */
    analyzeSentiment(messages) {
        const positiveWords = ['good', 'great', 'excellent', 'perfect', 'thanks', 'gracias', 'bueno', 'excelente'];
        const negativeWords = ['error', 'problem', 'issue', 'fail', 'wrong', 'problema', 'malo', 'error'];
        const neutralWords = ['ok', 'okay', 'fine', 'sure', 'yes', 'no', 'maybe'];

        let positiveScore = 0;
        let negativeScore = 0;
        let neutralScore = 0;

        messages.forEach(message => {
            const content = (message.content || '').toLowerCase();
            
            positiveWords.forEach(word => {
                const matches = (content.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
                positiveScore += matches;
            });

            negativeWords.forEach(word => {
                const matches = (content.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
                negativeScore += matches;
            });

            neutralWords.forEach(word => {
                const matches = (content.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
                neutralScore += matches;
            });
        });

        const total = positiveScore + negativeScore + neutralScore;
        
        if (total === 0) {
            return { sentiment: 'neutral', confidence: 0.5, scores: { positive: 0, negative: 0, neutral: 0 } };
        }

        const scores = {
            positive: positiveScore / total,
            negative: negativeScore / total,
            neutral: neutralScore / total
        };

        const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

        return {
            sentiment: dominant[0],
            confidence: dominant[1],
            scores
        };
    }

    /**
     * Calculate conversation coherence
     * @param {Array} messages - Messages to analyze
     * @returns {number} Coherence score (0-1)
     */
    calculateCoherence(messages) {
        if (messages.length < 2) return 1;

        let coherenceSum = 0;
        let comparisons = 0;

        for (let i = 1; i < messages.length; i++) {
            const prevContent = (messages[i-1].content || '').toLowerCase();
            const currentContent = (messages[i].content || '').toLowerCase();
            
            const similarity = this.calculateTextSimilarity(prevContent, currentContent);
            coherenceSum += similarity;
            comparisons++;
        }

        return comparisons > 0 ? coherenceSum / comparisons : 0;
    }

    /**
     * Detect topic drift throughout conversation
     * @param {Array} messages - Messages to analyze
     * @returns {Object} Topic drift analysis
     */
    detectTopicDrift(messages) {
        if (messages.length < 3) {
            return { hasDrift: false, driftPoints: [], averageDrift: 0 };
        }

        const chunkSize = Math.max(2, Math.floor(messages.length / 3));
        const chunks = [];
        
        for (let i = 0; i < messages.length; i += chunkSize) {
            chunks.push(messages.slice(i, i + chunkSize));
        }

        const chunkTopics = chunks.map(chunk => {
            const text = chunk.map(m => m.content || '').join(' ').toLowerCase();
            return this.extractTopics(text);
        });

        const driftPoints = [];
        let totalDrift = 0;

        for (let i = 1; i < chunkTopics.length; i++) {
            const similarity = this.calculateTopicSimilarity(chunkTopics[i-1], chunkTopics[i]);
            const drift = 1 - similarity;
            
            totalDrift += drift;
            
            if (drift > 0.5) {
                driftPoints.push({
                    chunkIndex: i,
                    driftScore: drift,
                    previousTopics: chunkTopics[i-1].slice(0, 3),
                    currentTopics: chunkTopics[i].slice(0, 3)
                });
            }
        }

        const averageDrift = chunkTopics.length > 1 ? totalDrift / (chunkTopics.length - 1) : 0;

        return {
            hasDrift: driftPoints.length > 0,
            driftPoints,
            averageDrift,
            chunkCount: chunks.length
        };
    }

    /**
     * Calculate similarity between two topic arrays
     * @param {Array} topics1 - First topic array
     * @param {Array} topics2 - Second topic array
     * @returns {number} Similarity score (0-1)
     */
    calculateTopicSimilarity(topics1, topics2) {
        if (!topics1.length || !topics2.length) return 0;

        const set1 = new Set(topics1.map(t => t.topic));
        const set2 = new Set(topics2.map(t => t.topic));
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    /**
     * Calculate simple text similarity using Jaccard index
     * @param {string} text1 - First text
     * @param {string} text2 - Second text
     * @returns {number} Similarity score (0-1)
     */
    calculateTextSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().match(/\b\w+\b/g) || []);
        const words2 = new Set(text2.toLowerCase().match(/\b\w+\b/g) || []);
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    /**
     * Build intent detection patterns
     * @returns {Object} Intent patterns
     */
    buildIntentPatterns() {
        return {
            'debugging': {
                patterns: [/error|bug|fail|crash|not working|problema|error/i],
                weight: 1.0,
                indicators: ['error messages', 'stack traces', 'failure descriptions']
            },
            'feature_request': {
                patterns: [/add|implement|create|new feature|quiero|necesito/i],
                weight: 0.9,
                indicators: ['implementation requests', 'new functionality']
            },
            'question': {
                patterns: [/how|what|why|when|where|can you|cómo|qué|por qué/i],
                weight: 0.8,
                indicators: ['question words', 'inquiry patterns']
            },
            'optimization': {
                patterns: [/slow|performance|optimize|improve|faster|lento|optimizar/i],
                weight: 0.9,
                indicators: ['performance concerns', 'optimization requests']
            },
            'documentation': {
                patterns: [/explain|understand|documentation|how does|explicar|documentar/i],
                weight: 0.7,
                indicators: ['explanation requests', 'documentation needs']
            },
            'configuration': {
                patterns: [/setup|config|install|deploy|environment|configurar|instalar/i],
                weight: 0.8,
                indicators: ['setup instructions', 'configuration requests']
            }
        };
    }

    /**
     * Build entity extraction patterns
     * @returns {Object} Entity patterns
     */
    buildEntityPatterns() {
        return {
            files: [
                /[\w\-\.\/]+\.(js|jsx|ts|tsx|py|java|php|rb|go|rs|cpp|c|h)/g,
                /src\/[\w\-\.\/]+/g,
                /components\/[\w\-\.\/]+/g
            ],
            functions: [
                /function\s+(\w+)/g,
                /const\s+(\w+)\s*=/g,
                /(\w+)\s*\(/g
            ],
            services: [
                /(?:back_|front_)(\w+)/g
            ]
        };
    }

    /**
     * Build complexity assessment metrics
     * @returns {Object} Complexity metrics
     */
    buildComplexityMetrics() {
        return {
            messageCountWeight: 0.3,
            codeBlockWeight: 0.2,
            errorCountWeight: 0.2,
            topicDiversityWeight: 0.15,
            technicalDepthWeight: 0.15
        };
    }

    /**
     * Generate cache key for messages
     * @param {Array} messages - Messages array
     * @returns {string} Cache key
     */
    generateCacheKey(messages) {
        const content = messages.map(m => m.content || '').join('');
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `semantic_${hash}_${messages.length}`;
    }

    /**
     * Clean up cache by removing oldest entries
     */
    cleanupCache() {
        const entries = Array.from(this.cache.entries());
        const toRemove = Math.floor(entries.length * 0.3); // Remove 30% of entries
        
        for (let i = 0; i < toRemove; i++) {
            this.cache.delete(entries[i][0]);
        }
        
        this.log(`Cache cleaned up: removed ${toRemove} entries`);
    }

    /**
     * Additional methods for the remaining layers would go here...
     * (detectIntent, analyzeTemporalPatterns, analyzeResolutionPath, etc.)
     */

    /**
     * Estimate tokens used for analysis
     * @param {Array} messages - Messages analyzed
     * @returns {number} Estimated token count
     */
    estimateAnalysisTokens(messages) {
        const contentLength = messages.reduce((sum, msg) => sum + (msg.content || '').length, 0);
        return Math.ceil(contentLength / 4); // Rough estimate: 4 chars per token
    }
}