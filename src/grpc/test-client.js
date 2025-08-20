import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Crear cliente gRPC
const client = new conversationProto.ConversationService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

// Función para probar el streaming de mensajes
function testStreamMessages() {
    console.log('🔴 Testing StreamMessages...');
    
    const stream = client.StreamMessages({});
    
    stream.on('data', (event) => {
        console.log('📨 Received event:', {
            type: event.type,
            timestamp: new Date(parseInt(event.timestamp)).toLocaleString(),
            message: event.message ? {
                id: event.message.id,
                project: event.message.project_name,
                type: event.message.message_type,
                content: event.message.content.substring(0, 50) + '...'
            } : null
        });
    });
    
    stream.on('error', (error) => {
        console.error('❌ Stream error:', error.message);
    });
    
    stream.on('end', () => {
        console.log('🔴 Stream ended');
    });
    
    // Mantener la conexión activa
    setTimeout(() => {
        console.log('🔴 Closing stream...');
        stream.cancel();
    }, 60000); // 1 minuto
}

// Función para probar obtención del árbol de conversaciones
async function testGetConversationTree() {
    console.log('🌳 Testing GetConversationTree...');
    
    return new Promise((resolve, reject) => {
        client.GetConversationTree({
            hours_back: 24,
            limit: 10
        }, (error, response) => {
            if (error) {
                console.error('❌ GetConversationTree error:', error.message);
                reject(error);
                return;
            }
            
            console.log('✅ Conversation Tree Response:', {
                projects_count: response.projects.length,
                total_messages: response.total_messages,
                total_sessions: response.total_sessions,
                projects: response.projects.map(p => ({
                    name: p.name,
                    message_count: p.message_count,
                    sessions_count: p.sessions.length,
                    last_activity: new Date(parseInt(p.last_activity)).toLocaleString()
                }))
            });
            
            resolve(response);
        });
    });
}

// Función para probar búsqueda
async function testSearchConversations() {
    console.log('🔍 Testing SearchConversations...');
    
    return new Promise((resolve, reject) => {
        client.SearchConversations({
            query: 'test',
            limit: 5
        }, (error, response) => {
            if (error) {
                console.error('❌ SearchConversations error:', error.message);
                reject(error);
                return;
            }
            
            console.log('✅ Search Response:', {
                results_count: response.results.length,
                total_count: response.total_count,
                has_more: response.has_more,
                results: response.results.map(r => ({
                    project: r.message.project_name,
                    type: r.message.message_type,
                    content_preview: r.message.content.substring(0, 100) + '...',
                    highlights_count: r.highlights.length
                }))
            });
            
            resolve(response);
        });
    });
}

// Función para probar marcado de conversaciones
async function testMarkImportant() {
    console.log('⭐ Testing MarkImportant...');
    
    // Primero necesitamos obtener un session_id válido
    try {
        const treeResponse = await testGetConversationTree();
        if (treeResponse.projects.length > 0 && treeResponse.projects[0].sessions.length > 0) {
            const sessionId = treeResponse.projects[0].sessions[0].session_id;
            
            return new Promise((resolve, reject) => {
                client.MarkImportant({
                    session_id: sessionId,
                    is_marked: true,
                    note: 'Test marking from gRPC client',
                    tags: ['test', 'grpc']
                }, (error, response) => {
                    if (error) {
                        console.error('❌ MarkImportant error:', error.message);
                        reject(error);
                        return;
                    }
                    
                    console.log('✅ Mark Response:', response);
                    resolve(response);
                });
            });
        } else {
            console.log('⚠️  No sessions available to mark');
        }
    } catch (error) {
        console.error('❌ Error getting session for marking:', error.message);
    }
}

// Función principal para ejecutar todas las pruebas
async function runTests() {
    console.log('🚀 Starting gRPC Client Tests');
    console.log('================================');
    
    try {
        // Test 1: Obtener árbol de conversaciones
        await testGetConversationTree();
        
        // Test 2: Búsqueda
        await testSearchConversations();
        
        // Test 3: Marcar conversación
        await testMarkImportant();
        
        // Test 4: Streaming (debe ir al final porque bloquea)
        setTimeout(() => {
            testStreamMessages();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
    }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests();
}

export {
    testStreamMessages,
    testGetConversationTree,
    testSearchConversations,
    testMarkImportant,
    runTests
};