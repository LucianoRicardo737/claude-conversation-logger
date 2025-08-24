/**
 * Servicio de exportación en múltiples formatos
 * Soporta PDF, Excel, CSV, JSON y Markdown
 */

const fs = require('fs').promises;
const path = require('path');

class ExportService {
    constructor(db, redis) {
        this.db = db;
        this.redis = redis;
        this.exportFormats = {
            'json': this.exportToJSON.bind(this),
            'markdown': this.exportToMarkdown.bind(this),
            'csv': this.exportToCSV.bind(this),
            'xlsx': this.exportToExcel.bind(this),
            'pdf': this.exportToPDF.bind(this),
            'html': this.exportToHTML.bind(this)
        };
        
        // Cache para exports recientes (30 minutos)
        this.exportCache = new Map();
        this.cacheTTL = 30 * 60 * 1000;
        
        // Límites de exportación
        this.maxConversations = 1000;
        this.maxMessages = 10000;
    }

    // =============================================================================
    // MÉTODO PRINCIPAL DE EXPORTACIÓN
    // =============================================================================

    async exportConversation(sessionId, format = 'json', options = {}) {
        // Validar formato
        if (!this.exportFormats[format]) {
            throw new Error(`Formato no soportado: ${format}`);
        }

        // Verificar caché
        const cacheKey = `export_${sessionId}_${format}_${JSON.stringify(options)}`;
        const cached = this.getCachedExport(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            // Obtener datos de la conversación
            const conversationData = await this.getConversationData(sessionId, options);
            
            if (!conversationData) {
                throw new Error(`Conversación no encontrada: ${sessionId}`);
            }

            // Validar límites
            this.validateExportLimits(conversationData, options);

            // Exportar en el formato solicitado
            const result = await this.exportFormats[format](conversationData, options);
            
            // Guardar en caché
            this.setCachedExport(cacheKey, result);
            
            return result;
        } catch (error) {
            console.error(`Error exportando conversación ${sessionId}:`, error);
            throw error;
        }
    }

    async exportMultipleConversations(filters = {}, format = 'json', options = {}) {
        try {
            // Obtener conversaciones que coincidan con los filtros
            const conversations = await this.getFilteredConversations(filters, options);
            
            if (conversations.length === 0) {
                throw new Error('No se encontraron conversaciones que coincidan con los filtros');
            }

            // Validar límites para múltiples conversaciones
            this.validateBulkExportLimits(conversations, options);

            // Exportar en formato de archivo comprimido para múltiples conversaciones
            const result = await this.exportBulkData(conversations, format, options);
            
            return result;
        } catch (error) {
            console.error('Error en exportación múltiple:', error);
            throw error;
        }
    }

    // =============================================================================
    // EXPORTADORES POR FORMATO
    // =============================================================================

    async exportToJSON(data, options = {}) {
        const { pretty = true, includeMetadata = true } = options;
        
        let exportData = {
            conversation: data.conversation,
            messages: data.messages
        };

        if (includeMetadata) {
            exportData.metadata = {
                exported_at: new Date().toISOString(),
                export_version: '2.1.3',
                total_messages: data.messages.length,
                date_range: {
                    start: data.messages[0]?.timestamp,
                    end: data.messages[data.messages.length - 1]?.timestamp
                }
            };
        }

        const jsonContent = pretty 
            ? JSON.stringify(exportData, null, 2)
            : JSON.stringify(exportData);

        return {
            content: jsonContent,
            filename: `conversation_${data.conversation.session_id.substring(0, 8)}_${this.getTimestamp()}.json`,
            mime_type: 'application/json',
            size: Buffer.byteLength(jsonContent, 'utf8')
        };
    }

    async exportToMarkdown(data, options = {}) {
        const { includeMetadata = true, includeSystemMessages = false } = options;
        
        let markdown = '';
        
        // Header
        markdown += `# Conversation Export\n\n`;
        
        if (includeMetadata) {
            markdown += `## Metadata\n\n`;
            markdown += `- **Session ID**: ${data.conversation.session_id}\n`;
            markdown += `- **Project**: ${data.conversation.project_name}\n`;
            markdown += `- **Started**: ${new Date(data.conversation.timestamp).toLocaleString()}\n`;
            markdown += `- **Messages**: ${data.messages.length}\n`;
            markdown += `- **Exported**: ${new Date().toLocaleString()}\n\n`;
        }
        
        markdown += `## Conversation\n\n`;
        
        // Messages
        for (const message of data.messages) {
            if (!includeSystemMessages && message.role === 'system') {
                continue;
            }
            
            const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
            const timestamp = new Date(message.timestamp).toLocaleTimeString();
            
            markdown += `### ${role} (${timestamp})\n\n`;
            markdown += `${message.content}\n\n`;
            
            if (message.tool_calls && message.tool_calls.length > 0) {
                markdown += `**Tool Calls:**\n`;
                for (const tool of message.tool_calls) {
                    markdown += `- ${tool.function.name}: ${tool.function.arguments}\n`;
                }
                markdown += `\n`;
            }
        }

        return {
            content: markdown,
            filename: `conversation_${data.conversation.session_id.substring(0, 8)}_${this.getTimestamp()}.md`,
            mime_type: 'text/markdown',
            size: Buffer.byteLength(markdown, 'utf8')
        };
    }

