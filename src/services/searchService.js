/**
 * Servicio de búsqueda full-text avanzado optimizado
 * Incluye búsqueda semántica, filtros complejos y relevancia scoring
 */

class AdvancedSearchService {
    constructor(db, redis) {
        this.db = db;
        this.redis = redis;
        
        // Cache para búsquedas frecuentes (10 minutos)
        this.searchCache = new Map();
        this.cacheTTL = 10 * 60 * 1000;
        
        // Configuración de búsqueda
        this.searchConfig = {
            maxResults: 1000,
            defaultLimit: 50,
            minQueryLength: 2,
            highlightFragment: 150,
            scoringWeights: {
                exactMatch: 10,
                titleMatch: 5,
                contentMatch: 1,
                recency: 2,
                projectRelevance: 3
            }
        };
        
        // Stopwords en español e inglés
        this.stopWords = new Set([
            'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
            'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
            'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
            'have', 'had', 'what', 'said', 'each', 'which', 'she', 'do', 'how',
            'their', 'if', 'up', 'out', 'many', 'then', 'them', 'these', 'so',
            'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no',
            'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'al',
            'del', 'los', 'las', 'una', 'como', 'pero', 'sus', 'me', 'ya',
            'muy', 'sin', 'sobre', 'más', 'hasta'
        ]);
    }

    // =============================================================================
    // BÚSQUEDA PRINCIPAL
    // =============================================================================

