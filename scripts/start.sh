#!/bin/bash

echo "=== Iniciando Claude Conversation Logger Monolith ==="

# Crear directorios de logs si no existen
mkdir -p /var/log/mongodb /var/log/redis /var/log/nginx /var/log/supervisor
mkdir -p /var/run/redis

# Configurar permisos
chown mongodb:mongodb /var/log/mongodb /data/db
chown redis:redis /var/log/redis /var/lib/redis /var/run/redis
chown www-data:www-data /var/log/nginx
chown appuser:appuser /app/logs

# La configuración de nginx ya está copiada en el Dockerfile

# Inicializar MongoDB con usuario admin si es primera vez
if [ ! -f /data/db/.initialized ]; then
    echo "Inicializando MongoDB..."
    
    # Iniciar MongoDB sin autenticación para crear el usuario admin
    mongod --config /etc/mongod.conf --noauth &
    MONGOD_PID=$!
    
    # Esperar a que MongoDB esté listo
    sleep 20
    
    # Crear usuario admin
    mongosh admin --eval 'db.createUser({
        user: "admin",
        pwd: "claude_logger_2024",
        roles: [
            { role: "userAdminAnyDatabase", db: "admin" },
            { role: "dbAdminAnyDatabase", db: "admin" },
            { role: "readWriteAnyDatabase", db: "admin" }
        ]
    })'
    
    # Crear base de datos y colecciones
    mongosh conversations -u admin -p claude_logger_2024 --authenticationDatabase admin --eval '
        db.createCollection("sessions");
        db.createCollection("messages");
        db.sessions.createIndex({"created_at": -1});
        db.sessions.createIndex({"project_name": 1, "created_at": -1});
        db.messages.createIndex({"session_id": 1, "timestamp": 1});
        db.messages.createIndex({"project_name": 1, "created_at": -1});
        db.messages.createIndex({"created_at": 1}, {"expireAfterSeconds": 7776000});
    '
    
    # Detener MongoDB temporal
    kill $MONGOD_PID
    wait $MONGOD_PID
    
    # Marcar como inicializado
    touch /data/db/.initialized
    chown mongodb:mongodb /data/db/.initialized
    
    echo "MongoDB inicializado exitosamente"
fi

echo "MongoDB: Puerto 27017 (interno)"
echo "Redis: Puerto 6379 (interno)" 
echo "Node.js API: Puerto 3000 (interno)"
echo "Nginx Proxy: Puerto 3003 (expuesto)"
echo "MCP Server: Incluido en Node.js"
echo "=============================================="

# Iniciar Supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf