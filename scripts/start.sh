#!/bin/bash

echo "=== Starting Claude Conversation Logger Monolith ==="

# Create log directories if they don't exist
mkdir -p /var/log/mongodb /var/log/redis /var/log/nginx /var/log/supervisor
mkdir -p /var/run/redis

# Configure permissions
chown mongodb:mongodb /var/log/mongodb /data/db
chown redis:redis /var/log/redis /var/lib/redis /var/run/redis
chown www-data:www-data /var/log/nginx
chown appuser:appuser /app/logs

# Nginx configuration is already copied in the Dockerfile

# Initialize MongoDB with admin user if it's the first time
if [ ! -f /data/db/.initialized ]; then
    echo "Initializing MongoDB..."
    
    # Start MongoDB without authentication to create admin user
    mongod --config /etc/mongod.conf --noauth &
    MONGOD_PID=$!
    
    # Wait for MongoDB to be ready
    sleep 20
    
    # Create admin user
    mongosh admin --eval 'db.createUser({
        user: "admin",
        pwd: "claude_logger_2024",
        roles: [
            { role: "userAdminAnyDatabase", db: "admin" },
            { role: "dbAdminAnyDatabase", db: "admin" },
            { role: "readWriteAnyDatabase", db: "admin" }
        ]
    })'
    
    # Create database and collections
    mongosh conversations -u admin -p claude_logger_2024 --authenticationDatabase admin --eval '
        db.createCollection("sessions");
        db.createCollection("messages");
        db.sessions.createIndex({"created_at": -1});
        db.sessions.createIndex({"project_name": 1, "created_at": -1});
        db.messages.createIndex({"session_id": 1, "timestamp": 1});
        db.messages.createIndex({"project_name": 1, "created_at": -1});
        db.messages.createIndex({"created_at": 1}, {"expireAfterSeconds": 7776000});
    '
    
    # Stop temporary MongoDB
    kill $MONGOD_PID
    wait $MONGOD_PID
    
    # Mark as initialized
    touch /data/db/.initialized
    chown mongodb:mongodb /data/db/.initialized
    
    echo "MongoDB initialized successfully"
fi

echo "MongoDB: Port 27017 (internal)"
echo "Redis: Port 6379 (internal)" 
echo "Node.js API: Port 3000 (internal)"
echo "Nginx Proxy: Port 3003 (exposed)"
echo "MCP Server: Included in Node.js"
echo "=============================================="

# Start Supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf