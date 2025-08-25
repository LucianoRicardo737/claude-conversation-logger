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
    previousView: null, // Track previous view for navigation
    isLoading: false,
    loadingMessage: '',
    error: null,
    
    // Search state
    searchQuery: '',
    searchFilters: {
        project: '',
        category: '',
        startDate: '',
        endDate: '',
        onlyMarked: false,
        tags: []
    },
    
    // Messages page data
    allMessages: [],
    messageFilters: {
        search: '',
        messageType: '',
        project: '',
        startDate: '',
        endDate: ''
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
    
    // Theme - Always start in dark mode
    isDarkMode: true
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
                // Text search filter (don't modify - it works correctly)
                if (this.store.searchFilters.project && 
                    !project.name.toLowerCase().includes(this.store.searchFilters.project.toLowerCase())) {
                    return false;
                }
                
                // Category filter
                if (this.store.searchFilters.category) {
                    try {
                        const lastActivity = new Date(project.last_activity);
                        const now = new Date();
                        
                        // Validate dates before calculations
                        if (isNaN(lastActivity.getTime()) || isNaN(now.getTime())) {
                            console.warn('Invalid date in category filter:', project.last_activity);
                            return true; // Don't filter out if dates are invalid
                        }
                        
                        const hoursDiff = (now - lastActivity) / (1000 * 60 * 60);
                        
                        switch (this.store.searchFilters.category) {
                            case 'active':
                                if (hoursDiff > 24) return false; // Active in last 24h
                                break;
                            case 'recent':
                                if (hoursDiff > 168) return false; // Recent activity (last week)
                                break;
                            case 'high-traffic':
                                // Use message_count with fallback to 0
                                const messageCount = project.message_count || 0;
                                if (messageCount < 50) return false; // High traffic (50+ messages)
                                break;
                        }
                    } catch (error) {
                        console.warn('Category filter error:', error);
                        // If processing fails, don't filter out the project
                    }
                }
                
                // Date filter
                if (this.store.searchFilters.startDate) {
                    try {
                        const filterDate = new Date(this.store.searchFilters.startDate);
                        const projectDate = new Date(project.last_activity);
                        
                        // Normalize dates to start of day for fair comparison
                        filterDate.setHours(0, 0, 0, 0);
                        projectDate.setHours(0, 0, 0, 0);
                        
                        if (projectDate < filterDate) return false;
                    } catch (error) {
                        console.warn('Date filter error:', error);
                        // If date parsing fails, ignore this filter
                    }
                }
                
                // Solo marcados filter
                if (this.store.searchFilters.onlyMarked) {
                    // Check if any session in the project has marked conversations
                    const hasMarkedSessions = project.sessions && project.sessions.some(session => 
                        session.is_marked || session.status === 'marked'
                    );
                    if (!hasMarkedSessions) return false;
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
            return filters.project || filters.category || filters.startDate || 
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
        },

        filteredMessages() {
            if (!this.store.allMessages || !this.store.allMessages.length) {
                console.log('No messages available for filtering');
                return [];
            }
            
            console.log('Filtering messages:', {
                total: this.store.allMessages.length,
                filters: this.store.messageFilters
            });
            
            return this.store.allMessages.filter(message => {
                // Text search filter
                if (this.store.messageFilters.search && 
                    !message.content.toLowerCase().includes(this.store.messageFilters.search.toLowerCase())) {
                    return false;
                }
                
                // Message type filter
                if (this.store.messageFilters.messageType && 
                    message.type !== this.store.messageFilters.messageType) {
                    return false;
                }
                
                // Project filter
                if (this.store.messageFilters.project && 
                    message.project_name !== this.store.messageFilters.project) {
                    return false;
                }
                
                // Date filter
                if (this.store.messageFilters.startDate) {
                    try {
                        const filterDate = new Date(this.store.messageFilters.startDate);
                        const messageDate = new Date(message.timestamp);
                        filterDate.setHours(0, 0, 0, 0);
                        messageDate.setHours(0, 0, 0, 0);
                        if (messageDate < filterDate) return false;
                    } catch (error) {
                        console.warn('Date filter error in messages:', error);
                    }
                }
                
                return true;
            }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        },

        // Session Analytics Computed Properties
        sessionsAnalytics() {
            if (!this.store.conversations || !this.store.conversations.length) return {};
            
            const analytics = {
                totalSessions: 0,
                activeSessions: 0,
                totalMessages: 0,
                sessionsByProject: [],
                longestSessions: [],
                averageMessages: 0,
                activityRate: 0
            };
            
            const allSessions = [];
            
            // Process each project
            this.store.conversations.forEach(project => {
                if (project.sessions && project.sessions.length > 0) {
                    analytics.totalSessions += project.sessions.length;
                    
                    // Count active sessions and collect all sessions
                    const activeSessions = project.sessions.filter(session => 
                        session.status === 'active' || 
                        (session.last_message && new Date() - new Date(session.last_message) < 24 * 60 * 60 * 1000)
                    );
                    
                    analytics.activeSessions += activeSessions.length;
                    
                    // Add to sessions by project
                    analytics.sessionsByProject.push({
                        name: project.name,
                        sessionCount: project.sessions.length,
                        messageCount: project.message_count || 0,
                        activeCount: activeSessions.length
                    });
                    
                    // Collect all sessions for longest sessions analysis
                    project.sessions.forEach(session => {
                        allSessions.push({
                            ...session,
                            projectName: project.name,
                            messageCount: session.message_count || 0
                        });
                        analytics.totalMessages += session.message_count || 0;
                    });
                }
            });
            
            // Calculate averages
            if (analytics.totalSessions > 0) {
                analytics.averageMessages = Math.round(analytics.totalMessages / analytics.totalSessions);
                analytics.activityRate = Math.round((analytics.activeSessions / analytics.totalSessions) * 100);
            }
            
            // Sort projects by session count
            analytics.sessionsByProject.sort((a, b) => b.sessionCount - a.sessionCount);
            
            // Get longest sessions
            analytics.longestSessions = allSessions
                .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
                .slice(0, 10);
            
            return analytics;
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
            // Track previous view for navigation
            this.store.previousView = this.store.activeView;
            this.store.activeView = view;
            this.updateBreadcrumbs(view);
            
            // Load messages when switching to messages view
            if (view === 'messages' && this.store.allMessages.length === 0) {
                this.loadAllMessages();
            }
        },

        // === Filters ===
        clearFilters() {
            this.store.searchFilters = {
                project: '',
                category: '',
                startDate: '',
                endDate: '',
                onlyMarked: false,
                tags: []
            };
        },

        clearMessageFilters() {
            this.store.messageFilters = {
                search: '',
                messageType: '',
                project: '',
                startDate: '',
                endDate: ''
            };
        },

        // === Messages Management ===
        async loadAllMessages() {
            await this.handleAsyncOperation(async () => {
                console.log('📩 Loading all messages...');
                const allMessages = [];
                
                // Aggregate messages from all projects and sessions
                for (const project of this.store.conversations) {
                    if (project.sessions && project.sessions.length > 0) {
                        for (const session of project.sessions) {
                            try {
                                const sessionDetails = await apiService.getConversationDetails(session.session_id);
                                if (sessionDetails && sessionDetails.messages) {
                                    sessionDetails.messages.forEach(message => {
                                        allMessages.push({
                                            ...message,
                                            project_name: project.name,
                                            session_id: session.session_id,
                                            session_description: session.description
                                        });
                                    });
                                }
                            } catch (error) {
                                console.warn(`Failed to load messages for session ${session.session_id}:`, error);
                            }
                        }
                    }
                }
                
                this.store.allMessages = allMessages.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                
                console.log(`✅ Loaded ${allMessages.length} messages total`);
            }, {
                loadingMessage: 'Loading all messages...',
                showLoading: true
            });
        },

        selectMessage(message) {
            // Navigate to the session containing this message
            const project = this.store.conversations.find(p => p.name === message.project_name);
            if (project) {
                const session = project.sessions.find(s => s.session_id === message.session_id);
                if (session) {
                    // Set previous view as messages so back button returns here
                    this.store.previousView = 'messages';
                    this.selectProject(project);
                    this.selectSession(session);
                }
            }
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
        <div class="h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden flex flex-col">
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
            <div v-else class="flex-1 flex flex-col overflow-hidden">
                <!-- Navigation Header -->
                <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
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
                <main class="flex-1 overflow-y-auto">
                    <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 h-full">
                    <!-- Dashboard View -->
                    <div v-if="store.activeView === 'dashboard' && !store.isLoading" class="h-full flex flex-col space-y-8">
                        <!-- Stats Grid -->
                        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 flex-shrink-0">
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
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
                            <!-- Proyectos Más Activos -->
                            <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-100 dark:border-gray-700 flex flex-col">
                                <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
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
                                
                                <div class="p-6 flex-1 overflow-y-auto">
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
                            <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-100 dark:border-gray-700 flex flex-col">
                                <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
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
                                
                                <div class="p-6 flex-1 overflow-y-auto">
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
                    <div v-else-if="store.activeView === 'projects'" class="h-full flex flex-col">
                        <!-- Header with breadcrumb -->
                        <div class="flex-shrink-0 mb-6">
                            <div class="flex items-center space-x-2 text-sm mb-4">
                                <i class="fas fa-chart-line text-blue-500"></i>
                                <span class="text-blue-500 cursor-pointer" @click="setActiveView('dashboard')">Dashboard</span>
                                <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
                                <span class="text-gray-300">Proyectos</span>
                            </div>
                        </div>

                        <!-- Search and Filters Bar -->
                        <div class="flex-shrink-0 bg-gray-800 dark:bg-gray-700 rounded-lg p-3 mb-4">
                            <div class="flex items-center space-x-3">
                                <!-- Search Input with integrated button -->
                                <div class="flex-1">
                                    <div class="relative">
                                        <input 
                                            v-model="store.searchFilters.project"
                                            type="text" 
                                            placeholder="Buscar en conversaciones..."
                                            class="w-full pl-4 pr-20 py-2 bg-gray-700 dark:bg-gray-600 text-white placeholder-gray-400 border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button class="absolute right-1 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-white text-xs">
                                            <i class="fas fa-search mr-1"></i>
                                            Buscar
                                        </button>
                                    </div>
                                </div>

                                <!-- Clear Filters Button -->
                                <button 
                                    v-if="hasActiveFilters"
                                    @click="clearFilters"
                                    class="flex items-center px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors"
                                    title="Limpiar todos los filtros"
                                >
                                    <i class="fas fa-times mr-1"></i>
                                    Limpiar
                                </button>

                                <!-- Project Filter -->
                                <div class="w-48">
                                    <select 
                                        v-model="store.searchFilters.category"
                                        class="w-full px-3 py-2 bg-gray-700 dark:bg-gray-600 text-white border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Todos los proyectos</option>
                                        <option value="active">Proyectos activos</option>
                                        <option value="recent">Actividad reciente</option>
                                        <option value="high-traffic">Alto tráfico</option>
                                    </select>
                                </div>


                                <!-- Date Range -->
                                <div class="w-32">
                                    <input 
                                        v-model="store.searchFilters.startDate"
                                        type="date" 
                                        class="w-full px-3 py-2 bg-gray-700 dark:bg-gray-600 text-white placeholder-gray-400 border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <!-- Solo marcados checkbox -->
                                <label class="flex items-center text-white text-sm whitespace-nowrap">
                                    <input 
                                        v-model="store.searchFilters.onlyMarked"
                                        type="checkbox" 
                                        class="mr-2 rounded bg-gray-600 border-gray-500 text-blue-600 focus:ring-blue-500"
                                    />
                                    Solo marcados
                                </label>
                            </div>
                        </div>

                        <!-- Projects List Header -->
                        <div class="flex-shrink-0 bg-gray-800 dark:bg-gray-700 rounded-t-lg px-6 py-4 border-b border-gray-600">
                            <div class="flex items-center">
                                <i class="fas fa-folder text-blue-500 mr-3"></i>
                                <h2 class="text-lg font-semibold text-white">Todos los Proyectos</h2>
                                <span class="ml-auto text-gray-400 text-sm">{{ filteredProjects.length }} proyectos</span>
                            </div>
                        </div>

                        <!-- Projects List Content -->
                        <div class="flex-1 bg-gray-800 dark:bg-gray-700 rounded-b-lg overflow-y-auto">
                            <div class="divide-y divide-gray-600">
                                <div 
                                    v-for="project in filteredProjects" 
                                    :key="project.name"
                                    @click="selectProject(project)"
                                    class="px-6 py-4 hover:bg-gray-700 dark:hover:bg-gray-600 cursor-pointer transition-colors group"
                                >
                                    <div class="flex items-center justify-between">
                                        <!-- Left side: Project info -->
                                        <div class="flex-1">
                                            <div class="flex items-center space-x-3 mb-2">
                                                <h3 class="text-white font-medium group-hover:text-blue-400">{{ project.name }}</h3>
                                                
                                                <!-- Status indicators -->
                                                <div class="flex items-center space-x-2">
                                                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                        {{ formatMetric(project.message_count || 0) }}
                                                    </span>
                                                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        {{ (project && project.sessions ? project.sessions.length : 0) }} activas
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <!-- Stats row -->
                                            <div class="flex items-center space-x-4 text-sm text-gray-400">
                                                <span>
                                                    <i class="fas fa-comments mr-1"></i>
                                                    {{ formatMetric(project.total_messages || project.message_count || 0) }} tokens
                                                </span>
                                                <span>
                                                    &#36;{{ formatCost((project.message_count || 0) * 0.002) }}
                                                </span>
                                                <span>
                                                    <i class="fas fa-clock mr-1"></i>
                                                    {{ formatTimestamp(project.last_activity) }}
                                                </span>
                                            </div>
                                        </div>

                                        <!-- Right side: Activity indicator -->
                                        <div class="flex items-center space-x-3">
                                            <div class="text-right">
                                                <div class="text-white font-medium">{{ formatMetric(project.message_count || 0) }}</div>
                                                <div class="text-gray-400 text-sm">{{ formatTimestamp(project.last_activity) }}</div>
                                            </div>
                                            <i class="fas fa-chevron-right text-gray-400 group-hover:text-white transition-colors"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Empty state -->
                            <div v-if="filteredProjects.length === 0" class="text-center py-12">
                                <i class="fas fa-folder-open text-4xl text-gray-500 mb-4"></i>
                                <p class="text-gray-400 text-lg mb-2">No se encontraron proyectos</p>
                                <p class="text-gray-500 text-sm">Ajusta los filtros de búsqueda para ver más resultados</p>
                            </div>
                        </div>
                    </div>

                    <!-- Sessions Analytics Dashboard -->
                    <div v-else-if="store.activeView === 'sessions'" class="h-full flex flex-col">
                        <!-- Header -->
                        <div class="flex-shrink-0 mb-4">
                            <div class="flex items-center justify-end">
                                <button @click="setActiveView('dashboard')" 
                                        class="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                                    <i class="fas fa-arrow-left mr-2"></i>Volver al Dashboard
                                </button>
                            </div>
                        </div>

                        <!-- Statistics Cards -->
                        <div class="flex-shrink-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <!-- Total Sessions -->
                            <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                <div class="flex items-center">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-layer-group text-2xl text-blue-400"></i>
                                    </div>
                                    <div class="ml-4">
                                        <p class="text-sm font-medium text-gray-400">Total Sesiones</p>
                                        <p class="text-2xl font-bold text-white">{{ sessionsAnalytics.totalSessions || 0 }}</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Active Sessions -->
                            <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                <div class="flex items-center">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-play-circle text-2xl text-green-400"></i>
                                    </div>
                                    <div class="ml-4">
                                        <p class="text-sm font-medium text-gray-400">Sesiones Activas</p>
                                        <p class="text-2xl font-bold text-white">{{ sessionsAnalytics.activeSessions || 0 }}</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Average Messages -->
                            <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                <div class="flex items-center">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-chart-line text-2xl text-purple-400"></i>
                                    </div>
                                    <div class="ml-4">
                                        <p class="text-sm font-medium text-gray-400">Promedio Mensajes</p>
                                        <p class="text-2xl font-bold text-white">{{ sessionsAnalytics.averageMessages || 0 }}</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Activity Rate -->
                            <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                <div class="flex items-center">
                                    <div class="flex-shrink-0">
                                        <i class="fas fa-tachometer-alt text-2xl text-yellow-400"></i>
                                    </div>
                                    <div class="ml-4">
                                        <p class="text-sm font-medium text-gray-400">Tasa de Actividad</p>
                                        <p class="text-2xl font-bold text-white">{{ sessionsAnalytics.activityRate || 0 }}%</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Analytics Grid -->
                        <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden min-h-0">
                            <!-- Sessions by Project -->
                            <div class="bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
                                <div class="flex-shrink-0 px-4 py-3 border-b border-gray-700">
                                    <h3 class="text-lg font-semibold text-white flex items-center">
                                        <i class="fas fa-folder text-blue-400 mr-3"></i>
                                        Sesiones por Proyecto
                                    </h3>
                                </div>
                                <div class="flex-1 p-4 overflow-y-auto">
                                    <div class="space-y-4">
                                        <div v-for="project in sessionsAnalytics.sessionsByProject" :key="project.name"
                                             class="flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
                                            <div class="flex-1">
                                                <p class="text-white font-medium">{{ project.name }}</p>
                                                <p class="text-gray-400 text-sm">{{ formatMetric(project.messageCount) }} mensajes</p>
                                            </div>
                                            <div class="text-right">
                                                <p class="text-xl font-bold text-white">{{ project.sessionCount }}</p>
                                                <p class="text-green-400 text-sm">{{ project.activeCount }} activas</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Longest Sessions -->
                            <div class="bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
                                <div class="flex-shrink-0 px-4 py-3 border-b border-gray-700">
                                    <h3 class="text-lg font-semibold text-white flex items-center">
                                        <i class="fas fa-trophy text-yellow-400 mr-3"></i>
                                        Sesiones Más Largas
                                    </h3>
                                </div>
                                <div class="flex-1 p-4 overflow-y-auto">
                                    <div class="space-y-3">
                                        <div v-for="(session, index) in sessionsAnalytics.longestSessions" :key="session.session_id"
                                             @click="selectProject(store.conversations.find(p => p.name === session.projectName))"
                                             class="flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer">
                                            <div class="flex-1">
                                                <p class="text-white font-mono text-sm">{{ session.session_id.substring(0, 8) }}</p>
                                                <p class="text-gray-400 text-xs">{{ session.projectName }}</p>
                                                <p class="text-gray-500 text-xs">{{ formatTimestamp(session.last_message) }}</p>
                                            </div>
                                            <div class="text-right">
                                                <p class="text-lg font-bold text-white">{{ session.messageCount || 0 }}</p>
                                                <div class="flex items-center mt-1">
                                                    <div class="w-2 h-2 bg-green-500 rounded-full mr-2" v-if="session.status === 'active'"></div>
                                                    <span class="text-xs" :class="session.status === 'active' ? 'text-green-400' : 'text-gray-400'">
                                                        {{ session.status === 'active' ? 'En vivo' : 'Completada' }}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Real-time Status -->
                            <div class="bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
                                <div class="flex-shrink-0 px-4 py-3 border-b border-gray-700">
                                    <h3 class="text-lg font-semibold text-white flex items-center">
                                        <i class="fas fa-pulse text-green-400 mr-3"></i>
                                        Estado en Tiempo Real
                                    </h3>
                                </div>
                                <div class="flex-1 p-4 overflow-y-auto">
                                    <div class="space-y-4">
                                        <div class="flex items-center justify-between">
                                            <span class="text-gray-400">Sesiones activas</span>
                                            <div class="flex items-center">
                                                <div class="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                                                <span class="text-white font-semibold">{{ sessionsAnalytics.activeSessions || 0 }}</span>
                                            </div>
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <span class="text-gray-400">Mensajes última hora</span>
                                            <span class="text-white font-semibold">{{ store.liveStats.recent_activity?.messages_last_hour || 0 }}</span>
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <span class="text-gray-400">Última actividad</span>
                                            <span class="text-gray-300 text-sm">{{ formatTimestamp(lastUpdate) }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Average Duration -->
                            <div class="bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
                                <div class="flex-shrink-0 px-4 py-3 border-b border-gray-700">
                                    <h3 class="text-lg font-semibold text-white flex items-center">
                                        <i class="fas fa-clock text-blue-400 mr-3"></i>
                                        Duración Promedio
                                    </h3>
                                </div>
                                <div class="flex-1 p-4 overflow-y-auto">
                                    <div class="space-y-4">
                                        <div class="text-center">
                                            <p class="text-3xl font-bold text-white mb-2">{{ sessionsAnalytics.averageMessages || 0 }}</p>
                                            <p class="text-gray-400">Mensajes por sesión</p>
                                        </div>
                                        <div class="grid grid-cols-2 gap-4 text-center">
                                            <div>
                                                <p class="text-xl font-semibold text-green-400">{{ Math.round((sessionsAnalytics.averageMessages || 0) * 0.75) }}</p>
                                                <p class="text-gray-400 text-xs">Promedio IA</p>
                                            </div>
                                            <div>
                                                <p class="text-xl font-semibold text-blue-400">{{ Math.round((sessionsAnalytics.averageMessages || 0) * 0.25) }}</p>
                                                <p class="text-gray-400 text-xs">Promedio Usuario</p>
                                            </div>
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
                                <button @click="setActiveView(store.previousView === 'messages' ? 'messages' : 'sessions')" 
                                        class="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                                    <i class="fas fa-arrow-left mr-2"></i>
                                    {{ store.previousView === 'messages' ? 'Back to Messages' : 'Back to Sessions' }}
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

                    <!-- Messages View -->
                    <div v-else-if="store.activeView === 'messages'" class="h-full flex flex-col">
                        <!-- Header Section -->
                        <div class="flex-shrink-0 mb-6">
                            <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <div>
                                    <h1 class="text-3xl font-bold text-white">Mensajes</h1>
                                    <p class="text-gray-300 mt-1">
                                        {{ filteredMessages.length }} mensajes encontrados
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-3">
                                <span class="text-gray-300">Última actualización: {{ formatTimestamp(lastUpdate) }}</span>
                            </div>
                            </div>
                        </div>

                        <!-- Search and Filters Bar -->
                        <div class="flex-shrink-0 bg-gray-800 dark:bg-gray-700 rounded-lg p-3 mb-4">
                            <div class="flex items-center space-x-3">
                                <!-- Search Input -->
                                <div class="flex-1">
                                    <div class="relative">
                                        <input 
                                            v-model="store.messageFilters.search"
                                            type="text" 
                                            placeholder="Buscar contenido de mensajes..."
                                            class="w-full pl-4 pr-20 py-2 bg-gray-700 dark:bg-gray-600 text-white placeholder-gray-400 border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button class="absolute right-1 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-white text-xs">
                                            <i class="fas fa-search mr-1"></i>
                                            Buscar
                                        </button>
                                    </div>
                                </div>

                                <!-- Clear Filters Button -->
                                <button 
                                    v-if="store.messageFilters.search || store.messageFilters.messageType || store.messageFilters.project || store.messageFilters.startDate"
                                    @click="clearMessageFilters"
                                    class="flex items-center px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors"
                                    title="Limpiar todos los filtros"
                                >
                                    <i class="fas fa-times mr-1"></i>
                                    Limpiar
                                </button>

                                <!-- Message Type Filter -->
                                <div class="w-44">
                                    <select 
                                        v-model="store.messageFilters.messageType"
                                        class="w-full px-3 py-2 bg-gray-700 dark:bg-gray-600 text-white border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Todos los tipos</option>
                                        <option value="user">Mensajes de usuario</option>
                                        <option value="assistant">Respuestas IA</option>
                                        <option value="system">Sistema</option>
                                    </select>
                                </div>

                                <!-- Project Filter -->
                                <div class="w-48">
                                    <select 
                                        v-model="store.messageFilters.project"
                                        class="w-full px-3 py-2 bg-gray-700 dark:bg-gray-600 text-white border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Todos los proyectos</option>
                                        <option v-for="project in store.conversations" :key="project.name" :value="project.name">
                                            {{ project.name }}
                                        </option>
                                    </select>
                                </div>

                                <!-- Date Filter -->
                                <div class="w-32">
                                    <input 
                                        v-model="store.messageFilters.startDate"
                                        type="date" 
                                        class="w-full px-3 py-2 bg-gray-700 dark:bg-gray-600 text-white placeholder-gray-400 border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Messages List Content -->
                        <div class="flex-1 bg-gray-800 dark:bg-gray-700 rounded-lg overflow-y-auto">
                            <div class="divide-y divide-gray-600">
                                <div 
                                    v-for="message in filteredMessages" 
                                    :key="message.id"
                                    @click="selectMessage(message)"
                                    class="px-6 py-4 hover:bg-gray-700 dark:hover:bg-gray-600 cursor-pointer transition-colors group"
                                >
                                    <div class="flex items-start space-x-4">
                                        <!-- Message Type Icon -->
                                        <div class="flex-shrink-0 mt-1">
                                            <div v-if="message.type === 'user'" class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                                <i class="fas fa-user text-white text-xs"></i>
                                            </div>
                                            <div v-else-if="message.type === 'assistant'" class="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                                                <i class="fas fa-robot text-white text-xs"></i>
                                            </div>
                                            <div v-else class="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                                                <i class="fas fa-cog text-white text-xs"></i>
                                            </div>
                                        </div>

                                        <!-- Message Content -->
                                        <div class="flex-1 min-w-0">
                                            <!-- Header with project and session info -->
                                            <div class="flex items-center space-x-2 mb-2">
                                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {{ message.project_name }}
                                                </span>
                                                <span class="text-gray-400 text-xs">
                                                    {{ message.session_id.substring(0, 8) }}
                                                </span>
                                                <span class="text-gray-400 text-xs">
                                                    •
                                                </span>
                                                <span class="text-gray-400 text-xs">
                                                    {{ formatTimestamp(message.timestamp) }}
                                                </span>
                                            </div>

                                            <!-- Message content preview -->
                                            <div class="text-white group-hover:text-blue-400">
                                                <p class="text-sm line-clamp-2">
                                                    {{ message.content.length > 150 ? message.content.substring(0, 150) + '...' : message.content }}
                                                </p>
                                            </div>

                                            <!-- Session description if available -->
                                            <div v-if="message.session_description" class="mt-1">
                                                <span class="text-gray-500 text-xs italic">
                                                    {{ message.session_description }}
                                                </span>
                                            </div>
                                        </div>

                                        <!-- Right arrow -->
                                        <div class="flex-shrink-0">
                                            <i class="fas fa-chevron-right text-gray-400 group-hover:text-white transition-colors"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Empty state -->
                            <div v-if="filteredMessages.length === 0" class="text-center py-12">
                                <i class="fas fa-comments text-4xl text-gray-500 mb-4"></i>
                                <p class="text-gray-400 text-lg mb-2">No se encontraron mensajes</p>
                                <p v-if="store.allMessages.length === 0" class="text-gray-500 text-sm">
                                    Los mensajes se cargarán automáticamente
                                </p>
                                <p v-else class="text-gray-500 text-sm">
                                    Ajusta los filtros de búsqueda para ver más resultados
                                </p>
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