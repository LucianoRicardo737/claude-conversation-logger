// Componente de búsqueda avanzada con resultados en tiempo real
const SearchComponent = {
    props: {
        store: Object,
        searchFilters: Object
    },
    
    emits: ['search', 'clear-search', 'select-result'],
    
    data() {
        return {
            localQuery: this.store.searchQuery || '',
            isSearching: false,
            searchTimeout: null,
            showFilters: false,
            searchHistory: JSON.parse(localStorage.getItem('search_history') || '[]'),
            showHistory: false
        };
    },
    
    computed: {
        hasActiveFilters() {
            return Object.values(this.searchFilters).some(value => 
                value && value !== '' && value !== false
            );
        },
        
        filteredSearchHistory() {
            return this.searchHistory
                .filter(item => item.query.toLowerCase().includes(this.localQuery.toLowerCase()))
                .slice(0, 5);
        }
    },
    
    watch: {
        localQuery: {
            handler: 'onQueryChange',
            immediate: false
        },
        
        'store.searchQuery': {
            handler(newVal) {
                if (newVal !== this.localQuery) {
                    this.localQuery = newVal;
                }
            }
        }
    },
    
    methods: {
        onQueryChange(newQuery) {
            // Clear existing timeout
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }
            
            // Auto-search after 500ms of inactivity
            if (newQuery && newQuery.trim().length >= 2) {
                this.searchTimeout = setTimeout(() => {
                    this.performSearch();
                }, 500);
            } else if (newQuery.trim().length === 0) {
                this.clearSearch();
            }
        },
        
        async performSearch() {
            if (!this.localQuery.trim()) return;
            
            this.isSearching = true;
            this.showHistory = false;
            
            try {
                // Save to history
                this.saveToHistory(this.localQuery);
                
                // Emit search event to parent
                this.$emit('search', this.localQuery);
                
                // Also perform real-time search via API
                await this.searchViaAPI();
                
            } catch (error) {
                console.error('Error in search:', error);
            } finally {
                this.isSearching = false;
            }
        },
        
        async searchViaAPI() {
            try {
                const response = await axios.post(`${window.location.origin}/api/search/advanced`, {
                    query: this.localQuery,
                    ...this.searchFilters,
                    limit: 20,
                    offset: 0
                });
                
                // Update results in store
                this.store.searchResults = response.data.results || [];
                
            } catch (error) {
                console.error('API search error:', error);
            }
        },
        
        clearSearch() {
            this.localQuery = '';
            this.showHistory = false;
            this.$emit('clear-search');
        },
        
        selectFromHistory(historyItem) {
            this.localQuery = historyItem.query;
            this.showHistory = false;
            this.performSearch();
        },
        
        saveToHistory(query) {
            const historyItem = {
                query: query.trim(),
                timestamp: Date.now(),
                filters: { ...this.searchFilters }
            };
            
            // Remove duplicates
            this.searchHistory = this.searchHistory.filter(item => item.query !== query);
            
            // Add to beginning
            this.searchHistory.unshift(historyItem);
            
            // Keep only last 10 items
            this.searchHistory = this.searchHistory.slice(0, 10);
            
            // Save to localStorage
            localStorage.setItem('search_history', JSON.stringify(this.searchHistory));
        },
        
        toggleFilters() {
            this.showFilters = !this.showFilters;
        },
        
        clearFilters() {
            Object.keys(this.searchFilters).forEach(key => {
                if (typeof this.searchFilters[key] === 'boolean') {
                    this.searchFilters[key] = false;
                } else {
                    this.searchFilters[key] = '';
                }
            });
            
            if (this.localQuery.trim()) {
                this.performSearch();
            }
        },
        
        onInputFocus() {
            if (this.searchHistory.length > 0 && !this.localQuery.trim()) {
                this.showHistory = true;
            }
        },
        
        onInputBlur() {
            // Delay hiding to allow click on history items
            setTimeout(() => {
                this.showHistory = false;
            }, 200);
        },
        
        formatTimestamp(timestamp) {
            return new Date(timestamp).toLocaleString('es-ES', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    },
    
    mounted() {
        // Set initial query from store
        if (this.store.searchQuery) {
            this.localQuery = this.store.searchQuery;
        }
    },
    
    template: `
        <div class="bg-white rounded-lg shadow-sm p-4 mb-6">
            <!-- Main search input -->
            <div class="relative">
                <div class="flex space-x-2">
                    <div class="flex-1 relative">
                        <input
                            v-model="localQuery"
                            @keyup.enter="performSearch"
                            @focus="onInputFocus"
                            @blur="onInputBlur"
                            type="text"
                            placeholder="Buscar por contenido, descripción, categoría... (min. 2 caracteres)"
                            class="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            :class="{ 'bg-yellow-50 border-yellow-300': isSearching }"
                        />
                        
                        <!-- Search icon or loading spinner -->
                        <div class="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <i v-if="!isSearching" class="fas fa-search text-gray-400"></i>
                            <i v-else class="fas fa-spinner fa-spin text-blue-500"></i>
                        </div>
                        
                        <!-- Search history dropdown -->
                        <div v-if="showHistory && filteredSearchHistory.length > 0" 
                             class="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1">
                            <div class="p-2 border-b bg-gray-50">
                                <span class="text-xs text-gray-600">
                                    <i class="fas fa-history mr-1"></i>
                                    Búsquedas recientes
                                </span>
                            </div>
                            <div class="max-h-48 overflow-y-auto">
                                <div v-for="item in filteredSearchHistory" 
                                     :key="item.timestamp"
                                     @click="selectFromHistory(item)"
                                     class="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                                    <div class="flex justify-between items-center">
                                        <span class="text-sm text-gray-900">{{ item.query }}</span>
                                        <span class="text-xs text-gray-500">{{ formatTimestamp(item.timestamp) }}</span>
                                    </div>
                                    <div v-if="Object.values(item.filters).some(v => v && v !== '' && v !== false)" 
                                         class="text-xs text-gray-600 mt-1">
                                        <i class="fas fa-filter mr-1"></i>
                                        Con filtros aplicados
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Search button -->
                    <button
                        @click="performSearch"
                        :disabled="!localQuery.trim() || isSearching"
                        class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <i class="fas fa-search mr-2"></i>
                        Buscar
                    </button>
                    
                    <!-- Filters toggle -->
                    <button
                        @click="toggleFilters"
                        :class="hasActiveFilters ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-gray-100 text-gray-700 border-gray-300'"
                        class="px-4 py-2 border rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        <i class="fas fa-filter mr-1"></i>
                        Filtros
                        <span v-if="hasActiveFilters" class="ml-1 bg-yellow-500 text-white text-xs px-1 py-0.5 rounded-full">
                            •
                        </span>
                    </button>
                    
                    <!-- Clear button -->
                    <button
                        v-if="localQuery || hasActiveFilters"
                        @click="clearSearch"
                        class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Search filters panel -->
                <div v-if="showFilters" class="mt-4 p-4 bg-gray-50 rounded-lg border">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="font-medium text-gray-900">
                            <i class="fas fa-sliders-h mr-2"></i>
                            Filtros de Búsqueda
                        </h3>
                        <button
                            v-if="hasActiveFilters"
                            @click="clearFilters"
                            class="text-sm text-blue-600 hover:text-blue-700"
                        >
                            <i class="fas fa-eraser mr-1"></i>
                            Limpiar filtros
                        </button>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <!-- Project filter -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Proyecto</label>
                            <select 
                                v-model="searchFilters.project_filter" 
                                @change="localQuery.trim() && performSearch()"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">Todos los proyectos</option>
                                <option v-for="project in store.conversations" :key="project.name" :value="project.name">
                                    {{ project.name }}
                                </option>
                            </select>
                        </div>
                        
                        <!-- Message type filter -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de mensaje</label>
                            <select 
                                v-model="searchFilters.message_type_filter" 
                                @change="localQuery.trim() && performSearch()"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="">Todos los tipos</option>
                                <option value="user">👤 Usuario</option>
                                <option value="assistant">🤖 Asistente</option>
                                <option value="system">🔧 Sistema</option>
                            </select>
                        </div>
                        
                        <!-- Date range -->
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Fecha desde</label>
                            <input
                                v-model="searchFilters.start_date"
                                @change="localQuery.trim() && performSearch()"
                                type="date"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Fecha hasta</label>
                            <input
                                v-model="searchFilters.end_date"
                                @change="localQuery.trim() && performSearch()"
                                type="date"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>
                    
                    <!-- Additional filters row -->
                    <div class="mt-4 flex flex-wrap gap-4">
                        <!-- Only marked conversations -->
                        <label class="flex items-center space-x-2 text-sm">
                            <input 
                                v-model="searchFilters.only_marked" 
                                @change="localQuery.trim() && performSearch()"
                                type="checkbox" 
                                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span class="text-gray-700">
                                <i class="fas fa-star text-yellow-500 mr-1"></i>
                                Solo conversaciones marcadas
                            </span>
                        </label>
                        
                        <!-- Session filter input -->
                        <div class="flex-1 min-w-48">
                            <input
                                v-model="searchFilters.session_filter"
                                @input="localQuery.trim() && performSearch()"
                                type="text"
                                placeholder="ID de sesión específica..."
                                class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Active filters display -->
            <div v-if="hasActiveFilters && !showFilters" class="mt-3 flex flex-wrap gap-2">
                <span class="text-sm text-gray-600">Filtros activos:</span>
                
                <span v-if="searchFilters.project_filter" 
                      class="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                    Proyecto: {{ searchFilters.project_filter }}
                    <button @click="searchFilters.project_filter = ''; performSearch()" 
                            class="ml-1 text-blue-600 hover:text-blue-800">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </span>
                
                <span v-if="searchFilters.message_type_filter" 
                      class="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    Tipo: {{ searchFilters.message_type_filter }}
                    <button @click="searchFilters.message_type_filter = ''; performSearch()" 
                            class="ml-1 text-green-600 hover:text-green-800">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </span>
                
                <span v-if="searchFilters.only_marked" 
                      class="inline-flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                    <i class="fas fa-star mr-1"></i>Solo marcadas
                    <button @click="searchFilters.only_marked = false; performSearch()" 
                            class="ml-1 text-yellow-600 hover:text-yellow-800">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </span>
                
                <span v-if="searchFilters.start_date" 
                      class="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                    Desde: {{ new Date(searchFilters.start_date).toLocaleDateString('es-ES') }}
                    <button @click="searchFilters.start_date = ''; performSearch()" 
                            class="ml-1 text-purple-600 hover:text-purple-800">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </span>
                
                <span v-if="searchFilters.session_filter" 
                      class="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                    Sesión: {{ searchFilters.session_filter.substring(0, 8) }}...
                    <button @click="searchFilters.session_filter = ''; performSearch()" 
                            class="ml-1 text-gray-600 hover:text-gray-800">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </span>
            </div>
            
            <!-- Quick search suggestions -->
            <div v-if="!localQuery.trim() && !showHistory" class="mt-3 flex flex-wrap gap-2">
                <span class="text-sm text-gray-500">Sugerencias:</span>
                <button v-for="suggestion in ['error', 'usuario', 'backup', 'mongodb', 'redis']"
                        :key="suggestion"
                        @click="localQuery = suggestion; performSearch()"
                        class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-full transition-colors">
                    {{ suggestion }}
                </button>
            </div>
        </div>
    `
};

export default SearchComponent;