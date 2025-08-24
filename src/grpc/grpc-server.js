import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
    handleGetConversationTree,
    handleSearchConversations,
    handleMarkImportant,
    handleExportConversation,
    handleStreamMessages,
    handleGetLiveStats,
    handleStreamActiveSessions,
    handleSubscribeToUpdates,
    handleBroadcastMetrics
} from './grpc-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OptimizedGrpcServer {
    constructor() {
        this.server = null;
        this.clients = new Map(); // Use Map for better client management
        this.isStarted = false;
        this.protoService = null;
        this.connectionPool = {
            maxConnections: parseInt(process.env.GRPC_MAX_CONNECTIONS) || 100,
            currentConnections: 0,
            keepAliveTimeMs: 30000,
            keepAliveTimeoutMs: 5000,
            keepAlivePermitWithoutCalls: true,
            http2MaxPingsWithoutData: 0,
            http2MinTimeBetweenPingsMs: 10000,
            http2MinPingIntervalWithoutDataMs: 300000
        };
    }

    async initialize() {
        try {
            // Load proto file with optimized options
            const PROTO_PATH = path.join(__dirname, 'conversation.proto');
            const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true,
                // Performance optimizations
                includeDirs: [__dirname],
                arrays: true,
                objects: true,
                json: true
            });

            this.protoService = grpc.loadPackageDefinition(packageDefinition).conversation;

            // Create server with optimized options
            this.server = new grpc.Server({
                'grpc.keepalive_time_ms': this.connectionPool.keepAliveTimeMs,
                'grpc.keepalive_timeout_ms': this.connectionPool.keepAliveTimeoutMs,
                'grpc.keepalive_permit_without_calls': this.connectionPool.keepAlivePermitWithoutCalls,
                'grpc.http2.max_pings_without_data': this.connectionPool.http2MaxPingsWithoutData,
                'grpc.http2.min_time_between_pings_ms': this.connectionPool.http2MinTimeBetweenPingsMs,
                'grpc.http2.min_ping_interval_without_data_ms': this.connectionPool.http2MinPingIntervalWithoutDataMs,
                'grpc.max_connection_age_ms': 300000, // 5 minutes
                'grpc.max_connection_age_grace_ms': 30000, // 30 seconds
                'grpc.max_connection_idle_ms': 60000, // 1 minute
                'grpc.max_receive_message_length': 4 * 1024 * 1024, // 4MB
                'grpc.max_send_message_length': 4 * 1024 * 1024 // 4MB
            });

            console.log('✅ gRPC server optimized and initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize gRPC server:', error);
            return false;
        }
    }

    setupServiceImplementation() {
        const optimizedImplementation = {
            StreamMessages: this.wrapStreamHandler(handleStreamMessages),
            GetConversationTree: this.wrapUnaryHandler(handleGetConversationTree),
            SearchConversations: this.wrapUnaryHandler(handleSearchConversations),
            MarkImportant: this.wrapUnaryHandler(handleMarkImportant),
            ExportConversation: this.wrapUnaryHandler(handleExportConversation),
            GetLiveStats: this.wrapStreamHandler(handleGetLiveStats),
            // Nuevos handlers para reemplazar WebSocket
            StreamActiveSessions: this.wrapStreamHandler(handleStreamActiveSessions),
            SubscribeToUpdates: this.wrapStreamHandler(handleSubscribeToUpdates),
            BroadcastMetrics: this.wrapStreamHandler(handleBroadcastMetrics)
        };

        this.server.addService(
            this.protoService.ConversationService.service,
            optimizedImplementation
        );

        console.log('📡 gRPC service implementation configured with optimization wrappers');
    }

    wrapUnaryHandler(originalHandler) {
        return async (call, callback) => {
            const startTime = Date.now();
            const clientId = this.generateClientId(call);

            try {
                // Connection limiting
                if (this.connectionPool.currentConnections >= this.connectionPool.maxConnections) {
                    const error = new Error('Connection limit exceeded');
                    error.code = grpc.status.RESOURCE_EXHAUSTED;
                    return callback(error);
                }

                this.connectionPool.currentConnections++;
                console.log(`📡 Unary call from ${clientId} (${this.connectionPool.currentConnections}/${this.connectionPool.maxConnections})`);

                // Call original handler
                await originalHandler(call, callback);

                const duration = Date.now() - startTime;
                console.log(`✅ Unary call completed in ${duration}ms`);

            } catch (error) {
                console.error(`❌ Unary call error:`, error);
                const grpcError = new Error(error.message || 'Internal server error');
                grpcError.code = error.code || grpc.status.INTERNAL;
                callback(grpcError);
            } finally {
                this.connectionPool.currentConnections--;
            }
        };
    }

    wrapStreamHandler(originalHandler) {
        return (call) => {
            const startTime = Date.now();
            const clientId = this.generateClientId(call);

            try {
                // Connection limiting
                if (this.connectionPool.currentConnections >= this.connectionPool.maxConnections) {
                    const error = new Error('Connection limit exceeded');
                    error.code = grpc.status.RESOURCE_EXHAUSTED;
                    call.emit('error', error);
                    return;
                }

                this.connectionPool.currentConnections++;
                console.log(`📡 Stream opened from ${clientId} (${this.connectionPool.currentConnections}/${this.connectionPool.maxConnections})`);

                // Register client with enhanced tracking
                this.registerStreamClient(call, clientId);

                // Setup stream monitoring
                this.setupStreamMonitoring(call, clientId, startTime);

                // Call original handler
                originalHandler(call);

            } catch (error) {
                console.error(`❌ Stream setup error:`, error);
                const grpcError = new Error(error.message || 'Internal server error');
                grpcError.code = error.code || grpc.status.INTERNAL;
                call.emit('error', grpcError);
                this.connectionPool.currentConnections--;
            }
        };
    }

    generateClientId(call) {
        const peer = call.getPeer();
        const metadata = call.metadata.getMap();
        return `${peer}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    registerStreamClient(stream, clientId) {
        const clientInfo = {
            id: clientId,
            stream,
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            messagesSent: 0,
            peer: stream.getPeer()
        };

        this.clients.set(clientId, clientInfo);
        console.log(`📡 Stream client registered: ${clientId} (${this.clients.size} total streams)`);
    }

    setupStreamMonitoring(stream, clientId, startTime) {
        // Stream end handler
        stream.on('end', () => {
            this.cleanupClient(clientId, 'end');
        });

        // Stream cancellation handler
        stream.on('cancelled', () => {
            this.cleanupClient(clientId, 'cancelled');
        });

        // Stream error handler
        stream.on('error', (error) => {
            console.warn(`⚠️  Stream error for ${clientId}:`, error.message);
            this.cleanupClient(clientId, 'error');
        });

        // Stream close handler
        stream.on('close', () => {
            this.cleanupClient(clientId, 'close');
        });

        // Heartbeat mechanism
        const heartbeatInterval = setInterval(() => {
            if (this.clients.has(clientId)) {
                try {
                    const clientInfo = this.clients.get(clientId);
                    clientInfo.lastActivity = Date.now();
                    
                    // Send heartbeat
                    const heartbeat = {
                        type: 'heartbeat',
                        timestamp: Date.now(),
                        client_id: clientId
                    };
                    
                    stream.write(heartbeat);
                } catch (error) {
                    console.warn(`⚠️  Heartbeat failed for ${clientId}:`, error.message);
                    this.cleanupClient(clientId, 'heartbeat_failed');
                }
            } else {
                clearInterval(heartbeatInterval);
            }
        }, 30000); // 30 seconds heartbeat

        // Store interval reference for cleanup
        if (this.clients.has(clientId)) {
            this.clients.get(clientId).heartbeatInterval = heartbeatInterval;
        }
    }

    cleanupClient(clientId, reason) {
        if (this.clients.has(clientId)) {
            const clientInfo = this.clients.get(clientId);
            const duration = Date.now() - clientInfo.connectedAt;
            
            // Clear heartbeat interval
            if (clientInfo.heartbeatInterval) {
                clearInterval(clientInfo.heartbeatInterval);
            }
            
            this.clients.delete(clientId);
            this.connectionPool.currentConnections--;
            
            console.log(`📡 Stream client cleaned up: ${clientId} (reason: ${reason}, duration: ${duration}ms, remaining: ${this.clients.size})`);
        }
    }

    async start(port = 50051) {
        if (this.isStarted) {
            console.log('⚠️  gRPC Server is already running');
            return false;
        }

        try {
            // Initialize if not done
            if (!this.protoService) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Failed to initialize gRPC server');
                }
            }

            // Setup service implementation
            this.setupServiceImplementation();

            // Configure server credentials
            const serverCredentials = process.env.NODE_ENV === 'production' 
                ? grpc.ServerCredentials.createSsl(null, [], false) // Use SSL in production
                : grpc.ServerCredentials.createInsecure();

            return new Promise((resolve, reject) => {
                this.server.bindAsync(
                    `0.0.0.0:${port}`,
                    serverCredentials,
                    (error, boundPort) => {
                        if (error) {
                            console.error('❌ Failed to bind gRPC server:', error);
                            reject(error);
                            return;
                        }
                        
                        this.server.start();
                        this.isStarted = true;
                        
                        console.log(`🚀 Optimized gRPC Server running on port ${boundPort}`);
                        console.log(`📡 Protocol: conversation.ConversationService`);
                        console.log(`🔗 Max connections: ${this.connectionPool.maxConnections}`);
                        console.log(`⏱️  Keep-alive: ${this.connectionPool.keepAliveTimeMs}ms`);
                        console.log(`🔌 Connection pool ready`);
                        
                        resolve(true);
                    }
                );
            });
        } catch (error) {
            console.error('❌ Failed to start gRPC server:', error);
            return false;
        }
    }

    async stop() {
        if (!this.isStarted) {
            console.log('⚠️  gRPC Server is not running');
            return;
        }

        console.log('🛑 Stopping gRPC server...');

        // Close all active streams gracefully
        console.log(`📡 Closing ${this.clients.size} active streams...`);
        for (const [clientId, clientInfo] of this.clients) {
            try {
                if (clientInfo.heartbeatInterval) {
                    clearInterval(clientInfo.heartbeatInterval);
                }
                
                // Send termination message
                clientInfo.stream.write({
                    type: 'server_shutdown',
                    message: 'Server is shutting down',
                    timestamp: Date.now()
                });
                
                clientInfo.stream.end();
            } catch (error) {
                console.warn(`⚠️  Error closing stream ${clientId}:`, error.message);
            }
        }

        this.clients.clear();

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn('⚠️  Graceful shutdown timeout, forcing shutdown');
                this.server.forceShutdown();
                this.isStarted = false;
                resolve();
            }, 10000); // 10 second timeout

            this.server.tryShutdown((error) => {
                clearTimeout(timeout);
                
                if (error) {
                    console.error('❌ Error during graceful shutdown:', error);
                    this.server.forceShutdown();
                } else {
                    console.log('✅ gRPC Server stopped gracefully');
                }
                
                this.isStarted = false;
                this.connectionPool.currentConnections = 0;
                resolve();
            });
        });
    }

    // Enhanced broadcast with client filtering and error handling
    broadcast(event, filter = null) {
        let successCount = 0;
        let errorCount = 0;
        const timestamp = Date.now();

        for (const [clientId, clientInfo] of this.clients) {
            try {
                // Apply filter if provided
                if (filter && !filter(clientInfo)) {
                    continue;
                }

                // Add metadata to event
                const enhancedEvent = {
                    ...event,
                    broadcast_timestamp: timestamp,
                    client_id: clientId
                };

                clientInfo.stream.write(enhancedEvent);
                clientInfo.messagesSent++;
                clientInfo.lastActivity = timestamp;
                successCount++;

            } catch (error) {
                console.warn(`⚠️  Failed to broadcast to client ${clientId}:`, error.message);
                this.cleanupClient(clientId, 'broadcast_error');
                errorCount++;
            }
        }

        if (successCount > 0 || errorCount > 0) {
            console.log(`📡 Broadcast completed: ${successCount} success, ${errorCount} errors`);
        }

        return { successCount, errorCount };
    }

    // Broadcast to specific client types
    broadcastToProject(event, projectName) {
        return this.broadcast(event, (clientInfo) => {
            return clientInfo.metadata?.project === projectName;
        });
    }

    // Get server statistics
    getStats() {
        const now = Date.now();
        const clientStats = [];

        for (const [clientId, clientInfo] of this.clients) {
            clientStats.push({
                id: clientId,
                peer: clientInfo.peer,
                connected_duration: now - clientInfo.connectedAt,
                last_activity: now - clientInfo.lastActivity,
                messages_sent: clientInfo.messagesSent
            });
        }

        return {
            server: {
                is_started: this.isStarted,
                uptime: this.isStarted ? now - this.startTime : 0
            },
            connections: {
                current: this.connectionPool.currentConnections,
                max: this.connectionPool.maxConnections,
                streams: this.clients.size
            },
            clients: clientStats
        };
    }

    // Health check
    async healthCheck() {
        return {
            status: this.isStarted ? 'healthy' : 'stopped',
            connections: this.connectionPool.currentConnections,
            streams: this.clients.size,
            timestamp: Date.now()
        };
    }
}

// Singleton for global access
let optimizedGrpcServerInstance = null;

export function getOptimizedGrpcServer() {
    if (!optimizedGrpcServerInstance) {
        optimizedGrpcServerInstance = new OptimizedGrpcServer();
    }
    return optimizedGrpcServerInstance;
}

export { OptimizedGrpcServer };