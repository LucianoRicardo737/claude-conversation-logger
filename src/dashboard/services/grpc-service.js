/**
 * Servicio gRPC optimizado para comunicación en tiempo real
 * Reemplaza completamente el WebSocket service con gRPC streaming bidireccional
 */

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';

class GrpcService {
    constructor() {
        this.client = null;
        this.streams = new Map(); // Manage multiple streams
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.reconnectTimer = null;
        this.isConnecting = false;
        this.listeners = new Map();
        
        // Stream management
        this.messageStream = null;
        this.statsStream = null;
        
        // Message queue for offline messages
        this.messageQueue = [];
        
        // Keep-alive management
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;
        
        // Connection state
        this.connectionState = 'disconnected'; // disconnected, connecting, connected, error
    }

    /**
     * Initialize gRPC client with optimized settings
     */
    async initialize() {
        try {
            // Load proto file
            const PROTO_PATH = this.getProtoPath();
            const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true,
                arrays: true,
                objects: true,
                json: true
            });

            const conversationProto = grpc.loadPackageDefinition(packageDefinition).conversation;

            // Create client with optimized channel options
            const channelOptions = {
                'grpc.keepalive_time_ms': 30000,
                'grpc.keepalive_timeout_ms': 5000,
                'grpc.keepalive_permit_without_calls': true,
                'grpc.http2.max_pings_without_data': 0,
                'grpc.http2.min_time_between_pings_ms': 10000,
                'grpc.http2.min_ping_interval_without_data_ms': 300000,
                'grpc.max_receive_message_length': 4 * 1024 * 1024, // 4MB
                'grpc.max_send_message_length': 4 * 1024 * 1024 // 4MB
            };

            this.client = new conversationProto.ConversationService(
                this.getGrpcServerUrl(),
                grpc.credentials.createInsecure(),
                channelOptions
            );

