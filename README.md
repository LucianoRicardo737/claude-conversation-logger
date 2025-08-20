# Claude Conversation Logger

🔍 **Complete conversation logging system for Claude Code** with a monolithic container that includes everything needed.

> **⚡ Quick Start**: [QUICK_START.md](./QUICK_START.md) | **🏗️ Estructura**: [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) | **🤖 Ejemplos MCP**: [examples/mcp-usage-examples.md](./examples/mcp-usage-examples.md)

## 📋 Features

- 🔄 **Automatic logging** of all Claude Code conversations
- 💾 **Triple Storage System** MongoDB + Redis + Memory (maximum reliability)
- 🔍 **Intelligent search** with freshness prioritization and resolved issue detection
- 🤖 **Integrated MCP server** for efficient queries from Claude
- 🏗️ **Monolithic container** with MongoDB, Redis, Node.js and Nginx included
- ⚡ **REST API** for integration with other tools
- 🛡️ **Health checks** and robust error handling
- 🐳 **Single container** - easy deployment and management
- ⚡ **Ultra-reliable** - Automatic triple redundancy

## 🚀 Quick Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd claude-conversation-logger
```

### 2. Start the monolithic container

```bash
# Build and start the container with all services
docker compose up -d --build

# Verify it's working
curl http://localhost:3003/health

# The container automatically includes:
# - MongoDB (internal port 27017) - Main persistence with 90-day TTL
# - Redis (internal port 6379) - Secondary cache
# - Node.js API (internal port 3000) - Main server
# - Nginx proxy (exposed port 3003) - Access point
# - Supervisor for process management
# - Triple Storage: MongoDB → Redis → Memory (total redundancy)
```

### 3. Configurar Claude Code Hook

```bash
# Crear directorio de hooks si no existe
mkdir -p ~/.claude/hooks

# El hook ya está listo, solo copiarlo
cp .claude/hooks/api-logger.py ~/.claude/hooks/api-logger.py
chmod +x ~/.claude/hooks/api-logger.py

# Probar que funciona
./examples/hook-test.sh
```

### 4. Configurar settings.json de Claude Code

Copiar la configuración de ejemplo:

```bash
# Crear configuración base
cp examples/claude-settings.json ~/.claude/settings.json
# O agregar las secciones correspondientes si ya tienes settings.json
```

**Contenido de `~/.claude/settings.json`:**

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "python3 ~/.claude/hooks/api-logger.py"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "python3 ~/.claude/hooks/api-logger.py"
      }]
    }],
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "python3 ~/.claude/hooks/api-logger.py"
      }]
    }]
  },
  "mcp": {
    "mcpServers": {
      "conversation-logger": {
        "command": "node",
        "args": ["/ruta/absoluta/claude-conversation-logger/src/mcp-server.js"],
        "env": {
          "API_URL": "http://localhost:3003",
          "API_KEY": "claude_api_secret_2024_change_me"
        }
      }
    }
  }
}
```

> **⚠️ Importante**: Reemplaza `/ruta/absoluta/` con la ruta real al directorio del proyecto.

## 📖 Configuración Detallada

### Configuración de Hooks

El sistema funciona mediante hooks de Claude Code que capturan automáticamente:

- ✅ **UserPromptSubmit**: Cada prompt que envías a Claude  
- ✅ **Stop**: Respuestas completas de Claude con tokens precisos (acumula chunks de streaming)
- ✅ **SessionStart**: Inicio de nuevas sesiones
- ⚠️ **PostToolUse**: Uso de herramientas (opcional)
- 🔧 **Token Parsing Mejorado**: Captura correcta de estadísticas de uso y contenido completo

⚠️ **IMPORTANTE**: La estructura de hooks debe ser exactamente como se muestra. Claude Code requiere un array con objetos que contengan un campo `"hooks"` interno.

#### archivo: `~/.claude/hooks/api-logger.py`

```python
#!/usr/bin/env python3
import json
import sys
import requests
import os

# Configuración
API_BASE_URL = 'http://localhost:3003'
API_KEY = 'claude_api_secret_2024_change_me'

# (ver examples/hook-setup.py para código completo)
```

