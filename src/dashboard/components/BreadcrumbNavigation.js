/**
 * Enhanced breadcrumb navigation component
 */
import { BaseComponent } from './BaseComponent.js';

export const BreadcrumbNavigation = {
    mixins: [BaseComponent],
    
    props: {
        items: {
            type: Array,
            required: true,
            validator: items => items.every(item => 
                typeof item === 'object' && 
                item.label && 
                (item.href || item.action || item.route)
            )
        },
        maxItems: {
            type: Number,
            default: 5
        },
        showIcons: {
            type: Boolean,
            default: true
        },
        animated: {
            type: Boolean,
            default: true
        }
    },

    emits: ['navigate'],

    computed: {
        processedItems() {
            if (this.items.length <= this.maxItems) {
                return this.items;
            }

            // Keep first item, show ellipsis, and keep last few items
            const keepLast = this.maxItems - 2; // Account for first item and ellipsis
            const firstItem = this.items[0];
            const lastItems = this.items.slice(-keepLast);
            
            return [
                firstItem,
                { 
                    label: '...', 
                    isEllipsis: true, 
                    action: () => this.showAllItems() 
                },
                ...lastItems
            ];
        },

        homeItem() {
            return {
                label: 'Dashboard',
                icon: 'fas fa-home',
                action: () => this.navigateHome()
            };
        }
    },

    data() {
        return {
            showAll: false
        };
    },

    methods: {
        handleItemClick(item, index) {
            if (item.isEllipsis) {
                this.showAllItems();
                return;
            }

            // Emit navigation event
            this.$emit('navigate', {
                item,
                index,
                items: this.items
            });

            // Handle different navigation types
            if (item.action && typeof item.action === 'function') {
                item.action();
            } else if (item.route) {
                // Vue Router navigation
                this.$router?.push(item.route);
            } else if (item.href) {
                // Direct navigation
                window.location.href = item.href;
            }
        },

        showAllItems() {
            this.showAll = true;
        },

        navigateHome() {
            this.$emit('navigate', {
                item: this.homeItem,
                index: -1,
                items: []
            });
        },

        getItemIcon(item) {
            if (!this.showIcons) return null;
            
            // Default icons based on common patterns
            if (item.icon) return item.icon;
            
            const label = item.label.toLowerCase();
            if (label.includes('project')) return 'fas fa-folder';
            if (label.includes('session')) return 'fas fa-comments';
            if (label.includes('search')) return 'fas fa-search';
            if (label.includes('setting')) return 'fas fa-cog';
            if (label.includes('user')) return 'fas fa-user';
            
            return 'fas fa-chevron-right';
        },

        getItemClass(item, index) {
            const baseClasses = [
                'inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200'
            ];

            if (item.isEllipsis) {
                baseClasses.push(
                    'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                    'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                );
            } else if (index === this.items.length - 1) {
                // Current/last item - active state
                baseClasses.push(
                    'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900',
                    'cursor-default'
                );
            } else {
                // Clickable items
                baseClasses.push(
                    'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100',
                    'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                );
            }

            return baseClasses.join(' ');
        }
    },

    template: `
        <nav class="breadcrumb-navigation" aria-label="Breadcrumb">
            <div class="flex items-center space-x-1 overflow-x-auto scrollbar-hide">
                <!-- Home Icon -->
                <button @click="navigateHome" 
                        class="inline-flex items-center p-2 text-gray-500 dark:text-gray-400 
                               hover:text-gray-700 dark:hover:text-gray-200 
                               hover:bg-gray-100 dark:hover:bg-gray-700 
                               rounded-md transition-colors duration-200"
                        title="Dashboard">
                    <i class="fas fa-home text-sm"></i>
                </button>

                <!-- Separator -->
                <div class="text-gray-400 dark:text-gray-500">
                    <i class="fas fa-chevron-right text-xs"></i>
                </div>

                <!-- Breadcrumb Items -->
                <template v-for="(item, index) in (showAll ? items : processedItems)" :key="index">
                    <!-- Item -->
                    <div :class="[
                        'inline-flex items-center',
                        animated ? 'animate-fadeInUp' : ''
                    ]" 
                         :style="animated ? { animationDelay: index * 100 + 'ms' } : {}">
                        
                        <button @click="handleItemClick(item, index)"
                                :class="getItemClass(item, index)"
                                :disabled="index === items.length - 1 && !item.isEllipsis"
                                :title="item.description || item.label">
                            <!-- Icon -->
                            <i v-if="getItemIcon(item)" 
                               :class="[getItemIcon(item), 'text-xs mr-2']"></i>
                            
                            <!-- Label -->
                            <span class="whitespace-nowrap">{{ item.label }}</span>
                            
                            <!-- Badge for special items -->
                            <span v-if="item.badge" 
                                  class="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                                {{ item.badge }}
                            </span>
                        </button>
                    </div>

                    <!-- Separator (except for last item) -->
                    <div v-if="index < (showAll ? items : processedItems).length - 1" 
                         class="text-gray-400 dark:text-gray-500">
                        <i class="fas fa-chevron-right text-xs"></i>
                    </div>
                </template>

                <!-- Show All Toggle (when items are collapsed) -->
                <button v-if="!showAll && items.length > maxItems" 
                        @click="showAll = true"
                        class="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 
                               hover:text-gray-700 dark:hover:text-gray-200 
                               hover:bg-gray-100 dark:hover:bg-gray-700 
                               rounded transition-colors duration-200"
                        title="Show all breadcrumb items">
                    <i class="fas fa-ellipsis-h mr-1"></i>
                    <span>Show All</span>
                </button>
            </div>

            <!-- Mobile Overflow Indicator -->
            <div class="block sm:hidden mt-2">
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <i class="fas fa-info-circle mr-1"></i>
                    <span>Scroll horizontally to see more</span>
                </div>
            </div>
        </nav>
    `
};