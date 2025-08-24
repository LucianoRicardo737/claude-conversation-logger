/**
 * Componente de diálogo para exportación en múltiples formatos
 */
import { BaseComponent } from './BaseComponent.js';

export const ExportDialog = {
    mixins: [BaseComponent],
    
    props: {
        visible: {
            type: Boolean,
            default: false
        },
        sessionId: {
            type: String,
            default: null
        },
        conversationData: {
            type: Object,
            default: null
        }
    },

    emits: ['close', 'export-started', 'export-completed', 'export-error'],

    data() {
        return {
            selectedFormat: 'json',
            exportOptions: {
                includeMetadata: true,
                includeSystemMessages: false,
                includeContent: true,
                pretty: true,
                fontSize: 12,
                pageSize: 'A4',
                includeCharts: false,
                includeStats: true,
                interactive: false,
                includeCSS: true
            },
            availableFormats: [
                {
                    value: 'json',
                    label: 'JSON',
                    description: 'Machine-readable format for data processing',
                    icon: 'fa-code',
                    size: 'Small',
                    features: ['Structured data', 'API friendly', 'Compact']
                },
                {
                    value: 'markdown',
                    label: 'Markdown',
                    description: 'Human-readable format for documentation',
                    icon: 'fa-markdown',
                    size: 'Medium',
                    features: ['Easy to read', 'Git friendly', 'Portable']
                },
                {
                    value: 'html',
                    label: 'HTML',
                    description: 'Web format with styling and interactivity',
                    icon: 'fa-globe',
                    size: 'Medium',
                    features: ['Styled output', 'Interactive', 'Web ready']
                },
                {
                    value: 'pdf',
                    label: 'PDF',
                    description: 'Professional document format for sharing',
                    icon: 'fa-file-pdf',
                    size: 'Large',
                    features: ['Print ready', 'Professional', 'Portable']
                },
                {
                    value: 'xlsx',
                    label: 'Excel',
                    description: 'Spreadsheet format for data analysis',
                    icon: 'fa-file-excel',
                    size: 'Medium',
                    features: ['Data analysis', 'Charts', 'Formulas']
                },
                {
                    value: 'csv',
                    label: 'CSV',
                    description: 'Simple format for data import/export',
                    icon: 'fa-table',
                    size: 'Small',
                    features: ['Universal', 'Lightweight', 'Database ready']
                }
            ],
            isExporting: false,
            exportProgress: 0,
            currentStep: '',
            downloadUrl: null,
            exportResult: null,
            errors: [],
            advancedOptionsVisible: false
        };
    },

    computed: {
        selectedFormatInfo() {
            return this.availableFormats.find(f => f.value === this.selectedFormat) || this.availableFormats[0];
        },

        formatSpecificOptions() {
            const options = {};
            
            switch (this.selectedFormat) {
                case 'json':
                    options.pretty = this.exportOptions.pretty;
                    options.includeMetadata = this.exportOptions.includeMetadata;
                    break;
                case 'markdown':
                    options.includeMetadata = this.exportOptions.includeMetadata;
                    options.includeSystemMessages = this.exportOptions.includeSystemMessages;
                    break;
                case 'html':
                    options.includeCSS = this.exportOptions.includeCSS;
                    options.interactive = this.exportOptions.interactive;
                    break;
                case 'pdf':
                    options.includeMetadata = this.exportOptions.includeMetadata;
                    options.fontSize = this.exportOptions.fontSize;
                    options.pageSize = this.exportOptions.pageSize;
                    break;
                case 'xlsx':
                    options.includeCharts = this.exportOptions.includeCharts;
                    options.includeStats = this.exportOptions.includeStats;
                    break;
                case 'csv':
                    options.includeContent = this.exportOptions.includeContent;
                    options.includeSystemMessages = this.exportOptions.includeSystemMessages;
                    break;
            }
            
            return options;
        },

        canExport() {
            return (this.sessionId || this.conversationData) && !this.isExporting;
        },

        estimatedSize() {
            if (!this.conversationData?.messages) return 'Unknown';
            
            const messageCount = this.conversationData.messages.length;
            const avgMessageLength = this.conversationData.messages.reduce((sum, m) => sum + m.content.length, 0) / messageCount;
            
            // Estimaciones aproximadas por formato
            const estimates = {
                json: messageCount * (avgMessageLength + 100) * 1.2,
                markdown: messageCount * (avgMessageLength + 50) * 1.1,
                html: messageCount * (avgMessageLength + 200) * 1.5,
                pdf: messageCount * (avgMessageLength + 100) * 2,
                xlsx: messageCount * (avgMessageLength + 150) * 1.3,
                csv: messageCount * (avgMessageLength + 50) * 0.8
            };
            
            const bytes = estimates[this.selectedFormat] || estimates.json;
            return this.formatFileSize(bytes);
        }
    },

    watch: {
        visible(newValue) {
            if (newValue) {
                this.resetDialog();
            }
        }
    },

    methods: {
        async startExport() {
            if (!this.canExport) return;
            
            this.isExporting = true;
            this.exportProgress = 0;
            this.currentStep = 'Preparing export...';
            this.errors = [];
            this.downloadUrl = null;
            this.exportResult = null;
            
            this.$emit('export-started', {
                sessionId: this.sessionId,
                format: this.selectedFormat,
                options: this.formatSpecificOptions
            });

            try {
                // Simular progreso
                await this.updateProgress(10, 'Validating data...');
                await this.delay(300);
                
                await this.updateProgress(25, 'Processing conversation...');
                
                // Realizar export
                const result = await this.performExport();
                
                await this.updateProgress(75, 'Generating file...');
                await this.delay(500);
                
                await this.updateProgress(90, 'Finalizing...');
                
                // Crear URL de descarga
                this.createDownloadUrl(result);
                
                await this.updateProgress(100, 'Export completed!');
                
                this.exportResult = result;
                this.$emit('export-completed', result);
                
            } catch (error) {
                console.error('Export error:', error);
                this.errors.push(error.message || 'Export failed');
                this.$emit('export-error', error);
            } finally {
                this.isExporting = false;
            }
        },

        async performExport() {
            const endpoint = this.sessionId 
                ? `/api/conversations/${this.sessionId}/export`
                : '/api/export/conversation';
            
            const params = new URLSearchParams({
                format: this.selectedFormat,
                ...this.formatSpecificOptions
            });

            const response = await fetch(`${endpoint}?${params}`, {
                method: 'GET',
                headers: {
                    'X-API-Key': 'claude_api_secret_2024_change_me'
                }
            });

            if (!response.ok) {
                throw new Error(`Export failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        },

        createDownloadUrl(result) {
            // Crear blob para descarga
            const mimeType = result.mime_type || 'application/octet-stream';
            const blob = new Blob([result.content], { type: mimeType });
            
            // Limpiar URL anterior si existe
            if (this.downloadUrl) {
                URL.revokeObjectURL(this.downloadUrl);
            }
            
            this.downloadUrl = URL.createObjectURL(blob);
        },

        downloadFile() {
            if (!this.downloadUrl || !this.exportResult) return;
            
            const link = document.createElement('a');
            link.href = this.downloadUrl;
            link.download = this.exportResult.filename;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Mostrar notificación de éxito
            this.showNotification('File downloaded successfully!', 'success');
        },

        async updateProgress(percentage, step) {
            this.exportProgress = percentage;
            this.currentStep = step;
            await this.delay(100); // Permitir que la UI se actualice
        },

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        resetDialog() {
            this.isExporting = false;
            this.exportProgress = 0;
            this.currentStep = '';
            this.errors = [];
            this.exportResult = null;
            
            if (this.downloadUrl) {
                URL.revokeObjectURL(this.downloadUrl);
                this.downloadUrl = null;
            }
        },

        closeDialog() {
            this.resetDialog();
            this.$emit('close');
        },

        selectFormat(format) {
            this.selectedFormat = format;
        },

        toggleAdvancedOptions() {
            this.advancedOptionsVisible = !this.advancedOptionsVisible;
        },

        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        showNotification(message, type = 'info') {
            // Implementar sistema de notificaciones
            console.log(`${type.toUpperCase()}: ${message}`);
        },

        getFormatIcon(format) {
            const formatInfo = this.availableFormats.find(f => f.value === format);
            return formatInfo ? formatInfo.icon : 'fa-file';
        }
    },

    beforeUnmount() {
        // Limpiar URL de descarga
        if (this.downloadUrl) {
            URL.revokeObjectURL(this.downloadUrl);
        }
    },

    template: `
        <div v-if="visible" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Export Conversation
                    </h3>
                    <button @click="closeDialog" 
                            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Content -->
                <div class="p-6">
                    <!-- Export Progress (when exporting) -->
                    <div v-if="isExporting" class="mb-6">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ currentStep }}</span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">{{ exportProgress }}%</span>
                        </div>
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                 :style="{ width: exportProgress + '%' }"></div>
                        </div>
                    </div>

                    <!-- Error Messages -->
                    <div v-if="errors.length > 0" class="mb-6">
                        <div v-for="error in errors" :key="error" 
                             class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-md p-3 mb-2">
                            <div class="flex">
                                <i class="fas fa-exclamation-triangle text-red-400 mr-2 mt-0.5"></i>
                                <span class="text-sm text-red-800 dark:text-red-200">{{ error }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Success Result -->
                    <div v-if="exportResult && !isExporting" class="mb-6">
                        <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-800 rounded-md p-4">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center">
                                    <i class="fas fa-check-circle text-green-500 mr-3"></i>
                                    <div>
                                        <h4 class="text-sm font-medium text-green-800 dark:text-green-200">Export Completed</h4>
                                        <p class="text-sm text-green-700 dark:text-green-300">
                                            File: {{ exportResult.filename }} ({{ formatFileSize(exportResult.size) }})
                                        </p>
                                    </div>
                                </div>
                                <button @click="downloadFile" 
                                        class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                                    <i class="fas fa-download mr-2"></i>
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Format Selection -->
                    <div v-if="!isExporting && !exportResult" class="mb-6">
                        <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Select Export Format</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div v-for="format in availableFormats" :key="format.value"
                                 @click="selectFormat(format.value)"
                                 :class="['cursor-pointer rounded-lg border-2 p-4 transition-all duration-200',
                                         selectedFormat === format.value 
                                           ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' 
                                           : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600']">
                                <div class="flex items-start space-x-3">
                                    <div :class="['flex-shrink-0 w-8 h-8 flex items-center justify-center rounded',
                                                 selectedFormat === format.value 
                                                   ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                                                   : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400']">
                                        <i :class="['fas', format.icon]"></i>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center justify-between">
                                            <h5 class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ format.label }}</h5>
                                            <span class="text-xs text-gray-500 dark:text-gray-400">{{ format.size }}</span>
                                        </div>
                                        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ format.description }}</p>
                                        <div class="flex flex-wrap gap-1 mt-2">
                                            <span v-for="feature in format.features" :key="feature"
                                                  class="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                                {{ feature }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Selected Format Info -->
                        <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <div class="flex items-center justify-between">
                                <div>
                                    <h5 class="font-medium text-gray-900 dark:text-gray-100">{{ selectedFormatInfo.label }} Export</h5>
                                    <p class="text-sm text-gray-600 dark:text-gray-400">{{ selectedFormatInfo.description }}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Estimated Size</p>
                                    <p class="text-sm text-gray-600 dark:text-gray-400">{{ estimatedSize }}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Advanced Options -->
                    <div v-if="!isExporting && !exportResult" class="mb-6">
                        <button @click="toggleAdvancedOptions" 
                                class="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                            <i :class="['fas mr-2', advancedOptionsVisible ? 'fa-chevron-down' : 'fa-chevron-right']"></i>
                            Advanced Options
                        </button>
                        
                        <div v-if="advancedOptionsVisible" class="mt-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <!-- Common Options -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <label class="flex items-center">
                                    <input v-model="exportOptions.includeMetadata" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Include metadata</span>
                                </label>
                                
                                <label class="flex items-center">
                                    <input v-model="exportOptions.includeSystemMessages" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Include system messages</span>
                                </label>
                            </div>

                            <!-- Format Specific Options -->
                            <div v-if="selectedFormat === 'json'" class="space-y-3">
                                <label class="flex items-center">
                                    <input v-model="exportOptions.pretty" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Pretty-print JSON</span>
                                </label>
                            </div>

                            <div v-if="selectedFormat === 'pdf'" class="space-y-3">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Font Size</label>
                                    <select v-model="exportOptions.fontSize" 
                                            class="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                        <option value="10">10px</option>
                                        <option value="12">12px</option>
                                        <option value="14">14px</option>
                                        <option value="16">16px</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Page Size</label>
                                    <select v-model="exportOptions.pageSize" 
                                            class="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                                        <option value="A4">A4</option>
                                        <option value="A3">A3</option>
                                        <option value="Letter">Letter</option>
                                        <option value="Legal">Legal</option>
                                    </select>
                                </div>
                            </div>

                            <div v-if="selectedFormat === 'xlsx'" class="space-y-3">
                                <label class="flex items-center">
                                    <input v-model="exportOptions.includeCharts" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Include charts</span>
                                </label>
                                <label class="flex items-center">
                                    <input v-model="exportOptions.includeStats" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Include statistics sheet</span>
                                </label>
                            </div>

                            <div v-if="selectedFormat === 'html'" class="space-y-3">
                                <label class="flex items-center">
                                    <input v-model="exportOptions.includeCSS" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Include CSS styling</span>
                                </label>
                                <label class="flex items-center">
                                    <input v-model="exportOptions.interactive" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Interactive features</span>
                                </label>
                            </div>

                            <div v-if="selectedFormat === 'csv'" class="space-y-3">
                                <label class="flex items-center">
                                    <input v-model="exportOptions.includeContent" 
                                           type="checkbox" 
                                           class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded">
                                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Include full message content</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-750 border-t border-gray-200 dark:border-gray-700">
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                        <span v-if="conversationData?.messages">
                            {{ conversationData.messages.length }} messages ready for export
                        </span>
                    </div>
                    <div class="flex space-x-3">
                        <button @click="closeDialog" 
                                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Cancel
                        </button>
                        <button @click="startExport" 
                                :disabled="!canExport"
                                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center">
                            <i v-if="isExporting" class="fas fa-spinner fa-spin mr-2"></i>
                            <i v-else class="fas fa-download mr-2"></i>
                            {{ isExporting ? 'Exporting...' : 'Export' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
};