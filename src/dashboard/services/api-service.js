/**
 * API Service - REST client for dashboard communication
 * Reemplaza gRPC/WebSocket con REST + polling para compatibilidad con navegadores
 * Se conecta al servidor principal que usa gRPC en el backend (puerto 50051)
 */

class ApiService {
    constructor() {
        this.baseUrl = this.getBaseUrl();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.listeners = new Map();
        
        // Polling configuration
        this.pollingIntervals = new Map();
        this.defaultPollingInterval = 5000; // 5 seconds
        this.statsPollingInterval = 10000; // 10 seconds for stats
        
        // Cache for data consistency
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.defaultCacheTime = 30000; // 30 seconds cache
    }

    /**
     * Get base URL for API calls
     */
    getBaseUrl() {
        if (typeof window !== 'undefined') {
            return `${window.location.protocol}//${window.location.host}/api`;
        }
        return 'http://localhost:3000/api';
    }

    /**
     * Initialize connection and start polling
     */
    async connect() {
        try {
            // Test connection with health check
            const response = await this.request('GET', '/stats');
            if (response) {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startPolling();
                this.emit('connection', { status: 'connected' });
                console.log('✅ API Service connected successfully');
                return true;
            }
        } catch (error) {
            console.error('❌ API connection failed:', error);
            this.handleConnectionError();
            return false;
        }
    }

    /**
     * Disconnect and stop polling
     */
    disconnect() {
        this.isConnected = false;
        this.stopPolling();
        this.emit('connection', { status: 'disconnected' });
        console.log('🔌 API Service disconnected');
    }

    /**
     * Start polling for real-time updates
     */
    startPolling() {
        // Stats polling
        this.pollingIntervals.set('stats', setInterval(async () => {
            try {
                const stats = await this.getStats();
                this.emit('live_stats', stats);
            } catch (error) {
                console.warn('⚠️ Stats polling error:', error.message);
            }
        }, this.statsPollingInterval));

        // Conversations polling
        this.pollingIntervals.set('conversations', setInterval(async () => {
            try {
                const tree = await this.getConversationTree();
                this.emit('conversations_update', tree);
            } catch (error) {
                console.warn('⚠️ Conversations polling error:', error.message);
            }
        }, this.defaultPollingInterval));

        console.log('🔄 Polling started for real-time updates');
    }

    /**
     * Stop all polling intervals
     */
    stopPolling() {
        for (const [name, interval] of this.pollingIntervals) {
            clearInterval(interval);
            console.log(`🛑 Stopped ${name} polling`);
        }
        this.pollingIntervals.clear();
    }