    async exportToCSV(data, options = {}) {
        const { includeContent = true, includeSystemMessages = false } = options;
        
        // Headers
        let csvContent = 'Timestamp,Role,Content_Length';
        if (includeContent) {
            csvContent += ',Content';
        }
        csvContent += '\n';
        
        // Data rows
        for (const message of data.messages) {
            if (!includeSystemMessages && message.role === 'system') {
                continue;
            }
            
            const timestamp = new Date(message.timestamp).toISOString();
            const role = message.role;
            const contentLength = message.content.length;
            
            let row = `"${timestamp}","${role}",${contentLength}`;
            
            if (includeContent) {
                // Escapar comillas y nuevas líneas en el contenido
                const escapedContent = message.content
                    .replace(/"/g, '""')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r');
                row += `,"${escapedContent}"`;
            }
            
            csvContent += row + '\n';
        }

        return {
            content: csvContent,
            filename: `conversation_${data.conversation.session_id.substring(0, 8)}_${this.getTimestamp()}.csv`,
            mime_type: 'text/csv',
            size: Buffer.byteLength(csvContent, 'utf8')
        };
    }

    async exportToExcel(data, options = {}) {
        // Para Excel necesitaríamos una librería como 'xlsx'
        // Por ahora, simulamos la creación de un archivo Excel básico
        
        const { includeCharts = false, includeStats = true } = options;
        
        // Simular estructura de Excel
        const excelData = {
            sheets: {
                'Conversation': {
                    headers: ['Timestamp', 'Role', 'Content', 'Length'],
                    rows: data.messages.map(msg => [
                        new Date(msg.timestamp).toISOString(),
                        msg.role,
                        msg.content.substring(0, 1000) + (msg.content.length > 1000 ? '...' : ''),
                        msg.content.length
                    ])
                }
            }
        };

        if (includeStats) {
            excelData.sheets['Statistics'] = {
                headers: ['Metric', 'Value'],
                rows: [
                    ['Total Messages', data.messages.length],
                    ['User Messages', data.messages.filter(m => m.role === 'user').length],
                    ['Assistant Messages', data.messages.filter(m => m.role === 'assistant').length],
                    ['Average Message Length', Math.round(data.messages.reduce((sum, m) => sum + m.content.length, 0) / data.messages.length)],
                    ['Conversation Duration', this.calculateDuration(data.messages)],
                    ['Export Date', new Date().toISOString()]
                ]
            };
        }

        // En implementación real, usar library 'xlsx':
        // const XLSX = require('xlsx');
        // const wb = XLSX.utils.book_new();
        // const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        // XLSX.utils.book_append_sheet(wb, ws, 'Conversation');
        // const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return {
            content: JSON.stringify(excelData, null, 2), // Placeholder
            filename: `conversation_${data.conversation.session_id.substring(0, 8)}_${this.getTimestamp()}.xlsx`,
            mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: JSON.stringify(excelData).length,
            note: 'Excel export requires xlsx library implementation'
        };
    }

