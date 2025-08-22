import { MongoClient } from 'mongodb';
import Redis from 'redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recovery Manager para Claude Conversation Logger
 * Proporciona funciones para recuperar, restaurar y mantener datos
 */
class RecoveryManager {
    constructor(options = {}) {
        this.mongoUri = options.mongoUri || process.env.MONGODB_URI;
        this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
        this.backupPath = options.backupPath || path.join(__dirname, '../../backups');
        this.mongoClient = null;
        this.redisClient = null;
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            // Inicializar MongoDB si está disponible
            if (this.mongoUri) {
                this.mongoClient = new MongoClient(this.mongoUri);
                await this.mongoClient.connect();
                console.log('✅ Recovery Manager - MongoDB connected');
            }
            
            // Inicializar Redis si está disponible
            if (this.redisUrl) {
                this.redisClient = Redis.createClient({ url: this.redisUrl });
                await this.redisClient.connect();
                console.log('✅ Recovery Manager - Redis connected');
            }
            
            // Crear directorio de backups
            if (!fs.existsSync(this.backupPath)) {
                fs.mkdirSync(this.backupPath, { recursive: true });
            }
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Recovery Manager initialization failed:', error.message);
            throw error;
        }
    }
    
    /**
     * Crear backup completo del sistema
     */
    async createSystemBackup(backupName = null) {
        await this.initialize();
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const name = backupName || `system-backup-${timestamp}`;
        const backupDir = path.join(this.backupPath, name);
        
        console.log(`📦 Creating system backup: ${name}`);
        
        try {
            fs.mkdirSync(backupDir, { recursive: true });
            
            const backupInfo = {
                name,
                timestamp: new Date().toISOString(),
                type: 'full_system',
                sources: [],
                stats: {
                    total_messages: 0,
                    total_sessions: 0,
                    projects_count: 0,
                    file_size_mb: 0
                }
            };
            
            // Backup MongoDB
            if (this.mongoClient) {
                const mongoBackup = await this.backupMongoDB(path.join(backupDir, 'mongodb.json'));
                backupInfo.sources.push('mongodb');
                backupInfo.stats.total_messages += mongoBackup.message_count;
                backupInfo.stats.total_sessions += mongoBackup.session_count;
                backupInfo.stats.projects_count += mongoBackup.project_count;
            }
            
            // Backup Redis
            if (this.redisClient) {
                const redisBackup = await this.backupRedis(path.join(backupDir, 'redis.json'));
                backupInfo.sources.push('redis');
            }
            
            // Guardar información del backup
            const backupInfoPath = path.join(backupDir, 'backup-info.json');
            fs.writeFileSync(backupInfoPath, JSON.stringify(backupInfo, null, 2));
            
            // Calcular tamaño total
            const stats = this.getDirectoryStats(backupDir);
            backupInfo.stats.file_size_mb = Math.round(stats.totalSize / 1024 / 1024 * 100) / 100;
            
            // Actualizar info con estadísticas finales
            fs.writeFileSync(backupInfoPath, JSON.stringify(backupInfo, null, 2));
            
            console.log(`✅ System backup created successfully:`);
            console.log(`   📁 Path: ${backupDir}`);
            console.log(`   📊 Messages: ${backupInfo.stats.total_messages}`);
            console.log(`   🗂️  Sessions: ${backupInfo.stats.total_sessions}`);
            console.log(`   📦 Size: ${backupInfo.stats.file_size_mb} MB`);
            
            return backupInfo;
            
        } catch (error) {
            console.error('❌ System backup failed:', error);
            throw error;
        }
    }
    
    /**
     * Backup específico de MongoDB
     */
    async backupMongoDB(outputPath) {
        if (!this.mongoClient) {
            throw new Error('MongoDB not connected');
        }
        
        const db = this.mongoClient.db();
        const collections = ['messages', 'conversations']; // Ajustar según colecciones reales
        
        const backup = {
            timestamp: new Date().toISOString(),
            collections: {},
            stats: {
                message_count: 0,
                session_count: 0,
                project_count: 0
            }
        };
        
        try {
            // Obtener lista de colecciones disponibles
            const availableCollections = await db.listCollections().toArray();
            const collectionNames = availableCollections.map(col => col.name);
            
            // Backup de mensajes (colección principal)
            if (collectionNames.includes('messages')) {
                const messagesCollection = db.collection('messages');
                const messages = await messagesCollection.find({}).toArray();
                backup.collections.messages = messages;
                backup.stats.message_count = messages.length;
                
                // Contar sesiones únicas
                const uniqueSessions = new Set(messages.map(msg => msg.session_id));
                backup.stats.session_count = uniqueSessions.size;
                
                // Contar proyectos únicos
                const uniqueProjects = new Set(messages.map(msg => msg.project_name));
                backup.stats.project_count = uniqueProjects.size;
            }
            
            // Backup de otras colecciones
            for (const collectionName of collectionNames) {
                if (collectionName !== 'messages' && !collectionName.startsWith('system.')) {
                    const collection = db.collection(collectionName);
                    const data = await collection.find({}).toArray();
                    backup.collections[collectionName] = data;
                }
            }
            
            fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2));
            console.log(`✅ MongoDB backup saved: ${outputPath}`);
            
            return backup.stats;
            
        } catch (error) {
            console.error('❌ MongoDB backup failed:', error);
            throw error;
        }
    }
    
    /**
     * Backup de Redis
     */
    async backupRedis(outputPath) {
        if (!this.redisClient) {
            throw new Error('Redis not connected');
        }
        
        try {
            const backup = {
                timestamp: new Date().toISOString(),
                keys: {},
                stats: {
                    key_count: 0,
                    total_size: 0
                }
            };
            
            // Obtener todas las keys
            const keys = await this.redisClient.keys('*');
            backup.stats.key_count = keys.length;
            
            // Backup de cada key
            for (const key of keys) {
                const type = await this.redisClient.type(key);
                
                switch (type) {
                    case 'string':
                        backup.keys[key] = {
                            type: 'string',
                            value: await this.redisClient.get(key)
                        };
                        break;
                        
                    case 'list':
                        backup.keys[key] = {
                            type: 'list',
                            value: await this.redisClient.lRange(key, 0, -1)
                        };
                        break;
                        
                    case 'set':
                        backup.keys[key] = {
                            type: 'set',
                            value: await this.redisClient.sMembers(key)
                        };
                        break;
                        
                    case 'zset':
                        backup.keys[key] = {
                            type: 'zset',
                            value: await this.redisClient.zRangeWithScores(key, 0, -1)
                        };
                        break;
                        
                    case 'hash':
                        backup.keys[key] = {
                            type: 'hash',
                            value: await this.redisClient.hGetAll(key)
                        };
                        break;
                }
                
                // Obtener TTL si existe
                const ttl = await this.redisClient.ttl(key);
                if (ttl > 0) {
                    backup.keys[key].ttl = ttl;
                }
            }
            
            fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2));
            console.log(`✅ Redis backup saved: ${outputPath}`);
            
            return backup.stats;
            
        } catch (error) {
            console.error('❌ Redis backup failed:', error);
            throw error;
        }
    }
    
    /**
     * Restaurar desde backup
     */
    async restoreFromBackup(backupName, options = {}) {
        await this.initialize();
        
        const backupDir = path.join(this.backupPath, backupName);
        const backupInfoPath = path.join(backupDir, 'backup-info.json');
        
        if (!fs.existsSync(backupInfoPath)) {
            throw new Error(`Backup not found: ${backupName}`);
        }
        
        const backupInfo = JSON.parse(fs.readFileSync(backupInfoPath, 'utf8'));
        console.log(`🔄 Restoring backup: ${backupInfo.name}`);
        
        try {
            // Restaurar MongoDB
            if (options.restoreMongoDB !== false && backupInfo.sources.includes('mongodb')) {
                await this.restoreMongoDB(path.join(backupDir, 'mongodb.json'), options);
            }
            
            // Restaurar Redis
            if (options.restoreRedis !== false && backupInfo.sources.includes('redis')) {
                await this.restoreRedis(path.join(backupDir, 'redis.json'), options);
            }
            
            console.log(`✅ Backup restored successfully: ${backupInfo.name}`);
            return backupInfo;
            
        } catch (error) {
            console.error('❌ Backup restoration failed:', error);
            throw error;
        }
    }
    
    /**
     * Restaurar MongoDB desde backup
     */
    async restoreMongoDB(backupPath, options = {}) {
        if (!fs.existsSync(backupPath)) {
            throw new Error(`MongoDB backup file not found: ${backupPath}`);
        }
        
        const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        const db = this.mongoClient.db();
        
        console.log(`🔄 Restoring MongoDB from ${backupPath}`);
        
        for (const [collectionName, data] of Object.entries(backup.collections)) {
            if (data && data.length > 0) {
                const collection = db.collection(collectionName);
                
                if (options.clearBeforeRestore) {
                    await collection.deleteMany({});
                }
                
                await collection.insertMany(data);
                console.log(`✅ Restored ${data.length} documents to ${collectionName}`);
            }
        }
    }
    
    /**
     * Restaurar Redis desde backup
     */
    async restoreRedis(backupPath, options = {}) {
        if (!fs.existsSync(backupPath)) {
            throw new Error(`Redis backup file not found: ${backupPath}`);
        }
        
        const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        
        console.log(`🔄 Restoring Redis from ${backupPath}`);
        
        if (options.clearBeforeRestore) {
            await this.redisClient.flushDb();
        }
        
        for (const [key, data] of Object.entries(backup.keys)) {
            switch (data.type) {
                case 'string':
                    await this.redisClient.set(key, data.value);
                    break;
                    
                case 'list':
                    await this.redisClient.del(key);
                    if (data.value.length > 0) {
                        await this.redisClient.lPush(key, ...data.value.reverse());
                    }
                    break;
                    
                case 'set':
                    await this.redisClient.del(key);
                    if (data.value.length > 0) {
                        await this.redisClient.sAdd(key, ...data.value);
                    }
                    break;
                    
                case 'hash':
                    await this.redisClient.del(key);
                    if (Object.keys(data.value).length > 0) {
                        await this.redisClient.hSet(key, data.value);
                    }
                    break;
            }
            
            // Restaurar TTL si existe
            if (data.ttl) {
                await this.redisClient.expire(key, data.ttl);
            }
        }
        
        console.log(`✅ Restored ${Object.keys(backup.keys).length} Redis keys`);
    }
    
    /**
     * Listar backups disponibles
     */
    listBackups() {
        if (!fs.existsSync(this.backupPath)) {
            return [];
        }
        
        const backups = [];
        const entries = fs.readdirSync(this.backupPath);
        
        for (const entry of entries) {
            const backupDir = path.join(this.backupPath, entry);
            const backupInfoPath = path.join(backupDir, 'backup-info.json');
            
            if (fs.existsSync(backupInfoPath)) {
                const backupInfo = JSON.parse(fs.readFileSync(backupInfoPath, 'utf8'));
                backups.push(backupInfo);
            }
        }
        
        return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    /**
     * Eliminar backup
     */
    deleteBackup(backupName) {
        const backupDir = path.join(this.backupPath, backupName);
        if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true });
            console.log(`🗑️  Backup deleted: ${backupName}`);
        }
    }
    
    /**
     * Obtener estadísticas de directorio
     */
    getDirectoryStats(dirPath) {
        const stats = { fileCount: 0, totalSize: 0 };
        
        function walkDir(dir) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    walkDir(filePath);
                } else {
                    stats.fileCount++;
                    stats.totalSize += stat.size;
                }
            }
        }
        
        walkDir(dirPath);
        return stats;
    }
    
    /**
     * Cerrar conexiones
     */
    async close() {
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
        if (this.redisClient) {
            await this.redisClient.disconnect();
        }
    }
}

export default RecoveryManager;