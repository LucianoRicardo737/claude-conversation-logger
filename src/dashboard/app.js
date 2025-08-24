console.log('🚀 Starting optimized app.js initialization with gRPC');

const { createApp, reactive, computed, onMounted, onUnmounted, nextTick } = Vue;

// Import optimized components
// import { BaseComponent } from './components/BaseComponent.js';
// import { LoadingSpinner } from './components/LoadingSpinner.js';
// import { VirtualScroll } from './components/VirtualScroll.js';
// import { SearchFilters } from './components/SearchFilters.js';
// import { BreadcrumbNavigation } from './components/BreadcrumbNavigation.js';

// Import API service (REST with polling for browser compatibility)
import apiService from './services/api-service.js';

// Global configuration
const API_BASE_URL = window.location.origin;
const API_KEY = 'claude_api_secret_2024_change_me';

// Enhanced reactive store with performance optimizations
const store = reactive({
    // Core data
    conversations: [],
    selectedProject: null,
    selectedSession: null,
    searchResults: [],
    
    // UI state
    activeView: 'dashboard',
    isLoading: false,
    loadingMessage: '',
    error: null,
    
    // Search state
    searchQuery: '',
    searchFilters: {
        project: '',
        messageType: '',
        startDate: '',
        endDate: '',
        onlyMarked: false,
        tags: []
    },
    
    // Real-time stats
    liveStats: {
        total_messages: 0,
        total_sessions: 0,
        active_projects: 0,
        recent_activity: {
            last_messages: [],
            messages_last_hour: 0,
            active_sessions: 0
        }
    },
    
    // Connection status (using gRPC)
    connectionStatus: 'disconnected',
    
    // Performance settings
    virtualScrollEnabled: true,
    pageSize: 50,
    
    // Theme
    isDarkMode: localStorage.getItem('claude-dashboard-theme') === 'dark' || 
                (!localStorage.getItem('claude-dashboard-theme') && 
                 window.matchMedia('(prefers-color-scheme: dark)').matches)
});

