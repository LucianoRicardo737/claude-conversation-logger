const { createApp } = Vue;

// Configuración global
const API_BASE_URL = window.location.origin;

// Importar servicios y componentes
// Como estamos en el navegador sin build process, necesitamos usar script tags
// El componente SearchComponent se definirá aquí mismo

// Store global para gestión del estado
const store = {
    state: {
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
        connectionStatus: 'disconnected' // 'connected', 'connecting', 'disconnected'
    },
    
    mutations: {
        setConversations(conversations) {
            this.state.conversations = conversations;
        },
        
        setSelectedProject(project) {
            this.state.selectedProject = project;
            this.state.selectedSession = null; // Reset session
        },
        
        setSelectedSession(session) {
            this.state.selectedSession = session;
        },
        
        setSearchResults(results) {
            this.state.searchResults = results;
        },
        
        setSearchQuery(query) {
            this.state.searchQuery = query;
        },
        
        setLoading(loading) {
            this.state.isLoading = loading;
        },
        
        updateLiveStats(stats) {
            this.state.liveStats = { ...this.state.liveStats, ...stats };
        },
        
        setConnectionStatus(status) {
            this.state.connectionStatus = status;
        },
        
        addNewMessage(message) {
            // Agregar mensaje a la lista de mensajes recientes
            this.state.liveStats.recent_activity.last_messages.unshift(message);
            if (this.state.liveStats.recent_activity.last_messages.length > 10) {
                this.state.liveStats.recent_activity.last_messages.pop();
            }
            this.state.liveStats.total_messages++;
        }
    }
};

