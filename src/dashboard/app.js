console.log('🚀 Starting optimized app.js initialization with gRPC');

const { createApp, reactive, computed, onMounted, onUnmounted, nextTick } = Vue;

// Import optimized components
import { BaseComponent } from './components/BaseComponent.js';
import { LoadingSpinner } from './components/LoadingSpinner.js';
import { VirtualScroll } from './components/VirtualScroll.js';
import { SearchFilters } from './components/SearchFilters.js';
import { BreadcrumbNavigation } from './components/BreadcrumbNavigation.js';

// Import gRPC service instead of WebSocket
import grpcService from './services/grpc-service.js';

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

// Enhanced API service with caching and retry logic
class OptimizedApiService {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
        this.requestQueue = new Map();
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    async request(endpoint, options = {}) {
        const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
        
        // Check cache for GET requests
        if (!options.method || options.method === 'GET') {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                console.log(`📦 Cache hit for ${endpoint}`);
                return cached;
            }
        }

        // Prevent duplicate requests
        if (this.requestQueue.has(cacheKey)) {
            console.log(`⏳ Waiting for ongoing request ${endpoint}`);
            return this.requestQueue.get(cacheKey);
        }

        const requestPromise = this.executeRequest(endpoint, options);
        this.requestQueue.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            
            // Cache successful GET requests
            if (!options.method || options.method === 'GET') {
                this.setCache(cacheKey, result);
            }
            
            return result;
        } catch (error) {
            throw error;
        } finally {
            this.requestQueue.delete(cacheKey);
        }
    }

    async executeRequest(endpoint, options = {}) {
        const url = `${API_BASE_URL}/api/${endpoint}`;
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'X-API-Key': API_KEY,
                        'Content-Type': 'application/json',
                        ...options.headers,
                    },
                    ...options,
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                console.error(`❌ Request failed (attempt ${attempt}/${this.retryAttempts}):`, error);
                
                if (attempt === this.retryAttempts) {
                    throw error;
                }
                
                // Exponential backoff
                await new Promise(resolve => 
                    setTimeout(resolve, this.retryDelay * Math.pow(2, attempt - 1))
                );
            }
        }
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() > cached.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.cacheTTL
        });
    }

    clearCache() {
        this.cache.clear();
    }

    // API methods with enhanced error handling
    async getConversationTree(filters = {}) {
        console.log('📡 Fetching conversation tree...');
        const params = new URLSearchParams(filters).toString();
        const endpoint = `conversations/tree${params ? `?${params}` : ''}`;
        return this.request(endpoint);
    }

    async getConversationDetails(sessionId) {
        return this.request(`conversations/${sessionId}`);
    }

    async searchConversations(query, filters = {}) {
        const params = new URLSearchParams();
        if (query) params.append('q', query);
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== '' && value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(v => params.append(key, v));
                } else {
                    params.append(key, value.toString());
                }
            }
        });
        
        return this.request(`search/advanced?${params.toString()}`);
    }

    async markConversation(sessionId, isMarked, note = '', tags = []) {
        return this.request(`conversations/${sessionId}/mark`, {
            method: 'POST',
            body: JSON.stringify({
                is_marked: isMarked,
                note,
                tags
            })
        });
    }

    async exportConversation(sessionId, format = 'json') {
        const params = new URLSearchParams({ format }).toString();
        const response = await fetch(`${API_BASE_URL}/api/conversations/${sessionId}/export?${params}`, {
            headers: { 'X-API-Key': API_KEY }
        });
        
        if (!response.ok) {
            throw new Error(`Export failed: ${response.status} ${response.statusText}`);
        }
        
        if (format === 'json') {
            return response.json();
        } else {
            return {
                content: await response.text(),
                filename: `conversation_${sessionId.substring(0, 8)}.${format}`,
                mime_type: format === 'markdown' ? 'text/markdown' : 'text/plain'
            };
        }
    }

    async getSystemStats() {
        return this.request('stats');
    }
}

