import { MongoClient } from 'mongodb';

class MongoDB {
    constructor() {
        this.client = null;
        this.db = null;
        this.messagesCollection = null;
        this.isConnected = false;
        this.uri = process.env.MONGODB_URI || 'mongodb://admin:claude_logger_2024@localhost:27017/conversations?authSource=admin';
    }

    async connect() {
        try {
            const options = {
                maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 20,
                minPoolSize: 5,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 10000,
                maxIdleTimeMS: 30000,
                retryWrites: true,
                retryReads: true
            };

            this.client = new MongoClient(this.uri, options);
            await this.client.connect();
            
            this.db = this.client.db('conversations');
            this.messagesCollection = this.db.collection('messages');
            
            // Create optimized indexes
            await this.createIndexes();
            
            // Setup TTL if configured
            await this.setupTTL();
            
            this.isConnected = true;
            console.log('✅ MongoDB connected successfully');
            
            return true;
        } catch (error) {
            console.warn('⚠️  MongoDB connection failed:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    async createIndexes() {
        try {
            const indexes = [
                // Basic indexes
                { key: { timestamp: -1 }, name: 'timestamp_desc' },
                { key: { session_id: 1 }, name: 'session_id_asc' },
                { key: { project_name: 1, timestamp: -1 }, name: 'project_timestamp' },
                
                // Compound indexes for better query performance
                { key: { project_name: 1, session_id: 1, timestamp: -1 }, name: 'project_session_time' },
                { key: { message_type: 1, timestamp: -1 }, name: 'type_timestamp' },
                { key: { 'metadata.model': 1, timestamp: -1 }, name: 'model_timestamp' },
                
                // Text search index
                { 
                    key: { 
                        session_description: 'text', 
                        content: 'text', 
                        project_name: 'text' 
                    }, 
                    name: 'search_text_index',
                    weights: {
                        session_description: 10,
                        content: 5,
                        project_name: 3
                    }
                },
                
                // Specialized indexes
                { key: { session_description: 1 }, name: 'session_desc' },
                { key: { session_category: 1 }, name: 'session_category' },
                { key: { hook_event: 1, timestamp: -1 }, name: 'hook_event_time' }
            ];

            for (const index of indexes) {
                try {
                    await this.messagesCollection.createIndex(index.key, { 
                        name: index.name,
                        background: true,
                        ...(index.weights && { weights: index.weights })
                    });
                } catch (indexError) {
                    if (!indexError.message.includes('already exists')) {
                        console.warn(`⚠️  Failed to create index ${index.name}:`, indexError.message);
                    }
                }
            }

            console.log('📋 MongoDB indexes created/verified');
        } catch (error) {
            console.warn('⚠️  Failed to create MongoDB indexes:', error.message);
        }
    }

    async setupTTL() {
        try {
            const ttlSeconds = process.env.MONGODB_TTL_SECONDS;
            if (ttlSeconds && parseInt(ttlSeconds) > 0) {
                await this.messagesCollection.createIndex(
                    { created_at: 1 }, 
                    { 
                        expireAfterSeconds: parseInt(ttlSeconds),
                        name: 'ttl_index',
                        background: true
                    }
                );
                console.log(`📅 MongoDB TTL: Data expires after ${ttlSeconds} seconds (${Math.round(ttlSeconds/86400)} days)`);
            } else {
                console.log('♾️  MongoDB: Indefinite persistence (no TTL configured)');
            }
        } catch (error) {
            console.warn('⚠️  Failed to setup TTL:', error.message);
        }
    }

    async insertMessage(message) {
        if (!this.isConnected || !this.messagesCollection) {
            throw new Error('MongoDB not connected');
        }

        try {
            const result = await this.messagesCollection.insertOne(message);
            return result;
        } catch (error) {
            console.error('❌ MongoDB insert failed:', error.message);
            throw error;
        }
    }

    async findMessages(query = {}, options = {}) {
        if (!this.isConnected || !this.messagesCollection) {
            throw new Error('MongoDB not connected');
        }

        try {
            const {
                sort = { timestamp: -1 },
                limit = 50,
                skip = 0,
                projection = {}
            } = options;

            const cursor = this.messagesCollection
                .find(query, { projection })
                .sort(sort)
                .skip(skip)
                .limit(limit);

            return await cursor.toArray();
        } catch (error) {
            console.error('❌ MongoDB find failed:', error.message);
            throw error;
        }
    }

    async aggregateMessages(pipeline) {
        if (!this.isConnected || !this.messagesCollection) {
            throw new Error('MongoDB not connected');
        }

        try {
            return await this.messagesCollection.aggregate(pipeline, {
                allowDiskUse: true,
                maxTimeMS: 30000
            }).toArray();
        } catch (error) {
            console.error('❌ MongoDB aggregation failed:', error.message);
            throw error;
        }
    }

    async countMessages(query = {}) {
        if (!this.isConnected || !this.messagesCollection) {
            throw new Error('MongoDB not connected');
        }

        try {
            return await this.messagesCollection.countDocuments(query);
        } catch (error) {
            console.error('❌ MongoDB count failed:', error.message);
            throw error;
        }
    }

    async updateMessages(filter, update, options = {}) {
        if (!this.isConnected || !this.messagesCollection) {
            throw new Error('MongoDB not connected');
        }

        try {
            const result = await this.messagesCollection.updateMany(filter, update, options);
            return result;
        } catch (error) {
            console.error('❌ MongoDB update failed:', error.message);
            throw error;
        }
    }

    async findOne(query, options = {}) {
        if (!this.isConnected || !this.messagesCollection) {
            throw new Error('MongoDB not connected');
        }

        try {
            return await this.messagesCollection.findOne(query, options);
        } catch (error) {
            console.error('❌ MongoDB findOne failed:', error.message);
            throw error;
        }
    }

    async textSearch(searchText, options = {}) {
        if (!this.isConnected || !this.messagesCollection) {
            throw new Error('MongoDB not connected');
        }

        try {
            const {
                limit = 50,
                skip = 0,
                additionalFilters = {}
            } = options;

            const query = {
                $text: { $search: searchText },
                ...additionalFilters
            };

            const projection = {
                score: { $meta: 'textScore' }
            };

            return await this.messagesCollection
                .find(query, { projection })
                .sort({ score: { $meta: 'textScore' }, timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .toArray();
        } catch (error) {
            console.error('❌ MongoDB text search failed:', error.message);
            throw error;
        }
    }

    async getStats() {
        if (!this.isConnected || !this.db) {
            return null;
        }

        try {
            const stats = await this.db.stats();
            const collectionStats = await this.messagesCollection.stats();
            
            return {
                database: {
                    collections: stats.collections,
                    dataSize: stats.dataSize,
                    storageSize: stats.storageSize,
                    indexSize: stats.indexSize
                },
                collection: {
                    count: collectionStats.count,
                    size: collectionStats.size,
                    avgObjSize: collectionStats.avgObjSize,
                    totalIndexSize: collectionStats.totalIndexSize
                }
            };
        } catch (error) {
            console.warn('⚠️  Failed to get MongoDB stats:', error.message);
            return null;
        }
    }

    async disconnect() {
        if (this.client) {
            try {
                await this.client.close();
                this.isConnected = false;
                console.log('📴 MongoDB disconnected');
            } catch (error) {
                console.warn('⚠️  Error disconnecting MongoDB:', error.message);
            }
        }
    }

    // Health check
    async ping() {
        if (!this.isConnected || !this.db) {
            return false;
        }

        try {
            await this.db.admin().ping();
            return true;
        } catch (error) {
            console.warn('⚠️  MongoDB ping failed:', error.message);
            return false;
        }
    }
}

export default MongoDB;