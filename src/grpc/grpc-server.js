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
    handleGetLiveStats
} from './grpc-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar el archivo .proto
const PROTO_PATH = path.join(__dirname, 'conversation.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const conversationProto = grpc.loadPackageDefinition(packageDefinition).conversation;

// Implementaciones de los servicios
const serviceImplementation = {
    StreamMessages: handleStreamMessages,
    GetConversationTree: handleGetConversationTree,
    SearchConversations: handleSearchConversations,
    MarkImportant: handleMarkImportant,
    ExportConversation: handleExportConversation,
    GetLiveStats: handleGetLiveStats,
};

class GrpcServer {
    constructor() {
        this.server = new grpc.Server();
        this.clients = new Set(); // Para streaming
        this.isStarted = false;
    }

    start(port = 50051) {
        if (this.isStarted) {
            console.log('⚠️  gRPC Server is already running');
            return;
        }

        // Agregar el servicio
        this.server.addService(
            conversationProto.ConversationService.service,
            serviceImplementation
        );

        // Configurar el servidor
        const serverCredentials = grpc.ServerCredentials.createInsecure();
        
        this.server.bindAsync(
            `0.0.0.0:${port}`,
            serverCredentials,
            (error, boundPort) => {
                if (error) {
                    console.error('❌ Failed to start gRPC server:', error);
                    return;
                }
                
                this.server.start();
                this.isStarted = true;
                console.log(`🚀 gRPC Server running on port ${boundPort}`);
                console.log(`📡 Protocol: conversation.ConversationService`);
                console.log(`🔗 Clients can connect to: localhost:${boundPort}`);
            }
        );
    }

    stop() {
        if (!this.isStarted) {
            console.log('⚠️  gRPC Server is not running');
            return;
        }

        return new Promise((resolve) => {
            this.server.tryShutdown((error) => {
                if (error) {
                    console.error('❌ Error stopping gRPC server:', error);
                    this.server.forceShutdown();
                } else {
                    console.log('🛑 gRPC Server stopped gracefully');
                }
                this.isStarted = false;
                resolve();
            });
        });
    }

    // Método para broadcast a todos los clientes conectados
    broadcast(event) {
        this.clients.forEach(client => {
            try {
                client.write(event);
            } catch (error) {
                console.warn('⚠️  Failed to broadcast to client:', error.message);
                this.clients.delete(client);
            }
        });
    }

    // Registrar cliente para streaming
    registerClient(stream) {
        this.clients.add(stream);
        console.log(`📡 New gRPC client connected (${this.clients.size} total)`);
        
        stream.on('cancelled', () => {
            this.clients.delete(stream);
            console.log(`📡 gRPC client disconnected (${this.clients.size} remaining)`);
        });

        stream.on('error', (error) => {
            console.warn('⚠️  gRPC client error:', error.message);
            this.clients.delete(stream);
        });
    }

    getClientCount() {
        return this.clients.size;
    }
}

// Singleton para acceso global
let grpcServerInstance = null;

export function getGrpcServer() {
    if (!grpcServerInstance) {
        grpcServerInstance = new GrpcServer();
    }
    return grpcServerInstance;
}

export { GrpcServer };