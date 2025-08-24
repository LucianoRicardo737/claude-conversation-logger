# ⚙️ Agent System Configuration Guide

## 📋 Overview

El sistema de agentes es completamente configurable a través de variables de entorno, permitiendo adaptación a diferentes idiomas, casos de uso y requisitos de performance.

## 🌍 Language Configuration

### **Primary & Secondary Languages**
```bash
# Idioma principal para detección de patrones
AGENT_PRIMARY_LANGUAGE=es

# Idioma secundario para soporte mixto
AGENT_SECONDARY_LANGUAGE=en

# Habilitar modo mixto (español + inglés simultáneo)
AGENT_MIXED_LANGUAGE_MODE=true
```

### **Keyword Configuration (JSON Arrays)**

#### **Documentación Keywords**
```bash
# Palabras que activan el agente de documentación
AGENT_WRITE_KEYWORDS='[
  "documentar", "guardar", "registrar", "crear doc",
  "document", "save", "record", "store", "create doc",
  "escribir", "generar", "almacenar"
]'
```

#### **Búsqueda Keywords**
```bash
# Palabras que activan búsqueda de contexto
AGENT_READ_KEYWORDS='[
  "buscar", "encontrar", "similar", "relacionado", "buscar contexto",
  "search", "find", "similar", "related", "lookup", "query",
  "hallar", "localizar", "consultar"
]'
```

#### **Resolución Keywords**
```bash
# Palabras que indican problemas resueltos
AGENT_RESOLUTION_KEYWORDS='[
  "resuelto", "solucionado", "funcionando", "completado", "finalizado",
  "resolved", "fixed", "working", "solved", "completed", "done",
  "arreglado", "corregido", "terminado"
]'
```

#### **Problema Keywords**
```bash
# Palabras que indican problemas o errores
AGENT_PROBLEM_KEYWORDS='[
  "error", "falla", "problema", "bug", "issue", "fallo",
  "fail", "crash", "broken", "not working", "exception",
  "problema", "inconveniente", "dificultad"
]'
```

#### **Sesión Activa Indicators**
```bash
# Indicadores de sesión activa (usuario necesita ayuda)
AGENT_ACTIVE_SESSION_INDICATORS='[
  "pregunta", "ayuda", "cómo", "necesito", "no sé", "dudas",
  "question", "help", "how", "need", "don\'t know", "unsure",
  "consulta", "auxilio", "asistencia"
]'
```

#### **Sesión Completada Indicators**
```bash
# Indicadores de sesión completada (usuario satisfecho)
AGENT_COMPLETED_SESSION_INDICATORS='[
  "gracias", "perfecto", "listo", "excelente", "genial", "ok",
  "thanks", "perfect", "done", "excellent", "great", "awesome",
  "muchas gracias", "está bien", "funciona"
]'
```

### **Custom Language Support**

Para agregar soporte a idiomas adicionales, crea archivos personalizados:

```javascript
// config/custom-languages.js
export const customLanguages = {
  'pt': { // Portugués
    write: ['documentar', 'salvar', 'registrar'],
    read: ['buscar', 'encontrar', 'procurar'],
    resolution: ['resolvido', 'solucionado', 'funcionando'],
    problem: ['erro', 'problema', 'falha']
  },
  'fr': { // Francés
    write: ['documenter', 'sauvegarder', 'enregistrer'],
    read: ['chercher', 'trouver', 'rechercher'],
    resolution: ['résolu', 'terminé', 'fonctionne'],
    problem: ['erreur', 'problème', 'échec']
  },
  'de': { // Alemán
    write: ['dokumentieren', 'speichern', 'aufzeichnen'],
    read: ['suchen', 'finden', 'nachschlagen'],
    resolution: ['gelöst', 'behoben', 'funktioniert'],
    problem: ['fehler', 'problem', 'störung']
  }
};

// Uso en docker-compose.yml
AGENT_CUSTOM_LANGUAGE=pt
AGENT_WRITE_KEYWORDS='["documentar","salvar","registrar","document","save"]'
```

## 🎯 Pattern Detection Configuration