    async exportToPDF(data, options = {}) {
        // Para PDF necesitaríamos una librería como 'puppeteer' o 'pdfkit'
        const { includeMetadata = true, fontSize = 12, pageSize = 'A4' } = options;
        
        // Generar HTML que se convertiría a PDF
        let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Conversation Export</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: ${fontSize}px; margin: 40px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .metadata { background: #f5f5f5; padding: 15px; margin-bottom: 30px; border-radius: 5px; }
        .message { margin-bottom: 20px; padding: 15px; border-left: 4px solid #ddd; }
        .user { border-left-color: #007bff; }
        .assistant { border-left-color: #28a745; }
        .system { border-left-color: #ffc107; }
        .role { font-weight: bold; color: #333; margin-bottom: 5px; }
        .timestamp { font-size: 0.9em; color: #666; }
        .content { margin-top: 10px; line-height: 1.6; }
        @media print { body { margin: 20px; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Conversation Export</h1>
        <p>Session: ${data.conversation.session_id}</p>
    </div>
`;

        if (includeMetadata) {
            html += `
    <div class="metadata">
        <h3>Metadata</h3>
        <p><strong>Project:</strong> ${data.conversation.project_name}</p>
        <p><strong>Started:</strong> ${new Date(data.conversation.timestamp).toLocaleString()}</p>
        <p><strong>Messages:</strong> ${data.messages.length}</p>
        <p><strong>Exported:</strong> ${new Date().toLocaleString()}</p>
    </div>
`;
        }

        html += `<div class="conversation">`;
        
        for (const message of data.messages) {
            html += `
    <div class="message ${message.role}">
        <div class="role">${message.role.charAt(0).toUpperCase() + message.role.slice(1)}</div>
        <div class="timestamp">${new Date(message.timestamp).toLocaleString()}</div>
        <div class="content">${this.escapeHtml(message.content)}</div>
    </div>
`;
        }
        
        html += `</div></body></html>`;

        // En implementación real con Puppeteer:
        // const puppeteer = require('puppeteer');
        // const browser = await puppeteer.launch();
        // const page = await browser.newPage();
        // await page.setContent(html);
        // const pdf = await page.pdf({ format: pageSize });
        // await browser.close();

        return {
            content: html, // En real sería el buffer del PDF
            filename: `conversation_${data.conversation.session_id.substring(0, 8)}_${this.getTimestamp()}.pdf`,
            mime_type: 'application/pdf',
            size: Buffer.byteLength(html, 'utf8'),
            note: 'PDF export requires puppeteer or pdfkit implementation'
        };
    }

    async exportToHTML(data, options = {}) {
        const { includeCSS = true, interactive = false } = options;
        
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conversation Export - ${data.conversation.session_id}</title>`;

        if (includeCSS) {
            html += `
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; padding: 20px; background: #f5f5f5; color: #333;
        }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 30px; }
        .metadata { background: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 30px; }
        .message { margin-bottom: 20px; padding: 15px; border-radius: 8px; position: relative; }
        .user { background: #e3f2fd; border-left: 4px solid #2196f3; }
        .assistant { background: #e8f5e9; border-left: 4px solid #4caf50; }
        .system { background: #fff3e0; border-left: 4px solid #ff9800; }
        .role { font-weight: 600; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .timestamp { font-size: 0.8em; color: #666; margin-bottom: 10px; }
        .content { line-height: 1.6; white-space: pre-wrap; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 20px; }
        .stat { text-align: center; padding: 15px; background: #f0f0f0; border-radius: 6px; }
        .stat-value { font-size: 1.5em; font-weight: bold; color: #2196f3; }
        .stat-label { font-size: 0.9em; color: #666; margin-top: 5px; }
        @media (max-width: 600px) {
            body { padding: 10px; }
            .container { padding: 20px; }
            .stats { grid-template-columns: 1fr; }
        }
    </style>`;
        }

        html += `
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Conversation Export</h1>
            <p><strong>Session:</strong> ${data.conversation.session_id}</p>
            <p><strong>Project:</strong> ${data.conversation.project_name}</p>
        </div>

        <div class="metadata">
            <h3>Export Information</h3>
            <p><strong>Exported:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total Messages:</strong> ${data.messages.length}</p>
            <p><strong>Date Range:</strong> ${new Date(data.messages[0]?.timestamp).toLocaleDateString()} - ${new Date(data.messages[data.messages.length - 1]?.timestamp).toLocaleDateString()}</p>
        </div>

        <div class="conversation">`;

        for (const message of data.messages) {
            html += `
            <div class="message ${message.role}">
                <div class="role">${message.role}</div>
                <div class="timestamp">${new Date(message.timestamp).toLocaleString()}</div>
                <div class="content">${this.escapeHtml(message.content)}</div>
            </div>`;
        }

        // Estadísticas
        const userMessages = data.messages.filter(m => m.role === 'user').length;
        const assistantMessages = data.messages.filter(m => m.role === 'assistant').length;
        const avgLength = Math.round(data.messages.reduce((sum, m) => sum + m.content.length, 0) / data.messages.length);

        html += `
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${userMessages}</div>
                <div class="stat-label">User Messages</div>
            </div>
            <div class="stat">
                <div class="stat-value">${assistantMessages}</div>
                <div class="stat-label">Assistant Messages</div>
            </div>
            <div class="stat">
                <div class="stat-value">${avgLength}</div>
                <div class="stat-label">Avg. Length</div>
            </div>
            <div class="stat">
                <div class="stat-value">${this.calculateDuration(data.messages)}</div>
                <div class="stat-label">Duration</div>
            </div>
        </div>
    </div>
</body>
</html>`;

        return {
            content: html,
            filename: `conversation_${data.conversation.session_id.substring(0, 8)}_${this.getTimestamp()}.html`,
            mime_type: 'text/html',
            size: Buffer.byteLength(html, 'utf8')
        };
    }

    // =============================================================================
    // MÉTODOS DE UTILIDAD
    // =============================================================================

    async getConversationData(sessionId, options = {}) {
        const { includeSystemMessages = true } = options;
        
        try {
            const conversation = await this.db.collection('conversations').findOne({
                session_id: sessionId
            });

            if (!conversation) {
                return null;
            }

            // Filtrar mensajes si es necesario
            let messages = conversation.messages || [];
            
            if (!includeSystemMessages) {
                messages = messages.filter(msg => msg.role !== 'system');
            }

            return {
                conversation,
                messages
            };
        } catch (error) {
            console.error('Error obteniendo datos de conversación:', error);
            throw error;
        }
    }

    async getFilteredConversations(filters, options = {}) {
        const { limit = 100 } = options;
        
        try {
            const query = this.buildFilterQuery(filters);
            
            const conversations = await this.db.collection('conversations')
                .find(query)
                .sort({ timestamp: -1 })
                .limit(limit)
                .toArray();

            return conversations;
        } catch (error) {
            console.error('Error obteniendo conversaciones filtradas:', error);
            throw error;
        }
    }

    buildFilterQuery(filters) {
        const query = {};
        
        if (filters.project) {
            query.project_name = filters.project;
        }
        
        if (filters.startDate || filters.endDate) {
            query.timestamp = {};
            if (filters.startDate) {
                query.timestamp.$gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                query.timestamp.$lte = new Date(filters.endDate);
            }
        }
        
        if (filters.isMarked !== undefined) {
            query.is_marked = filters.isMarked;
        }
        
        if (filters.isActive !== undefined) {
            query.is_active = filters.isActive;
        }
        
        return query;
    }

    validateExportLimits(data, options) {
        if (data.messages.length > this.maxMessages) {
            throw new Error(`La conversación tiene demasiados mensajes (${data.messages.length}). Máximo permitido: ${this.maxMessages}`);
        }
        
        // Validar tamaño total de contenido
        const totalSize = data.messages.reduce((sum, msg) => sum + msg.content.length, 0);
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (totalSize > maxSize) {
            throw new Error(`El contenido de la conversación es demasiado grande. Máximo permitido: ${maxSize / 1024 / 1024}MB`);
        }
    }

    validateBulkExportLimits(conversations, options) {
        if (conversations.length > this.maxConversations) {
            throw new Error(`Demasiadas conversaciones para exportar (${conversations.length}). Máximo permitido: ${this.maxConversations}`);
        }
    }

    getCachedExport(key) {
        const cached = this.exportCache.get(key);
        if (!cached) return null;
        
        if (Date.now() > cached.expiry) {
            this.exportCache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    setCachedExport(key, data) {
        this.exportCache.set(key, {
            data,
            expiry: Date.now() + this.cacheTTL
        });
    }

    getTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    calculateDuration(messages) {
        if (messages.length < 2) return '0m';
        
        const start = new Date(messages[0].timestamp);
        const end = new Date(messages[messages.length - 1].timestamp);
        const durationMs = end - start;
        
        const minutes = Math.floor(durationMs / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m`;
        }
    }

    async exportBulkData(conversations, format, options) {
        // Para exportación masiva, crear un ZIP con múltiples archivos
        // En implementación real usaría 'archiver' o 'jszip'
        
        const exports = [];
        
        for (const conversation of conversations) {
            const data = {
                conversation,
                messages: conversation.messages || []
            };
            
            const exported = await this.exportFormats[format](data, options);
            exports.push(exported);
        }
        
        return {
            type: 'bulk_export',
            format,
            count: exports.length,
            total_size: exports.reduce((sum, exp) => sum + exp.size, 0),
            files: exports,
            filename: `bulk_export_${this.getTimestamp()}.zip`,
            note: 'Bulk export requires ZIP library implementation'
        };
    }
}

module.exports = ExportService;