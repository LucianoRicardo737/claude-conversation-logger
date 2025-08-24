/**
 * Componente de métricas en tiempo real con gRPC streaming
 * Muestra estadísticas actualizadas automáticamente usando gRPC
 */
import { BaseComponent } from './BaseComponent.js';
import grpcService from '../services/grpc-service.js';

export const RealTimeMetrics = {
    mixins: [BaseComponent],
    
    props: {
        autoRefresh: {
            type: Boolean,
            default: true
        },
        refreshInterval: {
            type: Number,
            default: 5000 // 5 segundos
        },
        showCharts: {
            type: Boolean,
            default: true
        },
        compact: {
            type: Boolean,
            default: false
        }
    },

    data() {
        return {
            metrics: {
                system: {
                    uptime: 0,
                    memory_usage: 0,
                    cpu_usage: 0,
                    connections: 0
                },
                conversations: {
                    total: 0,
                    active: 0,
                    today: 0,
                    last_hour: 0
                },
                messages: {
                    total: 0,
                    today: 0,
                    last_hour: 0,
                    avg_per_session: 0
                },
                projects: {
                    total: 0,
                    active_today: 0,
                    most_active: null
                },
                performance: {
                    avg_response_time: 0,
                    requests_per_second: 0,
                    error_rate: 0,
                    cache_hit_rate: 0
                }
            },
            historicalData: {
                messages: [],
                sessions: [],
                performance: []
            },
            isConnected: false,
            lastUpdate: null,
            refreshTimer: null,
            chartData: null,
            alertThresholds: {
                high_memory: 80,
                high_cpu: 75,
                high_error_rate: 5,
                low_cache_hit_rate: 70
            },
            alerts: []
        };
    },

    computed: {
        systemHealthStatus() {
            const { memory_usage, cpu_usage } = this.metrics.system;
            const { error_rate } = this.metrics.performance;
            
            if (memory_usage > 90 || cpu_usage > 90 || error_rate > 10) {
                return { status: 'critical', color: 'red', icon: 'fa-exclamation-triangle' };
            } else if (memory_usage > 70 || cpu_usage > 70 || error_rate > 5) {
                return { status: 'warning', color: 'yellow', icon: 'fa-exclamation-circle' };
            } else {
                return { status: 'healthy', color: 'green', icon: 'fa-check-circle' };
            }
        },

        uptimeFormatted() {
            const seconds = this.metrics.system.uptime;
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            
            if (days > 0) {
                return `${days}d ${hours}h ${mins}m`;
            } else if (hours > 0) {
                return `${hours}h ${mins}m`;
            } else {
                return `${mins}m`;
            }
        },

        activityTrend() {
            if (this.historicalData.messages.length < 2) return 'stable';
            
            const recent = this.historicalData.messages.slice(-5);
            const older = this.historicalData.messages.slice(-10, -5);
            
            const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
            const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
            
            const change = ((recentAvg - olderAvg) / olderAvg) * 100;
            
            if (change > 10) return 'increasing';
            if (change < -10) return 'decreasing';
            return 'stable';
        }
    },

    async mounted() {
        console.log('🔄 Inicializando métricas en tiempo real...');
        
        // Inicializar métricas
        await this.fetchInitialMetrics();
        
        // Configurar auto-refresh
        if (this.autoRefresh) {
            this.startAutoRefresh();
        }
        
        // Inicializar gráficos si están habilitados
        if (this.showCharts) {
            await this.initializeCharts();
        }
        
        // Configurar eventos de visibilidad
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    },

    beforeUnmount() {
        this.stopAutoRefresh();
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    },

    methods: {
        async fetchInitialMetrics() {
            await this.handleAsyncOperation(async () => {
                const response = await fetch('/api/metrics/realtime', {
                    headers: {
                        'X-API-Key': 'claude_api_secret_2024_change_me'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.updateMetrics(data);
                    this.lastUpdate = new Date();
                    this.isConnected = true;
                } else {
                    throw new Error(`Failed to fetch metrics: ${response.status}`);
                }
            }, {
                showLoading: false,
                errorMessage: 'Error al cargar métricas'
            });
        },

        updateMetrics(data) {
            // Actualizar métricas principales
            this.metrics = { ...this.metrics, ...data.metrics };
            
            // Actualizar datos históricos para gráficos
            if (data.historical) {
                this.updateHistoricalData(data.historical);
            }
            
            // Verificar alertas
            this.checkAlerts();
            
            // Actualizar gráficos
            if (this.showCharts && this.chartData) {
                this.updateCharts();
            }
        },

        updateHistoricalData(historical) {
            const maxPoints = 50; // Mantener solo los últimos 50 puntos
            
            if (historical.messages) {
                this.historicalData.messages.push(...historical.messages);
                if (this.historicalData.messages.length > maxPoints) {
                    this.historicalData.messages = this.historicalData.messages.slice(-maxPoints);
                }
            }
            
            if (historical.sessions) {
                this.historicalData.sessions.push(...historical.sessions);
                if (this.historicalData.sessions.length > maxPoints) {
                    this.historicalData.sessions = this.historicalData.sessions.slice(-maxPoints);
                }
            }
            
            if (historical.performance) {
                this.historicalData.performance.push(...historical.performance);
                if (this.historicalData.performance.length > maxPoints) {
                    this.historicalData.performance = this.historicalData.performance.slice(-maxPoints);
                }
            }
        },

        checkAlerts() {
            const newAlerts = [];
            const { system, performance } = this.metrics;
            
            // Check memory usage
            if (system.memory_usage > this.alertThresholds.high_memory) {
                newAlerts.push({
                    type: 'warning',
                    message: `High memory usage: ${system.memory_usage}%`,
                    timestamp: new Date()
                });
            }
            
            // Check CPU usage
            if (system.cpu_usage > this.alertThresholds.high_cpu) {
                newAlerts.push({
                    type: 'warning',
                    message: `High CPU usage: ${system.cpu_usage}%`,
                    timestamp: new Date()
                });
            }
            
            // Check error rate
            if (performance.error_rate > this.alertThresholds.high_error_rate) {
                newAlerts.push({
                    type: 'error',
                    message: `High error rate: ${performance.error_rate}%`,
                    timestamp: new Date()
                });
            }
            
            // Check cache hit rate
            if (performance.cache_hit_rate < this.alertThresholds.low_cache_hit_rate) {
                newAlerts.push({
                    type: 'info',
                    message: `Low cache hit rate: ${performance.cache_hit_rate}%`,
                    timestamp: new Date()
                });
            }
            
            // Actualizar alertas (mantener solo las últimas 10)
            this.alerts = [...newAlerts, ...this.alerts].slice(0, 10);
        },

        startAutoRefresh() {
            this.refreshTimer = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    this.fetchInitialMetrics();
                }
            }, this.refreshInterval);
        },

        stopAutoRefresh() {
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
        },

        handleVisibilityChange() {
            if (document.visibilityState === 'visible' && this.autoRefresh) {
                // Refrescar inmediatamente cuando la página vuelve a ser visible
                this.fetchInitialMetrics();
                if (!this.refreshTimer) {
                    this.startAutoRefresh();
                }
            } else {
                // Pausar actualizaciones cuando la página no es visible
                this.stopAutoRefresh();
            }
        },

        async initializeCharts() {
            // Simulación de inicialización de gráficos
            // En implementación real, usaría Chart.js o similar
            this.chartData = {
                labels: Array.from({ length: 20 }, (_, i) => 
                    new Date(Date.now() - (19 - i) * 60000).toLocaleTimeString()
                ),
                datasets: [
                    {
                        label: 'Messages/min',
                        data: this.historicalData.messages.slice(-20),
                        borderColor: 'rgb(59, 130, 246)',
                        tension: 0.1
                    },
                    {
                        label: 'Active Sessions',
                        data: this.historicalData.sessions.slice(-20),
                        borderColor: 'rgb(16, 185, 129)',
                        tension: 0.1
                    }
                ]
            };
        },

        updateCharts() {
            if (!this.chartData) return;
            
            // Actualizar labels de tiempo
            this.chartData.labels.push(new Date().toLocaleTimeString());
            this.chartData.labels = this.chartData.labels.slice(-20);
            
            // Actualizar datos
            this.chartData.datasets[0].data = this.historicalData.messages.slice(-20);
            this.chartData.datasets[1].data = this.historicalData.sessions.slice(-20);
        },

        formatNumber(num, options = {}) {
            return this.formatNumberHelper(num, options);
        },

        getMetricColor(value, thresholds) {
            if (value >= thresholds.critical) return 'text-red-600';
            if (value >= thresholds.warning) return 'text-yellow-600';
            return 'text-green-600';
        },

        getTrendIcon(trend) {
            switch (trend) {
                case 'increasing': return 'fa-arrow-up text-green-500';
                case 'decreasing': return 'fa-arrow-down text-red-500';
                default: return 'fa-minus text-gray-400';
            }
        },

        dismissAlert(index) {
            this.alerts.splice(index, 1);
        }
    },

    template: `
        <div class="real-time-metrics space-y-6">
            <!-- Header con estado de conexión -->
            <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Real-time Metrics
                </h3>
                <div class="flex items-center space-x-4">
                    <!-- Estado de conexión -->
                    <div :class="['flex items-center space-x-2', isConnected ? 'text-green-500' : 'text-red-500']">
                        <i :class="['fas fa-circle text-xs', isConnected ? 'animate-pulse' : '']"></i>
                        <span class="text-sm font-medium">{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
                    </div>
                    
                    <!-- Última actualización -->
                    <span v-if="lastUpdate" class="text-xs text-gray-500 dark:text-gray-400">
                        Updated {{ formatTimestamp(lastUpdate) }}
                    </span>
                </div>
            </div>

            <!-- Alertas activas -->
            <div v-if="alerts.length > 0" class="space-y-2">
                <div v-for="(alert, index) in alerts.slice(0, 3)" :key="index"
                     :class="['p-3 rounded-md border-l-4 flex items-center justify-between',
                             alert.type === 'error' ? 'bg-red-50 border-red-400 text-red-800' :
                             alert.type === 'warning' ? 'bg-yellow-50 border-yellow-400 text-yellow-800' :
                             'bg-blue-50 border-blue-400 text-blue-800']">
                    <div class="flex items-center space-x-2">
                        <i :class="['fas', 
                                   alert.type === 'error' ? 'fa-exclamation-triangle' :
                                   alert.type === 'warning' ? 'fa-exclamation-circle' :
                                   'fa-info-circle']"></i>
                        <span class="text-sm font-medium">{{ alert.message }}</span>
                    </div>
                    <button @click="dismissAlert(index)" 
                            class="text-xs opacity-60 hover:opacity-100">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- Grid de métricas principales -->
            <div :class="[compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', 
                         'grid gap-4']">
                
                <!-- Estado del sistema -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">System Health</p>
                            <p class="text-lg font-bold" :class="'text-' + systemHealthStatus.color + '-600'">
                                {{ systemHealthStatus.status.toUpperCase() }}
                            </p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">
                                Uptime: {{ uptimeFormatted }}
                            </p>
                        </div>
                        <div :class="['p-3 rounded-lg', 'bg-' + systemHealthStatus.color + '-100']">
                            <i :class="['fas', systemHealthStatus.icon, 'text-' + systemHealthStatus.color + '-600', 'text-xl']"></i>
                        </div>
                    </div>
                </div>

                <!-- Total de conversaciones -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Conversations</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {{ formatNumber(metrics.conversations.total) }}
                            </p>
                            <div class="flex items-center space-x-1 text-xs">
                                <span class="text-gray-500 dark:text-gray-400">Active:</span>
                                <span class="font-medium text-green-600">{{ metrics.conversations.active }}</span>
                            </div>
                        </div>
                        <div class="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <i class="fas fa-comments text-blue-600 dark:text-blue-400 text-xl"></i>
                        </div>
                    </div>
                </div>

                <!-- Mensajes -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Messages</p>
                            <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {{ formatNumber(metrics.messages.total) }}
                            </p>
                            <div class="flex items-center space-x-2 text-xs">
                                <span class="text-gray-500 dark:text-gray-400">Trend:</span>
                                <i :class="['fas', getTrendIcon(activityTrend)]"></i>
                                <span class="text-gray-500 dark:text-gray-400">{{ activityTrend }}</span>
                            </div>
                        </div>
                        <div class="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                            <i class="fas fa-envelope text-purple-600 dark:text-purple-400 text-xl"></i>
                        </div>
                    </div>
                </div>

                <!-- Performance -->
                <div class="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Performance</p>
                            <p class="text-lg font-bold text-gray-900 dark:text-gray-100">
                                {{ metrics.performance.avg_response_time }}ms
                            </p>
                            <div class="flex items-center space-x-2 text-xs">
                                <span class="text-green-600">{{ metrics.performance.cache_hit_rate }}% cache</span>
                                <span class="text-gray-400">•</span>
                                <span :class="getMetricColor(metrics.performance.error_rate, { warning: 2, critical: 5 })">
                                    {{ metrics.performance.error_rate }}% error
                                </span>
                            </div>
                        </div>
                        <div class="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                            <i class="fas fa-tachometer-alt text-green-600 dark:text-green-400 text-xl"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Métricas detalladas -->
            <div v-if="!compact" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                <!-- Métricas de sistema -->
                <div class="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">System Resources</h4>
                    
                    <!-- Memory Usage -->
                    <div class="mb-4">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Memory Usage</span>
                            <span class="text-sm font-bold" :class="getMetricColor(metrics.system.memory_usage, { warning: 70, critical: 85 })">
                                {{ metrics.system.memory_usage }}%
                            </span>
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div class="h-2 rounded-full transition-all duration-300"
                                 :class="metrics.system.memory_usage > 85 ? 'bg-red-500' : 
                                         metrics.system.memory_usage > 70 ? 'bg-yellow-500' : 'bg-green-500'"
                                 :style="{ width: metrics.system.memory_usage + '%' }"></div>
                        </div>
                    </div>
                    
                    <!-- CPU Usage -->
                    <div class="mb-4">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm font-medium text-gray-600 dark:text-gray-400">CPU Usage</span>
                            <span class="text-sm font-bold" :class="getMetricColor(metrics.system.cpu_usage, { warning: 70, critical: 85 })">
                                {{ metrics.system.cpu_usage }}%
                            </span>
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div class="h-2 rounded-full transition-all duration-300"
                                 :class="metrics.system.cpu_usage > 85 ? 'bg-red-500' : 
                                         metrics.system.cpu_usage > 70 ? 'bg-yellow-500' : 'bg-green-500'"
                                 :style="{ width: metrics.system.cpu_usage + '%' }"></div>
                        </div>
                    </div>
                    
                    <!-- Connections -->
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Active Connections</span>
                        <span class="text-sm font-bold text-gray-900 dark:text-gray-100">
                            {{ metrics.system.connections }}
                        </span>
                    </div>
                </div>
                
                <!-- Actividad reciente -->
                <div class="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Recent Activity</h4>
                    
                    <div class="space-y-4">
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600 dark:text-gray-400">Messages Today</span>
                            <span class="font-bold text-gray-900 dark:text-gray-100">
                                {{ formatNumber(metrics.messages.today) }}
                            </span>
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600 dark:text-gray-400">Messages Last Hour</span>
                            <span class="font-bold text-gray-900 dark:text-gray-100">
                                {{ formatNumber(metrics.messages.last_hour) }}
                            </span>
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600 dark:text-gray-400">Avg Messages/Session</span>
                            <span class="font-bold text-gray-900 dark:text-gray-100">
                                {{ formatNumber(metrics.messages.avg_per_session, { maximumFractionDigits: 1 }) }}
                            </span>
                        </div>
                        
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-gray-600 dark:text-gray-400">Active Projects Today</span>
                            <span class="font-bold text-gray-900 dark:text-gray-100">
                                {{ metrics.projects.active_today }}
                            </span>
                        </div>
                        
                        <div v-if="metrics.projects.most_active" class="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span class="text-sm text-gray-600 dark:text-gray-400">Most Active Project</span>
                            <p class="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {{ metrics.projects.most_active }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Gráfico placeholder (implementar con Chart.js en producción) -->
            <div v-if="showCharts && !compact" class="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Activity Trends</h4>
                <div class="h-64 flex items-center justify-center bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div class="text-center">
                        <i class="fas fa-chart-line text-4xl text-gray-400 mb-2"></i>
                        <p class="text-gray-500 dark:text-gray-400">Real-time charts</p>
                        <p class="text-sm text-gray-400 dark:text-gray-500">Implement with Chart.js</p>
                    </div>
                </div>
            </div>
        </div>
    `
};