#### Archivo: `~/.claude/settings.json`

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/api-logger.py"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command", 
            "command": "python3 ~/.claude/hooks/api-logger.py"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/api-logger.py"
          }
        ]
      }
    ]
  }
}
```

## 📊 Example of Captured Conversation

Here's a real example of what gets stored in MongoDB when the hooks are working correctly:

```javascript
// Session initialization
{
  _id: '77f04828-71ad-4033-8078-e184f86df1ea',
  session_id: '97e025af-1920-4734-b1dc-2abe06a41230',
  project_name: 'uniCommerce',
  message_type: 'system',
  content: 'Session started (source: startup)',
  hook_event: 'SessionStart',
  timestamp: ISODate('2025-08-20T11:44:38.349Z')
}

// User message captured
{
  _id: 'e6c10e47-de16-49f8-9aaa-56e7249da2c3',
  session_id: '97e025af-1920-4734-b1dc-2abe06a41230',
  project_name: 'uniCommerce',
  message_type: 'user',
  content: 'Hola, probando, 1 2 3',
  hook_event: 'UserPromptSubmit',
  timestamp: ISODate('2025-08-20T11:44:42.388Z')
}

// Assistant response with complete token usage
{
  _id: '0b5e0ff9-598c-46eb-b2d1-17f4b83e26dd',
  session_id: '97e025af-1920-4734-b1dc-2abe06a41230',
  project_name: 'uniCommerce',
  message_type: 'assistant',
  content: 'Hola! Te recibo perfectamente. ¿En qué puedo ayudarte hoy con el proyecto uniCommerce?',
  hook_event: 'Stop',
  timestamp: ISODate('2025-08-20T11:44:47.757Z'),
  metadata: {
    source: 'stop_hook_assistant',
    model: 'claude-opus-4-1-20250805',
    usage: {
      input_tokens: 3,
      cache_creation_input_tokens: 44348,  // Created once per session
      cache_read_input_tokens: 0,           // Will be used in subsequent turns
      output_tokens: 8,                     // Includes internal processing overhead
      service_tier: 'standard'
    }
  }
}
```

### 💡 Token Usage Explained

- **cache_creation_input_tokens**: Context loaded at session start (CLAUDE.md, project files)
- **cache_read_input_tokens**: Reused cached context (90% discount)
- **output_tokens**: May seem low due to internal Claude Code processing
- **input_tokens**: Actual user message tokens

### Variables de Entorno

Las variables están pre-configuradas en el contenedor monolítico:

```env
# API Configuration (pre-configurado)
NODE_ENV=production
PORT=3000
API_SECRET=claude_api_secret_2024_change_me

# Database (interno del contenedor)
MONGODB_URI=mongodb://admin:claude_logger_2024@localhost:27017/conversations?authSource=admin
REDIS_URL=redis://localhost:6379

# Triple Storage System:
# - MongoDB: Persistencia principal (90 días TTL)
# - Redis: Cache secundario rápido
# - Memory: Buffer ultra-rápido (1000 msgs)
# - Auto-failover: Si MongoDB falla → Redis → Memory
```

## 🏗️ Arquitectura Monolítica

```
┌─────────────────┐    ┌─────────────────┐    
│   Claude Code   │───▶│      Hook       │    
│                 │    │   (Python)      │    
└─────────────────┘    └─────────────────┘    
                                │
                                ▼
        ╔═══════════════════════════════════════════════╗
        ║              CONTENEDOR MONOLÍTICO            ║
        ║  ┌─────────────┐                             ║
        ║  │   Nginx     │ :3003 (Puerto expuesto)      ║
        ║  │ (Proxy)     │                             ║
        ║  └──────┬──────┘                             ║
        ║         │                                    ║
        ║         ▼                                    ║
        ║  ┌─────────────┐    ┌─────────────┐         ║
        ║  │  Node.js    │───▶│ MCP Server  │         ║
        ║  │ API :3000   │    │ (Integrado) │         ║
        ║  └──────┬──────┘    └─────────────┘         ║
        ║         │                                    ║
        ║  ┌──────▼──────┐    ┌─────────────┐         ║
        ║  │  MongoDB    │    │    Redis    │         ║
        ║  │  :27017     │    │    :6379    │         ║
        ║  │(Persistente)│    │   (Cache)   │         ║
        ║  └─────────────┘    └─────────────┘         ║
        ║                                              ║
        ║  ┌─────────────────────────────────────┐    ║
        ║  │        Memory Buffer (1000 msgs)    │    ║
        ║  │         Ultra-fast Access           │    ║
        ║  └─────────────────────────────────────┘    ║
        ║                                              ║
        ║         Gestionado por Supervisor           ║
        ╚═══════════════════════════════════════════════╝
