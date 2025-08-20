console.log('🚀 Starting app.js initialization');

const { createApp, reactive } = Vue;

// Configuración global
const API_BASE_URL = window.location.origin;
console.log('📍 API Base URL:', API_BASE_URL);

// Store global reactivo
const store = reactive({
    conversations: [],
    selectedProject: null,
    selectedSession: null,
    searchResults: [],
    searchQuery: '',
    isLoading: false,
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
    connectionStatus: 'disconnected'
});

// Hacer store disponible globalmente para debugging
window.store = store;
console.log('📦 Reactive store created:', store);

// API Service
const API_KEY = 'claude_api_secret_2024_change_me';

// Configurar headers por defecto para Axios
axios.defaults.headers.common['x-api-key'] = API_KEY;
console.log('🔑 API key configured');

const apiService = {
    async getConversationTree(filters = {}) {
        console.log('📡 Fetching conversation tree...');
        try {
            const response = await axios.get(`${API_BASE_URL}/api/conversations/tree`, {
                params: filters
            });
            console.log('✅ Conversation tree received:', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ Error fetching conversation tree:', error);
            throw error;
        }
    },
    
    async getConversationDetails(sessionId) {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/conversations/${sessionId}`);
            return response.data;
        } catch (error) {
            console.error('Error fetching conversation details:', error);
            throw error;
        }
    },
    
    async searchConversations(query, filters = {}) {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/search/advanced`, {
                query,
                ...filters
            });
            return response.data;
        } catch (error) {
            console.error('Error searching conversations:', error);
            throw error;
        }
    },
    
    async markConversation(sessionId, isMarked, note = '', tags = []) {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/conversations/${sessionId}/mark`, {
                is_marked: isMarked,
                note,
                tags
            });
            return response.data;
        } catch (error) {
            console.error('Error marking conversation:', error);
            throw error;
        }
    },
    
    async exportConversation(sessionId, format = 'json') {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/conversations/${sessionId}/export`, {
                params: { format },
                responseType: format === 'json' ? 'json' : 'blob'
            });
            return response.data;
        } catch (error) {
            console.error('Error exporting conversation:', error);
            throw error;
        }
    }
};

