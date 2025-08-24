/**
 * Servicio de métricas en tiempo real optimizado
 * Proporciona estadísticas del sistema y aplicación
 */

const os = require('os');
const { performance } = require('perf_hooks');

class MetricsService {
    constructor(mongoDb, redisClient) {
        this.db = mongoDb;
        this.redis = redisClient;
        this.startTime = Date.now();
        this.requestCounter = 0;
        this.errorCounter = 0;
        this.responseTimeHistory = [];
        this.cacheStats = { hits: 0, misses: 0 };
        
        // Cache para métricas costosas (5 segundos TTL)
        this.metricsCache = new Map();
        this.cacheTTL = 5000;
        
        // Inicializar monitoreo de rendimiento
        this.initializePerformanceMonitoring();
    }

    initializePerformanceMonitoring() {
        // Interceptar requests para métricas
        this.originalDbFind = this.db.collection.bind(this.db);
        
        // Limpiar métricas históricas cada hora
        setInterval(() => {
            this.cleanupHistoricalData();
        }, 3600000); // 1 hora
    }

    // =============================================================================
    // MÉTRICAS PRINCIPALES
    // =============================================================================

    async getRealTimeMetrics() {
        const cacheKey = 'realtime_metrics';
        const cached = this.getCachedMetrics(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const [
                systemMetrics,
                conversationMetrics,
                messageMetrics,
                projectMetrics,
                performanceMetrics
            ] = await Promise.all([
                this.getSystemMetrics(),
                this.getConversationMetrics(),
                this.getMessageMetrics(),
                this.getProjectMetrics(),
                this.getPerformanceMetrics()
            ]);

            const metrics = {
                timestamp: new Date(),
                system: systemMetrics,
                conversations: conversationMetrics,
                messages: messageMetrics,
                projects: projectMetrics,
                performance: performanceMetrics
            };

            // Cachear resultado
            this.setCachedMetrics(cacheKey, metrics);
            
            return metrics;
        } catch (error) {
            console.error('Error al obtener métricas:', error);
            throw error;
        }
    }

    async getSystemMetrics() {
        const memoryUsage = process.memoryUsage();
        const systemMemory = os.totalmem();
        const freeMemory = os.freemem();
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        
        // CPU usage (promedio de los últimos 5 minutos)
        const cpuUsage = await this.getCpuUsage();
        
        // Conexiones activas (simulado - en producción usar métricas reales)
        const connections = this.getActiveConnections();

        return {
            uptime,
            memory_usage: Math.round(((systemMemory - freeMemory) / systemMemory) * 100),
            memory_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            memory_total_mb: Math.round(systemMemory / 1024 / 1024),
            cpu_usage: Math.round(cpuUsage),
            connections,
            node_version: process.version,
            platform: os.platform(),
            load_average: os.loadavg()
        };
    }