// Initialize API service
const apiService = new OptimizedApiService();

// Enhanced Dashboard Component
const OptimizedDashboard = {
    mixins: [BaseComponent],

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
            if (!this.store.conversations?.length) return [];
            
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
            
            // Compute new result
            const filtered = this.store.conversations
                .filter(project => {
                    if (!this.store.searchFilters.project) return true;
                    return project.name.toLowerCase().includes(
                        this.store.searchFilters.project.toLowerCase()
                    );
                })
                .sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
            
            // Cache the result
            cache.data = filtered;
            cache.lastConversationsLength = conversationsLength;
            cache.lastFiltersHash = filtersHash;
            
            return filtered;
        },

        activeProjects() {
            return this.filteredProjects.filter(project => 
                project.sessions?.some(session => session.is_active)
            );
        },

        recentSessions() {
            const sessions = [];
            this.store.conversations?.forEach(project => {
                project.sessions?.forEach(session => {
                    sessions.push({
                        ...session,
                        project_name: project.name
                    });
                });
            });
            
            return sessions
                .sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity))
                .slice(0, 10);
        },

        dashboardStats() {
            const conversations = this.store.conversations || [];
            const totalSessions = conversations.reduce((sum, p) => sum + (p.sessions?.length || 0), 0);
            const totalMessages = conversations.reduce((sum, p) => sum + (p.message_count || 0), 0);
            const activeSessions = conversations.reduce((sum, p) => 
                sum + (p.sessions?.filter(s => s.is_active)?.length || 0), 0
            );

            return {
                totalProjects: conversations.length,
                totalSessions,
                totalMessages,
                activeSessions
            };
        }
    },

    async mounted() {
        console.log('🎯 Optimized Dashboard mounted with gRPC');
        
        // Apply theme
        this.applyTheme();
        
        // Initialize keyboard shortcuts
        this.initializeKeyboardShortcuts();
        
        // Initialize gRPC connection and event listeners
        this.initializeGrpcConnection();
        
        // Load initial data
        await this.loadInitialData();
        
        // Setup auto-refresh
        this.setupAutoRefresh();
        
        // Setup performance monitoring
        this.startPerformanceMonitoring();
    },

    beforeUnmount() {
        // Cleanup gRPC connection
        grpcService.disconnect();
        
        // Cleanup intervals
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.removeKeyboardShortcuts();
        apiService.clearCache();
    },

    methods: {
        /**
         * Smart merge of conversation data to prevent flickering
         */
        mergeConversationData(newProjects) {
            if (!newProjects || !Array.isArray(newProjects)) {
                return;
            }

            // If no existing data, just set it with smooth transitions
            if (!this.store.conversations || this.store.conversations.length === 0) {
                this.store.conversations = newProjects;
                // Add GPU acceleration for smooth rendering
                nextTick(() => {
                    document.querySelectorAll('.project-card').forEach(el => {
                        el.classList.add('gpu-accelerated');
                    });
                });
                return;
            }

            const existingProjects = new Map();
            this.store.conversations.forEach((project, index) => {
                existingProjects.set(project.name, { project, index });
            });

            const updatedProjects = [];
            
            newProjects.forEach(newProject => {
                const existing = existingProjects.get(newProject.name);
                
                if (existing) {
                    // Merge existing project with new data
                    const mergedProject = this.mergeProject(existing.project, newProject);
                    updatedProjects.push(mergedProject);
                    existingProjects.delete(newProject.name);
                } else {
                    // New project - add it
                    updatedProjects.push(newProject);
                }
            });

            // Sort by last activity (most recent first)
            updatedProjects.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));

            // Update store without replacing the entire array reference
            this.store.conversations.splice(0, this.store.conversations.length, ...updatedProjects);
        },

        /**
         * Merge individual project data intelligently
         */
        mergeProject(existing, newData) {
            // If no significant changes, return existing reference to prevent re-render
            if (existing.message_count === newData.message_count &&
                existing.last_activity === newData.last_activity &&
                existing.sessions?.length === newData.sessions?.length) {
                return existing;
            }

            // Merge sessions intelligently
            const mergedSessions = this.mergeSessions(existing.sessions || [], newData.sessions || []);

            return {
                ...existing,
                message_count: newData.message_count,
                last_activity: newData.last_activity,
                sessions: mergedSessions
            };
        },

        /**
         * Merge sessions to preserve UI state (expanded/collapsed, etc.)
         */
        mergeSessions(existingSessions, newSessions) {
            const sessionMap = new Map();
            existingSessions.forEach(session => {
                sessionMap.set(session.session_id, session);
            });

            const merged = [];
            newSessions.forEach(newSession => {
                const existing = sessionMap.get(newSession.session_id);
                
                if (existing) {
                    // Preserve UI state while updating data
                    merged.push({
                        ...existing,
                        message_count: newSession.message_count,
                        last_activity: newSession.last_activity,
                        is_active: newSession.is_active,
                        recent_messages: newSession.recent_messages || existing.recent_messages
                    });
                } else {
                    // New session
                    merged.push(newSession);
                }
            });

            return merged.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
        },

        async loadInitialData() {
            await this.handleAsyncOperation(async () => {
                console.log('📊 Loading dashboard data...');
                
                const startTime = performance.now();
                
                // Load conversation tree and stats in parallel
                const [conversationData, statsData] = await Promise.all([
                    apiService.getConversationTree({ limit: 50, hours_back: 48 }),
                    apiService.getSystemStats()
                ]);
                
                // Use smart merge instead of replacing entire array
                this.mergeConversationData(conversationData.projects);
                this.store.liveStats = {
                    total_messages: statsData.total_messages || 0,
                    total_sessions: conversationData.total_sessions || 0,
                    active_projects: statsData.projects || 0,
                    recent_activity: statsData.recent_activity || {}
                };
                
                this.performanceMetrics.renderTime = performance.now() - startTime;
                this.lastUpdate = new Date();
                
                console.log(`✅ Dashboard loaded in ${this.performanceMetrics.renderTime.toFixed(2)}ms`);
            }, { 
                loadingMessage: 'Loading dashboard...',
                showLoading: true 
            });
        },

        initializeGrpcConnection() {
            console.log('🔗 Initializing gRPC connection...');
            
            // Setup connection status listener
            grpcService.on('connection', (data) => {
                this.store.connectionStatus = data.status;
                console.log(`📡 gRPC connection status: ${data.status}`);
                
                if (data.status === 'connected') {
                    console.log('✅ gRPC connected successfully');
                } else if (data.status === 'error') {
                    console.error('❌ gRPC connection error');
                }
            });
            
            // Setup real-time message listener
            grpcService.on('new_message', (message) => {
                console.log('📨 New message received via gRPC:', message);
                this.handleNewMessage(message);
            });
            
            // Setup live stats listener  
            grpcService.on('live_stats', (stats) => {
                this.updateLiveStats(stats);
            });
            
            // Setup session updates listener
            grpcService.on('session_start', (message) => {
                console.log('🚀 New session started via gRPC');
                this.handleSessionStart(message);
            });
            
            grpcService.on('session_end', (message) => {
                console.log('🔚 Session ended via gRPC');
                this.handleSessionEnd(message);
            });
            
            // Update connection status
            this.store.connectionStatus = grpcService.getConnectionStatus();
        },

        handleNewMessage(message) {
            // Update conversation data with new message using optimized approach
            if (message && message.session_id) {
                let updated = false;
                
                // Find and update the relevant conversation without causing reactive updates
                for (let i = 0; i < this.store.conversations.length; i++) {
                    const project = this.store.conversations[i];
                    if (project.sessions) {
                        for (let j = 0; j < project.sessions.length; j++) {
                            const session = project.sessions[j];
                            if (session.session_id === message.session_id) {
                                // Update session data in place
                                session.message_count = (session.message_count || 0) + 1;
                                session.last_activity = Date.now();
                                session.is_active = true;
                                
                                // Add to recent messages (keep only last 3)
                                if (!session.recent_messages) {
                                    session.recent_messages = [];
                                }
                                session.recent_messages.push(message);
                                session.recent_messages = session.recent_messages.slice(-3);
                                
                                // Update project last activity and message count
                                project.last_activity = Date.now();
                                project.message_count = (project.message_count || 0) + 1;
                                
                                updated = true;
                                break;
                            }
                        }
                    }
                    if (updated) break;
                }
                
                // Update live stats efficiently
                this.store.liveStats.total_messages++;
                if (this.store.liveStats.recent_activity) {
                    this.store.liveStats.recent_activity.messages_last_hour++;
                }
            }
        },

        handleSessionStart(message) {
            // Add new session to conversations if needed
            if (message && message.session_id && message.project_name) {
                let project = this.store.conversations.find(p => p.name === message.project_name);
                
                if (!project) {
                    // Create new project
                    project = {
                        name: message.project_name,
                        message_count: 0,
                        sessions: [],
                        last_activity: Date.now()
                    };
                    this.store.conversations.push(project);
                }
                
                // Add new session
                const newSession = {
                    session_id: message.session_id,
                    short_id: message.session_id.substring(0, 8),
                    message_count: 1,
                    start_time: Date.now(),
                    last_activity: Date.now(),
                    is_active: true,
                    is_marked: false,
                    recent_messages: [message]
                };
                
                project.sessions.unshift(newSession);
                project.last_activity = Date.now();
                
                // Update stats
                this.store.liveStats.total_sessions++;
                if (this.store.liveStats.recent_activity) {
                    this.store.liveStats.recent_activity.active_sessions++;
                }
            }
        },

        handleSessionEnd(message) {
            // Mark session as inactive
            if (message && message.session_id) {
                this.store.conversations.forEach(project => {
                    if (project.sessions) {
                        const session = project.sessions.find(s => s.session_id === message.session_id);
                        if (session) {
                            session.is_active = false;
                        }
                    }
                });
                
                // Update active sessions count
                if (this.store.liveStats.recent_activity) {
                    this.store.liveStats.recent_activity.active_sessions = Math.max(0, 
                        this.store.liveStats.recent_activity.active_sessions - 1);
                }
            }
        },

        updateLiveStats(stats) {
            // Update live statistics from gRPC stream
            this.store.liveStats = {
                ...this.store.liveStats,
                ...stats
            };
        },

        async refreshData() {
            console.log('🔄 Refreshing dashboard data...');
            // Don't clear cache - let it expire naturally for better UX
            // Only clear if we detect stale data or user explicitly refreshes
            await this.loadInitialData();
        },

        setupAutoRefresh() {
            // Refresh every 30 seconds
            this.refreshInterval = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    this.refreshData();
                }
            }, 30000);
        },

        applyTheme() {
            const htmlElement = document.documentElement;
            if (this.store.isDarkMode) {
                htmlElement.setAttribute('data-theme', 'dark');
                htmlElement.classList.add('dark');
            } else {
                htmlElement.setAttribute('data-theme', 'light');
                htmlElement.classList.remove('dark');
            }
            
            // Save preference
            localStorage.setItem('claude-dashboard-theme', this.store.isDarkMode ? 'dark' : 'light');
        },

        toggleTheme() {
            this.store.isDarkMode = !this.store.isDarkMode;
            this.applyTheme();
        },

        initializeKeyboardShortcuts() {
            this.keyboardShortcuts.set('r', () => this.refreshData());
            this.keyboardShortcuts.set('s', () => this.focusSearch());
            this.keyboardShortcuts.set('d', () => this.setActiveView('dashboard'));
            this.keyboardShortcuts.set('p', () => this.setActiveView('projects'));
            this.keyboardShortcuts.set('t', () => this.toggleTheme());
            this.keyboardShortcuts.set('/', () => this.focusSearch());

            document.addEventListener('keydown', this.handleKeyboardShortcut);
        },

        removeKeyboardShortcuts() {
            document.removeEventListener('keydown', this.handleKeyboardShortcut);
        },

        handleKeyboardShortcut(event) {
            // Only handle shortcuts when not in input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            const key = event.key.toLowerCase();
            const shortcut = this.keyboardShortcuts.get(key);
            
            if (shortcut) {
                event.preventDefault();
                shortcut();
            }
        },

        focusSearch() {
            const searchInput = document.querySelector('input[type="text"]');
            if (searchInput) {
                searchInput.focus();
            }
        },

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
                breadcrumbs.push({ label: 'Sessions' });
            } else if (view === 'search') {
                breadcrumbs.push({ label: 'Search Results' });
            }

            this.breadcrumbItems = breadcrumbs;
        },

        async handleSearch(filters) {
            console.log('🔍 Performing search...', filters);
            
            await this.handleAsyncOperation(async () => {
                const results = await apiService.searchConversations(filters.query, filters);
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

        startPerformanceMonitoring() {
            // Monitor API calls
            const originalRequest = apiService.request;
            apiService.request = async (...args) => {
                this.performanceMetrics.apiCallCount++;
                return originalRequest.apply(apiService, args);
            };
        },

        formatMetric(value, type = 'number') {
            if (type === 'number') {
                return this.formatNumber(value, { compact: true });
            } else if (type === 'time') {
                return this.formatTimestamp(value);
            }
            return value;
        },

        handleToast(event) {
            // Simple toast implementation
            console.log(`Toast: ${event.message} (${event.type})`);
        }
    },

    components: {
        LoadingSpinner,
        VirtualScroll,
        SearchFilters,
        BreadcrumbNavigation
    },

    template: `
        <div id="optimized-dashboard" :class="{ 'dark': store.isDarkMode }">
            <!-- Header -->
            <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between items-center py-4">
                        <!-- Title and Status -->
                        <div class="flex items-center space-x-4">
                            <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                Claude Conversation Logger
                            </h1>
                            <span class="text-sm text-gray-500 dark:text-gray-400">
                                v2.1.3 Optimized
                            </span>
                            <div :class="['flex items-center space-x-1', store.connectionStatus === 'connected' ? 'text-green-500' : 'text-red-500']">
                                <i class="fas fa-circle text-xs"></i>
                                <span class="text-xs font-medium">{{ store.connectionStatus }}</span>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center space-x-3">
                            <!-- Last Update -->
                            <span v-if="lastUpdate" class="text-xs text-gray-500 dark:text-gray-400">
                                Updated {{ formatTimestamp(lastUpdate) }}
                            </span>
                            
                            <!-- Refresh Button -->
                            <button @click="refreshData" 
                                    :disabled="store.isLoading"
                                    class="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 
                                           text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 
                                           bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 
                                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 
                                           disabled:opacity-50 transition-colors">
                                <i :class="['fas fa-sync-alt mr-2', store.isLoading ? 'animate-spin' : '']"></i>
                                Refresh
                            </button>
                            
                            <!-- Theme Toggle -->
                            <button @click="toggleTheme" 
                                    class="inline-flex items-center p-2 border border-gray-300 dark:border-gray-600 
                                           text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 
                                           bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 
                                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                                    title="Toggle theme (T)">
                                <i :class="['fas', store.isDarkMode ? 'fa-sun' : 'fa-moon']"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Breadcrumb Navigation -->
            <div class="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                    <BreadcrumbNavigation 
                        :items="breadcrumbItems" 
                        @navigate="handleBreadcrumbNavigation" />
                </div>
            </div>

            <!-- Main Content -->
            <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Loading Overlay -->
                <LoadingSpinner v-if="store.isLoading" 
                                :message="store.loadingMessage" 
                                overlay 
                                type="ring" 
                                size="large" />

                <!-- Error State -->
                <div v-if="store.error" 
                     class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-md p-4 mb-6">
                    <div class="flex">
                        <i class="fas fa-exclamation-triangle text-red-400 mr-3 mt-1"></i>
                        <div>
                            <h3 class="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
                            <p class="mt-1 text-sm text-red-700 dark:text-red-300">{{ store.error }}</p>
                            <button @click="refreshData" 
                                    class="mt-2 text-sm text-red-600 dark:text-red-400 hover:text-red-500 underline">
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Dashboard View -->
                <div v-if="store.activeView === 'dashboard'" class="space-y-8">
                    <!-- Stats Cards -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Projects</p>
                                    <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                        {{ formatMetric(dashboardStats.totalProjects) }}
                                    </p>
                                </div>
                                <div class="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                                    <i class="fas fa-folder text-blue-600 dark:text-blue-400 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Sessions</p>
                                    <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                        {{ formatMetric(dashboardStats.totalSessions) }}
                                    </p>
                                </div>
                                <div class="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                                    <i class="fas fa-comments text-green-600 dark:text-green-400 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Total Messages</p>
                                    <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                        {{ formatMetric(dashboardStats.totalMessages) }}
                                    </p>
                                </div>
                                <div class="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                                    <i class="fas fa-envelope text-purple-600 dark:text-purple-400 text-xl"></i>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Active Sessions</p>
                                    <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                        {{ formatMetric(dashboardStats.activeSessions) }}
                                    </p>
                                </div>
                                <div class="p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
                                    <i class="fas fa-bolt text-orange-600 dark:text-orange-400 text-xl"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Search Filters -->
                    <SearchFilters 
                        v-model="store.searchFilters"
                        :projects="store.conversations"
                        @search="handleSearch"
                        @clear="store.searchFilters = {}"
                        @toast="handleToast" />

                    <!-- Recent Projects -->
                    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
                        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Recent Projects</h3>
                        </div>
                        
                        <VirtualScroll v-if="store.virtualScrollEnabled && filteredProjects.length > 10"
                                       :items="filteredProjects"
                                       :item-height="80"
                                       :container-height="400"
                                       @scroll="handleVirtualScroll">
                            <template #default="{ item }">
                                <div class="p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors"
                                     @click="selectProject(item)">
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ item.name }}</h4>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                                {{ item.sessions?.length || 0 }} sessions • {{ item.message_count || 0 }} messages
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                                {{ formatTimestamp(item.last_activity) }}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </VirtualScroll>
                        
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <div v-for="project in filteredProjects.slice(0, 10)" 
                                 :key="project.name"
                                 class="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors"
                                 @click="selectProject(project)">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ project.name }}</h4>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            {{ project.sessions?.length || 0 }} sessions • {{ project.message_count || 0 }} messages
                                        </p>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            {{ formatTimestamp(project.last_activity) }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Other views (projects, sessions, search results) would go here -->
                <!-- ... -->
            </main>

            <!-- Performance Debug Info (dev only) -->
            <div v-if="false" class="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded">
                <div>Render: {{ performanceMetrics.renderTime.toFixed(2) }}ms</div>
                <div>API Calls: {{ performanceMetrics.apiCallCount }}</div>
            </div>
        </div>
    `
};

// Global app configuration
window.optimizedApp = createApp(OptimizedDashboard);

// Register global components
window.optimizedApp.component('LoadingSpinner', LoadingSpinner);
window.optimizedApp.component('VirtualScroll', VirtualScroll);
window.optimizedApp.component('SearchFilters', SearchFilters);
window.optimizedApp.component('BreadcrumbNavigation', BreadcrumbNavigation);

// Mount the optimized app
window.optimizedApp.mount('#app');

console.log('✅ Optimized Dashboard initialized successfully');