/**
 * Base component with common functionality and optimizations
 */
export const BaseComponent = {
    data() {
        return {
            isLoading: false,
            error: null,
            retryCount: 0,
            maxRetries: 3,
            debounceTimers: new Map()
        };
    },

    methods: {
        /**
         * Enhanced error handling with retry logic
         */
        async handleAsyncOperation(operation, options = {}) {
            const { showLoading = true, retryable = true, loadingMessage = 'Loading...' } = options;
            
            if (showLoading) {
                this.isLoading = true;
                this.error = null;
            }

            try {
                const result = await operation();
                this.retryCount = 0;
                return result;
            } catch (error) {
                console.error('Operation failed:', error);
                this.error = error.message || 'An error occurred';
                
                // Retry logic for retryable operations
                if (retryable && this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`Retrying operation... (${this.retryCount}/${this.maxRetries})`);
                    
                    // Exponential backoff
                    const delay = Math.pow(2, this.retryCount) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    return this.handleAsyncOperation(operation, options);
                }
                
                throw error;
            } finally {
                if (showLoading) {
                    this.isLoading = false;
                }
            }
        },

        /**
         * Debounced function execution
         */
        debounce(key, fn, delay = 300) {
            if (this.debounceTimers.has(key)) {
                clearTimeout(this.debounceTimers.get(key));
            }

            const timer = setTimeout(() => {
                fn();
                this.debounceTimers.delete(key);
            }, delay);

            this.debounceTimers.set(key, timer);
        },

        /**
         * Format timestamp with relative time
         */
        formatTimestamp(timestamp, options = {}) {
            if (!timestamp) return 'Unknown';
            
            const date = new Date(timestamp);
            const now = new Date();
            const diffMs = now - date;
            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffSecs / 60);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            // Relative time for recent items
            if (diffSecs < 60) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;

            // Absolute time for older items
            if (options.includeTime) {
                return date.toLocaleString();
            }
            return date.toLocaleDateString();
        },

        /**
         * Format file size
         */
        formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        /**
         * Format numbers with locale
         */
        formatNumber(num, options = {}) {
            if (typeof num !== 'number') return '0';
            
            if (options.compact && num >= 1000) {
                const units = ['', 'K', 'M', 'B'];
                const unitIndex = Math.floor(Math.log10(Math.abs(num)) / 3);
                const scaledNum = num / Math.pow(1000, unitIndex);
                return scaledNum.toFixed(1) + units[unitIndex];
            }
            
            return num.toLocaleString();
        },

        /**
         * Copy text to clipboard
         */
        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.showToast('Copied to clipboard', 'success');
            } catch (error) {
                console.error('Failed to copy:', error);
                this.showToast('Failed to copy', 'error');
            }
        },

        /**
         * Show toast notification
         */
        showToast(message, type = 'info', duration = 3000) {
            // Emit event to parent or global toast system
            this.$emit('toast', { message, type, duration });
        },

        /**
         * Download blob as file
         */
        downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        /**
         * Intersection Observer for lazy loading
         */
        observeElement(element, callback, options = {}) {
            const defaultOptions = {
                root: null,
                rootMargin: '50px',
                threshold: 0.1
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        callback(entry);
                        observer.unobserve(entry.target);
                    }
                });
            }, { ...defaultOptions, ...options });

            observer.observe(element);
            return observer;
        },

        /**
         * Escape HTML to prevent XSS
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        /**
         * Highlight search terms in text
         */
        highlightSearchTerms(text, searchTerm) {
            if (!searchTerm) return text;
            
            const regex = new RegExp(`(${searchTerm})`, 'gi');
            return text.replace(regex, '<mark class="highlight">$1</mark>');
        }
    },

    beforeUnmount() {
        // Clean up debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }
};