```

## 📡 API Endpoints

### Core Endpoints

| Endpoint | Method | Descripción |
|----------|--------|-------------|
| `/health` | GET | Health check del sistema |
| `/api/log` | POST | Guardar mensaje de conversación |
| `/api/messages` | GET | Obtener mensajes recientes |
| `/api/sessions` | GET | Listar sesiones |
| `/api/search` | GET | Búsqueda de conversaciones |
| `/api/cleanup` | DELETE | Limpiar datos antiguos |

### Ejemplos de Uso

```bash
# Health Check
curl http://localhost:3003/health

# Buscar conversaciones
curl "http://localhost:3003/api/search?q=docker&days=7"

# Ver mensajes recientes
curl http://localhost:3003/api/messages
```

## 🤖 Servidor MCP Integrado

El servidor MCP proporciona herramientas nativas para que Claude acceda a las conversaciones almacenadas:

### 🛠️ Herramientas Disponibles

| Herramienta | Descripción | Parámetros |
|-------------|-------------|------------|
| **`search_conversations`** | Buscar en historial con priorización por frescura | `query`, `days`, `include_resolved`, `limit` |
| **`get_recent_conversations`** | Obtener conversaciones recientes priorizadas | `hours`, `project`, `limit` |
| **`analyze_conversation_patterns`** | Analizar patrones y temas en conversaciones | `days`, `project` |
| **`export_conversation`** | Exportar conversación completa en Markdown | `session_id` |

### 🚀 Configuración del MCP

1. **Asegurar que el contenedor está corriendo**:
   ```bash
   docker compose ps  # Debe mostrar el contenedor healthy
   ```

2. **Configurar MCP Server** (dos opciones disponibles):

   **🎯 Opción A: Usar .mcp.json del proyecto (recomendado)**
   
   El proyecto ya incluye `.mcp.json` preconfigurado:

   ```json
   {
     "mcpServers": {
       "conversation-logger": {
         "command": "node",
         "args": ["/home/uni/Escritorio/unicorp/unicorp/uniCommerce/claude-conversation-logger/src/mcp-server.js"],
         "env": {
           "API_URL": "http://localhost:3003",
           "API_KEY": "claude_api_secret_2024_change_me"
         }
       }
     }
   }
   ```

   **🔧 Opción B: Configuración global en settings.json**
   
   Si prefieres configuración global, agregar a `~/.claude/settings.json`:

   ```json
   {
     "mcp": {
       "mcpServers": {
         "conversation-logger": {
           "command": "node",
           "args": ["/tu/ruta/completa/claude-conversation-logger/src/mcp-server.js"],
           "env": {
             "API_URL": "http://localhost:3003",
             "API_KEY": "claude_api_secret_2024_change_me"
           }
         }
       }
     }
   }
   ```

   > **💡 Ventaja del .mcp.json**: Claude Code lo detecta automáticamente sin editar configuración global.

4. **Reiniciar Claude Code** para que tome la configuración

5. **Probar el MCP** - Ahora puedes usar comandos como:
   - "Busca conversaciones sobre docker en los últimos 3 días"
   - "Muéstrame las conversaciones más recientes"
   - "Analiza los patrones de mis conversaciones"
   - "Exporta la sesión XYZ en markdown"

### ⚡ Características Inteligentes

- 🔥 **Priorización por frescura**: Score dinámico basado en tiempo
- ✅ **Detección de resolución**: Identifica automáticamente problemas resueltos
- 🎯 **Filtrado inteligente**: Excluye conversaciones resueltas por defecto
- 📊 **Análisis de patrones**: Identifica proyectos activos, palabras clave y horarios
- 🏷️ **Categorización automática**: Por proyecto, sesión y tipo de mensaje
- 📈 **Métricas en tiempo real**: Actividad por horas y proyectos

### 🚀 **Rendimiento Optimizado**

- **⚡ Ultra-rápido**: Acceso instantáneo a mensajes en RAM
- **💾 Persistente**: Redis backup automático sin impacto en performance
- **🔄 Auto-scaling**: Se adapta automáticamente al volumen de datos
- **🧹 Self-cleaning**: Limpieza automática para evitar overflow
- **📈 Efficient**: Uso mínimo de recursos (~50MB RAM base)
- **🔒 Stable**: No dependencias de bases de datos complejas

## 🔧 Troubleshooting

### Common Issues and Solutions

#### ❌ **Hooks not triggering / Messages not being saved**

**Problem**: Configuration structure is incorrect.

**Solution**: Ensure your hooks have the exact nested structure:

```json
// ✅ CORRECT - Nested structure with "hooks" field
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
        ]
      }
    ]
  }
}