### **Detection Thresholds**
```bash
# Frecuencia mínima para considerar un patrón
AGENT_MIN_PATTERN_FREQUENCY=3

# Umbral de similitud para agrupar conversaciones (0.0-1.0)
AGENT_SIMILARITY_THRESHOLD=0.75

# Umbral de confianza para decisiones automáticas (0.0-1.0)
AGENT_CONFIDENCE_THRESHOLD=0.80

# Ventana de tiempo para detección de patrones (días)
AGENT_PATTERN_DETECTION_WINDOW_DAYS=7

# Días hacia atrás para búsqueda de relaciones
AGENT_RELATIONSHIP_SEARCH_DAYS=14
```

### **Advanced Pattern Configuration**
```bash
# Pesos para diferentes tipos de similitud
AGENT_CONTENT_WEIGHT=0.5        # Peso del contenido
AGENT_TEMPORAL_WEIGHT=0.2       # Peso temporal
AGENT_STRUCTURAL_WEIGHT=0.3     # Peso estructural

# Configuración de clustering
AGENT_MIN_CLUSTER_SIZE=2        # Tamaño mínimo de cluster
AGENT_MAX_CLUSTERS=10           # Máximo número de clusters
```

## 📊 Session State Configuration

### **Session Timeouts**
```bash
# Timeout para considerar sesión activa (minutos)
AGENT_ACTIVE_SESSION_TIMEOUT_MINUTES=30

# Timeout para considerar sesión abandonada (múltiplo del timeout activo)
AGENT_ABANDONED_SESSION_MULTIPLIER=4

# Valor mínimo para documentación automática (0-100)
AGENT_MIN_DOCUMENTATION_VALUE=50
```

### **Quality Assessment**
```bash
# Umbrales para evaluación de calidad
AGENT_HIGH_QUALITY_THRESHOLD=0.8
AGENT_MEDIUM_QUALITY_THRESHOLD=0.6
AGENT_LOW_QUALITY_THRESHOLD=0.3

# Factores de complejidad
AGENT_HIGH_COMPLEXITY_THRESHOLD=15   # Mensajes para alta complejidad
AGENT_MEDIUM_COMPLEXITY_THRESHOLD=5  # Mensajes para media complejidad
```

## ⚡ Performance Configuration

### **Token Management**
```bash
# Presupuesto máximo de tokens por operación
AGENT_MAX_TOKEN_BUDGET=100

# Presupuestos específicos por tipo de operación
AGENT_SEMANTIC_ANALYSIS_TOKENS=50
AGENT_PATTERN_DETECTION_TOKENS=40
AGENT_RELATIONSHIP_MAPPING_TOKENS=35
AGENT_DOCUMENTATION_TOKENS=60

# Nivel de optimización de tokens
AGENT_TOKEN_OPTIMIZATION_LEVEL=high  # high, medium, low
```

### **Caching Configuration**
```bash
# TTL del cache en segundos
AGENT_CACHE_TTL_SECONDS=300

# Tamaño máximo del cache (número de entradas)
AGENT_CACHE_MAX_SIZE=1000

# Habilitar cache avanzado con compresión
AGENT_ENABLE_ADVANCED_CACHING=true

# Cache para diferentes componentes
AGENT_SEMANTIC_CACHE_SIZE=500
AGENT_RELATIONSHIP_CACHE_SIZE=300
AGENT_PATTERN_CACHE_SIZE=200
```

### **Concurrency & Performance**
```bash
# Número máximo de análisis concurrentes
AGENT_MAX_CONCURRENT_ANALYSIS=5

# Tamaño de lote para procesamiento batch
AGENT_BATCH_PROCESSING_SIZE=10

# Timeout para operaciones de agente (ms)
AGENT_OPERATION_TIMEOUT_MS=30000

# Intervalo de limpieza de cache (ms)
AGENT_CACHE_CLEANUP_INTERVAL_MS=300000
```

## 🎛️ Feature Flags

### **Core Features**
```bash
# Habilitar análisis semántico profundo
AGENT_ENABLE_SEMANTIC_ANALYSIS=true

# Habilitar detección de intención
AGENT_ENABLE_INTENT_DETECTION=true

# Habilitar auto-documentación
AGENT_ENABLE_AUTO_DOCUMENTATION=true

# Habilitar mapeo de relaciones
AGENT_ENABLE_RELATIONSHIP_MAPPING=true

# Habilitar predicción de patrones
AGENT_ENABLE_PATTERN_PREDICTION=true
```