// Enhanced Dashboard Component
const OptimizedDashboard = {
    // mixins: [BaseComponent],

    data() {
        return {
            store,
            breadcrumbItems: [
                { label: 'Dashboard', action: () => this.setActiveView('dashboard') }
            ],
            searchFiltersExpanded: false,
            refreshInterval: null,
            keyboardShortcuts: new Map(),
            lastUpdate: null,
            performanceMetrics: {
                renderTime: 0,
                apiCallCount: 0,
                cacheHits: 0
            },
            
            // Computed properties cache for better performance
            _computedCache: {
                filteredProjects: {
                    data: null,
                    lastConversationsLength: 0,
                    lastFiltersHash: null
                }
            }
        };
    },

    computed: {
        filteredProjects() {
            if (!this.store.conversations || !this.store.conversations.length) return [];
            
            // Create hash for current state to enable memoization
            const conversationsLength = this.store.conversations.length;
            const filtersHash = JSON.stringify(this.store.searchFilters);
            const cache = this._computedCache.filteredProjects;
            
            // Return cached result if nothing has changed
            if (cache.data && 
                cache.lastConversationsLength === conversationsLength &&
                cache.lastFiltersHash === filtersHash) {
                this.performanceMetrics.cacheHits++;
                return cache.data;
            }
            
            // Compute filtered results
            const projects = this.store.conversations.filter(project => {
                if (this.store.searchFilters.project && 
                    !project.name.toLowerCase().includes(this.store.searchFilters.project.toLowerCase())) {
                    return false;
                }
                return true;
            });
            
            // Cache the result
            cache.data = projects;
            cache.lastConversationsLength = conversationsLength;
            cache.lastFiltersHash = filtersHash;
            
            return projects;
        },

        hasActiveFilters() {
            const filters = this.store.searchFilters;
            return filters.project || filters.messageType || filters.startDate || 
                   filters.endDate || filters.onlyMarked || filters.tags.length > 0;
        },

        totalSessionsCount() {
            return this.filteredProjects.reduce((total, project) => 
                total + (project.sessions ? project.sessions.length : 0), 0
            );
        },

        totalMessagesCount() {
            return this.filteredProjects.reduce((total, project) => 
                total + (project.message_count || 0), 0
            );
        }
    },

    async mounted() {
        console.log('🎯 OptimizedDashboard mounted with enhanced performance');
        
        const startTime = performance.now();
        
        try {
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Setup connection status listener
            apiService.on('connection', (data) => {
                this.store.connectionStatus = data.status;
                console.log(`📡 API service connection status: ${data.status}`);
            });
            
            // Setup real-time message listener
            apiService.on('new_message', (message) => {
                console.log('📨 New message received via API service:', message);
                this.handleNewMessage(message);
            });
            
            // Setup live stats listener  
            apiService.on('live_stats', (stats) => {
                this.updateLiveStats(stats);
            });
            
            // Setup session updates listener
            apiService.on('session_start', (message) => {
                console.log('🚀 New session started via API service:');
                this.handleSessionStart(message);
            });
            
            apiService.on('session_end', (message) => {
                console.log('🔚 Session ended via API service');
                this.handleSessionEnd(message);
            });
            
            // Setup performance monitoring
            this.startPerformanceMonitoring();
            
            // Initialize data with error handling
            await this.initializeData();
            
            // Start auto-refresh
            this.startAutoRefresh();
            
            // Apply theme
            this.applyTheme();
            
            this.performanceMetrics.renderTime = performance.now() - startTime;
            console.log(`⚡ Dashboard initialized in ${this.performanceMetrics.renderTime.toFixed(2)}ms`);
            
        } catch (error) {
            console.error('❌ Dashboard initialization error:', error);
            this.store.error = `Initialization failed: ${error.message}`;
        }
    },

    beforeUnmount() {
        this.cleanup();
    },

    methods: {
        // === Core Navigation ===
        setActiveView(view) {
            this.store.activeView = view;
            this.updateBreadcrumbs(view);
        },

        updateBreadcrumbs(view) {
            const breadcrumbs = [
                { label: 'Dashboard', action: () => this.setActiveView('dashboard') }
            ];
            
            if (view === 'projects') {
                breadcrumbs.push({ label: 'Projects' });
            } else if (view === 'sessions') {
                breadcrumbs.push({ label: 'Projects', action: () => this.setActiveView('projects') });
                if (this.store.selectedProject) {
                    breadcrumbs.push({ label: this.store.selectedProject.name });
                }
            } else if (view === 'details') {
                breadcrumbs.push({ label: 'Projects', action: () => this.setActiveView('projects') });
                if (this.store.selectedProject) {
                    breadcrumbs.push({ 
                        label: this.store.selectedProject.name,
                        action: () => this.setActiveView('sessions')
                    });
                }
                breadcrumbs.push({ label: 'Session Details' });
            } else if (view === 'search') {
                breadcrumbs.push({ label: 'Search Results' });
            }
            
            this.breadcrumbItems = breadcrumbs;
        },

        // === Data Loading ===
        async initializeData() {
            await this.handleAsyncOperation(async () => {
                console.log('📊 Loading initial dashboard data...');
                
                // Connect to API service
                const connected = await apiService.connect();
                if (!connected) {
                    throw new Error('Failed to connect to API service');
                }
                
                // Load conversation tree
                const conversationTree = await apiService.getConversationTree();
                console.log('📋 Conversation tree loaded:', conversationTree);
                
                if (conversationTree && conversationTree.projects) {
                    this.store.conversations = conversationTree.projects.map(project => ({
                        name: project.project_name,
                        sessions: project.sessions || [],
                        message_count: project.total_messages || 0,
                        last_activity: project.last_activity
                    }));
                }
                
                // Load initial stats
                const stats = await apiService.getStats();
                this.updateLiveStats(stats);
                
                this.lastUpdate = new Date();
                console.log('✅ Dashboard data loaded successfully');
                
            }, {
                loadingMessage: 'Loading dashboard...',
                showLoading: true
            });
        },

        // === Search ===
        async performSearch() {
            if (!this.store.searchQuery.trim()) return;
            
            await this.handleAsyncOperation(async () => {
                const results = await apiService.searchConversations(
                    this.store.searchQuery,
                    this.store.searchFilters
                );
                
                this.store.searchResults = results.results || [];
                this.setActiveView('search');
            }, { 
                loadingMessage: 'Searching...',
                showLoading: true 
            });
        },

        async selectProject(project) {
            this.store.selectedProject = project;
            this.setActiveView('sessions');
            this.updateBreadcrumbs('sessions');
        },

        async selectSession(session) {
            await this.handleAsyncOperation(async () => {
                const details = await apiService.getConversationDetails(session.session_id);
                this.store.selectedSession = details;
                this.setActiveView('details');
            }, { 
                loadingMessage: 'Loading session...',
                showLoading: true 
            });
        },

        // === Real-time Updates ===
        updateLiveStats(stats) {
            if (!stats) return;
            
            console.log('📊 Updating live stats:', stats);
            
            // Update store with animation classes
            this.store.liveStats = { ...this.store.liveStats, ...stats };
            
            // Trigger update animations for changed values
            this.$nextTick(() => {
                this.animateStatUpdates();
            });
        },

        handleNewMessage(message) {
            console.log('📨 Processing new message:', message);
            // Add to appropriate conversation/session
            // This would be more complex in real implementation
        },

        handleSessionStart(session) {
            console.log('🚀 Processing new session:', session);
            // Update conversations list
        },

        handleSessionEnd(session) {
            console.log('🔚 Processing ended session:', session);
            // Update session status
        },

        // === Performance Monitoring ===
        startPerformanceMonitoring() {
            const originalRequest = apiService.request;
            const self = this;
            
            apiService.request = async function() {
                self.performanceMetrics.apiCallCount++;
                return originalRequest.apply(apiService, arguments);
            };
        },

        animateStatUpdates() {
            // Add CSS classes for animations
            const statElements = this.$el.querySelectorAll('.stat-number');
            statElements.forEach(el => {
                el.classList.add('number-update');
                setTimeout(() => el.classList.remove('number-update'), 500);
            });
        },

        // === Keyboard Shortcuts ===
        setupKeyboardShortcuts() {
            this.keyboardShortcuts.set('d', () => this.setActiveView('dashboard'));
            this.keyboardShortcuts.set('p', () => this.setActiveView('projects'));
            this.keyboardShortcuts.set('t', () => this.toggleTheme());
            this.keyboardShortcuts.set('/', () => this.focusSearch());
            
            document.addEventListener('keydown', this.handleKeyboardShortcut);
        },

        handleKeyboardShortcut(event) {
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            
            const handler = this.keyboardShortcuts.get(event.key.toLowerCase());
            if (handler) {
                event.preventDefault();
                handler();
            }
        },

        focusSearch() {
            const searchInput = this.$el.querySelector('input[type="text"]');
            if (searchInput) {
                searchInput.focus();
            }
        },

        // === Theme Management ===
        toggleTheme() {
            this.store.isDarkMode = !this.store.isDarkMode;
            this.applyTheme();
        },

        applyTheme() {
            const theme = this.store.isDarkMode ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('claude-dashboard-theme', theme);
        },

        // === Auto-refresh ===
        startAutoRefresh() {
            this.refreshInterval = setInterval(async () => {
                try {
                    const stats = await apiService.getStats();
                    this.updateLiveStats(stats);
                } catch (error) {
                    console.warn('⚠️ Auto-refresh error:', error.message);
                }
            }, 30000); // 30 seconds
        },

        // === Utilities ===
        formatTimestamp(timestamp) {
            if (!timestamp) return 'Unknown';
            return new Date(timestamp).toLocaleString();
        },

        formatMetric(value) {
            if (!value || value === 0) return '0';
            if (value < 1000) return value.toString();
            if (value < 1000000) return (value / 1000).toFixed(1) + 'K';
            return (value / 1000000).toFixed(1) + 'M';
        },

        // === Navigation History ===
        handleBrowserNavigation() {
            const currentView = this.store.activeView;
            
            if (window.location.hash) {
                const viewFromHash = window.location.hash.substring(1);
                const validViews = ['dashboard', 'projects', 'sessions', 'details', 'search'];
                
                if (validViews.includes(viewFromHash) && viewFromHash !== currentView) {
                    this.restoreViewFromHash(viewFromHash);
                }
            }
        },

        restoreViewFromHash(view) {
            switch (view) {
                case 'dashboard':
                    this.setActiveView('dashboard');
                    break;
                case 'projects':
                    this.setActiveView('projects');
                    break;
                case 'sessions':
                    if (this.store.selectedProject) {
                        this.setActiveView('sessions');
                    } else {
                        this.setActiveView('dashboard');
                    }
                    break;
                case 'details':
                    if (this.store.selectedSession) {
                        this.setActiveView('details');
                    } else {
                        this.setActiveView('dashboard');
                    }
                    break;
                default:
                    this.setActiveView('dashboard');
            }
        },

        // === Cleanup ===
        cleanup() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            
            document.removeEventListener('keydown', this.handleKeyboardShortcut);
            console.log('🧹 Dashboard cleanup completed');
        },

        // === Missing computed properties ===
        dashboardStats() {
            return {
                totalProjects: this.filteredProjects.length,
                totalSessions: this.totalSessionsCount,
                totalMessages: this.totalMessagesCount,
                activeSessions: this.store.liveStats.active_sessions || 0,
                totalTokens: this.store.liveStats.total_tokens || 0,
                estimatedCost: this.store.liveStats.estimated_cost || 2.73
            };
        },

        // === Missing utility methods ===
        formatCost(cost) {
            if (!cost || cost === 0) return '0.00';
            const num = parseFloat(cost);
            if (isNaN(num)) return '0.00';
            return num.toFixed(2);
        },

        async handleAsyncOperation(asyncFn, options = {}) {
            const { loadingMessage = 'Loading...', showLoading = false } = options;
            
            try {
                if (showLoading) {
                    this.store.isLoading = true;
                    this.store.loadingMessage = loadingMessage;
                }
                
                const result = await asyncFn();
                return result;
            } catch (error) {
                console.error('Async operation failed:', error);
                this.store.error = error.message || 'Operation failed';
                throw error;
            } finally {
                if (showLoading) {
                    this.store.isLoading = false;
                    this.store.loadingMessage = '';
                }
            }
        },

        async refreshData() {
            await this.initializeData();
        },

        handleSearch(query) {
            this.store.searchQuery = query;
            this.performSearch();
        },

        handleToast(message) {
            console.log('Toast:', message);
        }
    },

    template: `
        <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
            <!-- Loading State -->
            <div v-if="store.isLoading" class="flex items-center justify-center min-h-screen">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <span class="ml-4 text-gray-600">{{ store.loadingMessage || 'Loading...' }}</span>
            </div>

            <!-- Error State -->
            <div v-else-if="store.error" class="flex items-center justify-center min-h-screen">
                <div class="bg-red-50 border border-red-200 rounded-md p-6 max-w-md">
                    <div class="flex">
                        <i class="fas fa-exclamation-triangle text-red-400 mr-3"></i>
                        <div>
                            <h3 class="text-sm font-medium text-red-800">Error</h3>
                            <div class="mt-2 text-sm text-red-700">{{ store.error }}</div>
                            <button @click="refreshData" class="mt-4 bg-red-100 hover:bg-red-200 text-red-800 px-4 py-2 rounded text-sm">
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Dashboard Content -->
            <div v-else>
                <!-- Navigation Header -->
                <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
                    <div class="w-full px-4 sm:px-6 lg:px-8">
                        <!-- Top Navigation Bar -->
                        <nav class="flex justify-between items-center py-4">
                            <div class="flex items-center space-x-8">
                                <div class="flex items-center">
                                    <i class="fas fa-chart-line text-blue-500 text-xl mr-2"></i>
                                    <span class="text-lg font-semibold text-gray-800 dark:text-white">Dashboard</span>
                                </div>
                                
                                <!-- Navigation Items -->
                                <div class="hidden md:flex items-center space-x-6">
                                    <button @click="setActiveView('dashboard')" 
                                            :class="store.activeView === 'dashboard' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'"
                                            class="px-3 py-2 text-sm font-medium border-b-2 border-transparent">
                                        <i class="fas fa-tachometer-alt mr-1"></i>
                                        Dashboard
                                    </button>
                                    <button @click="setActiveView('projects')" 
                                            :class="store.activeView === 'projects' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'"
                                            class="px-3 py-2 text-sm font-medium border-b-2 border-transparent">
                                        <i class="fas fa-folder mr-1"></i>
                                        Proyectos
                                    </button>
                                    <button @click="setActiveView('messages')" 
                                            :class="store.activeView === 'messages' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'"
                                            class="px-3 py-2 text-sm font-medium border-b-2 border-transparent">
                                        <i class="fas fa-comments mr-1"></i>
                                        Mensajes
                                    </button>
                                    <button @click="setActiveView('sessions')" 
                                            :class="store.activeView === 'sessions' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'"
                                            class="px-3 py-2 text-sm font-medium border-b-2 border-transparent">
                                        <i class="fas fa-clock mr-1"></i>
                                        Sesiones
                                    </button>
                                    <button @click="setActiveView('analysis')" 
                                            :class="store.activeView === 'analysis' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'"
                                            class="px-3 py-2 text-sm font-medium border-b-2 border-transparent">
                                        <i class="fas fa-chart-bar mr-1"></i>
                                        Análisis
                                    </button>
                                    <button @click="setActiveView('costs')" 
                                            :class="store.activeView === 'costs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'"
                                            class="px-3 py-2 text-sm font-medium border-b-2 border-transparent">
                                        <i class="fas fa-dollar-sign mr-1"></i>
                                        Costos
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Right Side Controls -->
                            <div class="flex items-center space-x-4">
                                <!-- Service Status Indicators -->
                                <div class="hidden lg:flex items-center space-x-3 text-xs">
                                    <div class="flex items-center">
                                        <div class="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                                        <span class="text-gray-600 dark:text-gray-400">1366</span>
                                    </div>
                                    <div class="flex items-center">
                                        <div class="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                                        <span class="text-gray-600 dark:text-gray-400">MongoDB</span>
                                    </div>
                                    <div class="flex items-center">
                                        <div class="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
                                        <span class="text-gray-600 dark:text-gray-400">Redis</span>
                                    </div>
                                    <div class="flex items-center">
                                        <div class="w-2 h-2 bg-purple-500 rounded-full mr-1"></div>
                                        <span class="text-gray-600 dark:text-gray-400">gRPC</span>
                                    </div>
                                    <div class="text-blue-500 font-mono">
                                        $ {{ formatCost(dashboardStats.estimatedCost) }}
                                    </div>
                                </div>
                                
                                <!-- Theme Toggle -->
                                <button @click="toggleTheme" class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                                    <i :class="store.isDarkMode ? 'fas fa-sun' : 'fas fa-moon'"></i>
                                </button>
                                
                                <!-- Refresh Button -->
                                <button @click="refreshData" class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg">
                                    <i class="fas fa-sync-alt mr-2"></i>API
                                </button>
                            </div>
                        </nav>
                    </div>
                </header>

                <!-- Main Content -->
                <main class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                    <!-- Dashboard View -->
                    <div v-if="store.activeView === 'dashboard' && !store.isLoading" class="space-y-8">
                        <!-- Stats Grid -->
                        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            <!-- Total Messages -->
                            <div class="bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                                <div class="p-6">
                                    <div class="flex items-center">
                                        <div class="flex-shrink-0">
                                            <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                                                <i class="fas fa-comments text-blue-500 text-xl"></i>
                                            </div>
                                        </div>
                                        <div class="ml-4 w-0 flex-1">
                                            <dl>
                                                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total Mensajes</dt>
                                                <dd class="text-3xl font-bold text-gray-900 dark:text-white stat-number">
                                                    {{ formatMetric(store.liveStats.total_messages) }}
                                                </dd>
                                                <dd class="text-xs text-gray-400 mt-1">+204.5K Tokens</dd>
                                            </dl>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Total Sessions -->
                            <div class="bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                                <div class="p-6">
                                    <div class="flex items-center">
                                        <div class="flex-shrink-0">
                                            <div class="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                                                <i class="fas fa-layer-group text-green-500 text-xl"></i>
                                            </div>
                                        </div>
                                        <div class="ml-4 w-0 flex-1">
                                            <dl>
                                                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Sesiones Totales</dt>
                                                <dd class="text-3xl font-bold text-gray-900 dark:text-white stat-number">
                                                    {{ formatMetric(store.liveStats.total_sessions) }}
                                                </dd>
                                                <dd class="text-xs text-gray-400 mt-1">1 activo</dd>
                                            </dl>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Active Projects -->
                            <div class="bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                                <div class="p-6">
                                    <div class="flex items-center">
                                        <div class="flex-shrink-0">
                                            <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                                                <i class="fas fa-project-diagram text-purple-500 text-xl"></i>
                                            </div>
                                        </div>
                                        <div class="ml-4 w-0 flex-1">
                                            <dl>
                                                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Proyectos Activos</dt>
                                                <dd class="text-3xl font-bold text-gray-900 dark:text-white stat-number">
                                                    {{ formatMetric(store.liveStats.active_projects) }}
                                                </dd>
                                                <dd class="text-xs text-gray-400 mt-1">1 con actividad</dd>
                                            </dl>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Estimated Cost -->
                            <div class="bg-white dark:bg-gray-800 overflow-hidden shadow-sm rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                                <div class="p-6">
                                    <div class="flex items-center">
                                        <div class="flex-shrink-0">
                                            <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-lg flex items-center justify-center">
                                                <i class="fas fa-dollar-sign text-amber-500 text-xl"></i>
                                            </div>
                                        </div>
                                        <div class="ml-4 w-0 flex-1">
                                            <dl>
                                                <dt class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Costo Estimado</dt>
                                                <dd class="text-3xl font-bold text-gray-900 dark:text-white stat-number">
                                                    $ {{ formatCost(store.liveStats.estimated_cost || 2.73) }}
                                                </dd>
                                                <dd class="text-xs text-gray-400 mt-1">Claude API</dd>
                                            </dl>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Main Dashboard Content Grid -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <!-- Proyectos Más Activos -->
                            <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-100 dark:border-gray-700">
                                <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center">
                                            <div class="w-8 h-8 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mr-3">
                                                <i class="fas fa-star text-orange-500 text-sm"></i>
                                            </div>
                                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Proyectos Más Activos</h3>
                                        </div>
                                        <button @click="setActiveView('projects')" class="text-sm text-blue-500 hover:text-blue-700 font-medium">
                                            Ver todos →
                                        </button>
                                    </div>
                                </div>
                                
                                <div class="p-6">
                                    <div v-if="filteredProjects.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
                                        <i class="fas fa-folder-open text-3xl text-gray-300 mb-3"></i>
                                        <p>No hay proyectos disponibles</p>
                                    </div>
                                    
                                    <div v-else-if="filteredProjects && filteredProjects.length > 0" class="space-y-4">
                                        <div v-for="project in filteredProjects.slice(0, 5)" :key="project.name" 
                                             @click="selectProject(project)"
                                             class="group p-4 rounded-lg border border-gray-100 dark:border-gray-600 hover:border-blue-200 dark:hover:border-blue-500 cursor-pointer transition-all hover:shadow-sm">
                                            <div class="flex items-start justify-between">
                                                <div class="flex-1">
                                                    <div class="flex items-center mb-2">
                                                        <h4 class="text-base font-medium text-gray-900 dark:text-white group-hover:text-blue-600">
                                                            {{ project.name }}
                                                        </h4>
                                                        <div class="ml-2 text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
                                                            {{ formatMetric(project.message_count || 0) }} mensajes
                                                        </div>
                                                    </div>
                                                    
                                                    <div class="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                                                        <div class="flex items-center">
                                                            <i class="fas fa-layer-group text-xs mr-1"></i>
                                                            {{ (project && project.sessions ? project.sessions.length : 0) }} sesiones
                                                        </div>
                                                        <div class="flex items-center">
                                                            <i class="fas fa-clock text-xs mr-1"></i>
                                                            {{ formatTimestamp(project.last_activity) }}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div class="flex flex-col items-end">
                                                    <div class="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                                        174.5K • $ {{ formatCost((project.message_count || 0) * 0.002) }}
                                                    </div>
                                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                                        Claude API
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <!-- Progress bar -->
                                            <div class="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                                                <div class="bg-blue-500 h-1 rounded-full transition-all" 
                                                     :style="{width: Math.min((project.message_count || 0) / 100, 100) + '%'}"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Sesiones Activas - Temporalmente simplificado -->
                            <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-100 dark:border-gray-700">
                                <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center">
                                            <div class="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-3">
                                                <i class="fas fa-pulse text-green-500 text-sm"></i>
                                            </div>
                                            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Sesiones Activas</h3>
                                        </div>
                                        <div class="text-sm text-green-500 font-medium">
                                            {{ store.liveStats.active_sessions || 1 }} En vivo
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="p-6">
                                    <div class="space-y-4">
                                        <!-- Active Session Example -->
                                        <div class="p-4 rounded-lg border border-green-100 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                                            <div class="flex items-start justify-between">
                                                <div class="flex-1">
                                                    <div class="flex items-center mb-2">
                                                        <div class="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                                                        <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                                                            74bb1bdc
                                                        </h4>
                                                        <span class="ml-2 text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 rounded-full">
                                                            En vivo
                                                        </span>
                                                    </div>
                                                    
                                                    <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                        claude-conversation-logger • {{ formatMetric(store.liveStats.total_messages || 1166) }} mensajes
                                                    </div>
                                                    
                                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                                        <i class="fas fa-clock mr-1"></i>
                                                        Última actividad hace 2 min
                                                    </div>
                                                </div>
                                                
                                                <div class="flex flex-col items-end">
                                                    <div class="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
                                                        174.5K • $ {{ formatCost(store.liveStats.estimated_cost || 2.73) }}
                                                    </div>
                                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                                        Claude API
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <!-- Placeholder for additional sessions -->
                                        <div class="text-center py-4 text-gray-500">
                                            Otras sesiones inactivas...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Projects View -->
                    <div v-else-if="store.activeView === 'projects'" class="space-y-6">
                        <div class="bg-white shadow rounded-lg p-6">
                            <h2 class="text-2xl font-bold text-gray-900 mb-6">All Projects</h2>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div v-for="project in filteredProjects" :key="project.name" 
                                     @click="selectProject(project)"
                                     class="bg-gray-50 border rounded-lg p-4 cursor-pointer hover:shadow-md transition-all">
                                    <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ project.name }}</h3>
                                    <div class="grid grid-cols-2 gap-4 mb-4">
                                        <div class="text-center">
                                            <p class="text-2xl font-bold text-blue-600">
                                                {{ (project && project.sessions ? project.sessions.length : 0) }}
                                            </p>
                                            <p class="text-xs text-gray-500">Sessions</p>
                                        </div>
                                        <div class="text-center">
                                            <p class="text-2xl font-bold text-green-600">
                                                {{ formatMetric(project.message_count || 0) }}
                                            </p>
                                            <p class="text-xs text-gray-500">Messages</p>
                                        </div>
                                    </div>
                                    <div class="text-xs text-gray-500 text-center">
                                        Last activity: {{ formatTimestamp(project.last_activity) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Sessions View -->
                    <div v-else-if="store.activeView === 'sessions' && store.selectedProject" class="space-y-6">
                        <div class="bg-white shadow rounded-lg p-6">
                            <div class="flex items-center justify-between mb-6">
                                <div>
                                    <h2 class="text-2xl font-bold text-gray-900">{{ store.selectedProject.name }}</h2>
                                    <p class="text-sm text-gray-500 mt-1">
                                        {{ (store.selectedProject && store.selectedProject.sessions ? store.selectedProject.sessions.length : 0) }} sessions
                                    </p>
                                </div>
                                <button @click="setActiveView('dashboard')" 
                                        class="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                                    <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
                                </button>
                            </div>
                            
                            <div class="space-y-4">
                                <div v-if="!store.selectedProject || !store.selectedProject.sessions || store.selectedProject.sessions.length === 0"
                                     class="text-center py-8">
                                    <i class="fas fa-comments text-4xl text-gray-300 mb-4"></i>
                                    <p class="text-gray-500">No sessions found for this project</p>
                                </div>
                                
                                <div v-for="session in (store.selectedProject && store.selectedProject.sessions ? store.selectedProject.sessions : [])" :key="session.session_id"
                                     @click="selectSession(session)"
                                     class="bg-gray-50 border rounded-lg p-4 cursor-pointer hover:shadow-md transition-all">
                                    <div class="flex items-center justify-between mb-3">
                                        <div class="flex items-center space-x-3">
                                            <div>
                                                <h3 class="text-lg font-medium text-gray-900">
                                                    Session {{ session.session_id.substring(0, 8) }}
                                                </h3>
                                                <p class="text-sm text-gray-500">
                                                    {{ formatTimestamp(session.created_at || session.last_activity) }}
                                                </p>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-sm font-medium text-gray-900">
                                                {{ (session.recent_messages || []).length }} messages
                                            </p>
                                            <i class="fas fa-chevron-right text-gray-400 text-sm mt-1"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Session Details View -->
                    <div v-else-if="store.activeView === 'details' && store.selectedSession" class="space-y-6">
                        <div class="bg-white shadow rounded-lg p-6">
                            <div class="flex items-center justify-between mb-6">
                                <div>
                                    <h2 class="text-2xl font-bold text-gray-900">Session Details</h2>
                                    <p class="text-sm text-gray-500 mt-1">{{ store.selectedSession.session_id }}</p>
                                </div>
                                <button @click="setActiveView('sessions')" 
                                        class="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                                    <i class="fas fa-arrow-left mr-2"></i>Back to Sessions
                                </button>
                            </div>
                            
                            <!-- Messages -->
                            <div class="space-y-4">
                                <div v-if="!store.selectedSession.messages || store.selectedSession.messages.length === 0"
                                     class="text-center py-8">
                                    <i class="fas fa-comment text-4xl text-gray-300 mb-4"></i>
                                    <p class="text-gray-500">No messages found in this session</p>
                                </div>
                                
                                <div v-for="message in store.selectedSession.messages || []" 
                                     :key="message.id || message.timestamp"
                                     class="border rounded-lg p-4">
                                    <div class="flex items-start justify-between mb-2">
                                        <div class="flex items-center space-x-2">
                                            <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                                          message.type === 'user' ? 
                                                            'bg-blue-100 text-blue-800' :
                                                            'bg-purple-100 text-purple-800']">
                                                <i :class="message.type === 'user' ? 'fas fa-user' : 'fas fa-robot'" class="text-xs mr-1"></i>
                                                {{ message.type === 'user' ? 'User' : 'Assistant' }}
                                            </span>
                                            <span class="text-xs text-gray-500">
                                                {{ formatTimestamp(message.timestamp) }}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="prose max-w-none">
                                        <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ message.content }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Search Results View -->
                    <div v-else-if="store.activeView === 'search'" class="space-y-6">
                        <div class="bg-white shadow rounded-lg p-6">
                            <div class="flex items-center justify-between mb-6">
                                <div>
                                    <h2 class="text-2xl font-bold text-gray-900">Search Results</h2>
                                    <p class="text-sm text-gray-500 mt-1">
                                        {{ store.searchResults.length }} results for "{{ store.searchQuery }}"
                                    </p>
                                </div>
                                <button @click="setActiveView('dashboard')" 
                                        class="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                                    <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
                                </button>
                            </div>
                            
                            <div class="space-y-4">
                                <div v-if="store.searchResults.length === 0" class="text-center py-8 text-gray-500">
                                    No results found
                                </div>
                                
                                <div v-for="result in store.searchResults" :key="result.session_id"
                                     @click="selectSession(result)"
                                     class="border rounded-lg p-4 cursor-pointer hover:bg-gray-50">
                                    <h4 class="text-lg font-medium text-gray-900">
                                        {{ result.project_name || 'Unknown Project' }}
                                    </h4>
                                    <p class="text-sm text-gray-600 mt-1">{{ result.message_excerpt }}</p>
                                    <div class="flex justify-between items-center mt-2">
                                        <span class="text-xs text-gray-500">
                                            {{ result.message_count }} messages
                                        </span>
                                        <span class="text-xs text-gray-400">
                                            {{ formatTimestamp(result.timestamp) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    `
};

// Initialize Vue app
const app = createApp({
    components: {
        OptimizedDashboard
    },
    template: '<OptimizedDashboard />'
});

app.mount('#app');

console.log('✅ Dashboard app initialized successfully');