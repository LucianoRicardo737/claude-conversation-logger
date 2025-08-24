/**
 * Enhanced loading spinner component with multiple variants
 */
export const LoadingSpinner = {
    props: {
        type: {
            type: String,
            default: 'default',
            validator: value => ['default', 'dots', 'pulse', 'bars', 'ring'].includes(value)
        },
        size: {
            type: String,
            default: 'medium',
            validator: value => ['small', 'medium', 'large'].includes(value)
        },
        color: {
            type: String,
            default: 'blue'
        },
        message: {
            type: String,
            default: ''
        },
        overlay: {
            type: Boolean,
            default: false
        }
    },

    computed: {
        spinnerClasses() {
            const sizeClasses = {
                small: 'h-4 w-4',
                medium: 'h-8 w-8',
                large: 'h-12 w-12'
            };

            const colorClasses = {
                blue: 'text-blue-500',
                green: 'text-green-500',
                red: 'text-red-500',
                yellow: 'text-yellow-500',
                purple: 'text-purple-500',
                gray: 'text-gray-500'
            };

            return [
                sizeClasses[this.size],
                colorClasses[this.color] || colorClasses.blue
            ].join(' ');
        },

        containerClasses() {
            return [
                'flex flex-col items-center justify-center',
                this.overlay ? 'fixed inset-0 bg-black bg-opacity-50 z-50' : '',
                this.message ? 'space-y-3' : ''
            ].filter(Boolean).join(' ');
        }
    },

    template: `
        <div :class="containerClasses">
            <!-- Default Spinner -->
            <div v-if="type === 'default'" 
                 :class="spinnerClasses" 
                 class="animate-spin">
                <svg class="w-full h-full" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle>
                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor"></path>
                </svg>
            </div>

            <!-- Dots Spinner -->
            <div v-else-if="type === 'dots'" 
                 :class="spinnerClasses" 
                 class="flex space-x-1">
                <div class="w-2 h-2 bg-current rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-2 h-2 bg-current rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-2 h-2 bg-current rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>

            <!-- Pulse Spinner -->
            <div v-else-if="type === 'pulse'" 
                 :class="spinnerClasses" 
                 class="bg-current rounded-full animate-pulse"></div>

            <!-- Bars Spinner -->
            <div v-else-if="type === 'bars'" 
                 :class="spinnerClasses" 
                 class="flex space-x-1 items-end">
                <div class="w-1 h-4 bg-current animate-pulse" style="animation-delay: 0ms"></div>
                <div class="w-1 h-6 bg-current animate-pulse" style="animation-delay: 150ms"></div>
                <div class="w-1 h-4 bg-current animate-pulse" style="animation-delay: 300ms"></div>
                <div class="w-1 h-6 bg-current animate-pulse" style="animation-delay: 450ms"></div>
            </div>

            <!-- Ring Spinner -->
            <div v-else-if="type === 'ring'" 
                 :class="spinnerClasses" 
                 class="animate-spin">
                <svg class="w-full h-full" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416" class="animate-spin"></circle>
                </svg>
            </div>

            <!-- Loading Message -->
            <div v-if="message" 
                 class="text-sm font-medium text-gray-600 dark:text-gray-300 text-center max-w-xs">
                {{ message }}
            </div>
        </div>
    `
};