### **Advanced Features**
```bash
# Habilitar clustering automático
AGENT_ENABLE_AUTO_CLUSTERING=true

# Habilitar análisis de sentiment
AGENT_ENABLE_SENTIMENT_ANALYSIS=true

# Habilitar extracción de entidades
AGENT_ENABLE_ENTITY_EXTRACTION=true

# Habilitar análisis temporal
AGENT_ENABLE_TEMPORAL_ANALYSIS=true

# Habilitar generación de insights
AGENT_ENABLE_INSIGHT_GENERATION=true
```

### **Experimental Features**
```bash
# Habilitar predicción de resolución
AGENT_ENABLE_RESOLUTION_PREDICTION=false

# Habilitar análisis de conversación en tiempo real
AGENT_ENABLE_REALTIME_ANALYSIS=false

# Habilitar aprendizaje automático básico
AGENT_ENABLE_BASIC_ML=false
```

## 🔧 API & Integration Configuration

### **API Settings**
```bash
# Timeout para llamadas API internas (ms)
AGENT_API_TIMEOUT_MS=30000

# Número de reintentos para operaciones fallidas
AGENT_API_RETRY_ATTEMPTS=3

# Delay entre reintentos (ms)
AGENT_API_RETRY_DELAY_MS=1000

# Rate limiting para agentes
AGENT_MAX_REQUESTS_PER_MINUTE=120
```

### **Database Integration**
```bash
# Configuración de MongoDB para agentes
AGENT_MONGODB_COLLECTION_PREFIX=agent_
AGENT_MONGODB_INDEX_CREATION=true

# Configuración de Redis para agentes
AGENT_REDIS_KEY_PREFIX=agent:
AGENT_REDIS_COMPRESSION=true

# TTL para datos persistentes (días)
AGENT_PERSISTENT_DATA_TTL_DAYS=90
```

## 📊 Logging & Monitoring

### **Logging Configuration**
```bash
# Nivel de log para agentes
AGENT_LOG_LEVEL=info  # debug, info, warn, error

# Habilitar logging de métricas
AGENT_ENABLE_METRICS_LOGGING=true

# Habilitar logging de performance
AGENT_ENABLE_PERFORMANCE_LOGGING=true

# Habilitar logging de decisiones
AGENT_ENABLE_DECISION_LOGGING=true

# Formato de logs
AGENT_LOG_FORMAT=json  # json, text
```

### **Metrics & Monitoring**
```bash
# Habilitar métricas detalladas
AGENT_ENABLE_DETAILED_METRICS=true

# Intervalo de reporte de métricas (ms)
AGENT_METRICS_REPORT_INTERVAL_MS=60000

# Habilitar health checks
AGENT_ENABLE_HEALTH_CHECKS=true

# Puerto para métricas (si está habilitado)
AGENT_METRICS_PORT=9090
```

## 🔒 Security & Privacy

### **Privacy Settings**
```bash
# Habilitar anonymización automática
AGENT_ENABLE_AUTO_ANONYMIZATION=true

# Patrones para datos sensibles (regex JSON)
AGENT_SENSITIVE_DATA_PATTERNS='[
  "\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b",
  "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"
]'

# Retención de datos de agentes (días)
AGENT_DATA_RETENTION_DAYS=30
```

## 🎨 Custom Configuration Examples

### **E-commerce Focused**
```bash
# Configuración optimizada para e-commerce
AGENT_PRIMARY_LANGUAGE=es
AGENT_WRITE_KEYWORDS='["documentar","registrar","sincronizar","integrar"]'
AGENT_PROBLEM_KEYWORDS='["error","falla","no sincroniza","no funciona","timeout"]'
AGENT_MIN_PATTERN_FREQUENCY=2
AGENT_SIMILARITY_THRESHOLD=0.70
```

### **Multi-Language Support**
```bash
# Soporte completo multi-idioma
AGENT_MIXED_LANGUAGE_MODE=true
AGENT_PRIMARY_LANGUAGE=es
AGENT_SECONDARY_LANGUAGE=en
AGENT_WRITE_KEYWORDS='["documentar","document","documenter","dokumentieren"]'
AGENT_READ_KEYWORDS='["buscar","search","chercher","suchen"]'
```

