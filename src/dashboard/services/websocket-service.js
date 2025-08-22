// Servicio WebSocket para comunicación en tiempo real
class WebSocketService {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 3000;
        this.reconnectTimer = null;
        this.isConnecting = false;
        this.listeners = new Map();
        this.messageQueue = [];
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;
    }
    
    // Conectar al WebSocket
    connect(url = null) {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }
        
        this.isConnecting = true;
        const wsUrl = url || this.getWebSocketURL();
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (error) {
            console.error('❌ WebSocket connection error:', error);
            this.handleConnectionError();
        }
    }
    
    // Configurar event handlers
    setupEventHandlers() {
        this.ws.onopen = () => {
            console.log('✅ WebSocket connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.processMessageQueue();
            this.emit('connection', { status: 'connected' });
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.warn('⚠️  Invalid WebSocket message:', error);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log('🔴 WebSocket disconnected:', event.code, event.reason);
            this.isConnecting = false;
            this.stopHeartbeat();
            this.emit('connection', { status: 'disconnected' });
            
            if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.handleConnectionError();
        };
    }
    
    // Manejar mensajes recibidos
    handleMessage(data) {
        const { type, ...payload } = data;
        
        switch (type) {
            case 'heartbeat':
                this.lastHeartbeat = Date.now();
                break;
                
            case 'new_message':
                this.emit('new_message', payload.message);
                break;
                
            case 'conversation_update':
                this.emit('conversation_update', payload);
                break;
                
            case 'search_result':
                this.emit('search_result', payload);
                break;
                
            case 'live_stats':
                this.emit('live_stats', payload.stats);
                break;
                
            case 'session_marked':
                this.emit('session_marked', payload);
                break;
                
            default:
                console.warn('⚠️  Unknown message type:', type);
                this.emit('unknown_message', data);
        }
    }
    
    // Enviar mensaje
    send(type, data = {}) {
        const message = {
            type,
            timestamp: Date.now(),
            ...data
        };
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            // Encolar mensaje para enviar cuando se conecte
            this.messageQueue.push(message);
            
            // Intentar conectar si no está conectado
            if (!this.isConnecting && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
                this.connect();
            }
        }
    }
    
    // Procesar cola de mensajes
    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.ws.send(JSON.stringify(message));
        }
    }
    
    // Programar reconexión
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }
    
    // Manejar errores de conexión
    handleConnectionError() {
        this.isConnecting = false;
        this.emit('connection', { status: 'error' });
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
        }
    }
    
    // Obtener URL del WebSocket
    getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }
    
    // Iniciar heartbeat
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.send('heartbeat');
                
                // Check if we haven't received a heartbeat response in too long
                if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > 30000) {
                    console.warn('⚠️  Heartbeat timeout, closing connection');
                    this.ws.close();
                }
            }
        }, 15000); // Send heartbeat every 15 seconds
    }
    
    // Detener heartbeat
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    // Registrar listener para eventos
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }
    
    // Remover listener
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }
    
    // Emitir evento
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
    
    // Cerrar conexión
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this.stopHeartbeat();
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
        
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
        
        this.emit('connection', { status: 'disconnected' });
    }
    
    // Obtener estado de conexión
    getConnectionStatus() {
        if (!this.ws) return 'disconnected';
        
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING:
                return 'connecting';
            case WebSocket.OPEN:
                return 'connected';
            case WebSocket.CLOSING:
                return 'disconnecting';
            case WebSocket.CLOSED:
                return 'disconnected';
            default:
                return 'unknown';
        }
    }
    
    // Métodos específicos para el dashboard
    
    // Suscribirse a actualizaciones de conversaciones
    subscribeToConversations(projectFilter = null) {
        this.send('subscribe', {
            type: 'conversations',
            project_filter: projectFilter
        });
    }
    
    // Suscribirse a resultados de búsqueda en tiempo real
    subscribeToSearch(query, filters = {}) {
        this.send('subscribe', {
            type: 'search',
            query,
            filters
        });
    }
    
    // Solicitar estadísticas en vivo
    requestLiveStats() {
        this.send('request', {
            type: 'live_stats'
        });
    }
    
    // Marcar sesión como importante
    markSession(sessionId, isMarked, note = '', tags = []) {
        this.send('mark_session', {
            session_id: sessionId,
            is_marked: isMarked,
            note,
            tags
        });
    }
}

// Instancia singleton del servicio WebSocket
const websocketService = new WebSocketService();

// Auto-conectar cuando se carga la página
if (typeof window !== 'undefined') {
    // Conectar automáticamente al cargar
    websocketService.connect();
    
    // Reconectar cuando la página se vuelve visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && websocketService.getConnectionStatus() === 'disconnected') {
            websocketService.connect();
        }
    });
    
    // Desconectar cuando se cierra la página
    window.addEventListener('beforeunload', () => {
        websocketService.disconnect();
    });
}

export default websocketService;