            console.log('✅ gRPC client initialized successfully');
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize gRPC client:', error);
            return false;
        }
    }

    /**
     * Connect and establish streaming connections
     */
    async connect() {
        if (this.isConnecting || this.connectionState === 'connected') {
            return;
        }

        this.isConnecting = true;
        this.connectionState = 'connecting';

        try {
            // Initialize client if not done
            if (!this.client) {
                await this.initialize();
            }

            // Test connection with a simple call
            await this.testConnection();

            // Establish streaming connections
            await this.establishStreams();

            this.connectionState = 'connected';
            this.isConnecting = false;
            this.reconnectAttempts = 0;

            this.startHeartbeat();
            this.processMessageQueue();
            this.emit('connection', { status: 'connected' });

            console.log('✅ gRPC service connected and streaming');

        } catch (error) {
            console.error('❌ gRPC connection failed:', error);
            this.handleConnectionError();
        }
    }

    /**
     * Test connection with a lightweight call
     */
    async testConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection test timeout'));
            }, 5000);

            // Use GetLiveStats as a connection test
            const call = this.client.GetLiveStats({});
            
            call.on('data', () => {
                clearTimeout(timeout);
                call.cancel();
                resolve();
            });

            call.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Establish all streaming connections
     */
    async establishStreams() {
        // Message stream for real-time updates
        this.messageStream = this.client.StreamMessages({});
        this.setupMessageStreamHandlers();

        // Stats stream for metrics
        this.statsStream = this.client.GetLiveStats({});
        this.setupStatsStreamHandlers();
    }

    /**
     * Setup message stream event handlers
     */
    setupMessageStreamHandlers() {
        this.messageStream.on('data', (messageEvent) => {
            this.handleMessageEvent(messageEvent);
        });

        this.messageStream.on('error', (error) => {
            console.error('❌ Message stream error:', error);
            this.handleStreamError('message', error);
        });

        this.messageStream.on('end', () => {
            console.log('🔴 Message stream ended');
            this.handleStreamEnd('message');
        });

        this.messageStream.on('status', (status) => {
            console.log('📡 Message stream status:', status.code, status.details);
        });
    }

    /**
     * Setup stats stream event handlers  
     */
    setupStatsStreamHandlers() {
        this.statsStream.on('data', (statsEvent) => {
            this.handleStatsEvent(statsEvent);
        });

        this.statsStream.on('error', (error) => {
            console.error('❌ Stats stream error:', error);
            this.handleStreamError('stats', error);
        });

        this.statsStream.on('end', () => {
            console.log('🔴 Stats stream ended');
            this.handleStreamEnd('stats');
        });

        this.statsStream.on('status', (status) => {
            console.log('📊 Stats stream status:', status.code, status.details);
        });
    }

    /**
     * Handle incoming message events
     */
    handleMessageEvent(messageEvent) {
        const { type, message, timestamp } = messageEvent;
        
        switch (type) {
            case 'new_message':
                this.emit('new_message', message);
                break;
                
            case 'session_start':
                this.emit('session_start', message);
                break;
                
            case 'session_end':
                this.emit('session_end', message);
                break;
                
            default:
                console.warn('⚠️  Unknown message event type:', type);
                this.emit('unknown_message', messageEvent);
        }
    }

    /**
     * Handle incoming stats events
     */
    handleStatsEvent(statsEvent) {
        const { type, stats, timestamp } = statsEvent;
        
        this.lastHeartbeat = Date.now();
        
        switch (type) {
            case 'message_count':
            case 'token_usage':
            case 'cost_update':
            case 'project_activity':
                this.emit('live_stats', stats);
                break;
                
            default:
                this.emit('stats_update', statsEvent);
        }
    }

    /**
     * Handle stream errors
     */
    handleStreamError(streamName, error) {
        console.error(`❌ ${streamName} stream error:`, error);
        
        // Attempt to reconnect on certain errors
        if (this.shouldReconnectOnError(error)) {
            this.scheduleReconnect();
        }
    }

    /**
     * Handle stream end
     */
    handleStreamEnd(streamName) {
        console.log(`🔴 ${streamName} stream ended`);
        
        if (this.connectionState === 'connected') {
            // Unexpected stream end, try to reconnect
            this.scheduleReconnect();
        }
    }

    /**
     * Determine if error warrants reconnection
     */
    shouldReconnectOnError(error) {
        // Reconnect on network errors, unavailable service, etc.
        return error.code === grpc.status.UNAVAILABLE ||
               error.code === grpc.status.DEADLINE_EXCEEDED ||
               error.code === grpc.status.CANCELLED ||
               error.code === grpc.status.ABORTED;
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.connectionState = 'error';
            this.emit('connection', { status: 'error' });
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnect();
        }, delay);
    }

    /**
     * Reconnect to gRPC server
     */
    async reconnect() {
        console.log('🔄 Attempting gRPC reconnection...');
        
        // Close existing streams
        this.closeStreams();
        
        this.connectionState = 'disconnected';
        await this.connect();
    }

    /**
     * Close all active streams
     */
    closeStreams() {
        if (this.messageStream) {
            this.messageStream.cancel();
            this.messageStream = null;
        }

        if (this.statsStream) {
            this.statsStream.cancel();
            this.statsStream = null;
        }
    }

    /**
     * Handle connection errors
     */
    handleConnectionError() {
        this.isConnecting = false;
        this.connectionState = 'error';
        this.emit('connection', { status: 'error' });
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            // Check if we haven't received stats in too long
            if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > 60000) {
                console.warn('⚠️  gRPC heartbeat timeout, reconnecting...');
                this.reconnect();
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Process queued messages when connection is restored
     */
    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const queuedCall = this.messageQueue.shift();
            try {
                queuedCall();
            } catch (error) {
                console.error('❌ Error processing queued message:', error);
            }
        }
    }

    // === Public API Methods ===

    /**
     * Get conversation tree
     */
    async getConversationTree(filters = {}) {
        return new Promise((resolve, reject) => {
            const request = {
                project_filter: filters.project || '',
                limit: filters.limit || 50,
                hours_back: filters.hours_back || 24
            };

            this.client.GetConversationTree(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Search conversations
     */
    async searchConversations(query, filters = {}) {
        return new Promise((resolve, reject) => {
            const request = {
                query: query || '',
                project_filter: filters.project || '',
                session_filter: filters.session || '',
                message_type_filter: filters.messageType || '',
                start_date: filters.startDate || 0,
                end_date: filters.endDate || 0,
                only_marked: filters.onlyMarked || false,
                limit: filters.limit || 50,
                offset: filters.offset || 0
            };

            this.client.SearchConversations(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Mark conversation as important
     */
    async markConversation(sessionId, isMarked, note = '', tags = []) {
        return new Promise((resolve, reject) => {
            const request = {
                session_id: sessionId,
                is_marked: isMarked,
                note: note,
                tags: tags
            };

            this.client.MarkImportant(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    /**
     * Export conversation
     */
    async exportConversation(sessionId, format = 'json', includeMetadata = true) {
        return new Promise((resolve, reject) => {
            const request = {
                session_id: sessionId,
                format: format,
                include_metadata: includeMetadata
            };

            this.client.ExportConversation(request, (error, response) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });
    }

    // === Event System (compatible with WebSocket service) ===

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
     * Get current connection status
     */
    getConnectionStatus() {
        return this.connectionState;
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        console.log('🔌 Disconnecting gRPC service...');
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Stop heartbeat
        this.stopHeartbeat();

        // Close streams
        this.closeStreams();

        // Mark max attempts to prevent reconnection
        this.reconnectAttempts = this.maxReconnectAttempts;
        this.connectionState = 'disconnected';

        // Close client
        if (this.client) {
            this.client.close();
            this.client = null;
        }

        this.emit('connection', { status: 'disconnected' });
        console.log('🔌 gRPC service disconnected');
    }

    // === Utility Methods ===

    /**
     * Get proto file path
     */
    getProtoPath() {
        // Adjust path based on environment
        if (typeof window !== 'undefined') {
            // Browser environment - proto should be served by server
            return '/grpc/conversation.proto';
        } else {
            // Node.js environment
            return path.join(process.cwd(), 'src', 'grpc', 'conversation.proto');
        }
    }

    /**
     * Get gRPC server URL
     */
    getGrpcServerUrl() {
        if (typeof window !== 'undefined') {
            // Browser environment
            const protocol = window.location.protocol === 'https:' ? 'grpcs:' : 'grpc:';
            const host = window.location.hostname;
            const port = process.env.GRPC_PORT || 50051;
            return `${host}:${port}`;
        } else {
            // Node.js environment
            return `localhost:${process.env.GRPC_PORT || 50051}`;
        }
    }

    // === Compatibility Methods for WebSocket Migration ===

    /**
     * Subscribe to conversations (WebSocket compatibility)
     */
    subscribeToConversations(projectFilter = null) {
        // gRPC streaming handles this automatically
        console.log('📡 Subscribed to conversations via gRPC stream');
    }

    /**
     * Subscribe to search results (WebSocket compatibility)
     */
    subscribeToSearch(query, filters = {}) {
        // Implement with real-time search if needed
        console.log('🔍 Search subscription via gRPC stream');
    }

    /**
     * Request live stats (WebSocket compatibility)
     */
    requestLiveStats() {
        // Stats stream is automatic, no need to request
        console.log('📊 Live stats via gRPC stream');
    }
}

// Create and export singleton instance
const grpcService = new GrpcService();

// Auto-initialize when loaded
if (typeof window !== 'undefined') {
    // Browser environment - auto-connect
    grpcService.connect().catch(error => {
        console.error('❌ Failed to auto-connect gRPC service:', error);
    });

    // Reconnect when page becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && grpcService.getConnectionStatus() === 'disconnected') {
            grpcService.connect();
        }
    });

    // Disconnect when page is about to unload
    window.addEventListener('beforeunload', () => {
        grpcService.disconnect();
    });
}

export default grpcService;