    async search(query, filters = {}, options = {}) {
        const {
            limit = this.searchConfig.defaultLimit,
            offset = 0,
            sortBy = 'relevance',
            sortOrder = 'desc',
            includeHighlights = true,
            includeFacets = false,
            exactMatch = false
        } = options;

        // Validar query
        if (!query || query.trim().length < this.searchConfig.minQueryLength) {
            throw new Error(`Query must be at least ${this.searchConfig.minQueryLength} characters`);
        }

        // Verificar caché
        const cacheKey = this.generateCacheKey(query, filters, options);
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // Procesar query
            const processedQuery = this.processQuery(query, exactMatch);
            
            // Construir pipeline de agregación
            const pipeline = await this.buildSearchPipeline(processedQuery, filters, options);
            
            // Ejecutar búsqueda
            const startTime = Date.now();
            const results = await this.db.collection('conversations').aggregate(pipeline).toArray();
            const searchTime = Date.now() - startTime;
            
            // Procesar resultados
            const processedResults = await this.processSearchResults(
                results, 
                processedQuery, 
                includeHighlights,
                limit,
                offset
            );
            
            // Obtener facets si se solicitan
            const facets = includeFacets ? await this.getFacets(processedQuery, filters) : null;
            
            // Preparar respuesta
            const response = {
                query: query,
                total: results.length,
                results: processedResults,
                search_time_ms: searchTime,
                filters_applied: filters,
                facets,
                pagination: {
                    limit,
                    offset,
                    has_more: results.length > limit + offset
                }
            };
            
            // Cachear resultado
            this.setCachedResult(cacheKey, response);
            
            return response;
            
        } catch (error) {
            console.error('Error en búsqueda avanzada:', error);
            throw error;
        }
    }

    // =============================================================================
    // PROCESAMIENTO DE QUERIES
    // =============================================================================

    processQuery(query, exactMatch = false) {
        if (exactMatch) {
            return {
                original: query,
                processed: query,
                terms: [query],
                exact: true
            };
        }

        // Normalizar query
        const normalized = query.toLowerCase().trim();
        
        // Extraer términos y frases
        const phrases = this.extractPhrases(normalized);
        const terms = this.extractTerms(normalized);
        
        // Filtrar stopwords
        const filteredTerms = terms.filter(term => !this.stopWords.has(term));
        
        // Generar variaciones (stemming básico)
        const variations = this.generateVariations(filteredTerms);
        
        return {
            original: query,
            processed: normalized,
            terms: filteredTerms,
            phrases,
            variations,
            exact: false
        };
    }

    extractPhrases(query) {
        const phrases = [];
        const regex = /"([^"]+)"/g;
        let match;
        
        while ((match = regex.exec(query)) !== null) {
            phrases.push(match[1]);
        }
        
        return phrases;
    }

    extractTerms(query) {
        // Remover frases entre comillas primero
        const withoutPhrases = query.replace(/"[^"]+"/g, '');
        
        // Extraer términos individuales
        return withoutPhrases
            .split(/\s+/)
            .filter(term => term.length >= 2)
            .map(term => term.replace(/[^\w\sñáéíóúü]/gi, ''));
    }

    generateVariations(terms) {
        const variations = new Map();
        
        for (const term of terms) {
            const termVariations = [];
            
            // Stemming básico en español
            if (term.endsWith('ando') || term.endsWith('iendo')) {
                termVariations.push(term.slice(0, -4)); // quitar gerundio
            }
            if (term.endsWith('ar') || term.endsWith('er') || term.endsWith('ir')) {
                termVariations.push(term.slice(0, -2)); // quitar infinitivo
            }
            if (term.endsWith('ción')) {
                termVariations.push(term.slice(0, -4) + 'r'); // conversión -> convertir
            }
            
            // Stemming básico en inglés
            if (term.endsWith('ing')) {
                termVariations.push(term.slice(0, -3));
            }
            if (term.endsWith('ed')) {
                termVariations.push(term.slice(0, -2));
            }
            if (term.endsWith('ly')) {
                termVariations.push(term.slice(0, -2));
            }
            
            variations.set(term, [term, ...termVariations]);
        }
        
        return variations;
    }

    // =============================================================================
    // PIPELINE DE BÚSQUEDA
    // =============================================================================

    async buildSearchPipeline(processedQuery, filters, options) {
        const pipeline = [];
        
        // Stage 1: Filtros básicos
        const matchStage = this.buildMatchStage(filters);
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }
        
        // Stage 2: Búsqueda de texto
        if (processedQuery.exact) {
            pipeline.push({
                $match: {
                    $text: { $search: `"${processedQuery.original}"` }
                }
            });
        } else {
            // Búsqueda combinada con text index y regex
            const textSearchStage = this.buildTextSearchStage(processedQuery);
            pipeline.push(textSearchStage);
        }
        
        // Stage 3: Añadir score de relevancia
        pipeline.push({
            $addFields: {
                relevance_score: this.buildRelevanceScore(processedQuery),
                search_highlights: this.buildHighlightFields(processedQuery)
            }
        });
        
        // Stage 4: Filtrar por score mínimo
        pipeline.push({
            $match: {
                relevance_score: { $gt: 0 }
            }
        });
        
        // Stage 5: Ordenamiento
        const sortStage = this.buildSortStage(options.sortBy, options.sortOrder);
        pipeline.push({ $sort: sortStage });
        
        // Stage 6: Proyección optimizada
        pipeline.push({
            $project: {
                session_id: 1,
                project_name: 1,
                timestamp: 1,
                last_activity: 1,
                is_active: 1,
                is_marked: 1,
                message_count: 1,
                messages: 1,
                relevance_score: 1,
                search_highlights: 1
            }
        });
        
        return pipeline;
    }

    buildMatchStage(filters) {
        const match = {};
        
        if (filters.project && filters.project !== '') {
            match.project_name = filters.project;
        }
        
        if (filters.messageType && filters.messageType !== '') {
            match['messages.role'] = filters.messageType;
        }
        
        if (filters.startDate || filters.endDate) {
            match.timestamp = {};
            if (filters.startDate) {
                match.timestamp.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                match.timestamp.$lte = new Date(filters.endDate);
            }
        }
        
        if (filters.onlyMarked === true) {
            match.is_marked = true;
        }
        
        if (filters.onlyActive === true) {
            match.is_active = true;
        }
        
        if (filters.tags && filters.tags.length > 0) {
            match.tags = { $in: filters.tags };
        }
        
        return match;
    }

    buildTextSearchStage(processedQuery) {
        const conditions = [];
        
        // Búsqueda por texto completo (MongoDB text index)
        if (processedQuery.terms.length > 0) {
            conditions.push({
                $text: { 
                    $search: processedQuery.terms.join(' '),
                    $caseSensitive: false,
                    $diacriticSensitive: false
                }
            });
        }
        
        // Búsqueda en campos específicos con regex
        const regexConditions = [];
        
        for (const term of processedQuery.terms) {
            const regex = new RegExp(term, 'i');
            regexConditions.push(
                { 'project_name': regex },
                { 'session_id': regex },
                { 'messages.content': regex }
            );
        }
        
        // Búsqueda de frases exactas
        for (const phrase of processedQuery.phrases) {
            const phraseRegex = new RegExp(phrase, 'i');
            regexConditions.push(
                { 'messages.content': phraseRegex }
            );
        }
        
        if (regexConditions.length > 0) {
            conditions.push({ $or: regexConditions });
        }
        
        return conditions.length > 0 ? { $match: { $or: conditions } } : { $match: {} };
    }

    buildRelevanceScore(processedQuery) {
        const scoreComponents = [];
        
        // Score por coincidencia exacta en título/proyecto
        scoreComponents.push({
            $cond: [
                { $regexMatch: { input: "$project_name", regex: processedQuery.original, options: "i" } },
                this.searchConfig.scoringWeights.titleMatch,
                0
            ]
        });
        
        // Score por coincidencias en contenido
        for (const term of processedQuery.terms) {
            scoreComponents.push({
                $multiply: [
                    {
                        $size: {
                            $filter: {
                                input: "$messages",
                                cond: { $regexMatch: { input: "$$this.content", regex: term, options: "i" } }
                            }
                        }
                    },
                    this.searchConfig.scoringWeights.contentMatch
                ]
            });
        }
        
        // Score por recencia
        scoreComponents.push({
            $multiply: [
                {
                    $divide: [
                        { $subtract: [new Date(), "$timestamp"] },
                        86400000 // ms en un día
                    ]
                },
                this.searchConfig.scoringWeights.recency
            ]
        });
        
        // Score por MongoDB text score (si disponible)
        scoreComponents.push({
            $ifNull: [{ $meta: "textScore" }, 0]
        });
        
        return { $add: scoreComponents };
    }

    buildHighlightFields(processedQuery) {
        // Preparar highlights para los términos encontrados
        return {
            $map: {
                input: "$messages",
                as: "message",
                in: {
                    role: "$$message.role",
                    content: "$$message.content",
                    timestamp: "$$message.timestamp",
                    highlights: {
                        $map: {
                            input: processedQuery.terms,
                            as: "term",
                            in: {
                                term: "$$term",
                                found: { $regexMatch: { input: "$$message.content", regex: "$$term", options: "i" } }
                            }
                        }
                    }
                }
            }
        };
    }

    buildSortStage(sortBy, sortOrder) {
        const direction = sortOrder === 'desc' ? -1 : 1;
        
        switch (sortBy) {
            case 'relevance':
                return { relevance_score: -1, timestamp: -1 };
            case 'date':
                return { timestamp: direction };
            case 'project':
                return { project_name: direction, timestamp: -1 };
            case 'activity':
                return { last_activity: direction };
            default:
                return { relevance_score: -1, timestamp: -1 };
        }
    }

    // =============================================================================
    // PROCESAMIENTO DE RESULTADOS
    // =============================================================================

    async processSearchResults(results, processedQuery, includeHighlights, limit, offset) {
        const processed = [];
        
        for (let i = offset; i < Math.min(results.length, offset + limit); i++) {
            const result = results[i];
            
            const processedResult = {
                session_id: result.session_id,
                project_name: result.project_name,
                timestamp: result.timestamp,
                last_activity: result.last_activity,
                is_active: result.is_active,
                is_marked: result.is_marked,
                message_count: result.message_count,
                relevance_score: Math.round(result.relevance_score * 100) / 100,
                summary: this.generateSummary(result.messages, processedQuery),
                matching_messages: this.getMatchingMessages(result.messages, processedQuery)
            };
            
            if (includeHighlights) {
                processedResult.highlights = this.generateHighlights(result.messages, processedQuery);
            }
            
            processed.push(processedResult);
        }
        
        return processed;
    }

    generateSummary(messages, processedQuery) {
        // Encontrar los mensajes más relevantes
        const relevantMessages = messages
            .filter(msg => this.messageContainsTerms(msg.content, processedQuery.terms))
            .slice(0, 3);
        
        if (relevantMessages.length === 0) {
            return 'No matching content found';
        }
        
        return relevantMessages
            .map(msg => msg.content.substring(0, 100) + '...')
            .join(' | ');
    }

    getMatchingMessages(messages, processedQuery) {
        return messages
            .filter(msg => this.messageContainsTerms(msg.content, processedQuery.terms))
            .map(msg => ({
                role: msg.role,
                content: msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''),
                timestamp: msg.timestamp,
                snippet: this.generateSnippet(msg.content, processedQuery.terms)
            }));
    }

    generateHighlights(messages, processedQuery) {
        const highlights = [];
        
        for (const message of messages) {
            for (const term of processedQuery.terms) {
                const regex = new RegExp(`(${term})`, 'gi');
                const matches = message.content.match(regex);
                
                if (matches) {
                    highlights.push({
                        term,
                        message_role: message.role,
                        snippet: this.generateSnippet(message.content, [term]),
                        count: matches.length
                    });
                }
            }
        }
        
        return highlights;
    }

    generateSnippet(content, terms) {
        // Encontrar la primera ocurrencia de cualquier término
        let earliestIndex = content.length;
        let foundTerm = null;
        
        for (const term of terms) {
            const regex = new RegExp(term, 'i');
            const match = content.match(regex);
            if (match && match.index < earliestIndex) {
                earliestIndex = match.index;
                foundTerm = term;
            }
        }
        
        if (!foundTerm) {
            return content.substring(0, this.searchConfig.highlightFragment) + '...';
        }
        
        // Crear snippet centrado en el término encontrado
        const start = Math.max(0, earliestIndex - Math.floor(this.searchConfig.highlightFragment / 2));
        const end = Math.min(content.length, start + this.searchConfig.highlightFragment);
        
        let snippet = content.substring(start, end);
        
        // Añadir elipsis si es necesario
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
        
        // Destacar los términos encontrados
        for (const term of terms) {
            const regex = new RegExp(`(${term})`, 'gi');
            snippet = snippet.replace(regex, '<mark>$1</mark>');
        }
        
        return snippet;
    }

    messageContainsTerms(content, terms) {
        const lowerContent = content.toLowerCase();
        return terms.some(term => lowerContent.includes(term));
    }

    // =============================================================================
    // FACETS Y AGREGACIONES
    // =============================================================================

    async getFacets(processedQuery, filters) {
        try {
            const pipeline = [
                // Aplicar filtros básicos (excluyendo el campo que estamos faceteando)
                { $match: this.buildMatchStage(filters) },
                
                // Facet por múltiples dimensiones
                {
                    $facet: {
                        projects: [
                            { $group: { _id: "$project_name", count: { $sum: 1 } } },
                            { $sort: { count: -1 } },
                            { $limit: 20 }
                        ],
                        message_types: [
                            { $unwind: "$messages" },
                            { $group: { _id: "$messages.role", count: { $sum: 1 } } },
                            { $sort: { count: -1 } }
                        ],
                        date_ranges: [
                            {
                                $group: {
                                    _id: {
                                        year: { $year: "$timestamp" },
                                        month: { $month: "$timestamp" }
                                    },
                                    count: { $sum: 1 }
                                }
                            },
                            { $sort: { "_id.year": -1, "_id.month": -1 } },
                            { $limit: 12 }
                        ],
                        activity_status: [
                            { $group: { _id: "$is_active", count: { $sum: 1 } } }
                        ],
                        marked_status: [
                            { $group: { _id: "$is_marked", count: { $sum: 1 } } }
                        ]
                    }
                }
            ];
            
            const result = await this.db.collection('conversations').aggregate(pipeline).toArray();
            
            return this.formatFacets(result[0]);
        } catch (error) {
            console.error('Error obteniendo facets:', error);
            return null;
        }
    }

    formatFacets(rawFacets) {
        return {
            projects: rawFacets.projects.map(p => ({
                name: p._id,
                count: p.count
            })),
            message_types: rawFacets.message_types.map(mt => ({
                type: mt._id,
                count: mt.count
            })),
            date_ranges: rawFacets.date_ranges.map(dr => ({
                period: `${dr._id.year}-${String(dr._id.month).padStart(2, '0')}`,
                count: dr.count
            })),
            activity_status: rawFacets.activity_status.reduce((acc, as) => {
                acc[as._id ? 'active' : 'inactive'] = as.count;
                return acc;
            }, {}),
            marked_status: rawFacets.marked_status.reduce((acc, ms) => {
                acc[ms._id ? 'marked' : 'unmarked'] = ms.count;
                return acc;
            }, {})
        };
    }

    // =============================================================================
    // BÚSQUEDAS ESPECIALIZADAS
    // =============================================================================

    async searchSimilar(sessionId, options = {}) {
        try {
            // Obtener conversación de referencia
            const reference = await this.db.collection('conversations').findOne({ session_id: sessionId });
            
            if (!reference) {
                throw new Error('Reference conversation not found');
            }
            
            // Extraer términos clave de la conversación
            const keyTerms = this.extractKeyTerms(reference.messages);
            
            // Buscar conversaciones similares
            return this.search(keyTerms.join(' '), {
                project: reference.project_name
            }, {
                limit: options.limit || 10,
                includeHighlights: false
            });
        } catch (error) {
            console.error('Error en búsqueda similar:', error);
            throw error;
        }
    }

    async searchByDateRange(startDate, endDate, options = {}) {
        const filters = {
            startDate: new Date(startDate),
            endDate: new Date(endDate)
        };
        
        return this.search('*', filters, {
            sortBy: 'date',
            sortOrder: 'desc',
            ...options
        });
    }

    async getPopularTerms(timeframe = '7d', limit = 20) {
        const cacheKey = `popular_terms_${timeframe}_${limit}`;
        const cached = this.getCachedResult(cacheKey);
        if (cached) return cached;
        
        try {
            const startDate = new Date();
            
            // Calcular fecha de inicio según timeframe
            switch (timeframe) {
                case '1d': startDate.setDate(startDate.getDate() - 1); break;
                case '7d': startDate.setDate(startDate.getDate() - 7); break;
                case '30d': startDate.setDate(startDate.getDate() - 30); break;
                default: startDate.setDate(startDate.getDate() - 7);
            }
            
            const pipeline = [
                { $match: { timestamp: { $gte: startDate } } },
                { $unwind: "$messages" },
                {
                    $project: {
                        words: {
                            $filter: {
                                input: { $split: [{ $toLower: "$messages.content" }, " "] },
                                cond: { $gte: [{ $strLenCP: "$$this" }, 3] }
                            }
                        }
                    }
                },
                { $unwind: "$words" },
                { $group: { _id: "$words", count: { $sum: 1 } } },
                { $match: { count: { $gte: 3 } } },
                { $sort: { count: -1 } },
                { $limit: limit }
            ];
            
            const result = await this.db.collection('conversations').aggregate(pipeline).toArray();
            
            const popularTerms = result
                .filter(term => !this.stopWords.has(term._id))
                .map(term => ({
                    term: term._id,
                    count: term.count
                }));
            
            this.setCachedResult(cacheKey, popularTerms, 30 * 60 * 1000); // 30 min cache
            
            return popularTerms;
        } catch (error) {
            console.error('Error obteniendo términos populares:', error);
            return [];
        }
    }

    extractKeyTerms(messages, limit = 10) {
        const termFreq = new Map();
        
        for (const message of messages) {
            const words = message.content
                .toLowerCase()
                .split(/\s+/)
                .filter(word => 
                    word.length >= 3 && 
                    !this.stopWords.has(word) &&
                    /^[a-záéíóúñü]+$/i.test(word)
                );
            
            for (const word of words) {
                termFreq.set(word, (termFreq.get(word) || 0) + 1);
            }
        }
        
        return Array.from(termFreq.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([term]) => term);
    }

    // =============================================================================
    // UTILIDADES DE CACHE
    // =============================================================================

    generateCacheKey(query, filters, options) {
        const key = {
            q: query,
            f: filters,
            o: {
                limit: options.limit,
                offset: options.offset,
                sortBy: options.sortBy,
                sortOrder: options.sortOrder
            }
        };
        return `search_${JSON.stringify(key)}`;
    }

    getCachedResult(key) {
        const cached = this.searchCache.get(key);
        if (!cached) return null;
        
        if (Date.now() > cached.expiry) {
            this.searchCache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    setCachedResult(key, data, ttl = this.cacheTTL) {
        this.searchCache.set(key, {
            data,
            expiry: Date.now() + ttl
        });
    }

    clearCache() {
        this.searchCache.clear();
    }

    // =============================================================================
    // ESTADÍSTICAS DE BÚSQUEDA
    // =============================================================================

    async getSearchStats() {
        return {
            cache_size: this.searchCache.size,
            cache_hit_rate: this.calculateCacheHitRate(),
            indexed_documents: await this.db.collection('conversations').estimatedDocumentCount(),
            text_index_size: await this.getTextIndexSize()
        };
    }

    calculateCacheHitRate() {
        // Implementar tracking de cache hits/misses
        return 0; // Placeholder
    }

    async getTextIndexSize() {
        try {
            const stats = await this.db.collection('conversations').stats();
            return stats.indexSizes?.fulltext_search_idx || 0;
        } catch (error) {
            return 0;
        }
    }
}

module.exports = AdvancedSearchService;