// API Service
const apiService = {
    async getConversationTree(filters = {}) {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/conversations/tree`, {
                params: filters
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching conversation tree:', error);
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
            store: store.state,
            activeView: 'tree', // 'tree', 'search', 'details'
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
        await this.loadConversationTree();
        this.initializeWebSocket();
    },
    
    methods: {
        async loadConversationTree() {
            store.mutations.setLoading(true);
            try {
                const data = await apiService.getConversationTree();
                store.mutations.setConversations(data.projects || []);
            } catch (error) {
                console.error('Error loading conversations:', error);
            } finally {
                store.mutations.setLoading(false);
            }
        },
        
        async selectProject(project) {
            store.mutations.setSelectedProject(project);
            this.activeView = 'tree';
        },
        
        async selectSession(session) {
            store.mutations.setSelectedSession(session);
            await this.loadSessionDetails(session.session_id);
            this.activeView = 'details';
        },
        
        async loadSessionDetails(sessionId) {
            store.mutations.setLoading(true);
            try {
                const details = await apiService.getConversationDetails(sessionId);
                this.selectedSessionDetails = details;
            } catch (error) {
                console.error('Error loading session details:', error);
            } finally {
                store.mutations.setLoading(false);
            }
        },
        
        async performSearch() {
            if (!this.store.searchQuery.trim()) return;
            
            store.mutations.setLoading(true);
            try {
                const results = await apiService.searchConversations(
                    this.store.searchQuery,
                    this.searchFilters
                );
                store.mutations.setSearchResults(results.results || []);
                this.activeView = 'search';
            } catch (error) {
                console.error('Error performing search:', error);
            } finally {
                store.mutations.setLoading(false);
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
            // Simular conexión WebSocket por ahora (hasta implementar servidor WS real)
            store.mutations.setConnectionStatus('connecting');
            
            setTimeout(() => {
                store.mutations.setConnectionStatus('connected');
                
                // Polling inteligente basado en actividad
                let pollInterval = 10000; // Empezar con 10 segundos
                
                const poll = async () => {
                    try {
                        await this.loadConversationTree();
                        
                        // Si hay actividad reciente, reducir intervalo
                        const hasRecentActivity = this.store.conversations.some(project => 
                            project.sessions.some(session => session.is_active)
                        );
                        
                        pollInterval = hasRecentActivity ? 5000 : 30000;
                        
                    } catch (error) {
                        console.error('Error in polling:', error);
                        pollInterval = Math.min(pollInterval * 1.5, 60000); // Exponential backoff
                    }
                    
                    setTimeout(poll, pollInterval);
                };
                
                poll();
                
                // Simular evento de nuevo mensaje ocasionalmente
                setInterval(() => {
                    if (Math.random() > 0.7) { // 30% chance
                        const mockMessage = {
                            id: 'mock_' + Date.now(),
                            project_name: 'claude-conversation-logger',
                            message_type: 'user',
                            content: 'Mensaje simulado para testing del dashboard',
                            timestamp: Date.now()
                        };
                        store.mutations.addNewMessage(mockMessage);
                    }
                }, 45000); // Cada 45 segundos
                
            }, 1000);
        },
        
        clearSearch() {
            store.mutations.setSearchQuery('');
            store.mutations.setSearchResults([]);
            this.activeView = 'tree';
        },
        
        goBackToTree() {
            this.activeView = 'tree';
            store.mutations.setSelectedSession(null);
        }
    },
    
    template: `
        <div class="min-h-screen bg-gray-50">
            <!-- Header -->
            <header class="bg-white shadow-sm border-b">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between items-center h-16">
                        <div class="flex items-center">
                            <h1 class="text-xl font-semibold text-gray-900">
                                <i class="fas fa-comments text-blue-500 mr-2"></i>
                                Claude Conversation Logger
                            </h1>
                        </div>
                        
                        <div class="flex items-center space-x-4">
                            <!-- Connection Status -->
                            <div class="flex items-center">
                                <i :class="[connectionStatusIcon, connectionStatusColor, 'mr-1']"></i>
                                <span :class="[connectionStatusColor, 'text-sm capitalize']">
                                    {{ store.connectionStatus }}
                                </span>
                            </div>
                            
                            <!-- Live Stats -->
                            <div class="hidden md:flex items-center space-x-4 text-sm text-gray-600">
                                <span>
                                    <i class="fas fa-comment text-blue-400 mr-1"></i>
                                    {{ store.liveStats.total_messages }} mensajes
                                </span>
                                <span>
                                    <i class="fas fa-layer-group text-green-400 mr-1"></i>
                                    {{ store.liveStats.total_sessions }} sesiones
                                </span>
                                <span>
                                    <i class="fas fa-project-diagram text-purple-400 mr-1"></i>
                                    {{ store.liveStats.active_projects }} proyectos
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <!-- Search Bar -->
                <div class="mb-6 bg-white rounded-lg shadow-sm p-4">
                    <div class="flex space-x-4">
                        <div class="flex-1">
                            <input
                                v-model="store.searchQuery"
                                @keyup.enter="performSearch"
                                type="text"
                                placeholder="Buscar en conversaciones..."
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <button
                            @click="performSearch"
                            :disabled="!store.searchQuery.trim() || store.isLoading"
                            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i class="fas fa-search mr-2"></i>
                            Buscar
                        </button>
                        <button
                            v-if="store.searchQuery"
                            @click="clearSearch"
                            class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                        >
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <!-- Search Filters -->
                    <div class="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <select v-model="searchFilters.project_filter" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                            <option value="">Todos los proyectos</option>
                            <option v-for="project in store.conversations" :key="project.name" :value="project.name">
                                {{ project.name }}
                            </option>
                        </select>
                        
                        <select v-model="searchFilters.message_type_filter" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                            <option value="">Todos los tipos</option>
                            <option value="user">Usuario</option>
                            <option value="assistant">Asistente</option>
                            <option value="system">Sistema</option>
                        </select>
                        
                        <input
                            v-model="searchFilters.start_date"
                            type="date"
                            class="px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                        
                        <label class="flex items-center space-x-2 text-sm">
                            <input v-model="searchFilters.only_marked" type="checkbox" class="rounded">
                            <span>Solo marcadas</span>
                        </label>
                    </div>
                </div>

                <!-- Loading Spinner -->
                <div v-if="store.isLoading" class="flex justify-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>

                <!-- Main Content -->
                <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <!-- Left Panel: Projects/Sessions Tree or Search Results -->
                    <div class="lg:col-span-2">
                        <!-- Conversation Tree View -->
                        <div v-if="activeView === 'tree'" class="bg-white rounded-lg shadow-sm">
                            <div class="p-4 border-b">
                                <h2 class="text-lg font-medium text-gray-900">
                                    <i class="fas fa-sitemap text-blue-500 mr-2"></i>
                                    Conversaciones por Proyecto
                                </h2>
                            </div>
                            
                            <div class="conversation-tree p-4">
                                <div v-for="project in filteredProjects" :key="project.name" class="mb-6">
                                    <div
                                        @click="selectProject(project)"
                                        class="project-card bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 cursor-pointer border border-blue-100"
                                    >
                                        <div class="flex justify-between items-center">
                                            <div>
                                                <h3 class="font-semibold text-gray-900">{{ project.name }}</h3>
                                                <p class="text-sm text-gray-600 mt-1">
                                                    {{ project.message_count }} mensajes • 
                                                    {{ project.sessions.length }} sesiones •
                                                    Última actividad: {{ formatTimestamp(project.last_activity) }}
                                                </p>
                                            </div>
                                            <div class="text-right">
                                                <div class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                                                    {{ project.sessions.filter(s => s.is_active).length }} activas
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Sessions for selected project -->
                                    <div v-if="store.selectedProject?.name === project.name" class="mt-3 ml-4">
                                        <div v-for="session in project.sessions" :key="session.session_id" 
                                             @click="selectSession(session)"
                                             class="session-item bg-white border border-gray-200 rounded-lg p-3 mb-3 cursor-pointer hover:border-blue-300">
                                            <div class="flex justify-between items-start">
                                                <div class="flex-1">
                                                    <div class="flex items-center space-x-2">
                                                        <span class="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                                            {{ session.short_id }}
                                                        </span>
                                                        <div v-if="session.is_active" class="live-indicator">
                                                            <span class="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                                                                <i class="fas fa-circle mr-1"></i>En vivo
                                                            </span>
                                                        </div>
                                                        <button
                                                            @click.stop="toggleMarkSession(session, !session.is_marked)"
                                                            class="text-yellow-500 hover:text-yellow-600"
                                                        >
                                                            <i :class="session.is_marked ? 'fas fa-star' : 'far fa-star'"></i>
                                                        </button>
                                                    </div>
                                                    <p class="text-sm text-gray-600 mt-1">
                                                        {{ session.message_count }} mensajes • 
                                                        Iniciada: {{ formatTimestamp(session.start_time) }}
                                                    </p>
                                                    
                                                    <!-- Recent messages preview -->
                                                    <div v-if="session.recent_messages?.length" class="mt-2 space-y-1">
                                                        <div v-for="msg in session.recent_messages.slice(0, 2)" 
                                                             :key="msg.id"
                                                             class="text-xs text-gray-500 truncate">
                                                            <i :class="getMessageTypeIcon(msg.message_type)" class="mr-1"></i>
                                                            {{ formatMessageContent(msg.content, 80) }}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div class="flex space-x-1 ml-2">
                                                    <button
                                                        @click.stop="exportSession(session, 'json')"
                                                        class="text-blue-500 hover:text-blue-600 text-sm"
                                                        title="Exportar JSON"
                                                    >
                                                        <i class="fas fa-download"></i>
                                                    </button>
                                                    <button
                                                        @click.stop="exportSession(session, 'markdown')"
                                                        class="text-green-500 hover:text-green-600 text-sm"
                                                        title="Exportar Markdown"
                                                    >
                                                        <i class="fab fa-markdown"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div v-if="!filteredProjects.length" class="text-center py-8 text-gray-500">
                                    <i class="fas fa-inbox text-4xl mb-4"></i>
                                    <p>No hay conversaciones disponibles</p>
                                </div>
                            </div>
                        </div>

                        <!-- Search Results View -->
                        <div v-if="activeView === 'search'" class="bg-white rounded-lg shadow-sm">
                            <div class="p-4 border-b flex justify-between items-center">
                                <h2 class="text-lg font-medium text-gray-900">
                                    <i class="fas fa-search text-blue-500 mr-2"></i>
                                    Resultados de Búsqueda
                                </h2>
                                <button @click="goBackToTree" class="text-blue-600 hover:text-blue-700">
                                    <i class="fas fa-arrow-left mr-1"></i>Volver
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

                    <!-- Right Panel: Session Details -->
                    <div v-if="activeView === 'details' && store.selectedSession" class="bg-white rounded-lg shadow-sm">
                        <div class="p-4 border-b flex justify-between items-center">
                            <h2 class="text-lg font-medium text-gray-900">
                                <i class="fas fa-comments text-purple-500 mr-2"></i>
                                Detalles de Sesión
                            </h2>
                            <button @click="goBackToTree" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div class="p-4">
                            <div class="mb-4">
                                <h3 class="font-semibold text-gray-900 mb-2">
                                    {{ store.selectedSession.short_id }}
                                </h3>
                                <div class="text-sm text-gray-600 space-y-1">
                                    <p><strong>Proyecto:</strong> {{ store.selectedProject?.name }}</p>
                                    <p><strong>Mensajes:</strong> {{ store.selectedSession.message_count }}</p>
                                    <p><strong>Iniciada:</strong> {{ formatTimestamp(store.selectedSession.start_time) }}</p>
                                    <p><strong>Última actividad:</strong> {{ formatTimestamp(store.selectedSession.last_activity) }}</p>
                                </div>
                            </div>
                            
                            <div class="space-y-2 mb-4">
                                <button
                                    @click="exportSession(store.selectedSession, 'json')"
                                    class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                >
                                    <i class="fas fa-download mr-2"></i>
                                    Exportar JSON
                                </button>
                                <button
                                    @click="exportSession(store.selectedSession, 'markdown')"
                                    class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                >
                                    <i class="fab fa-markdown mr-2"></i>
                                    Exportar Markdown
                                </button>
                                <button
                                    @click="toggleMarkSession(store.selectedSession, !store.selectedSession.is_marked)"
                                    :class="store.selectedSession.is_marked 
                                        ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                        : 'bg-gray-100 text-gray-800 border-gray-300'"
                                    class="w-full px-4 py-2 border rounded-lg text-sm"
                                >
                                    <i :class="store.selectedSession.is_marked ? 'fas fa-star' : 'far fa-star'" class="mr-2"></i>
                                    {{ store.selectedSession.is_marked ? 'Quitar marca' : 'Marcar importante' }}
                                </button>
                            </div>
                            
                            <!-- Session messages preview -->
                            <div v-if="selectedSessionDetails?.messages" class="mt-4">
                                <h4 class="font-medium text-gray-900 mb-2">Mensajes Recientes</h4>
                                <div class="space-y-2 max-h-64 overflow-y-auto">
                                    <div v-for="msg in selectedSessionDetails.messages.slice(-5)" 
                                         :key="msg.id"
                                         class="p-2 bg-gray-50 rounded text-sm">
                                        <div class="flex items-center space-x-2 mb-1">
                                            <i :class="getMessageTypeIcon(msg.message_type)"></i>
                                            <span class="font-medium capitalize">{{ msg.message_type }}</span>
                                            <span class="text-xs text-gray-500">
                                                {{ formatTimestamp(msg.timestamp) }}
                                            </span>
                                        </div>
                                        <p class="text-gray-700">{{ formatMessageContent(msg.content, 100) }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Panel: Recent Activity (when no session selected) -->
                    <div v-if="activeView === 'tree'" class="bg-white rounded-lg shadow-sm">
                        <div class="p-4 border-b">
                            <h2 class="text-lg font-medium text-gray-900">
                                <i class="fas fa-clock text-green-500 mr-2"></i>
                                Actividad Reciente
                            </h2>
                        </div>
                        
                        <div class="p-4">
                            <div class="space-y-3">
                                <div v-for="msg in store.liveStats.recent_activity.last_messages.slice(0, 5)" 
                                     :key="msg.id"
                                     class="p-3 bg-gray-50 rounded-lg">
                                    <div class="flex items-center space-x-2 mb-1">
                                        <i :class="getMessageTypeIcon(msg.message_type)"></i>
                                        <span class="font-medium text-sm">{{ msg.project_name }}</span>
                                        <span class="text-xs text-gray-500">
                                            {{ formatTimestamp(msg.timestamp) }}
                                        </span>
                                    </div>
                                    <p class="text-sm text-gray-700">
                                        {{ formatMessageContent(msg.content, 80) }}
                                    </p>
                                </div>
                                
                                <div v-if="!store.liveStats.recent_activity.last_messages.length" 
                                     class="text-center py-4 text-gray-500">
                                    <i class="fas fa-hourglass-empty text-2xl mb-2"></i>
                                    <p class="text-sm">Sin actividad reciente</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};

// Inicializar la aplicación Vue
createApp({
    components: {
        Dashboard
    }
}).mount('#app');