// ❌ INCORRECT - Missing nested "hooks" field
{
  "hooks": {
    "UserPromptSubmit": [
      {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
    ]
  }
}
```

#### ❌ **Only assistant messages saved, user messages missing**

**Problem**: Hook structure is incorrect or Claude Code needs restart.

**Solution**: 
1. Fix hook structure as shown above
2. Restart Claude Code completely
3. Test with: `./examples/hook-test.sh`

#### ❌ **Token counts seem incorrect**

**Explanation**: Claude Code includes internal processing overhead in token counts:
- `output_tokens` includes formatting and internal processing
- Actual visible response may be longer than reported tokens
- Cache tokens are created once per session, then reused

#### ❌ **Container not starting**

```bash
# Check logs
docker compose logs

# Rebuild if needed
docker compose down
docker compose up -d --build

# Verify health
curl http://localhost:3003/health
```

#### ❌ **MCP server not found**

**Solution A: Use project .mcp.json (easiest)**
```bash
# The project already includes .mcp.json with correct path
# Just restart Claude Code to detect it automatically
```

**Solution B: Fix global settings.json**
```bash
# Check absolute path in settings
pwd  # Copy this path

# Update settings.json with absolute path
"args": ["/absolute/path/to/claude-conversation-logger/src/mcp-server.js"]
```

**Verify MCP works:**
```bash
# Test MCP server directly
node src/mcp-server.js
# Should show: "🤖 MCP Server de Claude Conversation Logger iniciado"
```

## 🛠️ Desarrollo

### Estructura del Proyecto

```
claude-conversation-logger/
├── src/
│   └── server.js          # API Server con MCP integrado
├── config/
│   ├── supervisord.conf   # Configuración de Supervisor
│   ├── mongod.conf        # Configuración de MongoDB
│   ├── redis.conf         # Configuración de Redis
│   └── nginx.conf         # Configuración de Nginx proxy
├── scripts/
│   └── start.sh           # Script de inicialización del contenedor
├── .claude/
│   └── hooks/
│       └── api-logger.py  # Hook listo para usar
├── docker-compose.yml     # Contenedor monolítico
├── Dockerfile            # Imagen monolítica con todo incluido
└── README.md             # Esta documentación
```

### Comandos de Desarrollo

```bash
# Iniciar contenedor monolítico
docker compose up --build

# Ver logs del contenedor completo
docker compose logs -f

# Reconstruir el contenedor
docker compose up -d --build

# Verificar servicios dentro del contenedor
docker exec claude-logger-monolith supervisorctl status

# Acceder al contenedor
docker exec -it claude-logger-monolith bash

# Limpiar todo y empezar de nuevo
docker compose down -v
docker compose up -d --build
```

### Ventajas del Contenedor Monolítico

✅ **Simplicidad**: Un solo contenedor para gestionar  
✅ **Performance**: Comunicación interna sin overhead de red  
✅ **Portabilidad**: Fácil deployment en cualquier entorno  
✅ **Gestión**: Supervisor maneja todos los procesos automáticamente  
✅ **Debug**: Todos los logs en un lugar  
✅ **Recursos**: Uso optimizado de memoria y CPU  

### Servicios Incluidos

| Servicio | Puerto Interno | Estado | Función |
|----------|---------------|---------|----------|
| **Nginx** | 3003 (expuesto) | ✅ Running | Proxy reverso y balanceador |
| **Node.js API** | 3000 | ✅ Running | API REST y servidor MCP |
| **MongoDB** | 27017 | ✅ Running | Base de datos principal (90 días TTL) |
| **Redis** | 6379 | ✅ Running | Cache secundario rápido |
| **Memory Buffer** | - | ✅ Running | Buffer ultra-rápido (1000 msgs) |
| **Supervisor** | - | ✅ Running | Gestión de procesos |

### 💾 **Triple Storage System**

- **🗄️ MongoDB**: Persistencia principal con TTL de 90 días automático
- **🚀 Redis**: Cache secundario rápido para consultas frecuentes  
- **⚡ Memory**: Buffer ultra-rápido en RAM (1000 mensajes)
- **🔄 Auto-failover**: MongoDB → Redis → Memory (redundancia completa)
- **🧹 Auto-cleanup**: Limpieza automática en todos los niveles
- **📊 Smart routing**: Lee desde MongoDB, cache en Memory

## 🔧 Configuración Avanzada

### Personalizar Storage

El sistema usa storage híbrido optimizado:

```javascript
// Configurar límites de memoria
const MAX_MESSAGES = 1000;  // Mensajes en RAM
const REDIS_BACKUP_INTERVAL = 5000;  // ms para sync

// Personalizar auto-cleanup
const CLEANUP_OLDER_THAN = 7 * 24 * 60 * 60 * 1000;  // 7 días
```

### Personalizar Hook de Logging

El hook en `examples/hook-setup.py` puede ser modificado para:

- Filtrar ciertos tipos de mensajes
- Agregar metadata personalizada
- Enviar notificaciones
- Integrar con otros sistemas

### Health Monitoring

```bash
# Verificar estado de todos los servicios
curl http://localhost:3003/health

# Estadísticas del storage híbrido
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/stats

# Verificar mensajes almacenados
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/messages
```

## 📊 Monitoreo y Logs

### Ver logs en tiempo real

```bash
# Todos los servicios
docker compose logs -f

# Solo API
docker compose logs -f api

# Solo MongoDB
docker compose logs -f mongodb
```

### Métricas y Estadísticas

```bash
# Estado del sistema
curl http://localhost:3003/api/stats

# Conversaciones por proyecto
curl http://localhost:3003/api/analytics?group_by=project

# Actividad reciente
curl http://localhost:3003/api/activity?hours=24
```

## ❓ Troubleshooting

### Problemas Comunes

#### El hook no funciona

```bash
# 1. Verificar permisos
chmod +x ~/.claude/hooks/api-logger.py

# 2. Verificar que la API esté disponible
curl http://localhost:3003/health

# 3. Probar el hook manualmente
./examples/hook-test.sh

# 4. Verificar configuración de Claude Code
cat ~/.claude/settings.json

# 5. Debug del hook
echo '{"session_id":"test","hook_event_name":"UserPromptSubmit","prompt":"test","cwd":"'$(pwd)'"}' | \
  python3 ~/.claude/hooks/api-logger.py
```

#### El servidor MCP no conecta

```bash
# 1. Verificar ruta absoluta en settings.json
pwd  # Comparar con la ruta en settings.json

# 2. Probar el servidor MCP directamente
node src/mcp-server.js

# 3. Verificar variables de entorno
export API_URL="http://localhost:3003"
export API_KEY="claude_api_secret_2024_change_me"
node src/mcp-server.js

# 4. Debug de conexión
curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3003/api/messages?limit=1
```

#### API no responde

```bash
# Verificar que el contenedor está corriendo
docker compose ps

# Revisar logs
docker compose logs api

# Verificar conectividad
curl http://localhost:3003/health
```

#### Storage y performance

```bash
# Verificar storage híbrido
docker exec claude-logger-monolith curl -H "X-API-Key: claude_api_secret_2024_change_me" \
     http://localhost:3000/api/stats

# Ver uso de memoria
docker exec claude-logger-monolith ps aux | grep node

# Verificar Redis
docker exec claude-logger-monolith redis-cli ping
```

### Logs de Debug

Para habilitar logs detallados:

```bash
# Configurar en docker-compose.yml
environment:
  NODE_ENV: development
  DEBUG: "*"
```

## 🤝 Contribución

1. Fork el proyecto
2. Crear feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

MIT License - ver `LICENSE` para detalles.

## 🙏 Créditos

- Construido para [Claude Code](https://claude.ai/code)
- Usa [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
- Integración con MongoDB, Redis, y Docker

---

**⚡ Pro Tip**: Este sistema está diseñado para ser invisible. Una vez configurado, trabajará automáticamente en segundo plano, capturando todas tus conversaciones con Claude para búsqueda y análisis futuros.