FROM ubuntu:22.04

# Evitar prompts interactivos
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Instalar curl primero para health checks
RUN apt-get update && apt-get install -y curl

# Instalar dependencias base del sistema
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    lsb-release \
    ca-certificates \
    supervisor \
    nginx \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

# Instalar Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Instalar MongoDB 7.0
RUN wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | apt-key add - \
    && echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update \
    && apt-get install -y mongodb-org \
    && rm -rf /var/lib/apt/lists/*

# Crear directorios
RUN mkdir -p /app/data/mongodb /app/data/redis /app/logs \
    /var/log/supervisor /etc/supervisor/conf.d \
    /data/db /var/lib/redis /var/log/mongodb /var/log/redis

# Configurar permisos
RUN chown -R mongodb:mongodb /data/db /app/data/mongodb /var/log/mongodb \
    && chown -R redis:redis /var/lib/redis /app/data/redis \
    && chown -R www-data:www-data /var/log/nginx

# Configurar aplicación Node.js
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Copiar archivos de Vue.js y Axios desde node_modules a assets
RUN mkdir -p ./src/dashboard/assets && \
    cp ./node_modules/vue/dist/vue.global.js ./src/dashboard/assets/ && \
    cp ./node_modules/axios/dist/axios.min.js ./src/dashboard/assets/

COPY src/ ./src/

# Crear usuario para la aplicación
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 appuser \
    && chown -R appuser:appuser /app

# Copiar configuraciones
COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY config/mongod.conf /etc/mongod.conf
COPY config/redis.conf /etc/redis/redis.conf
COPY config/nginx.conf /etc/nginx/sites-enabled/default

# Script de inicio
COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

# Exponer puertos
EXPOSE 3003 50051

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Comando de inicio
CMD ["/start.sh"]