    /**
     * Generic HTTP request method
     */
    async request(method, endpoint, data = null, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error(`❌ Request failed ${method} ${endpoint}:`, error);
            
            // Handle network errors
            if (!navigator.onLine) {
                this.handleConnectionError();
            }
            
            throw error;
        }
    }

    // === API Methods ===

    /**
     * Get conversation tree
     */
    async getConversationTree(filters = {}) {
        const cacheKey = `tree_${JSON.stringify(filters)}`;
        
        // Check cache first
        if (this.isCacheValid(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const params = new URLSearchParams();
        if (filters.project) params.append('project', filters.project);
        if (filters.limit) params.append('limit', filters.limit);
        if (filters.hours_back) params.append('hours_back', filters.hours_back);

        const endpoint = `/conversations/tree${params.toString() ? '?' + params.toString() : ''}`;
        const data = await this.request('GET', endpoint);
        
        // Cache result
        this.setCache(cacheKey, data, this.defaultCacheTime);
        return data;
    }

    /**
     * Search conversations
     */
    async searchConversations(query, filters = {}) {
        const params = new URLSearchParams();
        if (query) params.append('q', query);
        if (filters.project) params.append('project', filters.project);
        if (filters.session) params.append('session', filters.session);
        if (filters.message_type) params.append('message_type', filters.message_type);
        if (filters.start_date) params.append('start_date', filters.start_date);
        if (filters.end_date) params.append('end_date', filters.end_date);
        if (filters.only_marked) params.append('only_marked', filters.only_marked);
        if (filters.limit) params.append('limit', filters.limit);
        if (filters.offset) params.append('offset', filters.offset);

        const endpoint = `/search/advanced?${params.toString()}`;
        return await this.request('GET', endpoint);
    }

    /**
     * Get conversation details
     */
    async getConversationDetails(sessionId, includeMetadata = true) {
        const params = new URLSearchParams();
        params.append('include_metadata', includeMetadata);
        
        const endpoint = `/conversations/${sessionId}?${params.toString()}`;
        return await this.request('GET', endpoint);
    }

    /**
     * Mark conversation as important
     */
    async markConversation(sessionId, isMarked, note = '', tags = []) {
        const data = {
            is_marked: isMarked,
            note,
            tags
        };
        
        const endpoint = `/conversations/${sessionId}/mark`;
        return await this.request('POST', endpoint, data);
    }

    /**
     * Export conversation
     */
    async exportConversation(sessionId, format = 'json', includeMetadata = true) {
        const params = new URLSearchParams();
        params.append('format', format);
        params.append('include_metadata', includeMetadata);
        
        const endpoint = `/conversations/${sessionId}/export?${params.toString()}`;
        return await this.request('GET', endpoint);
    }

    /**
     * Get dashboard stats
     */
    async getStats() {
        const cacheKey = 'dashboard_stats';
        
        // Check cache for stats (shorter cache time)
        if (this.isCacheValid(cacheKey, 10000)) { // 10 second cache for stats
            return this.cache.get(cacheKey);
        }

        const data = await this.request('GET', '/stats');
        this.setCache(cacheKey, data, 10000);
        return data;
    }

    /**
     * Update session description
     */
    async updateSessionDescription(sessionId, description, category = '📝 General', projectName = '') {
        const data = {
            description,
            category,
            project_name: projectName
        };
        
        const endpoint = `/sessions/${sessionId}/description`;
        return await this.request('POST', endpoint, data);
    }

    /**
     * Get session description
     */
    async getSessionDescription(sessionId) {
        const endpoint = `/sessions/${sessionId}/description`;
        return await this.request('GET', endpoint);
    }

    // === Cache Management ===

    /**
     * Set cache with expiry
     */
    setCache(key, data, ttl = this.defaultCacheTime) {
        this.cache.set(key, data);
        this.cacheExpiry.set(key, Date.now() + ttl);
    }

    /**
     * Check if cache is valid
     */
    isCacheValid(key, customTtl = null) {
        if (!this.cache.has(key)) return false;
        
        const expiry = this.cacheExpiry.get(key);
        const now = Date.now();
        
        if (customTtl) {
            return (now - (expiry - this.defaultCacheTime)) < customTtl;
        }
        
        return now < expiry;
    }

    /**
     * Clear cache
     */
    clearCache(key = null) {
        if (key) {
            this.cache.delete(key);
            this.cacheExpiry.delete(key);
        } else {
            this.cache.clear();
            this.cacheExpiry.clear();
        }
    }

    // === Event System (compatible with original service) ===

    /**
     * Register event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Emit event to listeners
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`❌ Error in ${event} listener:`, error);
                }
            });
        }
    }

    /**
     * Handle connection errors
     */
    handleConnectionError() {
        this.isConnected = false;
        this.stopPolling();
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
            
            console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.error('❌ Max reconnection attempts reached');
            this.emit('connection', { status: 'error' });
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return this.isConnected ? 'connected' : 'disconnected';
    }

    // === WebSocket Compatibility Methods ===

    /**
     * Subscribe to conversations (compatibility method)
     */
    subscribeToConversations(projectFilter = null) {
        console.log('📡 Subscribed to conversations via polling');
        // Polling handles this automatically
    }

    /**
     * Subscribe to search results (compatibility method)
     */
    subscribeToSearch(query, filters = {}) {
        console.log('🔍 Search subscription via polling');
        // Implement with on-demand search
    }

    /**
     * Request live stats (compatibility method)
     */
    requestLiveStats() {
        console.log('📊 Live stats via polling');
        // Stats polling handles this automatically
    }
}

// Create and export singleton instance
let apiService;
if (typeof window !== 'undefined') {
    // Browser environment - use global singleton
    if (!window.apiServiceInstance) {
        window.apiServiceInstance = new ApiService();
    }
    apiService = window.apiServiceInstance;
} else {
    // Node environment
    apiService = new ApiService();
}

// Auto-initialize when loaded in browser (singleton pattern)
if (typeof window !== 'undefined' && !window.apiServiceInitialized) {
    window.apiServiceInitialized = true;
    
    // Auto-connect when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            apiService.connect().catch(error => {
                console.error('❌ Failed to auto-connect API service:', error);
            });
        });
    } else {
        // Document already loaded
        apiService.connect().catch(error => {
            console.error('❌ Failed to auto-connect API service:', error);
        });
    }

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && apiService.getConnectionStatus() === 'disconnected') {
            apiService.connect();
        }
    });

    // Handle online/offline events
    window.addEventListener('online', () => {
        console.log('📶 Network online, reconnecting...');
        apiService.connect();
    });

    window.addEventListener('offline', () => {
        console.log('📵 Network offline');
        apiService.disconnect();
    });

    // Cleanup before unload
    window.addEventListener('beforeunload', () => {
        apiService.disconnect();
    });
}

export default apiService;