### **High Performance Setup**
```bash
# Configuración de alta performance
AGENT_MAX_TOKEN_BUDGET=150
AGENT_CACHE_TTL_SECONDS=600
AGENT_CACHE_MAX_SIZE=2000
AGENT_MAX_CONCURRENT_ANALYSIS=8
AGENT_ENABLE_ADVANCED_CACHING=true
```

### **Development Environment**
```bash
# Configuración para desarrollo
AGENT_LOG_LEVEL=debug
AGENT_ENABLE_PERFORMANCE_LOGGING=true
AGENT_ENABLE_DECISION_LOGGING=true
AGENT_CONFIDENCE_THRESHOLD=0.60
AGENT_MIN_PATTERN_FREQUENCY=2
```

## 🔄 Configuration Validation

### **Automatic Validation**
El sistema valida automáticamente la configuración al inicio y reporta errores:

```bash
# Ejemplo de validación exitosa
✅ Agent configuration validated successfully
✅ Language patterns loaded: es, en
✅ Token budgets configured: max=100, semantic=50
✅ Cache settings validated: TTL=300s, Size=1000
```

### **Manual Validation**
```javascript
// Validar configuración programáticamente
import AgentConfig from './src/agents/config/AgentConfig.js';

const config = new AgentConfig();
try {
  config.validateConfiguration();
  console.log('✅ Configuration is valid');
} catch (error) {
  console.error('❌ Configuration error:', error.message);
}
```

## 📚 Configuration Templates

### **Production Template**
```bash
# === PRODUCTION AGENT CONFIGURATION ===
AGENT_PRIMARY_LANGUAGE=es
AGENT_SECONDARY_LANGUAGE=en
AGENT_MIXED_LANGUAGE_MODE=true

# Performance optimizada para producción
AGENT_MAX_TOKEN_BUDGET=100
AGENT_CACHE_TTL_SECONDS=600
AGENT_MAX_CONCURRENT_ANALYSIS=5

# Features esenciales habilitadas
AGENT_ENABLE_SEMANTIC_ANALYSIS=true
AGENT_ENABLE_AUTO_DOCUMENTATION=true
AGENT_ENABLE_RELATIONSHIP_MAPPING=true

# Logging moderado
AGENT_LOG_LEVEL=info
AGENT_ENABLE_METRICS_LOGGING=true
```

### **Development Template**
```bash
# === DEVELOPMENT AGENT CONFIGURATION ===
AGENT_PRIMARY_LANGUAGE=es
AGENT_MIXED_LANGUAGE_MODE=true

# Performance relajada para desarrollo
AGENT_MAX_TOKEN_BUDGET=150
AGENT_CONFIDENCE_THRESHOLD=0.60
AGENT_MIN_PATTERN_FREQUENCY=2

# Todas las features habilitadas
AGENT_ENABLE_SEMANTIC_ANALYSIS=true
AGENT_ENABLE_AUTO_DOCUMENTATION=true
AGENT_ENABLE_RELATIONSHIP_MAPPING=true
AGENT_ENABLE_PATTERN_PREDICTION=true

# Logging detallado
AGENT_LOG_LEVEL=debug
AGENT_ENABLE_PERFORMANCE_LOGGING=true
AGENT_ENABLE_DECISION_LOGGING=true
```

---

## 🎯 Quick Reference

### **Most Important Settings**
1. **AGENT_PRIMARY_LANGUAGE** - Define el idioma principal
2. **AGENT_MAX_TOKEN_BUDGET** - Controla el costo de operaciones
3. **AGENT_SIMILARITY_THRESHOLD** - Afecta precisión de relaciones
4. **AGENT_MIN_PATTERN_FREQUENCY** - Controla detección de patrones
5. **AGENT_ENABLE_*** - Control granular de features

### **Performance Impact**
- **High Impact**: TOKEN_BUDGET, CACHE_SIZE, CONCURRENT_ANALYSIS
- **Medium Impact**: SIMILARITY_THRESHOLD, PATTERN_FREQUENCY
- **Low Impact**: LOG_LEVEL, METRICS_LOGGING

### **Memory Usage**
- **AGENT_CACHE_MAX_SIZE**: 1000 entries ≈ 50MB RAM
- **AGENT_MAX_CONCURRENT_ANALYSIS**: 5 concurrent ≈ 100MB RAM
- **AGENT_ENABLE_ADVANCED_CACHING**: +20% memory usage

Configura según tus recursos disponibles y requisitos de performance.