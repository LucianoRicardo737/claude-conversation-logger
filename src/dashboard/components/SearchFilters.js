/**
 * Advanced search filters component with enhanced UX
 */
import { BaseComponent } from './BaseComponent.js';

export const SearchFilters = {
    mixins: [BaseComponent],
    
    props: {
        modelValue: {
            type: Object,
            default: () => ({})
        },
        projects: {
            type: Array,
            default: () => []
        },
        showAdvanced: {
            type: Boolean,
            default: false
        }
    },

    emits: ['update:modelValue', 'search', 'clear', 'toggle-advanced'],

    data() {
        return {
            localFilters: {
                query: '',
                project: '',
                messageType: '',
                startDate: '',
                endDate: '',
                onlyMarked: false,
                tags: [],
                ...this.modelValue
            },
            isAdvancedOpen: this.showAdvanced,
            quickFilters: [
                { label: 'Today', days: 1 },
                { label: 'This Week', days: 7 },
                { label: 'This Month', days: 30 },
                { label: 'Last 3 Months', days: 90 }
            ],
            messageTypes: [
                { value: '', label: 'All Types' },
                { value: 'user', label: 'User Messages' },
                { value: 'assistant', label: 'Assistant Messages' },
                { value: 'system', label: 'System Messages' },
                { value: 'tool', label: 'Tool Messages' }
            ],
            availableTags: [
                'bug', 'feature', 'question', 'resolved', 'urgent', 'documentation'
            ]
        };
    },

    computed: {
        hasActiveFilters() {
            return !!(
                this.localFilters.query ||
                this.localFilters.project ||
                this.localFilters.messageType ||
                this.localFilters.startDate ||
                this.localFilters.endDate ||
                this.localFilters.onlyMarked ||
                this.localFilters.tags?.length
            );
        },

        activeFilterCount() {
            let count = 0;
            if (this.localFilters.query) count++;
            if (this.localFilters.project) count++;
            if (this.localFilters.messageType) count++;
            if (this.localFilters.startDate || this.localFilters.endDate) count++;
            if (this.localFilters.onlyMarked) count++;
            if (this.localFilters.tags?.length) count++;
            return count;
        },

        projectOptions() {
            const options = [{ value: '', label: 'All Projects' }];
            this.projects.forEach(project => {
                options.push({
                    value: project.name || project,
                    label: project.name || project
                });
            });
            return options;
        }
    },

    watch: {
        modelValue: {
            handler(newValue) {
                this.localFilters = { ...this.localFilters, ...newValue };
            },
            deep: true
        },

        localFilters: {
            handler(newValue) {
                // Debounce the emit to prevent excessive updates
                this.debounce('emit-filters', () => {
                    this.$emit('update:modelValue', newValue);
                }, 100);
            },
            deep: true
        },

        'localFilters.query': {
            handler(newValue) {
                // Debounce query input for better UX
                this.debounce('query-search', () => {
                    this.$emit('search', this.localFilters);
                }, 300);
            }
        },

        'localFilters.project': {
            handler(newValue) {
                // Immediate response for project selection
                this.debounce('project-search', () => {
                    this.$emit('search', this.localFilters);
                }, 150);
            }
        }
    },

    methods: {
        handleSearch() {
            this.$emit('search', this.localFilters);
        },

        clearFilters() {
            this.localFilters = {
                query: '',
                project: '',
                messageType: '',
                startDate: '',
                endDate: '',
                onlyMarked: false,
                tags: []
            };
            this.$emit('clear');
        },

        setQuickDateFilter(days) {
            const endDate = new Date();
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - days);
            
            this.localFilters.startDate = startDate.toISOString().split('T')[0];
            this.localFilters.endDate = endDate.toISOString().split('T')[0];
            
            this.debounce('search', this.handleSearch, 500);
        },

        toggleAdvanced() {
            this.isAdvancedOpen = !this.isAdvancedOpen;
            this.$emit('toggle-advanced', this.isAdvancedOpen);
        },

        addTag(tag) {
            if (!this.localFilters.tags.includes(tag)) {
                this.localFilters.tags.push(tag);
            }
        },

        removeTag(tag) {
            const index = this.localFilters.tags.indexOf(tag);
            if (index > -1) {
                this.localFilters.tags.splice(index, 1);
            }
        },

        onQueryChange() {
            this.debounce('search', this.handleSearch, 800);
        },

        onFilterChange() {
            this.debounce('search', this.handleSearch, 300);
        }
    },

    template: `
        <div class="search-filters bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm transition-all duration-200 ease-in-out">
            <!-- Main Search Bar -->
            <div class="p-4">
                <div class="flex gap-3">
                    <div class="flex-1 relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i class="fas fa-search text-gray-400"></i>
                        </div>
                        <input 
                            v-model="localFilters.query"
                            @input="onQueryChange"
                            @keyup.enter="handleSearch"
                            type="text" 
                            placeholder="Search conversations..." 
                            class="block w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 
                                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                                   placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200 ease-in-out">
                    </div>
                    
                    <button @click="handleSearch" 
                            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md 
                                   text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <i class="fas fa-search mr-2"></i>
                        Search
                    </button>
                    
                    <button @click="toggleAdvanced" 
                            :class="['inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md',
                                    'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600',
                                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors',
                                    isAdvancedOpen ? 'bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300' : '']">
                        <i :class="['fas', isAdvancedOpen ? 'fa-chevron-up' : 'fa-filter']"></i>
                        <span class="ml-2 hidden sm:inline">{{ isAdvancedOpen ? 'Hide' : 'Filters' }}</span>
                        <span v-if="activeFilterCount > 0" 
                              class="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                            {{ activeFilterCount }}
                        </span>
                    </button>
                </div>

                <!-- Quick Date Filters -->
                <div class="mt-3 flex flex-wrap gap-2">
                    <span class="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">Quick filters:</span>
                    <button v-for="filter in quickFilters" 
                            :key="filter.label"
                            @click="setQuickDateFilter(filter.days)"
                            class="inline-flex items-center px-2 py-1 text-xs font-medium rounded 
                                   text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900 
                                   hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors">
                        {{ filter.label }}
                    </button>
                </div>
            </div>

            <!-- Advanced Filters -->
            <transition name="accordion" mode="out-in">
                <div v-if="isAdvancedOpen" class="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-750 transition-all duration-300 ease-in-out">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <!-- Project Filter -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Project
                        </label>
                        <select v-model="localFilters.project" 
                                @change="onFilterChange"
                                class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 
                                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option v-for="option in projectOptions" 
                                    :key="option.value" 
                                    :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <!-- Message Type Filter -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Message Type
                        </label>
                        <select v-model="localFilters.messageType" 
                                @change="onFilterChange"
                                class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 
                                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option v-for="type in messageTypes" 
                                    :key="type.value" 
                                    :value="type.value">
                                {{ type.label }}
                            </option>
                        </select>
                    </div>

                    <!-- Date Range -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Date Range
                        </label>
                        <div class="flex gap-2">
                            <input v-model="localFilters.startDate" 
                                   @change="onFilterChange"
                                   type="date" 
                                   class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                          bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 
                                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <input v-model="localFilters.endDate" 
                                   @change="onFilterChange"
                                   type="date" 
                                   class="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                          bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 
                                          focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                    </div>
                </div>

                <!-- Additional Options -->
                <div class="mt-4 flex flex-wrap items-center gap-4">
                    <label class="flex items-center">
                        <input v-model="localFilters.onlyMarked" 
                               @change="onFilterChange"
                               type="checkbox" 
                               class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded">
                        <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Only marked conversations</span>
                    </label>
                </div>

                <!-- Tags -->
                <div class="mt-4">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tags
                    </label>
                    <div class="flex flex-wrap gap-2 mb-2">
                        <span v-for="tag in localFilters.tags" 
                              :key="tag"
                              class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full 
                                     text-blue-800 bg-blue-100 dark:text-blue-200 dark:bg-blue-800">
                            {{ tag }}
                            <button @click="removeTag(tag)" 
                                    class="ml-1 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100">
                                <i class="fas fa-times text-xs"></i>
                            </button>
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="tag in availableTags" 
                                :key="tag"
                                @click="addTag(tag)"
                                :disabled="localFilters.tags.includes(tag)"
                                class="inline-flex items-center px-2 py-1 text-xs font-medium rounded 
                                       text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 
                                       hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors
                                       disabled:opacity-50 disabled:cursor-not-allowed">
                            + {{ tag }}
                        </button>
                    </div>
                </div>

                <!-- Actions -->
                <div class="mt-4 flex justify-between items-center">
                    <button @click="clearFilters" 
                            :disabled="!hasActiveFilters"
                            class="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md 
                                   text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 
                                   border border-gray-300 dark:border-gray-600 
                                   hover:bg-gray-50 dark:hover:bg-gray-600 
                                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <i class="fas fa-times mr-2"></i>
                        Clear All
                    </button>
                    
                    <div class="text-xs text-gray-500 dark:text-gray-400">
                        <span v-if="activeFilterCount === 0">No active filters</span>
                        <span v-else>{{ activeFilterCount }} active filter{{ activeFilterCount !== 1 ? 's' : '' }}</span>
                    </div>
                </div>
                </div>
            </transition>
        </div>
    `
};