// Componente principal Dashboard
const Dashboard = {
    data() {
        return {
            activeView: 'dashboard', // 'dashboard', 'projects', 'sessions', 'details', 'search'
            searchFilters: {
                project_filter: '',
                message_type_filter: '',
                start_date: '',
                end_date: '',
                only_marked: false
            },
            selectedSessionDetails: null,
            exportFormat: 'json'
        };
    },
    
    computed: {
        store() {
            return store;
        },
        
        filteredProjects() {
            return this.store.conversations.filter(project => {
                if (!this.searchFilters.project_filter) return true;
                return project.name.toLowerCase().includes(this.searchFilters.project_filter.toLowerCase());
            });
        },
        
        connectionStatusColor() {
            const colors = {
                'connected': 'text-green-500',
                'connecting': 'text-yellow-500',
                'disconnected': 'text-red-500'
            };
            return colors[this.store.connectionStatus] || 'text-gray-500';
        },
        
        connectionStatusIcon() {
            const icons = {
                'connected': 'fas fa-circle',
                'connecting': 'fas fa-circle-notch fa-spin',
                'disconnected': 'fas fa-circle'
            };
            return icons[this.store.connectionStatus] || 'fas fa-circle';
        }
    },
    
    async mounted() {
        console.log('🔄 Dashboard mounted, loading data...');
        await this.loadConversationTree();
        this.initializeWebSocket();
    },
    
    methods: {
        async loadConversationTree() {
            console.log('📊 Loading conversation tree...');
            store.isLoading = true;
            
            try {
                const data = await apiService.getConversationTree();
                console.log('📈 Data received in loadConversationTree:', data);
                
                // Actualizar datos directamente en el store reactivo
                store.conversations = data.projects || [];
                store.liveStats.total_messages = data.total_messages || 0;
                store.liveStats.total_sessions = data.total_sessions || 0;
                store.liveStats.active_projects = data.projects?.length || 0;
                
                // Contar sesiones activas
                const activeSessions = data.projects?.reduce((count, project) => {
                    return count + project.sessions.filter(session => session.is_active).length;
                }, 0) || 0;
                store.liveStats.recent_activity.active_sessions = activeSessions;
                
                console.log('✅ Reactive store updated with data:', {
                    conversations: store.conversations.length,
                    total_messages: store.liveStats.total_messages,
                    total_sessions: store.liveStats.total_sessions,
                    active_projects: store.liveStats.active_projects
                });
                
            } catch (error) {
                console.error('❌ Error loading conversations:', error);
            } finally {
                store.isLoading = false;
                console.log('🏁 Loading completed');
            }
        },
        
        goToDashboard() {
            this.activeView = 'dashboard';
            store.selectedProject = null;
            store.selectedSession = null;
        },
        
        goToProjects() {
            this.activeView = 'projects';
            store.selectedProject = null;
            store.selectedSession = null;
        },
        
        async selectProject(project) {
            store.selectedProject = project;
            store.selectedSession = null;
            this.activeView = 'sessions';
        },
        
        async selectSession(session) {
            store.selectedSession = session;
            await this.loadSessionDetails(session.session_id);
            this.activeView = 'details';
        },
        
        async loadSessionDetails(sessionId) {
            store.isLoading = true;
            try {
                const details = await apiService.getConversationDetails(sessionId);
                this.selectedSessionDetails = details;
            } catch (error) {
                console.error('Error loading session details:', error);
            } finally {
                store.isLoading = false;
            }
        },
        
        async performSearch() {
            if (!this.store.searchQuery.trim()) return;
            
            store.isLoading = true;
            try {
                const results = await apiService.searchConversations(
                    this.store.searchQuery,
                    this.searchFilters
                );
                store.searchResults = results.results || [];
                this.activeView = 'search';
            } catch (error) {
                console.error('Error performing search:', error);
            } finally {
                store.isLoading = false;
            }
        },
        
        async toggleMarkSession(session, isMarked) {
            try {
                await apiService.markConversation(session.session_id, isMarked);
                session.is_marked = isMarked;
                this.$forceUpdate(); // Force reactivity update
            } catch (error) {
                console.error('Error marking session:', error);
            }
        },
        
        async exportSession(session, format = 'json') {
            try {
                const exportData = await apiService.exportConversation(session.session_id, format);
                
                if (format === 'json') {
                    // Para JSON, crear un blob y descargarlo
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                        type: 'application/json'
                    });
                    this.downloadFile(blob, `conversation_${session.short_id}.json`);
                } else {
                    // Para otros formatos, usar el contenido directamente
                    const blob = new Blob([exportData.content], {
                        type: exportData.mime_type
                    });
                    this.downloadFile(blob, exportData.filename);
                }
            } catch (error) {
                console.error('Error exporting session:', error);
            }
        },
        
        downloadFile(blob, filename) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        },
        
        formatTimestamp(timestamp) {
            return new Date(timestamp).toLocaleString('es-ES');
        },
        
        formatMessageContent(content, maxLength = 150) {
            if (!content) return '';
            if (content.length <= maxLength) return content;
            return content.substring(0, maxLength) + '...';
        },
        
        getMessageTypeIcon(type) {
            const icons = {
                'user': 'fas fa-user text-blue-500',
                'assistant': 'fas fa-robot text-purple-500',
                'system': 'fas fa-cog text-gray-500'
            };
            return icons[type] || 'fas fa-comment';
        },
        
        initializeWebSocket() {
            console.log('🔌 Initializing WebSocket connection...');
            store.connectionStatus = 'connecting';
            
            setTimeout(() => {
                store.connectionStatus = 'connected';
                console.log('✅ Connection status: connected');
                
                // Polling simple cada 30 segundos
                setInterval(async () => {
                    console.log('🔄 Polling for updates...');
                    try {
                        await this.loadConversationTree();
                    } catch (error) {
                        console.error('❌ Error in polling:', error);
                    }
                }, 30000);
                
            }, 1000);
        },
        
        clearSearch() {
            store.searchQuery = '';
            store.searchResults = [];
            this.activeView = 'projects';
        },
        
        goBackToSessions() {
            this.activeView = 'sessions';
            store.selectedSession = null;
        },
        
        goBackToProjects() {
            this.activeView = 'projects';
            store.selectedProject = null;
            store.selectedSession = null;
        }
    },
    
    template: `
        <div class="min-h-screen bg-gray-50">
            <!-- Header -->
            <header class="bg-white shadow-sm border-b">
                <div class="px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between items-center h-16">
                        <div class="flex items-center space-x-6">
                            <button @click="goToDashboard" class="flex items-center text-xl font-semibold text-gray-900 hover:text-blue-600">
                                <i class="fas fa-tachometer-alt text-blue-500 mr-2"></i>
                                Dashboard
                            </button>
                            
                            <!-- Navigation Menu -->
                            <nav class="hidden md:flex space-x-4">
                                <button 
                                    @click="goToProjects"
                                    :class="['px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                             activeView === 'projects' || activeView === 'sessions' || activeView === 'search' 
                                             ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-blue-600']"
                                >
                                    <i class="fas fa-project-diagram mr-1"></i>
                                    Proyectos
                                </button>
                            </nav>
                        </div>
                        
                        <div class="flex items-center space-x-6">
                            <!-- Live Stats - Always visible -->
                            <div class="flex items-center space-x-4 text-sm">
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-comment text-blue-500"></i>
                                    <span class="font-semibold text-blue-600">{{ store.liveStats.total_messages }}</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-layer-group text-green-500"></i>
                                    <span class="font-semibold text-green-600">{{ store.liveStats.total_sessions }}</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-project-diagram text-purple-500"></i>
                                    <span class="font-semibold text-purple-600">{{ store.liveStats.active_projects }}</span>
                                </div>
                            </div>
                            
                            <!-- System Status in Header -->
                            <div class="flex items-center space-x-3 text-xs">
                                <div class="flex items-center space-x-1">
                                    <div class="w-2 h-2 rounded-full" :class="store.connectionStatus === 'connected' ? 'bg-green-400' : 'bg-red-400'"></div>
                                    <span class="text-gray-600">API</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                                    <span class="text-gray-600">MongoDB</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                                    <span class="text-gray-600">Redis</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                                    <span class="text-gray-600">gRPC</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <!-- Loading Spinner -->
                <div v-if="store.isLoading" class="flex justify-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>

                <!-- DASHBOARD PRINCIPAL -->
                <div v-if="activeView === 'dashboard'" class="space-y-6">
                    <!-- Main Statistics Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-comment text-blue-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Total Mensajes</p>
                                    <p class="text-3xl font-bold text-gray-900">{{ store.liveStats.total_messages }}</p>
                                    <p class="text-xs text-gray-500">~{{ Math.round(store.liveStats.total_messages * 150).toLocaleString() }} tokens</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-layer-group text-green-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Sesiones Totales</p>
                                    <p class="text-3xl font-bold text-gray-900">{{ store.liveStats.total_sessions }}</p>
                                    <p class="text-xs text-green-600">{{ store.liveStats.recent_activity.active_sessions }} activas</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-project-diagram text-purple-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Proyectos Activos</p>
                                    <p class="text-3xl font-bold text-gray-900">{{ store.liveStats.active_projects }}</p>
                                    <p class="text-xs text-purple-600">{{ store.conversations.filter(p => p.sessions.some(s => s.is_active)).length }} con actividad</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-dollar-sign text-orange-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Costo Estimado</p>
                                    <p class="text-3xl font-bold text-gray-900">\${{ (store.liveStats.total_messages * 0.002).toFixed(2) }}</p>
                                    <p class="text-xs text-orange-600">Claude API</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Projects Overview & Active Sessions -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" style="height: calc(100vh - 320px);">
                        <!-- Top Projects -->
                        <div class="bg-white rounded-lg shadow-sm p-6 h-full">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-lg font-medium text-gray-900">
                                    <i class="fas fa-star text-yellow-500 mr-2"></i>
                                    Proyectos Más Activos
                                </h3>
                                <button @click="goToProjects" class="text-blue-600 hover:text-blue-700 text-sm transition-colors duration-200">
                                    Ver todos →
                                </button>
                            </div>
                            <div class="space-y-2 overflow-y-auto" style="height: calc(100% - 3.5rem);">
                                <div v-for="project in store.conversations.slice(0, 5)" :key="project.name" 
                                     @click="selectProject(project)"
                                     class="flex justify-between items-center p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-all duration-200 transform hover:scale-[1.01]">
                                    <div>
                                        <p class="font-medium text-gray-900 text-sm">{{ project.name }}</p>
                                        <p class="text-xs text-gray-600">{{ project.message_count }} mensajes • {{ project.sessions.length }} sesiones</p>
                                    </div>
                                    <div class="text-right flex items-center space-x-2">
                                        <div v-if="project.sessions.some(s => s.is_active)" class="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                                        <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Active Sessions - Same height as Projects -->
                        <div class="bg-white rounded-lg shadow-sm p-6 h-full">
                            <h3 class="text-lg font-medium text-gray-900 mb-4">
                                <i class="fas fa-circle text-green-400 mr-2"></i>
                                Sesiones Activas
                            </h3>
                            <div class="space-y-1 overflow-y-auto" style="height: calc(100% - 3.5rem);">
                                <div v-for="project in store.conversations" :key="'active-' + project.name">
                                    <div v-for="session in project.sessions.filter(s => s.is_active)" :key="session.session_id"
                                         @click="selectSession(session)"
                                         class="flex justify-between items-center p-2 border border-green-200 bg-green-50 rounded cursor-pointer hover:bg-green-100 transition-all duration-200 transform hover:scale-[1.01]">
                                        <div class="flex-1 min-w-0">
                                            <p class="font-medium text-gray-900 text-sm truncate">{{ session.short_id }}</p>
                                            <p class="text-xs text-gray-600 truncate">{{ project.name }} • {{ session.message_count }} mensajes</p>
                                        </div>
                                        <div class="flex-shrink-0 ml-2">
                                            <span class="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                                En vivo
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="!store.conversations.some(p => p.sessions.some(s => s.is_active))" 
                                     class="text-center py-8 text-gray-500">
                                    <i class="fas fa-moon text-xl mb-2"></i>
                                    <p class="text-sm">No hay sesiones activas</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <!-- VISTA DE PROYECTOS (con búsqueda) -->
                <div v-if="activeView === 'projects'" style="height: calc(100vh - 140px);" class="flex flex-col space-y-4">
                    <!-- Breadcrumb -->
                    <div class="flex items-center space-x-2 text-sm">
                        <button @click="goToDashboard" class="text-blue-600 hover:text-blue-700">
                            <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                        </button>
                        <span class="text-gray-400">/</span>
                        <span class="text-gray-900 font-medium">Proyectos</span>
                    </div>

                    <!-- Search Bar - Compacto -->
                    <div class="bg-white rounded-lg shadow-sm p-3">
                        <div class="flex space-x-3">
                            <div class="flex-1">
                                <input
                                    v-model="store.searchQuery"
                                    @keyup.enter="performSearch"
                                    type="text"
                                    placeholder="Buscar en conversaciones..."
                                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <button
                                @click="performSearch"
                                :disabled="!store.searchQuery.trim() || store.isLoading"
                                class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i class="fas fa-search mr-1"></i>
                                Buscar
                            </button>
                            <button
                                v-if="store.searchQuery"
                                @click="clearSearch"
                                class="px-3 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
                            >
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <!-- Search Filters - Compacto -->
                        <div class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                            <select v-model="searchFilters.project_filter" class="px-2 py-1 border border-gray-300 rounded text-xs">
                                <option value="">Todos los proyectos</option>
                                <option v-for="project in store.conversations" :key="project.name" :value="project.name">
                                    {{ project.name }}
                                </option>
                            </select>
                            
                            <select v-model="searchFilters.message_type_filter" class="px-2 py-1 border border-gray-300 rounded text-xs">
                                <option value="">Todos los tipos</option>
                                <option value="user">Usuario</option>
                                <option value="assistant">Asistente</option>
                                <option value="system">Sistema</option>
                            </select>
                            
                            <input
                                v-model="searchFilters.start_date"
                                type="date"
                                class="px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                            
                            <label class="flex items-center space-x-1 text-xs">
                                <input v-model="searchFilters.only_marked" type="checkbox" class="rounded">
                                <span>Solo marcadas</span>
                            </label>
                        </div>
                    </div>

                    <!-- Projects List - Dinámico -->
                    <div class="bg-white rounded-lg shadow-sm flex-1 flex flex-col min-h-0">
                        <div class="p-3 border-b flex-shrink-0">
                            <h2 class="text-base font-medium text-gray-900">
                                <i class="fas fa-project-diagram text-blue-500 mr-2"></i>
                                Todos los Proyectos
                            </h2>
                        </div>
                        <div class="flex-1 overflow-y-auto p-3">
                            <div class="space-y-2">
                                <div v-for="project in filteredProjects" :key="project.name">
                                    <div
                                        @click="selectProject(project)"
                                        class="project-card bg-gray-50 hover:bg-blue-50 rounded-lg p-3 cursor-pointer border border-gray-100 hover:border-blue-200 transition-all duration-200"
                                    >
                                        <div class="flex justify-between items-center">
                                            <div class="flex-1 min-w-0">
                                                <h3 class="text-base font-medium text-gray-900 mb-1 truncate">{{ project.name }}</h3>
                                                <div class="flex items-center space-x-4 text-xs text-gray-600">
                                                    <span class="flex items-center">
                                                        <i class="fas fa-comment text-blue-500 mr-1"></i>
                                                        {{ project.message_count }}
                                                    </span>
                                                    <span class="flex items-center">
                                                        <i class="fas fa-layer-group text-green-500 mr-1"></i>
                                                        {{ project.sessions.length }}
                                                    </span>
                                                    <span class="flex items-center" v-if="project.sessions.filter(s => s.is_active).length > 0">
                                                        <i class="fas fa-circle text-green-400 mr-1"></i>
                                                        {{ project.sessions.filter(s => s.is_active).length }} activas
                                                    </span>
                                                    <span class="flex items-center">
                                                        <i class="fas fa-clock text-gray-400 mr-1"></i>
                                                        {{ formatTimestamp(project.last_activity) }}
                                                    </span>
                                                </div>
                                            </div>
                                            <div class="text-right ml-3 flex-shrink-0">
                                                <i class="fas fa-chevron-right text-gray-400 text-sm"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div v-if="!filteredProjects.length" class="text-center py-12 text-gray-500">
                                <i class="fas fa-inbox text-2xl mb-2"></i>
                                <p class="text-sm">No hay conversaciones disponibles</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DE SESIONES (sin búsqueda) -->
                <div v-if="activeView === 'sessions'" style="height: calc(100vh - 140px);" class="flex flex-col space-y-4">
                    <!-- Breadcrumb -->
                    <div class="flex items-center space-x-2 text-sm">
                        <button @click="goToDashboard" class="text-blue-600 hover:text-blue-700">
                            <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                        </button>
                        <span class="text-gray-400">/</span>
                        <button @click="goToProjects" class="text-blue-600 hover:text-blue-700">
                            Proyectos
                        </button>
                        <span class="text-gray-400">/</span>
                        <span class="text-gray-900 font-medium">{{ store.selectedProject?.name }}</span>
                    </div>

                    <!-- Sessions List -->
                    <div class="bg-white rounded-lg shadow-sm flex-1 flex flex-col min-h-0">
                        <div class="p-3 border-b flex justify-between items-center flex-shrink-0">
                            <h2 class="text-base font-medium text-gray-900">
                                <i class="fas fa-comments text-purple-500 mr-2"></i>
                                Sesiones de {{ store.selectedProject?.name }}
                            </h2>
                            <button @click="goBackToProjects" class="text-blue-600 hover:text-blue-700 text-sm">
                                <i class="fas fa-arrow-left mr-1"></i>Volver a Proyectos
                            </button>
                        </div>
                        
                        <div class="flex-1 overflow-y-auto p-3">
                            <div class="space-y-2">
                                <div v-for="session in store.selectedProject?.sessions" :key="session.session_id" 
                                     @click="selectSession(session)"
                                     class="session-item bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-lg p-3 cursor-pointer transition-all duration-200">
                                    <div class="flex justify-between items-start">
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center space-x-2 mb-1">
                                                <span class="font-mono text-sm bg-white border px-2 py-1 rounded text-gray-700">
                                                    {{ session.short_id }}
                                                </span>
                                                <div v-if="session.is_active" class="live-indicator">
                                                    <span class="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                                        <i class="fas fa-circle mr-1 text-xs"></i>En vivo
                                                    </span>
                                                </div>
                                                <button
                                                    @click.stop="toggleMarkSession(session, !session.is_marked)"
                                                    :class="session.is_marked ? 'text-yellow-500' : 'text-gray-400'"
                                                    class="hover:text-yellow-600 text-sm"
                                                    :title="session.is_marked ? 'Desmarcar' : 'Marcar'"
                                                >
                                                    <i :class="session.is_marked ? 'fas fa-star' : 'far fa-star'"></i>
                                                </button>
                                            </div>
                                            <div class="text-xs text-gray-600 mb-1 flex items-center space-x-3">
                                                <span><i class="fas fa-comment mr-1"></i>{{ session.message_count }} mensajes</span>
                                                <span><i class="fas fa-clock mr-1"></i>{{ formatTimestamp(session.start_time) }}</span>
                                            </div>
                                            
                                            <!-- Recent messages preview -->
                                            <div v-if="session.recent_messages?.length" class="mt-1">
                                                <div v-for="msg in session.recent_messages.slice(0, 1)" 
                                                     :key="msg.id"
                                                     class="text-xs text-gray-500 truncate">
                                                    <i :class="getMessageTypeIcon(msg.message_type)" class="mr-1"></i>
                                                    {{ formatMessageContent(msg.content, 60) }}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center space-x-1 ml-3 flex-shrink-0">
                                            <button
                                                @click.stop="exportSession(session, 'json')"
                                                class="text-gray-400 hover:text-blue-500 text-xs p-1"
                                                title="Exportar JSON"
                                            >
                                                <i class="fas fa-download"></i>
                                            </button>
                                            <button
                                                @click.stop="exportSession(session, 'markdown')"
                                                class="text-gray-400 hover:text-green-500 text-xs p-1"
                                                title="Exportar Markdown"
                                            >
                                                <i class="fab fa-markdown"></i>
                                            </button>
                                            <i class="fas fa-chevron-right text-gray-400 text-xs ml-1"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DE RESULTADOS DE BÚSQUEDA -->
                <div v-if="activeView === 'search'" class="space-y-6">
                    <!-- Breadcrumb -->
                    <div class="flex items-center space-x-2 text-sm">
                        <button @click="goToDashboard" class="text-blue-600 hover:text-blue-700">
                            <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                        </button>
                        <span class="text-gray-400">/</span>
                        <button @click="goToProjects" class="text-blue-600 hover:text-blue-700">
                            Proyectos
                        </button>
                        <span class="text-gray-400">/</span>
                        <span class="text-gray-900 font-medium">Búsqueda</span>
                    </div>

                    <!-- Search Results -->
                    <div class="bg-white rounded-lg shadow-sm">
                        <div class="p-4 border-b flex justify-between items-center">
                            <h2 class="text-lg font-medium text-gray-900">
                                <i class="fas fa-search text-blue-500 mr-2"></i>
                                Resultados de Búsqueda
                            </h2>
                            <button @click="goToProjects" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-arrow-left mr-1"></i>Volver a Proyectos
                            </button>
                        </div>
                        
                        <div class="p-4">
                            <div v-if="store.searchResults.length" class="space-y-4">
                                <div v-for="result in store.searchResults" :key="result.message.id" 
                                     class="search-result bg-gray-50 p-4 rounded-lg">
                                    <div class="flex justify-between items-start mb-2">
                                        <div>
                                            <span class="font-mono text-sm bg-gray-200 px-2 py-1 rounded">
                                                {{ result.context.session_id.substring(0, 8) }}
                                            </span>
                                            <span class="ml-2 text-sm text-gray-600">{{ result.context.project_name }}</span>
                                        </div>
                                        <span class="text-xs text-gray-500">
                                            {{ formatTimestamp(result.message.timestamp) }}
                                        </span>
                                    </div>
                                    
                                    <div class="message-content">
                                        <div class="flex items-start space-x-2">
                                            <i :class="getMessageTypeIcon(result.message.message_type)"></i>
                                            <div class="flex-1">
                                                <p class="text-sm" v-html="result.message.content"></p>
                                                <div v-if="result.highlights?.length" class="mt-2">
                                                    <div v-for="highlight in result.highlights" :key="highlight" 
                                                         class="text-xs text-gray-600 bg-yellow-100 p-1 rounded mt-1"
                                                         v-html="highlight">
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div v-else class="text-center py-8 text-gray-500">
                                <i class="fas fa-search text-4xl mb-4"></i>
                                <p>No se encontraron resultados para "{{ store.searchQuery }}"</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DE DETALLES DE SESIÓN -->
                <div v-if="activeView === 'details'" class="space-y-6">
                    <!-- Breadcrumb -->
                    <div class="flex items-center space-x-2 text-sm">
                        <button @click="goToDashboard" class="text-blue-600 hover:text-blue-700">
                            <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                        </button>
                        <span class="text-gray-400">/</span>
                        <button @click="goToProjects" class="text-blue-600 hover:text-blue-700">
                            Proyectos
                        </button>
                        <span class="text-gray-400">/</span>
                        <button @click="goBackToSessions" class="text-blue-600 hover:text-blue-700">
                            {{ store.selectedProject?.name }}
                        </button>
                        <span class="text-gray-400">/</span>
                        <span class="text-gray-900 font-medium">{{ store.selectedSession?.short_id }}</span>
                    </div>

                    <!-- Session Details -->
                    <div class="bg-white rounded-lg shadow-sm" style="height: calc(100vh - 180px);">
                        <div class="p-3 border-b flex justify-between items-center">
                            <div class="flex items-center flex-1 min-w-0">
                                <i class="fas fa-comments text-purple-500 mr-2 flex-shrink-0"></i>
                                <div class="flex-1 min-w-0 mr-4">
                                    <h2 class="text-lg font-medium text-gray-900 truncate">{{ store.selectedSession?.short_id }}</h2>
                                    <div class="flex items-center space-x-4 text-xs text-gray-600 mt-1">
                                        <span><i class="fas fa-project-diagram mr-1"></i>{{ store.selectedProject?.name }}</span>
                                        <span><i class="fas fa-comment mr-1"></i>{{ store.selectedSession?.message_count }}</span>
                                        <span><i class="fas fa-clock mr-1"></i>{{ formatTimestamp(store.selectedSession?.start_time) }}</span>
                                        <span><i class="fas fa-history mr-1"></i>{{ formatTimestamp(store.selectedSession?.last_activity) }}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="flex items-center space-x-1 flex-shrink-0">
                                <button
                                    @click="exportSession(store.selectedSession, 'json')"
                                    class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                                    title="Exportar JSON"
                                >
                                    <i class="fas fa-download"></i>
                                </button>
                                <button
                                    @click="exportSession(store.selectedSession, 'markdown')"
                                    class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                                    title="Exportar Markdown"
                                >
                                    <i class="fab fa-markdown"></i>
                                </button>
                                <button
                                    @click="toggleMarkSession(store.selectedSession, !store.selectedSession.is_marked)"
                                    :class="store.selectedSession?.is_marked 
                                        ? 'bg-yellow-100 text-yellow-600'
                                        : 'bg-gray-100 text-gray-600'"
                                    class="px-2 py-1 text-xs rounded hover:opacity-80 transition-opacity"
                                    :title="store.selectedSession?.is_marked ? 'Desmarcar' : 'Marcar'"
                                >
                                    <i :class="store.selectedSession?.is_marked ? 'fas fa-star' : 'far fa-star'"></i>
                                </button>
                                <button @click="goBackToSessions" class="px-2 py-1 text-xs text-blue-600 hover:text-blue-700 transition-colors">
                                    <i class="fas fa-arrow-left mr-1"></i>Volver
                                </button>
                            </div>
                        </div>
                        
                        <!-- Session messages preview -->
                        <div v-if="selectedSessionDetails?.messages" class="p-4" style="height: calc(100% - 4rem); overflow-y: auto; overflow-x: hidden;">
                            <h4 class="font-medium text-gray-900 mb-4 text-sm">Conversación</h4>
                            <div class="space-y-3">
                                <div v-for="msg in selectedSessionDetails.messages" 
                                     :key="msg.id"
                                     class="flex w-full"
                                     :class="msg.message_type === 'user' ? 'justify-end' : 'justify-start'">
                                    <div class="max-w-[75%] p-3 rounded-lg text-sm shadow-sm"
                                         :class="msg.message_type === 'user' 
                                             ? 'bg-blue-500 text-white rounded-br-sm'
                                             : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'">
                                        <div class="flex items-center space-x-2 mb-2 opacity-80">
                                            <i :class="getMessageTypeIcon(msg.message_type)"></i>
                                            <span class="text-xs font-medium">
                                                {{ msg.message_type === 'user' ? 'Usuario' : 'Asistente' }}
                                            </span>
                                            <span class="text-xs">
                                                {{ formatTimestamp(msg.timestamp) }}
                                            </span>
                                        </div>
                                        <div class="break-words whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `
};

// Hacer apiService disponible globalmente para debugging
window.apiService = apiService;

// Inicializar la aplicación Vue
console.log('🎯 Creating Vue app...');
try {
    const app = createApp({
        components: {
            Dashboard
        }
    });
    
    console.log('⚡ Mounting Vue app to #app...');
    const mountedApp = app.mount('#app');
    
    console.log('🎉 Vue app mounted successfully!', mountedApp);
    window.vueApp = mountedApp;
    
} catch (error) {
    console.error('💥 Error creating/mounting Vue app:', error);
}
