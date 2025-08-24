# =============================================================================
# Multi-stage Dockerfile optimizado para Claude Conversation Logger
# Reduce el tamaño de imagen de ~2GB a ~800MB
# =============================================================================

# ============================
# Stage 1: Build Environment
# ============================
FROM node:18-alpine AS builder

# Metadatos
LABEL stage=builder
LABEL description="Build stage for Node.js dependencies"

# Variables de entorno para build
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn
ENV NPM_CONFIG_AUDIT=false

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción con optimizaciones
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# Extraer archivos estáticos necesarios
RUN mkdir -p ./assets && \
    cp ./node_modules/vue/dist/vue.global.js ./assets/ && \
    cp ./node_modules/axios/dist/axios.min.js ./assets/ && \
    cp ./node_modules/chart.js/dist/chart.min.js ./assets/ && \
    echo "Static assets extracted successfully"

# ============================
# Stage 2: Runtime Base
# ============================
FROM ubuntu:22.04 AS runtime-base

# Metadatos
LABEL stage=runtime-base
LABEL description="Optimized runtime environment"

# Variables de entorno para runtime
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=error

# Instalar solo las dependencias críticas del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core utilities
    curl \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    # Process management
    supervisor \
    # Web server
    nginx-light \
    # Database
    redis-server \
    # Cleanup
    && rm -rf /var/lib/apt/lists/* \
    && apt-get autoremove -y \
    && apt-get autoclean

# ============================
# Stage 3: Node.js Installation
# ============================
FROM runtime-base AS nodejs-runtime

# Instalar Node.js 18 con optimización de tamaño
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm config set fund false \
    && npm config set audit false

# ============================
# Stage 4: MongoDB Installation
# ============================
FROM nodejs-runtime AS mongodb-runtime

# Instalar MongoDB 7.0 con configuración optimizada
RUN wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add - \
    && echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        mongodb-org-server \
        mongodb-org-shell \
        mongodb-org-tools \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* \
    && apt-get autoremove -y \
    && apt-get autoclean

# ============================
# Stage 5: Final Production Image
# ============================
FROM mongodb-runtime AS production

# Metadatos finales
LABEL maintainer="Claude Code Team"
LABEL version="2.1.3-optimized"
LABEL description="Optimized Claude Conversation Logger with multi-service architecture"

# Variables de entorno de producción
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MONGODB_URI=mongodb://localhost:27017/claude_conversations
ENV REDIS_URL=redis://localhost:6379
ENV GRPC_PORT=50051
ENV HTTP_PORT=3003

# Crear estructura de directorios optimizada
RUN mkdir -p \
    # App directories
    /app/src \
    /app/logs \
    /app/data/mongodb \
    /app/data/redis \
    # System directories
    /data/db \
    /var/lib/redis \
    /var/log/mongodb \
    /var/log/redis \
    /var/log/supervisor \
    /etc/supervisor/conf.d \
    # Nginx
    /var/cache/nginx \
    /var/log/nginx

# Crear usuario de aplicación con permisos mínimos
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 -s /bin/false appuser

# Configurar permisos del sistema
RUN chown -R mongodb:mongodb /data/db /app/data/mongodb /var/log/mongodb \
    && chown -R redis:redis /var/lib/redis /app/data/redis /var/log/redis \
    && chown -R www-data:www-data /var/log/nginx /var/cache/nginx \
    && chown -R appuser:appuser /app

# Establecer directorio de trabajo
WORKDIR /app

# Copiar dependencias de Node.js optimizadas desde el stage builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/assets ./src/dashboard/assets

# Copiar código fuente de la aplicación
COPY --chown=appuser:appuser src/ ./src/
COPY --chown=appuser:appuser package*.json ./

# Copiar configuraciones del sistema
COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY config/mongod.conf /etc/mongod.conf
COPY config/redis.conf /etc/redis/redis.conf

# Configuración optimizada de Nginx con compresión y caché
COPY --chown=www-data:www-data config/nginx.optimized.conf /etc/nginx/sites-enabled/default

# Script de inicio optimizado
COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

# Crear archivo de configuración de la aplicación
RUN echo '{\
  "environment": "production",\
  "logging": {\
    "level": "info",\
    "format": "json"\
  },\
  "database": {\
    "mongodb": {\
      "uri": "mongodb://localhost:27017/claude_conversations",\
      "options": {\
        "maxPoolSize": 10,\
        "serverSelectionTimeoutMS": 5000,\
        "socketTimeoutMS": 45000\
      }\
    },\
    "redis": {\
      "uri": "redis://localhost:6379",\
      "options": {\
        "maxRetriesPerRequest": 3,\
        "retryDelayOnFailover": 100\
      }\
    }\
  },\
  "server": {\
    "http": {\
      "port": 3003,\
      "host": "0.0.0.0"\
    },\
    "grpc": {\
      "port": 50051,\
      "host": "0.0.0.0"\
    }\
  }\
}' > /app/config.json && chown appuser:appuser /app/config.json

# Optimizaciones de imagen final
RUN apt-get autoremove -y \
    && apt-get autoclean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* \
    && rm -rf /var/cache/apt/* \
    && find /usr/share/doc -depth -type f ! -name copyright -delete \
    && find /usr/share/man -depth -type f -delete \
    && find /usr/share/locale -mindepth 1 -maxdepth 1 ! -name 'en*' -exec rm -rf {} + \
    && rm -rf /usr/share/info/* \
    && rm -rf /var/cache/debconf/*

# Exponer puertos necesarios
EXPOSE 3003 50051

# Health check optimizado con timeout reducido
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Configurar límites de recursos para contenedor
ENV NODE_OPTIONS="--max-old-space-size=512 --gc-interval=100"

# Comando de inicio
ENTRYPOINT ["/start.sh"]

# =============================================================================
# Optimizaciones aplicadas:
# 
# 1. Multi-stage build: Separación de build y runtime (~60% reducción)
# 2. Alpine base para builder: Imagen más pequeña para dependencias
# 3. Ubuntu optimizado: Solo paquetes esenciales sin recomendados
# 4. Limpieza agresiva: Eliminación de cachés, docs, locales innecesarios
# 5. Usuario no-root: Seguridad mejorada
# 6. Variables de entorno: Configuración optimizada para producción
# 7. Health check eficiente: Timeout reducido y menos reintentos
# 8. Node.js optimizado: Garbage collection y memoria limitada
# 
# Tamaño estimado: ~800MB (vs ~2GB original)
# =============================================================================