    async getConversationMetrics() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        try {
            const [
                totalConversations,
                activeConversations,
                todayConversations
            ] = await Promise.all([
                this.db.collection('conversations').estimatedDocumentCount(),
                this.db.collection('conversations').countDocuments({ is_active: true }),
                this.db.collection('conversations').countDocuments({ 
                    timestamp: { $gte: today } 
                })
            ]);

            return {
                total: totalConversations,
                active: activeConversations,
                today: todayConversations,
                last_hour: await this.getLastHourConversations()
            };
        } catch (error) {
            console.error('Error en métricas de conversaciones:', error);
            return { total: 0, active: 0, today: 0, last_hour: 0 };
        }
    }

    async getMessageMetrics() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
        
        try {
            // Usar aggregation pipeline optimizada
            const messageStats = await this.db.collection('conversations').aggregate([
                {
                    $facet: {
                        total: [
                            { $group: { _id: null, total: { $sum: "$message_count" } } }
                        ],
                        today: [
                            { $match: { timestamp: { $gte: today } } },
                            { $group: { _id: null, total: { $sum: "$message_count" } } }
                        ],
                        lastHour: [
                            { $match: { last_activity: { $gte: lastHour } } },
                            { $group: { _id: null, total: { $sum: "$message_count" } } }
                        ],
                        avgPerSession: [
                            { $group: { _id: null, avg: { $avg: "$message_count" } } }
                        ]
                    }
                }
            ]).toArray();

            const stats = messageStats[0];
            
            return {
                total: stats.total[0]?.total || 0,
                today: stats.today[0]?.total || 0,
                last_hour: stats.lastHour[0]?.total || 0,
                avg_per_session: Math.round((stats.avgPerSession[0]?.avg || 0) * 10) / 10
            };
        } catch (error) {
            console.error('Error en métricas de mensajes:', error);
            return { total: 0, today: 0, last_hour: 0, avg_per_session: 0 };
        }
    }

    async getProjectMetrics() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        try {
            const projectStats = await this.db.collection('conversations').aggregate([
                {
                    $facet: {
                        total: [
                            { $group: { _id: "$project_name" } },
                            { $count: "count" }
                        ],
                        activeToday: [
                            { $match: { last_activity: { $gte: today } } },
                            { $group: { _id: "$project_name" } },
                            { $count: "count" }
                        ],
                        mostActive: [
                            { $match: { last_activity: { $gte: today } } },
                            { 
                                $group: { 
                                    _id: "$project_name", 
                                    activity: { $sum: "$message_count" } 
                                } 
                            },
                            { $sort: { activity: -1 } },
                            { $limit: 1 }
                        ]
                    }
                }
            ]).toArray();

            const stats = projectStats[0];
            
            return {
                total: stats.total[0]?.count || 0,
                active_today: stats.activeToday[0]?.count || 0,
                most_active: stats.mostActive[0]?._id || null
            };
        } catch (error) {
            console.error('Error en métricas de proyectos:', error);
            return { total: 0, active_today: 0, most_active: null };
        }
    }

    getPerformanceMetrics() {
        const totalRequests = this.requestCounter;
        const totalErrors = this.errorCounter;
        const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
        
        // Calcular tiempo promedio de respuesta de los últimos 100 requests
        const recentResponses = this.responseTimeHistory.slice(-100);
        const avgResponseTime = recentResponses.length > 0 
            ? recentResponses.reduce((sum, time) => sum + time, 0) / recentResponses.length 
            : 0;
        
        // Calcular requests por segundo (últimos 60 segundos)
        const now = Date.now();
        const recentRequests = this.responseTimeHistory.filter(
            time => now - time.timestamp < 60000
        ).length;
        const requestsPerSecond = recentRequests / 60;
        
        // Cache hit rate
        const totalCacheOps = this.cacheStats.hits + this.cacheStats.misses;
        const cacheHitRate = totalCacheOps > 0 
            ? (this.cacheStats.hits / totalCacheOps) * 100 
            : 0;

        return {
            avg_response_time: Math.round(avgResponseTime),
            requests_per_second: Math.round(requestsPerSecond * 10) / 10,
            error_rate: Math.round(errorRate * 100) / 100,
            cache_hit_rate: Math.round(cacheHitRate * 10) / 10,
            total_requests: totalRequests,
            total_errors: totalErrors
        };
    }

    // =============================================================================
    // MÉTRICAS HISTÓRICAS
    // =============================================================================

    async getHistoricalMetrics(hours = 24) {
        const cacheKey = `historical_metrics_${hours}h`;
        const cached = this.getCachedMetrics(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
            
            // Dividir el periodo en intervalos de 1 hora
            const intervalMinutes = 60;
            const intervals = this.generateTimeIntervals(startTime, endTime, intervalMinutes);
            
            const historicalData = await Promise.all([
                this.getMessageHistory(intervals),
                this.getSessionHistory(intervals),
                this.getPerformanceHistory(intervals)
            ]);

            const result = {
                timestamps: intervals.map(interval => interval.start),
                messages: historicalData[0],
                sessions: historicalData[1],
                performance: historicalData[2]
            };

            // Cachear por 2 minutos
            this.setCachedMetrics(cacheKey, result, 120000);
            
            return result;
        } catch (error) {
            console.error('Error al obtener métricas históricas:', error);
            throw error;
        }
    }

    async getMessageHistory(intervals) {
        const pipeline = [
            {
                $match: {
                    timestamp: {
                        $gte: intervals[0].start,
                        $lte: intervals[intervals.length - 1].end
                    }
                }
            },
            {
                $group: {
                    _id: {
                        hour: { $dateToString: { format: "%Y-%m-%d-%H", date: "$timestamp" } }
                    },
                    count: { $sum: "$message_count" }
                }
            },
            { $sort: { "_id.hour": 1 } }
        ];

        const results = await this.db.collection('conversations').aggregate(pipeline).toArray();
        
        // Mapear resultados a intervalos
        return intervals.map(interval => {
            const hourKey = interval.start.toISOString().substring(0, 13).replace('T', '-');
            const found = results.find(r => r._id.hour === hourKey);
            return found ? found.count : 0;
        });
    }

    async getSessionHistory(intervals) {
        // Implementación similar a getMessageHistory pero contando sesiones
        const pipeline = [
            {
                $match: {
                    timestamp: {
                        $gte: intervals[0].start,
                        $lte: intervals[intervals.length - 1].end
                    }
                }
            },
            {
                $group: {
                    _id: {
                        hour: { $dateToString: { format: "%Y-%m-%d-%H", date: "$timestamp" } }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.hour": 1 } }
        ];

        const results = await this.db.collection('conversations').aggregate(pipeline).toArray();
        
        return intervals.map(interval => {
            const hourKey = interval.start.toISOString().substring(0, 13).replace('T', '-');
            const found = results.find(r => r._id.hour === hourKey);
            return found ? found.count : 0;
        });
    }

    getPerformanceHistory(intervals) {
        // Para métricas de performance, simular datos basados en métricas actuales
        // En producción, esto vendría de un sistema de monitoreo
        return intervals.map(() => Math.floor(Math.random() * 100) + 50); // 50-150ms
    }

    // =============================================================================
    // UTILIDADES Y HELPERS
    // =============================================================================

    recordRequest(responseTime) {
        this.requestCounter++;
        this.responseTimeHistory.push({
            time: responseTime,
            timestamp: Date.now()
        });
        
        // Mantener solo los últimos 1000 registros
        if (this.responseTimeHistory.length > 1000) {
            this.responseTimeHistory = this.responseTimeHistory.slice(-1000);
        }
    }

    recordError() {
        this.errorCounter++;
    }

    recordCacheHit() {
        this.cacheStats.hits++;
    }

    recordCacheMiss() {
        this.cacheStats.misses++;
    }

    async getCpuUsage() {
        // Simulación de CPU usage - en producción usar libraries específicas
        const startUsage = process.cpuUsage();
        
        return new Promise((resolve) => {
            setTimeout(() => {
                const endUsage = process.cpuUsage(startUsage);
                const totalUsage = endUsage.user + endUsage.system;
                const percentage = (totalUsage / 1000000) * 100; // Convertir a porcentaje
                resolve(Math.min(percentage, 100));
            }, 100);
        });
    }

    getActiveConnections() {
        // En producción, obtener de métricas reales del servidor
        return Math.floor(Math.random() * 50) + 10; // Simulado: 10-60 conexiones
    }

    async getLastHourConversations() {
        const lastHour = new Date(Date.now() - 60 * 60 * 1000);
        
        try {
            return await this.db.collection('conversations').countDocuments({
                timestamp: { $gte: lastHour }
            });
        } catch (error) {
            return 0;
        }
    }

    generateTimeIntervals(start, end, intervalMinutes) {
        const intervals = [];
        const current = new Date(start);
        
        while (current < end) {
            const intervalEnd = new Date(current.getTime() + intervalMinutes * 60 * 1000);
            intervals.push({
                start: new Date(current),
                end: intervalEnd > end ? end : intervalEnd
            });
            current.setTime(current.getTime() + intervalMinutes * 60 * 1000);
        }
        
        return intervals;
    }

    getCachedMetrics(key) {
        const cached = this.metricsCache.get(key);
        if (!cached) return null;
        
        if (Date.now() > cached.expiry) {
            this.metricsCache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    setCachedMetrics(key, data, ttl = this.cacheTTL) {
        this.metricsCache.set(key, {
            data,
            expiry: Date.now() + ttl
        });
    }

    cleanupHistoricalData() {
        // Limpiar datos antiguos de response times
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 horas
        this.responseTimeHistory = this.responseTimeHistory.filter(
            record => record.timestamp > cutoff
        );
        
        // Limpiar caché de métricas
        for (const [key, value] of this.metricsCache.entries()) {
            if (Date.now() > value.expiry) {
                this.metricsCache.delete(key);
            }
        }
        
        console.log('🧹 Datos históricos de métricas limpiados');
    }

    // =============================================================================
    // API ENDPOINTS HELPERS
    // =============================================================================

    async getMetricsForApi(includeHistorical = false) {
        const metrics = await this.getRealTimeMetrics();
        
        if (includeHistorical) {
            const historical = await this.getHistoricalMetrics(24);
            return {
                metrics,
                historical
            };
        }
        
        return { metrics };
    }

    async getSystemHealth() {
        const metrics = await this.getRealTimeMetrics();
        
        // Determinar estado de salud basado en métricas críticas
        const health = {
            status: 'healthy',
            checks: {
                memory: metrics.system.memory_usage < 85,
                cpu: metrics.system.cpu_usage < 85,
                errors: metrics.performance.error_rate < 5,
                database: true // Implement actual DB health check
            },
            uptime: metrics.system.uptime,
            timestamp: new Date()
        };
        
        // Si algún check falla, marcar como unhealthy
        if (!Object.values(health.checks).every(check => check)) {
            health.status = 'unhealthy';
        }
        
        return health;
    }
}

module.exports = MetricsService;