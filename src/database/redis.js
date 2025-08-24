import Redis from 'redis';

class RedisManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.url = process.env.REDIS_URL || 'redis://localhost:6379';
        this.messageLimit = parseInt(process.env.REDIS_MESSAGE_LIMIT) || 5000;
    }

    async connect() {
        try {
            const options = {
                url: this.url,
                retryDelayOnFailover: 100,
                enableAutoPipelining: true,
                maxRetriesPerRequest: 3,
                retryDelayOnClusterDown: 300,
                enableReadyCheck: true,
                maxLoadingTimeout: 5000,
                socket: {
                    connectTimeout: 10000,
                    lazyConnect: true,
                    keepAlive: 30000
                }
            };

            this.client = Redis.createClient(options);

            // Event handlers
            this.client.on('error', (err) => {
                console.error('❌ Redis error:', err.message);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                console.log('🔗 Redis connecting...');
            });

            this.client.on('ready', () => {
                console.log('✅ Redis connected and ready');
                this.isConnected = true;
            });

            this.client.on('end', () => {
                console.log('📴 Redis connection ended');
                this.isConnected = false;
            });

            this.client.on('reconnecting', () => {
                console.log('🔄 Redis reconnecting...');
            });

            await this.client.connect();
            return true;
        } catch (error) {
            console.warn('⚠️  Redis connection failed:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    async cacheMessage(message, ttl = 86400) {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        try {
            const messageStr = JSON.stringify({
                ...message,
                timestamp: message.timestamp.toISOString ? message.timestamp.toISOString() : message.timestamp,
                created_at: message.created_at.toISOString ? message.created_at.toISOString() : message.created_at
            });

            // Pipeline operations for better performance
            const pipeline = this.client.multi();
            
            // Store individual message
            pipeline.setEx(`msg:${message.id}`, ttl, messageStr);
            
            // Add to recent messages list
            pipeline.lPush('messages:recent', messageStr);
            pipeline.lTrim('messages:recent', 0, this.messageLimit - 1);
            
            // Update last activity
            pipeline.set('last_activity', Date.now());
            
            await pipeline.exec();
            
            return true;
        } catch (error) {
            console.error('❌ Redis cache message failed:', error.message);
            throw error;
        }
    }

    async getMessage(messageId) {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        try {
            const messageStr = await this.client.get(`msg:${messageId}`);
            return messageStr ? JSON.parse(messageStr) : null;
        } catch (error) {
            console.error('❌ Redis get message failed:', error.message);
            throw error;
        }
    }

    async getRecentMessages(limit = 50) {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        try {
            const messages = await this.client.lRange('messages:recent', -limit, -1);
            return messages.map(msg => JSON.parse(msg)).reverse();
        } catch (error) {
            console.error('❌ Redis get recent messages failed:', error.message);
            throw error;
        }
    }

    async cacheQuery(key, data, ttl = 300) {
        if (!this.isConnected) {
            return false;
        }

        try {
            await this.client.setEx(key, ttl, JSON.stringify(data));
            return true;
        } catch (error) {
            console.warn('⚠️  Redis cache query failed:', error.message);
            return false;
        }
    }

    async getCachedQuery(key) {
        if (!this.isConnected) {
            return null;
        }

        try {
            const cached = await this.client.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('⚠️  Redis get cached query failed:', error.message);
            return null;
        }
    }

    async invalidateCache(pattern = null) {
        if (!this.isConnected) {
            return false;
        }

        try {
            if (pattern) {
                const keys = await this.client.keys(pattern);
                if (keys.length > 0) {
                    await this.client.del(keys);
                }
            } else {
                // Invalidate common cache keys
                const commonKeys = [
                    'dashboard:stats',
                    'messages:query:*',
                    'stats:*'
                ];
                
                for (const keyPattern of commonKeys) {
                    const keys = await this.client.keys(keyPattern);
                    if (keys.length > 0) {
                        await this.client.del(keys);
                    }
                }
            }
            return true;
        } catch (error) {
            console.warn('⚠️  Redis invalidate cache failed:', error.message);
            return false;
        }
    }

    async setSessionDescription(sessionId, description, category, ttl = 86400 * 30) {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        try {
            const data = {
                session_id: sessionId,
                description: description.substring(0, 200),
                category: category || "📝 General",
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            };

            await this.client.setEx(`session:desc:${sessionId}`, ttl, JSON.stringify(data));
            return data;
        } catch (error) {
            console.error('❌ Redis set session description failed:', error.message);
            throw error;
        }
    }

    async getSessionDescription(sessionId) {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        try {
            const cached = await this.client.get(`session:desc:${sessionId}`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('❌ Redis get session description failed:', error.message);
            throw error;
        }
    }

    async markSession(sessionId, isMarked, note = '', tags = [], ttl = 86400 * 30) {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        try {
            const key = `marked:${sessionId}`;
            
            if (isMarked) {
                const markData = {
                    marked: true,
                    note,
                    tags: Array.isArray(tags) ? tags : [],
                    marked_at: Date.now(),
                    updated_at: Date.now()
                };
                
                await this.client.setEx(key, ttl, JSON.stringify(markData));
                return markData;
            } else {
                await this.client.del(key);
                return null;
            }
        } catch (error) {
            console.error('❌ Redis mark session failed:', error.message);
            throw error;
        }
    }

    async getSessionMark(sessionId) {
        if (!this.isConnected) {
            return null;
        }

        try {
            const markData = await this.client.get(`marked:${sessionId}`);
            return markData ? JSON.parse(markData) : null;
        } catch (error) {
            console.warn('⚠️  Redis get session mark failed:', error.message);
            return null;
        }
    }

    async getStats() {
        if (!this.isConnected) {
            return null;
        }

        try {
            const info = await this.client.info();
            const memoryInfo = await this.client.info('memory');
            const clientsInfo = await this.client.info('clients');
            
            return {
                connected: this.isConnected,
                uptime: this.extractInfo(info, 'uptime_in_seconds'),
                memory_used: this.extractInfo(memoryInfo, 'used_memory_human'),
                memory_peak: this.extractInfo(memoryInfo, 'used_memory_peak_human'),
                connected_clients: this.extractInfo(clientsInfo, 'connected_clients'),
                total_commands_processed: this.extractInfo(info, 'total_commands_processed'),
                keyspace_hits: this.extractInfo(info, 'keyspace_hits'),
                keyspace_misses: this.extractInfo(info, 'keyspace_misses')
            };
        } catch (error) {
            console.warn('⚠️  Failed to get Redis stats:', error.message);
            return null;
        }
    }

    extractInfo(infoString, key) {
        const lines = infoString.split('\r\n');
        const line = lines.find(l => l.startsWith(key + ':'));
        return line ? line.split(':')[1] : 'unknown';
    }

    async healthCheck() {
        if (!this.isConnected) {
            return false;
        }

        try {
            const result = await this.client.ping();
            return result === 'PONG';
        } catch (error) {
            console.warn('⚠️  Redis health check failed:', error.message);
            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            try {
                await this.client.quit();
                this.isConnected = false;
                console.log('📴 Redis disconnected');
            } catch (error) {
                console.warn('⚠️  Error disconnecting Redis:', error.message);
            }
        }
    }

    // Utility methods for advanced caching patterns
    async multiGet(keys) {
        if (!this.isConnected || !keys.length) {
            return [];
        }

        try {
            const values = await this.client.mGet(keys);
            return values.map(val => val ? JSON.parse(val) : null);
        } catch (error) {
            console.error('❌ Redis multiGet failed:', error.message);
            return [];
        }
    }

    async multiSet(keyValuePairs, ttl = 3600) {
        if (!this.isConnected || !keyValuePairs.length) {
            return false;
        }

        try {
            const pipeline = this.client.multi();
            
            for (const [key, value] of keyValuePairs) {
                pipeline.setEx(key, ttl, JSON.stringify(value));
            }
            
            await pipeline.exec();
            return true;
        } catch (error) {
            console.error('❌ Redis multiSet failed:', error.message);
            return false;
        }
    }

    async atomicIncrement(key, amount = 1, ttl = null) {
        if (!this.isConnected) {
            return null;
        }

        try {
            const pipeline = this.client.multi();
            pipeline.incrBy(key, amount);
            if (ttl) {
                pipeline.expire(key, ttl);
            }
            
            const results = await pipeline.exec();
            return results[0][1]; // Return the incremented value
        } catch (error) {
            console.error('❌ Redis atomic increment failed:', error.message);
            return null;
        }
    }
}

export default RedisManager;