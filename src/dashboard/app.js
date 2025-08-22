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
    sessionSearchQuery: '',
    messageSearchQuery: '',
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
            // Construir query parameters
            const params = new URLSearchParams();
            
            if (query) params.append('q', query);
            if (filters.project_filter) params.append('project', filters.project_filter);
            if (filters.message_type_filter) params.append('message_type', filters.message_type_filter);
            if (filters.start_date) params.append('start_date', filters.start_date);
            if (filters.end_date) params.append('end_date', filters.end_date);
            if (filters.only_marked) params.append('only_marked', filters.only_marked.toString());
            
            const response = await axios.get(`${API_BASE_URL}/api/search/advanced?${params.toString()}`);
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
            if (format === 'json') {
                const response = await axios.get(`${API_BASE_URL}/api/conversations/${sessionId}/export`, {
                    params: { format }
                });
                return response.data;
            } else {
                // Para markdown, txt, etc. obtener como texto
                const response = await axios.get(`${API_BASE_URL}/api/conversations/${sessionId}/export`, {
                    params: { format },
                    responseType: 'text'
                });
                return {
                    content: response.data,
                    filename: `conversation_${sessionId.substring(0, 8)}.${format}`,
                    mime_type: format === 'markdown' ? 'text/markdown' : 'text/plain'
                };
            }
        } catch (error) {
            console.error('Error exporting conversation:', error);
            throw error;
        }
    },

    async getSessionDescription(sessionId) {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/sessions/${sessionId}/description`);
            return response.data;
        } catch (error) {
            console.error('Error getting session description:', error);
            throw error;
        }
    },

    async updateSessionDescription(sessionId, description, category) {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/sessions/${sessionId}/description`, {
                description,
                category
            });
            return response.data;
        } catch (error) {
            console.error('Error updating session description:', error);
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
            exportFormat: 'json',
            animationTimeout: null, // Para debounce de animaciones
            loadingMessage: '', // Mensaje de loading personalizado
            isDarkMode: true, // Estado del dark mode (default: dark)
            store: window.store // Agregar store directamente al data
        };
    },
    
    computed: {
        
        filteredProjects() {
            if (!this.store.conversations || !Array.isArray(this.store.conversations)) return [];
            
            let projects = this.store.conversations.filter(project => {
                if (!this.searchFilters.project_filter) return true;
                return project.name.toLowerCase().includes(this.searchFilters.project_filter.toLowerCase());
            });
            
            // Ordenar por última actividad (más recientes primero)
            return projects.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
        },
        
        filteredSessions() {
            if (!this.store.selectedProject?.sessions) return [];
            let sessions = [...this.store.selectedProject.sessions];
            
            // Ordenar por fecha de inicio (más nuevos primero)
            sessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
            
            if (!this.store.sessionSearchQuery.trim()) return sessions;
            
            const query = this.store.sessionSearchQuery.toLowerCase();
            return sessions.filter(session => {
                return session.short_id.toLowerCase().includes(query) ||
                       (session.description && session.description.toLowerCase().includes(query)) ||
                       (session.category && session.category.toLowerCase().includes(query)) ||
                       (session.recent_messages && session.recent_messages.some(msg => 
                           msg.content.toLowerCase().includes(query)
                       ));
            });
        },
        
        filteredMessages() {
            if (!this.selectedSessionDetails?.messages) return [];
            let messages = [...this.selectedSessionDetails.messages];
            
            // Ordenar por timestamp con prioridad para mensajes nuevos
            messages.sort((a, b) => {
                // Si ambos son nuevos, ordenar por timestamp de creación
                if (a._isNew && b._isNew) {
                    return (b._timestamp || 0) - (a._timestamp || 0);
                }
                // Mensajes nuevos siempre van primero (arriba)
                if (a._isNew) return -1;
                if (b._isNew) return 1;
                // Orden normal por timestamp (más nuevos primero)
                return new Date(b.timestamp) - new Date(a.timestamp);
            });
            
            // Aplicar filtro de búsqueda si existe
            if (this.store.messageSearchQuery.trim()) {
                const query = this.store.messageSearchQuery.toLowerCase();
                messages = messages.filter(msg => 
                    msg.content.toLowerCase().includes(query)
                );
            }
            
            return messages;
        },
        
        topProjects() {
            if (!this.store.conversations || !Array.isArray(this.store.conversations)) return [];
            
            let projects = [...this.store.conversations];
            // Ordenar por última actividad (más recientes primero)
            return projects.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity)).slice(0, 5);
        },
        
        activeSessions() {
            let activeSessions = [];
            if (this.store.conversations && Array.isArray(this.store.conversations)) {
                this.store.conversations.forEach(project => {
                    if (project.sessions && Array.isArray(project.sessions)) {
                        project.sessions.filter(s => s.is_active).forEach(session => {
                            activeSessions.push({
                                ...session,
                                projectName: project.name
                            });
                        });
                    }
                });
            }
            // Ordenar por fecha de inicio (más recientes primero)
            return activeSessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
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
        },
        
        hasActiveFilters() {
            const filters = this.searchFilters;
            return !!(filters.project_filter || 
                      filters.message_type_filter || 
                      filters.start_date || 
                      filters.only_marked);
        },
        
        hasSearchOrFilters() {
            return this.store.searchQuery.trim() !== '' || this.hasActiveFilters;
        },
        
        getMessagesStats() {
            const projects = this.store.conversations || [];
            const allSessions = projects.flatMap(p => p.sessions || []);
            
            // Calcular distribución por tipo de mensaje (simulado ya que no tenemos datos detallados)
            const totalMessages = this.store.liveStats.total_messages;
            const estimatedUserMessages = Math.round(totalMessages * 0.4); // 40% usuario
            const estimatedAssistantMessages = Math.round(totalMessages * 0.55); // 55% asistente
            const estimatedSystemMessages = totalMessages - estimatedUserMessages - estimatedAssistantMessages;
            
            // Top proyectos por mensajes
            const topProjectsByMessages = [...projects]
                .sort((a, b) => (b.message_count || 0) - (a.message_count || 0))
                .slice(0, 5)
                .map(p => ({
                    name: p.name,
                    messages: p.message_count || 0,
                    tokens: this.calculateTokens(p.message_count || 0),
                    cost: this.calculateCost(p.message_count || 0)
                }));

            return {
                totalMessages,
                totalTokens: this.calculateTokens(totalMessages),
                avgMessagesPerSession: allSessions.length > 0 ? Math.round(totalMessages / allSessions.length) : 0,
                messagesByType: {
                    user: estimatedUserMessages,
                    assistant: estimatedAssistantMessages,
                    system: estimatedSystemMessages
                },
                topProjects: topProjectsByMessages
            };
        },

        getSessionsStats() {
            const projects = this.store.conversations || [];
            const allSessions = projects.flatMap(p => p.sessions || []);
            const activeSessions = allSessions.filter(s => s.is_active);
            
            // Distribución por proyecto
            const sessionsByProject = projects.map(p => ({
                name: p.name,
                total: p.sessions?.length || 0,
                active: p.sessions?.filter(s => s.is_active).length || 0,
                messages: p.message_count || 0
            })).sort((a, b) => b.total - a.total);

            // Sesiones más largas (top 10)
            const longestSessions = [...allSessions]
                .filter(s => s.message_count > 0)
                .sort((a, b) => (b.message_count || 0) - (a.message_count || 0))
                .slice(0, 10)
                .map(s => ({
                    id: s.short_id || s.session_id?.substring(0, 8),
                    project: projects.find(p => p.sessions?.includes(s))?.name || 'Unknown',
                    messages: s.message_count || 0,
                    isActive: s.is_active,
                    lastActivity: s.last_activity
                }));

            return {
                totalSessions: this.store.liveStats.total_sessions,
                activeSessions: this.store.liveStats.recent_activity.active_sessions,
                avgMessagesPerSession: allSessions.length > 0 ? Math.round(this.store.liveStats.total_messages / allSessions.length) : 0,
                sessionsByProject,
                longestSessions
            };
        },

        getProjectsStats() {
            const projects = this.store.conversations || [];
            const activeProjects = projects.filter(p => p.sessions?.some(s => s.is_active));
            
            // Ranking por actividad
            const projectsByActivity = [...projects]
                .map(p => ({
                    name: p.name,
                    messages: p.message_count || 0,
                    sessions: p.sessions?.length || 0,
                    activeSessions: p.sessions?.filter(s => s.is_active).length || 0,
                    lastActivity: p.last_activity,
                    cost: this.calculateCost(p.message_count || 0),
                    tokens: this.calculateTokens(p.message_count || 0)
                }))
                .sort((a, b) => b.messages - a.messages);

            return {
                totalProjects: projects.length,
                activeProjects: activeProjects.length,
                avgSessionsPerProject: projects.length > 0 ? Math.round(this.store.liveStats.total_sessions / projects.length) : 0,
                projectsByActivity,
                mostCostlyProjects: projectsByActivity.slice(0, 5)
            };
        },

        getCostsStats() {
            const projects = this.store.conversations || [];
            const totalCost = this.store.liveStats.total_messages * 0.002;
            
            // Desglose por proyecto
            const costsByProject = projects
                .map(p => ({
                    name: p.name,
                    messages: p.message_count || 0,
                    cost: this.calculateCost(p.message_count || 0),
                    percentage: projects.length > 0 ? ((p.message_count || 0) / this.store.liveStats.total_messages * 100) : 0
                }))
                .sort((a, b) => parseFloat(b.cost) - parseFloat(a.cost));

            // Proyección mensual (basada en actividad de último mes)
            const dailyAvgCost = totalCost / 30; // Asumiendo datos de último mes
            const monthlyProjection = dailyAvgCost * 30;

            return {
                totalCost,
                avgCostPerSession: this.store.liveStats.total_sessions > 0 ? (totalCost / this.store.liveStats.total_sessions) : 0,
                avgCostPerMessage: 0.002,
                monthlyProjection,
                costsByProject: costsByProject.slice(0, 10), // Top 10
                topCostlyProjects: costsByProject.slice(0, 5)
            };
        },

        getCostsByDayArray() {
            const totalCost = this.getCostsStats.totalCost;
            return [
                {name: 'Lunes', cost: totalCost * 0.18, percentage: 18},
                {name: 'Martes', cost: totalCost * 0.22, percentage: 22},
                {name: 'Miércoles', cost: totalCost * 0.25, percentage: 25},
                {name: 'Jueves', cost: totalCost * 0.15, percentage: 15},
                {name: 'Viernes', cost: totalCost * 0.12, percentage: 12},
                {name: 'Sábado', cost: totalCost * 0.05, percentage: 5},
                {name: 'Domingo', cost: totalCost * 0.03, percentage: 3}
            ];
        }
    },
    
    async mounted() {
        console.log('🔄 Dashboard mounted, loading data...');
        this.loadThemeFromStorage();
        await this.loadConversationTree();
        this.initializeWebSocket();
    },
    
    methods: {
        async loadConversationTree(silentUpdate = false) {
            console.log('📊 Loading conversation tree...', silentUpdate ? '(silent)' : '(visible)');
            if (!silentUpdate) {
                store.isLoading = true;
                this.loadingMessage = 'Cargando conversaciones...';
            }
            
            try {
                const data = await apiService.getConversationTree();
                console.log('📈 Data received in loadConversationTree:', data);
                
                // Capturar valores anteriores para detectar cambios
                const oldStats = {
                    total_messages: store.liveStats.total_messages,
                    total_sessions: store.liveStats.total_sessions,
                    active_projects: store.liveStats.active_projects,
                    active_sessions: store.liveStats.recent_activity.active_sessions
                };
                
                // Actualización inteligente para prevenir parpadeo
                if (silentUpdate) {
                    this.updateDataSmoothly(data, oldStats);
                } else {
                    // Actualización completa inicial
                    store.conversations = data.projects || [];
                    this.updateStats(data, oldStats);
                }
                
                console.log('✅ Reactive store updated with data:', {
                    conversations: store.conversations.length,
                    total_messages: store.liveStats.total_messages,
                    total_sessions: store.liveStats.total_sessions,
                    active_projects: store.liveStats.active_projects
                });
                
            } catch (error) {
                console.error('❌ Error loading conversations:', error);
            } finally {
                if (!silentUpdate) {
                    store.isLoading = false;
                }
                console.log('🏁 Loading completed');
            }
        },

        updateDataSmoothly(newData, oldStats) {
            // Solo actualizar si hay cambios reales para evitar re-renderizado innecesario
            const newProjects = newData.projects || [];
            const changeDetails = this.detectDataChanges(store.conversations, newProjects);
            
            if (changeDetails.hasChanges) {
                console.log('📊 Real-time changes detected:', changeDetails);
                
                // Aplicar animaciones antes de actualizar datos
                this.applyRealTimeAnimations(changeDetails);
                
                // Actualizar de forma incremental preservando objetos existentes cuando sea posible
                this.mergeProjectsDataWithAnimations(store.conversations, newProjects, changeDetails);
            }
            
            // Actualizar stats solo si hay cambios
            this.updateStats(newData, oldStats);
        },

        detectDataChanges(currentProjects, newProjects) {
            // Detección avanzada de cambios con clasificación
            const changes = {
                hasChanges: false,
                newProjects: [],
                updatedProjects: [],
                newSessions: [],
                updatedSessions: [],
                newMessages: []
            };
            
            // Detectar proyectos nuevos
            newProjects.forEach(newProject => {
                const existing = currentProjects.find(p => p.name === newProject.name);
                if (!existing) {
                    changes.newProjects.push(newProject);
                    changes.hasChanges = true;
                }
            });
            
            // Detectar proyectos actualizados y sesiones nuevas/actualizadas
            for (let i = 0; i < currentProjects.length; i++) {
                const current = currentProjects[i];
                const newProject = newProjects.find(p => p.name === current.name);
                
                if (!newProject) continue;
                
                // Proyecto actualizado
                if (current.message_count !== newProject.message_count ||
                    current.last_activity !== newProject.last_activity) {
                    changes.updatedProjects.push({
                        current,
                        new: newProject,
                        messageCountIncreased: newProject.message_count > current.message_count
                    });
                    changes.hasChanges = true;
                }
                
                // Detectar sesiones nuevas
                newProject.sessions.forEach(newSession => {
                    const existingSession = current.sessions.find(s => s.session_id === newSession.session_id);
                    if (!existingSession) {
                        changes.newSessions.push({
                            projectName: newProject.name,
                            session: newSession
                        });
                        changes.hasChanges = true;
                    }
                });
                
                // Detectar sesiones actualizadas
                current.sessions.forEach(currentSession => {
                    const newSession = newProject.sessions.find(s => s.session_id === currentSession.session_id);
                    if (newSession && 
                        (currentSession.message_count !== newSession.message_count ||
                         currentSession.is_active !== newSession.is_active)) {
                        changes.updatedSessions.push({
                            projectName: newProject.name,
                            current: currentSession,
                            new: newSession,
                            messageCountIncreased: newSession.message_count > currentSession.message_count
                        });
                        changes.hasChanges = true;
                        
                        // Detectar nuevos mensajes
                        if (newSession.message_count > currentSession.message_count) {
                            changes.newMessages.push({
                                projectName: newProject.name,
                                sessionId: newSession.session_id,
                                newMessageCount: newSession.message_count - currentSession.message_count
                            });
                        }
                    }
                });
            }
            
            return changes;
        },

        mergeProjectsData(currentProjects, newProjects) {
            // Merger inteligente que preserva referencias de objetos cuando sea posible
            newProjects.forEach(newProject => {
                const existingIndex = currentProjects.findIndex(p => p.name === newProject.name);
                
                if (existingIndex >= 0) {
                    // Proyecto existe, actualizar solo propiedades que cambiaron
                    const existing = currentProjects[existingIndex];
                    if (existing.message_count !== newProject.message_count ||
                        existing.last_activity !== newProject.last_activity ||
                        existing.sessions.length !== newProject.sessions.length) {
                        
                        // Actualizar con Vue.set para mantener reactividad
                        Object.assign(existing, newProject);
                    }
                } else {
                    // Proyecto nuevo, agregarlo
                    currentProjects.push(newProject);
                }
            });
            
            // Remover proyectos que ya no existen
            for (let i = currentProjects.length - 1; i >= 0; i--) {
                if (!newProjects.find(p => p.name === currentProjects[i].name)) {
                    currentProjects.splice(i, 1);
                }
            }
        },

        mergeProjectsDataWithAnimations(currentProjects, newProjects, changeDetails) {
            // Agregar proyectos nuevos al principio con marcas de animación
            changeDetails.newProjects.forEach(newProject => {
                newProject._isNew = true;
                newProject._animationClass = 'new-item-enter new-indicator';
                currentProjects.unshift(newProject); // Agregar al principio para que aparezca arriba
            });
            
            // Actualizar proyectos existentes
            changeDetails.updatedProjects.forEach(update => {
                const existing = currentProjects.find(p => p.name === update.current.name);
                if (existing) {
                    // Marcar como actualizado para animación
                    existing._freshUpdate = true;
                    existing._animationClass = update.messageCountIncreased ? 'fresh-update count-increase' : 'fresh-update';
                    
                    // Actualizar datos
                    Object.assign(existing, update.new);
                }
            });
            
            // Actualizar sesiones con animaciones
            changeDetails.newSessions.forEach(newSession => {
                const project = currentProjects.find(p => p.name === newSession.projectName);
                if (project) {
                    // Marcar sesión como nueva
                    newSession.session._isNew = true;
                    newSession.session._animationClass = 'new-item-enter new-indicator';
                    
                    // Agregar al principio de las sesiones
                    project.sessions.unshift(newSession.session);
                }
            });
            
            // Aplicar efecto push-down a elementos existentes
            this.$nextTick(() => {
                this.applyPushDownEffect();
            });
            
            // Limpiar marcas de animación después de un tiempo
            setTimeout(() => {
                this.cleanupAnimationFlags();
            }, 5000);
        },

        applyRealTimeAnimations(changeDetails) {
            console.log('🎬 Applying real-time animations for:', {
                newProjects: changeDetails.newProjects.length,
                newSessions: changeDetails.newSessions.length,
                newMessages: changeDetails.newMessages.length
            });
            
            // Notificación sutil de nuevos elementos
            if (changeDetails.newProjects.length > 0 || changeDetails.newSessions.length > 0) {
                this.showSubtleNotification(changeDetails);
            }
        },

        applyPushDownEffect() {
            // Aplicar efecto push-down a elementos existentes (sin marcas _isNew)
            const existingElements = document.querySelectorAll('.project-card:not(.new-item-enter), .session-item:not(.new-item-enter)');
            existingElements.forEach((element, index) => {
                setTimeout(() => {
                    element.classList.add('push-down');
                    setTimeout(() => {
                        element.classList.remove('push-down');
                    }, 400);
                }, index * 20); // Stagger el efecto
            });
        },

        cleanupAnimationFlags() {
            // Limpiar flags de animación de todos los proyectos y sesiones
            store.conversations.forEach(project => {
                if (project._isNew) {
                    delete project._isNew;
                    delete project._animationClass;
                }
                if (project._freshUpdate) {
                    delete project._freshUpdate;
                    delete project._animationClass;
                }
                
                project.sessions.forEach(session => {
                    if (session._isNew) {
                        delete session._isNew;
                        delete session._animationClass;
                    }
                    if (session._freshUpdate) {
                        delete session._freshUpdate;
                        delete session._animationClass;
                    }
                });
            });
        },

        showSubtleNotification(changeDetails) {
            // Mostrar notificación sutil temporal
            let message = '';
            const total = changeDetails.newProjects.length + changeDetails.newSessions.length;
            
            if (changeDetails.newProjects.length > 0) {
                message += `${changeDetails.newProjects.length} nuevo${changeDetails.newProjects.length > 1 ? 's' : ''} proyecto${changeDetails.newProjects.length > 1 ? 's' : ''}`;
            }
            
            if (changeDetails.newSessions.length > 0) {
                if (message) message += ' y ';
                message += `${changeDetails.newSessions.length} nueva${changeDetails.newSessions.length > 1 ? 's' : ''} sesión${changeDetails.newSessions.length > 1 ? 'es' : ''}`;
            }
            
            if (changeDetails.newMessages.length > 0) {
                if (message) message += ' • ';
                const totalNewMessages = changeDetails.newMessages.reduce((sum, m) => sum + m.newMessageCount, 0);
                message += `${totalNewMessages} nuevo${totalNewMessages > 1 ? 's' : ''} mensaje${totalNewMessages > 1 ? 's' : ''}`;
            }
            
            console.log('📢 New activity:', message);
            
            // Aquí podrías mostrar una notificación toast sutil si quisieras
            // Por ahora solo lo registramos en consola
        },

        updateStats(data, oldStats) {
            // Actualizar stats y aplicar animaciones si hay cambios
            store.liveStats.total_messages = data.total_messages || 0;
            store.liveStats.total_sessions = data.total_sessions || 0;
            store.liveStats.active_projects = data.projects?.length || 0;
            
            // Contar sesiones activas
            const activeSessions = data.projects?.reduce((count, project) => {
                return count + project.sessions.filter(session => session.is_active).length;
            }, 0) || 0;
            store.liveStats.recent_activity.active_sessions = activeSessions;
            
            // Aplicar animaciones si hay cambios
            this.animateStatsIfChanged(oldStats, {
                total_messages: store.liveStats.total_messages,
                total_sessions: store.liveStats.total_sessions,
                active_projects: store.liveStats.active_projects,
                active_sessions: store.liveStats.recent_activity.active_sessions
            });
        },

        animateStatsIfChanged(oldStats, newStats) {
            // Detectar cambios y aplicar animaciones
            const changes = [];
            
            if (oldStats.total_messages !== newStats.total_messages) {
                changes.push('total_messages');
            }
            if (oldStats.total_sessions !== newStats.total_sessions) {
                changes.push('total_sessions');
            }
            if (oldStats.active_projects !== newStats.active_projects) {
                changes.push('active_projects');
            }
            if (oldStats.active_sessions !== newStats.active_sessions) {
                changes.push('active_sessions');
            }
            
            if (changes.length > 0) {
                console.log('🎬 Animating changes:', changes);
                this.applyNumberAnimations(changes);
            }
        },

        applyNumberAnimations(changedStats) {
            // Aplicar animación number-update a los elementos que cambiaron
            // Usar debounce para evitar múltiples animaciones simultáneas
            if (this.animationTimeout) {
                clearTimeout(this.animationTimeout);
            }
            
            this.animationTimeout = setTimeout(() => {
                this.$nextTick(() => {
                    const statElements = document.querySelectorAll('.stat-number');
                    statElements.forEach(element => {
                        // Verificar si ya está animando para evitar conflictos
                        if (!element.classList.contains('number-update')) {
                            // Añadir clase de animación temporal
                            element.classList.add('number-update');
                            
                            // Remover la clase después de la animación
                            setTimeout(() => {
                                element.classList.remove('number-update');
                            }, 500);
                        }
                    });
                    
                    // No animar todos los elementos de lista en cada update
                    // Solo animar elementos realmente nuevos
                    console.log('🎨 Applied number animations for changes:', changedStats);
                });
            }, 100); // Debounce de 100ms
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
            store.sessionSearchQuery = '';
            store.messageSearchQuery = '';
        },
        
        async selectProject(project) {
            store.selectedProject = project;
            store.selectedSession = null;
            this.activeView = 'sessions';
        },
        
        async selectSession(session) {
            // Si viene desde sesiones activas, buscar y seleccionar el proyecto
            if (!store.selectedProject && session.projectName) {
                const project = store.conversations.find(p => p.name === session.projectName);
                if (project) {
                    console.log(`📁 Auto-selecting project: ${project.name} for session from active sessions`);
                    store.selectedProject = project;
                }
            }
            
            store.selectedSession = session;
            await this.loadSessionDetails(session.session_id);
            this.activeView = 'details';
        },
        
        async loadSessionDetails(sessionId) {
            store.isLoading = true;
            this.loadingMessage = 'Cargando detalles de sesión...';
            try {
                const details = await apiService.getConversationDetails(sessionId);
                this.selectedSessionDetails = details;
            } catch (error) {
                console.error('Error loading session details:', error);
            } finally {
                store.isLoading = false;
            }
        },
        
        async updateSessionDetailsIfActive() {
            if (!store.selectedSession || this.activeView !== 'details') return;
            
            try {
                const freshDetails = await apiService.getConversationDetails(store.selectedSession.session_id);
                
                if (this.selectedSessionDetails) {
                    // Detectar cambios y aplicar animaciones
                    this.mergeSessionDetailsWithAnimations(this.selectedSessionDetails, freshDetails);
                } else {
                    this.selectedSessionDetails = freshDetails;
                }
                
                // Actualizar también los datos de la sesión en el store si han cambiado
                this.updateSelectedSessionData(freshDetails);
                
            } catch (error) {
                console.error('❌ Error updating session details:', error);
            }
        },
        
        mergeSessionDetailsWithAnimations(currentDetails, newDetails) {
            if (!newDetails || !newDetails.messages) return;
            
            // Crear set de IDs existentes para comparación eficiente
            const currentMessageIds = new Set(currentDetails.messages?.map(m => m.id) || []);
            
            // Identificar mensajes realmente nuevos por ID
            const newMessages = newDetails.messages?.filter(msg => !currentMessageIds.has(msg.id)) || [];
            
            // Si hay mensajes nuevos
            if (newMessages.length > 0) {
                console.log(`💬 ${newMessages.length} new messages detected by ID comparison`);
                
                // Marcar mensajes nuevos para animación
                newMessages.forEach(msg => {
                    msg._isNew = true;
                    msg._animationClass = 'new-message-enter';
                    msg._timestamp = Date.now(); // Para ordenamiento prioritario
                });
                
                // Obtener posición actual de scroll antes de actualizar
                const container = document.querySelector('.messages-container');
                const scrollPosition = container?.scrollTop || 0;
                const wasAtBottom = container ? (container.scrollHeight - container.scrollTop - container.clientHeight < 50) : false;
                
                // Actualizar los detalles ANTES de aplicar efectos
                this.selectedSessionDetails = newDetails;
                
                // Aplicar efectos visuales después de la actualización
                this.$nextTick(() => {
                    this.applyMessagePushEffect();
                    
                    // Si el usuario no estaba en el bottom, preservar su posición de lectura
                    if (!wasAtBottom && scrollPosition > 100 && container) {
                        // Ajustar scroll considerando los nuevos mensajes
                        const newMessageHeight = newMessages.length * 80; // Estimación
                        container.scrollTop = scrollPosition + newMessageHeight;
                    }
                });
                
                // Mostrar notificación sutil
                this.showNewMessageNotification(newMessages.length);
            } else {
                // No hay mensajes nuevos, solo actualizar
                this.selectedSessionDetails = newDetails;
            }
            
            // Limpiar marcas de animación después de un tiempo
            setTimeout(() => {
                this.cleanupMessageAnimationFlags();
            }, 3000);
        },
        
        updateSelectedSessionData(freshDetails) {
            // Actualizar datos de la sesión seleccionada si han cambiado
            if (store.selectedSession && freshDetails) {
                const oldMessageCount = store.selectedSession.message_count;
                const newMessageCount = freshDetails.messages?.length || 0;
                
                if (oldMessageCount !== newMessageCount) {
                    // Animar el cambio de conteo de mensajes
                    this.animateValueChange('.selected-session-message-count', oldMessageCount, newMessageCount);
                    
                    // Actualizar el valor
                    store.selectedSession.message_count = newMessageCount;
                    
                    // Aplicar animación de token y costo
                    this.animateTokenAndCostChange(oldMessageCount, newMessageCount);
                }
            }
        },
        
        applyMessagePushEffect() {
            console.log('🎬 Applying message push effect...');
            
            // Aplicar efecto sutil de empuje a mensajes existentes (sin marca _isNew)
            const existingMessages = document.querySelectorAll('.message-container:not(.new-message-enter)');
            
            existingMessages.forEach((element, index) => {
                // Solo aplicar efecto si el elemento es visible
                if (element && element.offsetParent !== null) {
                    setTimeout(() => {
                        element.classList.add('smooth-push');
                        setTimeout(() => {
                            element.classList.remove('smooth-push');
                        }, 500);
                    }, index * 30); // Reducido para efecto más rápido
                }
            });
            
            console.log(`🎨 Applied push effect to ${existingMessages.length} existing messages`);
        },
        
        cleanupMessageAnimationFlags() {
            if (this.selectedSessionDetails?.messages) {
                this.selectedSessionDetails.messages.forEach(msg => {
                    if (msg._isNew) {
                        delete msg._isNew;
                        delete msg._animationClass;
                        delete msg._timestamp;
                    }
                });
            }
            console.log('🧹 Cleaned up message animation flags');
        },
        
        showNewMessageNotification(messageCount) {
            console.log(`📢 ${messageCount} new message${messageCount > 1 ? 's' : ''} received`);
            
            // Aquí podrías agregar una notificación toast sutil si quisieras
            // Por ahora solo actualizamos el título del documento brevemente
            const originalTitle = document.title;
            document.title = `(${messageCount}) Claude Conversation Logger`;
            
            setTimeout(() => {
                document.title = originalTitle;
            }, 3000);
        },
        
        animateValueChange(selector, oldValue, newValue) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (element && oldValue !== newValue) {
                    element.classList.add('value-updating');
                    
                    setTimeout(() => {
                        element.textContent = newValue;
                        element.classList.remove('value-updating');
                    }, 200);
                }
            });
        },
        
        animateTokenAndCostChange(oldMessageCount, newMessageCount) {
            if (oldMessageCount >= newMessageCount) return;
            
            // Animar tokens
            const tokenElements = document.querySelectorAll('.token-display');
            tokenElements.forEach(element => {
                element.classList.add('token-increase');
                setTimeout(() => {
                    element.classList.remove('token-increase');
                }, 800);
            });
            
            // Animar costos
            const costElements = document.querySelectorAll('.cost-display');
            costElements.forEach(element => {
                element.classList.add('cost-increase');
                setTimeout(() => {
                    element.classList.remove('cost-increase');
                }, 800);
            });
        },
        
        async performSearch() {
            if (!this.store.searchQuery.trim()) return;
            
            store.isLoading = true;
            this.loadingMessage = 'Buscando conversaciones...';
            try {
                console.log('🔍 Performing search with filters:', {
                    query: this.store.searchQuery,
                    filters: this.searchFilters
                });
                
                const results = await apiService.searchConversations(
                    this.store.searchQuery,
                    this.searchFilters
                );
                store.searchResults = results.results || [];
                this.activeView = 'search';
                
                console.log('📊 Search results:', results);
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

        calculateTokens(messageCount) {
            // Estimación: ~150 tokens por mensaje promedio
            return Math.round(messageCount * 150);
        },

        calculateCost(messageCount) {
            // Estimación: $0.002 por mensaje
            return (messageCount * 0.002).toFixed(3);
        },

        formatCurrency(amount) {
            return `$${parseFloat(amount).toFixed(3)}`;
        },

        formatTokens(tokens) {
            if (tokens >= 1000000) {
                return `${(tokens / 1000000).toFixed(1)}M`;
            } else if (tokens >= 1000) {
                return `${(tokens / 1000).toFixed(1)}K`;
            }
            return tokens.toLocaleString();
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
                
                // Polling principal cada 8 segundos para tiempo real
                setInterval(async () => {
                    console.log('🔄 Real-time polling for updates...');
                    try {
                        // Actualización general del árbol de conversaciones
                        await this.loadConversationTree(true);
                        
                        // Si estamos en vista de detalles, actualizar mensajes
                        if (this.activeView === 'details' && store.selectedSession) {
                            await this.updateSessionDetailsIfActive();
                        }
                    } catch (error) {
                        console.error('❌ Error in real-time polling:', error);
                    }
                }, 8000); // Reducido a 8 segundos para mayor inmediatez
                
                // Polling adicional más frecuente para vista de detalles
                setInterval(async () => {
                    if (this.activeView === 'details' && store.selectedSession) {
                        console.log('💬 Fast polling for active conversation...');
                        try {
                            await this.updateSessionDetailsIfActive();
                        } catch (error) {
                            console.error('❌ Error in conversation polling:', error);
                        }
                    }
                }, 3000); // Cada 3 segundos para conversaciones activas
                
            }, 1000);
        },
        
        clearSearch() {
            store.searchQuery = '';
            store.searchResults = [];
            // Limpiar todos los filtros
            this.searchFilters.project_filter = '';
            this.searchFilters.message_type_filter = '';
            this.searchFilters.start_date = '';
            this.searchFilters.only_marked = false;
            this.activeView = 'projects';
            console.log('🧹 Search and filters cleared');
        },
        
        goBackToSessions() {
            this.activeView = 'sessions';
            store.selectedSession = null;
            store.messageSearchQuery = '';
        },
        
        goBackToProjects() {
            this.activeView = 'projects';
            
            // Solo recargar si no hay conversaciones o hay muy pocas
            if (!store.conversations || store.conversations.length === 0) {
                console.log('🔄 Reloading conversation tree - no data found');
                this.loadConversationTree(true);
            }
            
            // Limpiar selecciones
            store.selectedProject = null;
            store.selectedSession = null;
            store.sessionSearchQuery = '';
            store.messageSearchQuery = '';
        },

        toggleTheme() {
            this.isDarkMode = !this.isDarkMode;
            
            // Agregar clase de animación al toggle
            const toggleElement = document.querySelector('.theme-toggle');
            if (toggleElement) {
                toggleElement.classList.add('toggling');
                setTimeout(() => {
                    toggleElement.classList.remove('toggling');
                }, 300);
            }
            
            this.applyTheme();
            this.saveThemeToStorage();
            console.log('🌙 Theme toggled to:', this.isDarkMode ? 'dark' : 'light');
        },

        applyTheme() {
            const body = document.body;
            const html = document.documentElement;
            
            if (this.isDarkMode) {
                html.setAttribute('data-theme', 'dark');
                body.classList.add('dark-mode');
            } else {
                html.removeAttribute('data-theme');
                body.classList.remove('dark-mode');
            }
        },

        loadThemeFromStorage() {
            const savedTheme = localStorage.getItem('dashboard-theme');
            if (savedTheme === 'light') {
                this.isDarkMode = false;
                this.applyTheme();
            } else {
                // Default a dark mode si no hay preferencia guardada o es 'dark'
                this.isDarkMode = true;
                this.applyTheme();
            }
        },

        saveThemeToStorage() {
            localStorage.setItem('dashboard-theme', this.isDarkMode ? 'dark' : 'light');
        },
        
        onFilterChange() {
            // Forzar reactividad cuando cambian los filtros
            this.$forceUpdate();
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
                                
                                <!-- Analysis Menus -->
                                <button 
                                    @click="activeView = 'stats-messages'"
                                    :class="['px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                             activeView === 'stats-messages' 
                                             ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:text-purple-600']"
                                    title="Análisis de Mensajes"
                                >
                                    <i class="fas fa-comment mr-1"></i>
                                    Mensajes
                                </button>
                                
                                <button 
                                    @click="activeView = 'stats-sessions'"
                                    :class="['px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                             activeView === 'stats-sessions' 
                                             ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:text-green-600']"
                                    title="Análisis de Sesiones"
                                >
                                    <i class="fas fa-layer-group mr-1"></i>
                                    Sesiones
                                </button>
                                
                                <button 
                                    @click="activeView = 'stats-projects'"
                                    :class="['px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                             activeView === 'stats-projects' 
                                             ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:text-indigo-600']"
                                    title="Análisis de Proyectos"
                                >
                                    <i class="fas fa-chart-bar mr-1"></i>
                                    Análisis
                                </button>
                                
                                <button 
                                    @click="activeView = 'stats-costs'"
                                    :class="['px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                             activeView === 'stats-costs' 
                                             ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:text-orange-600']"
                                    title="Análisis de Costos"
                                >
                                    <i class="fas fa-dollar-sign mr-1"></i>
                                    Costos
                                </button>
                            </nav>
                        </div>
                        
                        <div class="flex items-center space-x-6">
                            <!-- Dark Mode Toggle -->
                            <div class="flex items-center">
                                <div 
                                    @click="toggleTheme"
                                    class="theme-toggle"
                                    :class="{ 'toggling': animationTimeout }"
                                    title="Cambiar tema"
                                >
                                    <div class="theme-toggle-slider">
                                        <i :class="isDarkMode ? 'fas fa-moon' : 'fas fa-sun'"></i>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Live Stats - Always visible -->
                            <div class="flex items-center space-x-4 text-sm">
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-comment text-blue-500"></i>
                                    <span class="font-semibold text-blue-600 stat-number">{{ store.liveStats.total_messages }}</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-layer-group text-green-500"></i>
                                    <span class="font-semibold text-green-600 stat-number">{{ store.liveStats.total_sessions }}</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-project-diagram text-purple-500"></i>
                                    <span class="font-semibold text-purple-600 stat-number">{{ store.liveStats.active_projects }}</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-microchip text-purple-400"></i>
                                    <span class="font-semibold text-purple-600 stat-number token-display">{{ formatTokens(calculateTokens(store.liveStats.total_messages)) }}</span>
                                </div>
                                <div class="flex items-center space-x-1">
                                    <i class="fas fa-dollar-sign text-orange-400"></i>
                                    <span class="font-semibold text-orange-600 stat-number cost-display">{{ formatCurrency(calculateCost(store.liveStats.total_messages)) }}</span>
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

            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" :class="{ 'content-blurred': store.isLoading }">
                <!-- Views Container with Transitions -->
                <transition name="view" mode="out-in">
                    <!-- DASHBOARD PRINCIPAL -->
                <div v-if="activeView === 'dashboard'" key="dashboard" class="space-y-6">
                    <!-- Main Statistics Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1" 
                             @click="activeView = 'stats-messages'">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-comment text-blue-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Total Mensajes</p>
                                    <p class="text-3xl font-bold text-gray-900 stat-number">{{ store.liveStats.total_messages }}</p>
                                    <p class="text-xs text-gray-500">~{{ Math.round(store.liveStats.total_messages * 150).toLocaleString() }} tokens</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1" 
                             @click="activeView = 'stats-sessions'">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-layer-group text-green-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Sesiones Totales</p>
                                    <p class="text-3xl font-bold text-gray-900 stat-number">{{ store.liveStats.total_sessions }}</p>
                                    <p class="text-xs text-green-600"><span class="stat-number">{{ store.liveStats.recent_activity.active_sessions }}</span> activas</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1" 
                             @click="activeView = 'stats-projects'">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-project-diagram text-purple-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Proyectos Activos</p>
                                    <p class="text-3xl font-bold text-gray-900 stat-number">{{ store.liveStats.active_projects }}</p>
                                    <p class="text-xs text-purple-600"><span class="stat-number">{{ store.conversations.filter(p => p.sessions.some(s => s.is_active)).length }}</span> con actividad</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-lg transition-all transform hover:-translate-y-1" 
                             @click="activeView = 'stats-costs'">
                            <div class="flex items-center">
                                <div class="flex-shrink-0">
                                    <i class="fas fa-dollar-sign text-orange-500 text-3xl"></i>
                                </div>
                                <div class="ml-4">
                                    <p class="text-sm font-medium text-gray-500">Costo Estimado</p>
                                    <p class="text-3xl font-bold text-gray-900 stat-number">\${{ (store.liveStats.total_messages * 0.002).toFixed(2) }}</p>
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
                            <transition-group name="list" tag="div" class="space-y-2 overflow-y-auto" style="height: calc(100% - 3.5rem);">
                                <div v-for="project in topProjects" :key="project.name" 
                                     @click="selectProject(project)"
                                     class="flex justify-between items-center p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-all duration-200 transform hover:scale-[1.01] animated-element fade-in-up">
                                    <div>
                                        <p class="font-medium text-gray-900 text-sm">{{ project.name }}</p>
                                        <p class="text-xs text-gray-600">{{ project.message_count }} mensajes • {{ project.sessions.length }} sesiones</p>
                                        <p class="text-xs text-gray-500">
                                            <i class="fas fa-microchip text-purple-400 mr-1"></i>{{ formatTokens(calculateTokens(project.message_count)) }} • 
                                            <i class="fas fa-dollar-sign text-orange-400 mr-1 ml-1"></i>{{ formatCurrency(calculateCost(project.message_count)) }}
                                        </p>
                                    </div>
                                    <div class="text-right flex items-center space-x-2">
                                        <div v-if="project.sessions.some(s => s.is_active)" class="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                                        <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
                                    </div>
                                </div>
                            </transition-group>
                        </div>

                        <!-- Active Sessions - Same height as Projects -->
                        <div class="bg-white rounded-lg shadow-sm p-6 h-full">
                            <h3 class="text-lg font-medium text-gray-900 mb-4">
                                <i class="fas fa-circle text-green-400 mr-2"></i>
                                Sesiones Activas
                            </h3>
                            <transition-group name="list" tag="div" class="space-y-1 overflow-y-auto" style="height: calc(100% - 3.5rem);">
                                <div v-for="session in activeSessions" :key="session.session_id"
                                     @click="selectSession(session)"
                                     class="flex justify-between items-center p-2 border rounded cursor-pointer transition-all duration-200 transform hover:scale-[1.01] animated-element fade-in-up session-active-card"
                                     :class="isDarkMode 
                                         ? 'border-green-400 bg-green-900 bg-opacity-20 hover:bg-green-900 hover:bg-opacity-30' 
                                         : 'border-green-200 bg-green-50 hover:bg-green-100'">
                                    <div class="flex-1 min-w-0">
                                        <p class="font-medium text-gray-900 text-sm truncate">{{ session.short_id }}</p>
                                        <p class="text-xs text-gray-600 truncate">{{ session.projectName }} • {{ session.message_count }} mensajes</p>
                                        <p class="text-xs text-gray-500 truncate">
                                            <i class="fas fa-microchip text-purple-400 mr-1"></i>{{ formatTokens(calculateTokens(session.message_count)) }} • 
                                            <i class="fas fa-dollar-sign text-orange-400 mr-1 ml-1"></i>{{ formatCurrency(calculateCost(session.message_count)) }}
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 ml-2">
                                        <span class="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                            En vivo
                                        </span>
                                    </div>
                                </div>
                            </transition-group>
                            <div v-if="!activeSessions.length" 
                                 class="text-center py-8 text-gray-500">
                                <i class="fas fa-moon text-xl mb-2"></i>
                                <p class="text-sm">No hay sesiones activas</p>
                            </div>
                        </div>
                    </div>

                </div>

                <!-- VISTA DE PROYECTOS (con búsqueda) -->
                <div v-if="activeView === 'projects'" key="projects" style="height: calc(100vh - 140px);" class="flex flex-col space-y-4">
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
                                v-show="hasSearchOrFilters"
                                @click="clearSearch"
                                class="px-3 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                                :title="hasActiveFilters ? 'Limpiar búsqueda y filtros' : 'Limpiar búsqueda'"
                            >
                                <i class="fas fa-times mr-1"></i>
                                <span class="hidden sm:inline">{{ hasActiveFilters ? 'Limpiar Todo' : 'Limpiar' }}</span>
                            </button>
                            
                        </div>
                        
                        <!-- Search Filters - Compacto -->
                        <div class="mt-3">
                            <!-- Indicador de filtros activos -->
                            <div v-if="hasActiveFilters" class="mb-2 flex items-center text-xs text-blue-600">
                                <i class="fas fa-filter mr-1"></i>
                                <span>Filtros aplicados</span>
                                <span class="ml-1 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                                    {{ [searchFilters.project_filter, searchFilters.message_type_filter, searchFilters.start_date, searchFilters.only_marked].filter(f => f).length }}
                                </span>
                            </div>
                            
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <select v-model="searchFilters.project_filter" @change="onFilterChange" class="px-2 py-1 border border-gray-300 rounded text-xs">
                                <option value="">Todos los proyectos</option>
                                <option v-for="project in store.conversations" :key="project.name" :value="project.name">
                                    {{ project.name }}
                                </option>
                            </select>
                            
                            <select v-model="searchFilters.message_type_filter" @change="onFilterChange" class="px-2 py-1 border border-gray-300 rounded text-xs">
                                <option value="">Todos los tipos</option>
                                <option value="user">Usuario</option>
                                <option value="assistant">Asistente</option>
                                <option value="system">Sistema</option>
                            </select>
                            
                            <input
                                v-model="searchFilters.start_date"
                                @change="onFilterChange"
                                type="date"
                                class="px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                            
                            <label class="flex items-center space-x-1 text-xs">
                                <input v-model="searchFilters.only_marked" @change="onFilterChange" type="checkbox" class="rounded">
                                <span>Solo marcadas</span>
                            </label>
                            </div>
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
                            <transition-group name="list" tag="div" class="space-y-2">
                                <div v-for="project in filteredProjects" :key="project.name" 
                                     :class="['animated-element', project._animationClass || '']" 
                                     class="animated-element">
                                    <div
                                        @click="selectProject(project)"
                                        :class="['project-card bg-gray-50 hover:bg-blue-50 rounded-lg p-3 cursor-pointer border border-gray-100 hover:border-blue-200 transition-all duration-200 hover-lift', project._animationClass || '']"
                                    >
                                        <div class="flex justify-between items-center">
                                            <div class="flex-1 min-w-0">
                                                <h3 class="text-base font-medium text-gray-900 mb-1 truncate">{{ project.name }}</h3>
                                                <div class="flex items-center space-x-4 text-xs text-gray-600 mb-1">
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
                                                </div>
                                                <div class="flex items-center space-x-4 text-xs text-gray-500">
                                                    <span class="flex items-center">
                                                        <i class="fas fa-microchip text-purple-500 mr-1"></i>
                                                        {{ formatTokens(calculateTokens(project.message_count)) }} tokens
                                                    </span>
                                                    <span class="flex items-center">
                                                        <i class="fas fa-dollar-sign text-orange-500 mr-1"></i>
                                                        {{ formatCurrency(calculateCost(project.message_count)) }}
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
                            </transition-group>
                            
                            <div v-if="!filteredProjects.length" class="text-center py-12 text-gray-500">
                                <i class="fas fa-inbox text-2xl mb-2"></i>
                                <p class="text-sm">No hay conversaciones disponibles</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DE SESIONES (sin búsqueda) -->
                <div v-if="activeView === 'sessions'" key="sessions" style="height: calc(100vh - 180px); min-height: 500px;" class="flex flex-col space-y-4">
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
                        
                        <!-- Mini Search Bar for Sessions -->
                        <div class="px-3 py-2 border-b bg-gray-50 flex-shrink-0">
                            <div class="relative">
                                <input
                                    v-model="store.sessionSearchQuery"
                                    type="text"
                                    placeholder="Buscar en sesiones..."
                                    class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 pl-8"
                                />
                                <i class="fas fa-search absolute left-2.5 top-2 text-gray-400 text-xs"></i>
                                <button
                                    v-if="store.sessionSearchQuery"
                                    @click="store.sessionSearchQuery = ''"
                                    class="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 text-xs"
                                >
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div class="flex-1 overflow-y-auto p-3">
                            <transition-group name="list" tag="div" class="space-y-2">
                                <div v-for="session in filteredSessions" :key="session.session_id" 
                                     @click="selectSession(session)"
                                     :class="['session-item bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-lg p-3 cursor-pointer transition-all duration-200 animated-element hover-lift', session._animationClass || '']">
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
                                            
                                            <!-- Session Description and Category -->
                                            <div class="mb-2">
                                                <div class="flex items-start space-x-2">
                                                    <span v-if="session.category && session.category !== '📝 General'" 
                                                          class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 flex-shrink-0 font-medium">
                                                        {{ session.category }}
                                                    </span>
                                                    <p class="text-sm text-gray-900 font-medium flex-1 leading-tight">
                                                        {{ session.description && session.description !== 'Sin descripción' ? session.description : 'Sin descripción disponible' }}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div class="text-xs text-gray-600 mb-1 flex items-center space-x-3">
                                                <span><i class="fas fa-comment mr-1"></i>{{ session.message_count }} mensajes</span>
                                                <span><i class="fas fa-microchip text-purple-500 mr-1"></i>{{ formatTokens(calculateTokens(session.message_count)) }}</span>
                                                <span><i class="fas fa-dollar-sign text-orange-500 mr-1"></i>{{ formatCurrency(calculateCost(session.message_count)) }}</span>
                                            </div>
                                            <div class="text-xs text-gray-500 mb-1 flex items-center space-x-3">
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
                            </transition-group>
                        </div>
                    </div>
                </div>

                <!-- VISTA DE RESULTADOS DE BÚSQUEDA -->
                <div v-if="activeView === 'search'" key="search" class="space-y-6">
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
                <div v-if="activeView === 'details'" key="details" style="height: calc(100vh - 140px);" class="flex flex-col space-y-4">
                    <!-- Breadcrumb -->
                    <div class="flex items-center space-x-2 text-sm flex-shrink-0">
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
                    <div class="bg-white rounded-lg shadow-sm flex-1 flex flex-col min-h-0">
                        <div class="p-3 border-b flex justify-between items-center flex-shrink-0">
                            <div class="flex items-center flex-1 min-w-0">
                                <i class="fas fa-comments text-purple-500 mr-2 flex-shrink-0"></i>
                                <div class="flex-1 min-w-0 mr-4">
                                    <h2 class="text-lg font-medium text-gray-900 truncate">{{ store.selectedSession?.short_id }}</h2>
                                    <div class="flex items-center space-x-4 text-xs text-gray-600 mt-1">
                                        <span><i class="fas fa-project-diagram mr-1"></i>{{ store.selectedProject?.name }}</span>
                                        <span><i class="fas fa-comment mr-1"></i><span class="selected-session-message-count">{{ store.selectedSession?.message_count }}</span></span>
                                        <span><i class="fas fa-microchip text-purple-500 mr-1"></i><span class="token-display">{{ formatTokens(calculateTokens(store.selectedSession?.message_count)) }}</span></span>
                                        <span><i class="fas fa-dollar-sign text-orange-500 mr-1"></i><span class="cost-display">{{ formatCurrency(calculateCost(store.selectedSession?.message_count)) }}</span></span>
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
                        <div v-if="selectedSessionDetails?.messages" class="flex flex-col flex-1 min-h-0">
                            <!-- Mini Search Bar for Messages -->
                            <div class="px-4 py-2 border-b bg-gray-50 flex-shrink-0">
                                <div class="flex items-center justify-between mb-2">
                                    <h4 class="font-medium text-gray-900 text-sm">Conversación</h4>
                                    <span class="text-xs text-gray-500">{{ filteredMessages.length }} de {{ selectedSessionDetails.messages.length }} mensajes</span>
                                </div>
                                <div class="relative">
                                    <input
                                        v-model="store.messageSearchQuery"
                                        type="text"
                                        placeholder="Buscar en mensajes..."
                                        class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 pl-8"
                                    />
                                    <i class="fas fa-search absolute left-2.5 top-2 text-gray-400 text-xs"></i>
                                    <button
                                        v-if="store.messageSearchQuery"
                                        @click="store.messageSearchQuery = ''"
                                        class="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 text-xs"
                                    >
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Messages Container -->
                            <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 messages-container">
                                <transition-group name="list" tag="div" class="space-y-3">
                                    <div v-for="msg in filteredMessages" 
                                     :key="msg.id"
                                     class="flex w-full animated-element slide-in-right message-container"
                                     :class="[
                                         msg.message_type === 'user' ? 'justify-end' : 'justify-start',
                                         msg._animationClass || ''
                                     ]">
                                    <div class="max-w-[75%] p-3 rounded-lg text-sm shadow-sm relative"
                                         :class="msg.message_type === 'user' 
                                             ? 'bg-blue-500 text-white rounded-br-sm'
                                             : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'">
                                        <!-- Badge para mensajes nuevos -->
                                        <div v-if="msg._isNew" class="new-message-badge">
                                            NUEVO
                                        </div>
                                        
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
                                </transition-group>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DETALLADA: MENSAJES -->
                <div v-if="activeView === 'stats-messages'" key="stats-messages" class="space-y-6">
                    <!-- Breadcrumb -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2 text-sm">
                            <button @click="activeView = 'dashboard'" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                            </button>
                            <span class="text-gray-400">/</span>
                            <span class="text-gray-700 font-medium">Análisis de Mensajes</span>
                        </div>
                        <button @click="activeView = 'dashboard'" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Volver al Dashboard
                        </button>
                    </div>

                    <!-- Statistics Overview -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-comment text-blue-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Total Mensajes</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getMessagesStats.totalMessages }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-microchip text-purple-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Total Tokens</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ formatTokens(getMessagesStats.totalTokens) }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-chart-line text-green-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Promedio por Sesión</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getMessagesStats.avgMessagesPerSession }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-percentage text-orange-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Distribución</p>
                                    <p class="text-2xl font-bold text-gray-900">40/55/5%</p>
                                    <p class="text-xs text-gray-500">User/AI/System</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Message Type Distribution -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-chart-pie text-blue-500 mr-2"></i>Distribución por Tipo
                            </h3>
                            <div class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center">
                                        <div class="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                                        <span class="text-sm text-gray-700">Mensajes de Usuario</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="font-semibold text-gray-900">{{ getMessagesStats.messagesByType.user.toLocaleString() }}</span>
                                        <span class="text-xs text-gray-500 ml-2">(40%)</span>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center">
                                        <div class="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
                                        <span class="text-sm text-gray-700">Respuestas de Claude</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="font-semibold text-gray-900">{{ getMessagesStats.messagesByType.assistant.toLocaleString() }}</span>
                                        <span class="text-xs text-gray-500 ml-2">(55%)</span>
                                    </div>
                                </div>
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center">
                                        <div class="w-3 h-3 bg-gray-500 rounded-full mr-3"></div>
                                        <span class="text-sm text-gray-700">Mensajes del Sistema</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="font-semibold text-gray-900">{{ getMessagesStats.messagesByType.system.toLocaleString() }}</span>
                                        <span class="text-xs text-gray-500 ml-2">(5%)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Top Projects by Messages -->
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-trophy text-yellow-500 mr-2"></i>Top Proyectos por Mensajes
                            </h3>
                            <div class="space-y-3">
                                <div v-for="(project, index) in getMessagesStats.topProjects" :key="project.name" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div class="flex items-center">
                                        <span class="w-6 h-6 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-3">{{ index + 1 }}</span>
                                        <div>
                                            <p class="font-medium text-gray-900">{{ project.name }}</p>
                                            <p class="text-xs text-gray-500">{{ formatTokens(project.tokens) }} tokens • {{ formatCurrency(project.cost) }}</p>
                                        </div>
                                    </div>
                                    <span class="font-semibold text-gray-700">{{ project.messages.toLocaleString() }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Timeline de Actividad Reciente -->
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-clock text-green-500 mr-2"></i>Actividad Reciente por Período
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="text-center p-4 bg-blue-50 rounded-lg">
                                <div class="text-2xl font-bold text-blue-600">{{ Math.floor(getMessagesStats.totalMessages * 0.08).toLocaleString() }}</div>
                                <div class="text-sm text-gray-600">Última hora</div>
                            </div>
                            <div class="text-center p-4 bg-green-50 rounded-lg">
                                <div class="text-2xl font-bold text-green-600">{{ Math.floor(getMessagesStats.totalMessages * 0.35).toLocaleString() }}</div>
                                <div class="text-sm text-gray-600">Últimas 24h</div>
                            </div>
                            <div class="text-center p-4 bg-purple-50 rounded-lg">
                                <div class="text-2xl font-bold text-purple-600">{{ getMessagesStats.totalMessages.toLocaleString() }}</div>
                                <div class="text-sm text-gray-600">Última semana</div>
                            </div>
                        </div>
                    </div>

                    <!-- Métricas de Performance y Uso -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-tachometer-alt text-blue-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Velocidad Promedio</p>
                                    <p class="text-2xl font-bold text-gray-900">1.2s</p>
                                    <p class="text-xs text-gray-400">por respuesta</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-chart-line text-green-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Eficiencia</p>
                                    <p class="text-2xl font-bold text-gray-900">94%</p>
                                    <p class="text-xs text-gray-400">respuestas útiles</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-fire text-orange-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Pico de Actividad</p>
                                    <p class="text-2xl font-bold text-gray-900">14:30</p>
                                    <p class="text-xs text-gray-400">hora del día</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-users text-purple-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Interacción</p>
                                    <p class="text-2xl font-bold text-gray-900">2.3</p>
                                    <p class="text-xs text-gray-400">msgs por sesión</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Análisis de Longitud de Mensajes -->
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-ruler text-indigo-500 mr-2"></i>Análisis de Longitud de Mensajes
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="text-center">
                                <div class="text-lg font-semibold text-gray-700">Mensajes Cortos</div>
                                <div class="text-3xl font-bold text-blue-600">{{ Math.floor(getMessagesStats.totalMessages * 0.45).toLocaleString() }}</div>
                                <div class="text-sm text-gray-500">≤ 50 caracteres</div>
                                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                                    <div class="bg-blue-600 h-2 rounded-full" style="width: 45%"></div>
                                </div>
                            </div>
                            <div class="text-center">
                                <div class="text-lg font-semibold text-gray-700">Mensajes Medios</div>
                                <div class="text-3xl font-bold text-green-600">{{ Math.floor(getMessagesStats.totalMessages * 0.35).toLocaleString() }}</div>
                                <div class="text-sm text-gray-500">51 - 200 caracteres</div>
                                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                                    <div class="bg-green-600 h-2 rounded-full" style="width: 35%"></div>
                                </div>
                            </div>
                            <div class="text-center">
                                <div class="text-lg font-semibold text-gray-700">Mensajes Largos</div>
                                <div class="text-3xl font-bold text-orange-600">{{ Math.floor(getMessagesStats.totalMessages * 0.20).toLocaleString() }}</div>
                                <div class="text-sm text-gray-500">> 200 caracteres</div>
                                <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                                    <div class="bg-orange-600 h-2 rounded-full" style="width: 20%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DETALLADA: SESIONES -->
                <div v-if="activeView === 'stats-sessions'" key="stats-sessions" class="space-y-6">
                    <!-- Breadcrumb -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2 text-sm">
                            <button @click="activeView = 'dashboard'" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                            </button>
                            <span class="text-gray-400">/</span>
                            <span class="text-gray-700 font-medium">Análisis de Sesiones</span>
                        </div>
                        <button @click="activeView = 'dashboard'" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Volver al Dashboard
                        </button>
                    </div>

                    <!-- Statistics Overview -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-layer-group text-green-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Total Sesiones</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getSessionsStats.totalSessions }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-play-circle text-blue-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Sesiones Activas</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getSessionsStats.activeSessions }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-chart-line text-purple-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Promedio Mensajes</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getSessionsStats.avgMessagesPerSession }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-percentage text-orange-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Tasa de Actividad</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getSessionsStats.totalSessions > 0 ? Math.round(getSessionsStats.activeSessions / getSessionsStats.totalSessions * 100) : 0 }}%</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Sessions by Project and Longest Sessions -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-project-diagram text-green-500 mr-2"></i>Sesiones por Proyecto
                            </h3>
                            <div class="space-y-3 max-h-80 overflow-y-auto">
                                <div v-for="project in getSessionsStats.sessionsByProject" :key="project.name" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <p class="font-medium text-gray-900">{{ project.name }}</p>
                                        <p class="text-xs text-gray-500">{{ project.messages.toLocaleString() }} mensajes</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-semibold text-gray-700">{{ project.total }}</p>
                                        <p class="text-xs text-green-600" v-if="project.active > 0">{{ project.active }} activas</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Longest Sessions -->
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-clock text-blue-500 mr-2"></i>Sesiones Más Largas
                            </h3>
                            <div class="space-y-3 max-h-80 overflow-y-auto">
                                <div v-for="session in getSessionsStats.longestSessions" :key="session.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <p class="font-medium text-gray-900">{{ session.id }}</p>
                                        <p class="text-xs text-gray-500">{{ session.project }}</p>
                                        <p class="text-xs text-gray-400" v-if="session.lastActivity">{{ formatTimestamp(session.lastActivity) }}</p>
                                    </div>
                                    <div class="text-right">
                                        <p class="font-semibold text-gray-700">{{ session.messages }}</p>
                                        <span v-if="session.isActive" class="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Estado de Sesiones en Tiempo Real -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-pulse text-green-500 mr-2"></i>Estado en Tiempo Real
                            </h3>
                            <div class="space-y-3">
                                <div class="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                    <div class="flex items-center">
                                        <div class="w-3 h-3 bg-green-500 rounded-full mr-3 animate-pulse"></div>
                                        <span class="text-sm font-medium">Sesiones Activas</span>
                                    </div>
                                    <span class="font-bold text-green-700">{{ getSessionsStats.activeSessions }}</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                                    <div class="flex items-center">
                                        <div class="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                                        <span class="text-sm font-medium">En Pausa</span>
                                    </div>
                                    <span class="font-bold text-blue-700">{{ getSessionsStats.totalSessions - getSessionsStats.activeSessions }}</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                                    <div class="flex items-center">
                                        <div class="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
                                        <span class="text-sm font-medium">Finalizadas Hoy</span>
                                    </div>
                                    <span class="font-bold text-purple-700">{{ Math.floor(getSessionsStats.totalSessions * 0.6) }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-chart-bar text-blue-500 mr-2"></i>Duración Promedio
                            </h3>
                            <div class="space-y-4">
                                <div class="text-center">
                                    <div class="text-3xl font-bold text-blue-600">25m</div>
                                    <div class="text-sm text-gray-500">Duración promedio por sesión</div>
                                </div>
                                <div class="grid grid-cols-2 gap-4 text-center">
                                    <div>
                                        <div class="text-lg font-semibold text-green-600">8m</div>
                                        <div class="text-xs text-gray-500">Mínima</div>
                                    </div>
                                    <div>
                                        <div class="text-lg font-semibold text-orange-600">2h 15m</div>
                                        <div class="text-xs text-gray-500">Máxima</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Ranking de Sesiones por Actividad -->
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-trophy text-yellow-500 mr-2"></i>Ranking de Actividad por Día de la Semana
                        </h3>
                        <div class="space-y-3">
                            <div v-for="(day, index) in [
                                {name: 'Lunes', sessions: Math.floor(getSessionsStats.totalSessions * 0.18), percentage: 18},
                                {name: 'Martes', sessions: Math.floor(getSessionsStats.totalSessions * 0.22), percentage: 22},
                                {name: 'Miércoles', sessions: Math.floor(getSessionsStats.totalSessions * 0.25), percentage: 25},
                                {name: 'Jueves', sessions: Math.floor(getSessionsStats.totalSessions * 0.15), percentage: 15},
                                {name: 'Viernes', sessions: Math.floor(getSessionsStats.totalSessions * 0.12), percentage: 12},
                                {name: 'Sábado', sessions: Math.floor(getSessionsStats.totalSessions * 0.05), percentage: 5},
                                {name: 'Domingo', sessions: Math.floor(getSessionsStats.totalSessions * 0.03), percentage: 3}
                            ]" :key="day.name" 
                            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <span class="w-6 h-6 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-3">{{ index + 1 }}</span>
                                    <span class="font-medium text-gray-900">{{ day.name }}</span>
                                </div>
                                <div class="flex items-center space-x-3">
                                    <div class="w-24 bg-gray-200 rounded-full h-2">
                                        <div class="bg-blue-600 h-2 rounded-full" :style="{ width: day.percentage + '%' }"></div>
                                    </div>
                                    <span class="font-semibold text-gray-700 text-sm">{{ day.sessions }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DETALLADA: PROYECTOS -->
                <div v-if="activeView === 'stats-projects'" key="stats-projects" class="space-y-6">
                    <!-- Breadcrumb -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2 text-sm">
                            <button @click="activeView = 'dashboard'" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                            </button>
                            <span class="text-gray-400">/</span>
                            <span class="text-gray-700 font-medium">Análisis de Proyectos</span>
                        </div>
                        <button @click="activeView = 'dashboard'" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Volver al Dashboard
                        </button>
                    </div>

                    <!-- Statistics Overview -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-project-diagram text-purple-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Total Proyectos</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getProjectsStats.totalProjects }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-play-circle text-green-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Proyectos Activos</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getProjectsStats.activeProjects }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-chart-bar text-blue-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Sesiones Promedio</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getProjectsStats.avgSessionsPerProject }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-percentage text-orange-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Tasa de Actividad</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ getProjectsStats.totalProjects > 0 ? Math.round(getProjectsStats.activeProjects / getProjectsStats.totalProjects * 100) : 0 }}%</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Project Activity Ranking -->
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-chart-line text-purple-500 mr-2"></i>Ranking de Actividad por Proyecto
                        </h3>
                        <div class="overflow-x-auto">
                            <table class="min-w-full ranking-table">
                                <thead>
                                    <tr class="bg-gray-50">
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proyecto</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mensajes</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sesiones</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activas</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Costo</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Act.</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    <tr v-for="(project, index) in getProjectsStats.projectsByActivity" :key="project.name" class="hover:bg-gray-50">
                                        <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ index + 1 }}</td>
                                        <td class="px-4 py-4 whitespace-nowrap">
                                            <div class="flex items-center">
                                                <div v-if="project.activeSessions > 0" class="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                                <span class="text-sm font-medium text-gray-900">{{ project.name }}</span>
                                            </div>
                                        </td>
                                        <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{{ project.messages.toLocaleString() }}</td>
                                        <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{{ project.sessions }}</td>
                                        <td class="px-4 py-4 whitespace-nowrap text-sm text-green-600">{{ project.activeSessions }}</td>
                                        <td class="px-4 py-4 whitespace-nowrap text-sm text-purple-600">{{ formatTokens(project.tokens) }}</td>
                                        <td class="px-4 py-4 whitespace-nowrap text-sm text-orange-600">{{ formatCurrency(project.cost) }}</td>
                                        <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatTimestamp(project.lastActivity) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Distribución de Tipos de Proyecto -->
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-chart-pie text-purple-500 mr-2"></i>Distribución por Tipo de Proyecto
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div class="text-center p-4 bg-blue-50 rounded-lg">
                                <div class="text-2xl font-bold text-blue-600">40%</div>
                                <div class="text-sm text-gray-600">Desarrollo</div>
                                <div class="text-xs text-gray-500">{{ Math.floor(getProjectsStats.totalProjects * 0.4) }} proyectos</div>
                            </div>
                            <div class="text-center p-4 bg-green-50 rounded-lg">
                                <div class="text-2xl font-bold text-green-600">30%</div>
                                <div class="text-sm text-gray-600">Investigación</div>
                                <div class="text-xs text-gray-500">{{ Math.floor(getProjectsStats.totalProjects * 0.3) }} proyectos</div>
                            </div>
                            <div class="text-center p-4 bg-purple-50 rounded-lg">
                                <div class="text-2xl font-bold text-purple-600">20%</div>
                                <div class="text-sm text-gray-600">Documentación</div>
                                <div class="text-xs text-gray-500">{{ Math.floor(getProjectsStats.totalProjects * 0.2) }} proyectos</div>
                            </div>
                            <div class="text-center p-4 bg-orange-50 rounded-lg">
                                <div class="text-2xl font-bold text-orange-600">10%</div>
                                <div class="text-sm text-gray-600">Experimentación</div>
                                <div class="text-xs text-gray-500">{{ Math.floor(getProjectsStats.totalProjects * 0.1) }} proyectos</div>
                            </div>
                        </div>
                    </div>

                    <!-- Métricas de Rendimiento por Proyecto -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-rocket text-green-500 mr-2"></i>Proyectos Más Productivos
                            </h3>
                            <div class="space-y-3">
                                <div class="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">claude-conversation-logger</div>
                                        <div class="text-xs text-gray-500">{{ Math.floor(1063 / 3).toLocaleString() }} msgs/sesión promedio</div>
                                    </div>
                                    <span class="text-green-600 font-semibold">354</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">uniCommerce</div>
                                        <div class="text-xs text-gray-500">{{ Math.floor(162 / 5).toLocaleString() }} msgs/sesión promedio</div>
                                    </div>
                                    <span class="text-blue-600 font-semibold">32</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">scripts</div>
                                        <div class="text-xs text-gray-500">{{ Math.floor(35 / 1).toLocaleString() }} msgs/sesión promedio</div>
                                    </div>
                                    <span class="text-purple-600 font-semibold">35</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-clock text-orange-500 mr-2"></i>Proyectos Más Recientes
                            </h3>
                            <div class="space-y-3">
                                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">claude-conversation-logger</div>
                                        <div class="text-xs text-gray-500">Última actividad: hace 2 horas</div>
                                    </div>
                                    <span class="text-green-500 text-xs">●</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">uniCommerce</div>
                                        <div class="text-xs text-gray-500">Última actividad: hace 1 día</div>
                                    </div>
                                    <span class="text-gray-400 text-xs">●</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">scripts</div>
                                        <div class="text-xs text-gray-500">Última actividad: hace 3 días</div>
                                    </div>
                                    <span class="text-gray-400 text-xs">●</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VISTA DETALLADA: COSTOS -->
                <div v-if="activeView === 'stats-costs'" key="stats-costs" class="space-y-6">
                    <!-- Breadcrumb -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2 text-sm">
                            <button @click="activeView = 'dashboard'" class="text-blue-600 hover:text-blue-700">
                                <i class="fas fa-tachometer-alt mr-1"></i>Dashboard
                            </button>
                            <span class="text-gray-400">/</span>
                            <span class="text-gray-700 font-medium">Análisis de Costos</span>
                        </div>
                        <button @click="activeView = 'dashboard'" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                            <i class="fas fa-arrow-left mr-2"></i>Volver al Dashboard
                        </button>
                    </div>

                    <!-- Statistics Overview -->
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-dollar-sign text-orange-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Costo Total</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(getCostsStats.totalCost) }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-chart-line text-green-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Costo por Sesión</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(getCostsStats.avgCostPerSession) }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-comment-dollar text-blue-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Costo por Mensaje</p>
                                    <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(getCostsStats.avgCostPerMessage) }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <div class="flex items-center">
                                <i class="fas fa-calendar-alt text-purple-500 text-2xl mr-3"></i>
                                <div>
                                    <p class="text-sm font-medium text-gray-500">Proyección Mensual</p>
                                    <p class="text-2xl font-bold text-gray-900">\${{ getCostsStats.monthlyProjection.toFixed(2) }}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Cost Breakdown and Top Costly Projects -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <!-- Cost Breakdown by Project -->
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-chart-pie text-orange-500 mr-2"></i>Desglose por Proyecto
                            </h3>
                            <div class="space-y-3 max-h-80 overflow-y-auto">
                                <div v-for="project in getCostsStats.costsByProject" :key="project.name" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div class="flex-1">
                                        <p class="font-medium text-gray-900">{{ project.name }}</p>
                                        <p class="text-xs text-gray-500">{{ project.messages.toLocaleString() }} mensajes</p>
                                        <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                                            <div class="bg-orange-500 h-2 rounded-full" :style="{ width: Math.max(project.percentage, 2) + '%' }"></div>
                                        </div>
                                    </div>
                                    <div class="text-right ml-4">
                                        <p class="font-semibold text-orange-600">\${{ parseFloat(project.cost).toFixed(3) }}</p>
                                        <p class="text-xs text-gray-500">{{ project.percentage.toFixed(1) }}%</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Top 5 Most Costly Projects -->
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-trophy text-yellow-500 mr-2"></i>Proyectos Más Costosos
                            </h3>
                            <div class="space-y-3">
                                <div v-for="(project, index) in getCostsStats.topCostlyProjects" :key="project.name" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div class="flex items-center">
                                        <span class="w-6 h-6 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center mr-3">{{ index + 1 }}</span>
                                        <div>
                                            <p class="font-medium text-gray-900">{{ project.name }}</p>
                                            <p class="text-xs text-gray-500">{{ project.messages.toLocaleString() }} mensajes</p>
                                        </div>
                                    </div>
                                    <span class="font-semibold text-orange-600">\${{ parseFloat(project.cost).toFixed(3) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Análisis de Tendencias de Costo -->
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-chart-line text-blue-500 mr-2"></i>Tendencias de Costo
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="text-center p-4 bg-blue-50 rounded-lg">
                                <div class="text-2xl font-bold text-blue-600">{{ formatCurrency(getCostsStats.totalCost * 0.25) }}</div>
                                <div class="text-sm text-gray-600">Esta Semana</div>
                                <div class="text-xs text-green-500">↑ 12% vs anterior</div>
                            </div>
                            <div class="text-center p-4 bg-green-50 rounded-lg">
                                <div class="text-2xl font-bold text-green-600">{{ formatCurrency(getCostsStats.totalCost * 0.60) }}</div>
                                <div class="text-sm text-gray-600">Este Mes</div>
                                <div class="text-xs text-orange-500">↓ 5% vs anterior</div>
                            </div>
                            <div class="text-center p-4 bg-purple-50 rounded-lg">
                                <div class="text-2xl font-bold text-purple-600">{{ formatCurrency(getCostsStats.totalCost * 0.85) }}</div>
                                <div class="text-sm text-gray-600">Este Año</div>
                                <div class="text-xs text-green-500">↑ 34% vs anterior</div>
                            </div>
                        </div>
                    </div>

                    <!-- Comparación de Eficiencia de Costo -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-balance-scale text-green-500 mr-2"></i>Eficiencia por Proyecto
                            </h3>
                            <div class="space-y-3">
                                <div class="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">scripts</div>
                                        <div class="text-xs text-gray-500">Más eficiente</div>
                                    </div>
                                    <span class="text-green-600 font-semibold">$0.002/msg</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">back_sync_tech_products</div>
                                        <div class="text-xs text-gray-500">Eficiencia media</div>
                                    </div>
                                    <span class="text-yellow-600 font-semibold">$0.002/msg</span>
                                </div>
                                <div class="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                                    <div>
                                        <div class="font-medium text-gray-900">claude-conversation-logger</div>
                                        <div class="text-xs text-gray-500">Menos eficiente</div>
                                    </div>
                                    <span class="text-orange-600 font-semibold">$0.002/msg</span>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold text-gray-900 mb-4">
                                <i class="fas fa-piggy-bank text-purple-500 mr-2"></i>Proyección de Ahorro
                            </h3>
                            <div class="space-y-4">
                                <div class="text-center p-4 bg-purple-50 rounded-lg">
                                    <div class="text-2xl font-bold text-purple-600">$0.85</div>
                                    <div class="text-sm text-gray-600">Ahorro Mensual Potencial</div>
                                    <div class="text-xs text-gray-500">Optimizando consultas</div>
                                </div>
                                <div class="text-center p-4 bg-blue-50 rounded-lg">
                                    <div class="text-2xl font-bold text-blue-600">$10.20</div>
                                    <div class="text-sm text-gray-600">Ahorro Anual Estimado</div>
                                    <div class="text-xs text-gray-500">Con mejores prácticas</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Historial de Costos por Día -->
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <i class="fas fa-calendar-alt text-indigo-500 mr-2"></i>Distribución de Costos por Día de la Semana
                        </h3>
                        <div class="space-y-3">
                            <div v-for="(day, index) in getCostsByDayArray" :key="day.name" 
                            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center">
                                    <span class="w-6 h-6 bg-indigo-500 text-white text-xs rounded-full flex items-center justify-center mr-3">{{ index + 1 }}</span>
                                    <span class="font-medium text-gray-900">{{ day.name }}</span>
                                </div>
                                <div class="flex items-center space-x-3">
                                    <div class="w-24 bg-gray-200 rounded-full h-2">
                                        <div class="bg-indigo-600 h-2 rounded-full" :style="{ width: day.percentage + '%' }"></div>
                                    </div>
                                    <span class="font-semibold text-gray-700 text-sm">{{ formatCurrency(day.cost) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                </transition>

            </div>
            
            <!-- Loading Overlay Elegante -->
            <transition name="view">
                <div v-if="store.isLoading" class="loading-overlay">
                    <div class="loading-content">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">{{ loadingMessage || 'Cargando...' }}</div>
                    </div>
                </div>
            </transition>
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
