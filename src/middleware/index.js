import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import express from 'express';

/**
 * Security middleware with enhanced configuration
 */
export const setupSecurity = (app) => {
    // Basic security headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:"],
                fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }));

    // CORS configuration
    app.use(cors({
        origin: process.env.NODE_ENV === 'production' ? 
            ['http://localhost:3003', 'https://your-domain.com'] : '*',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        exposedHeaders: ['Content-Disposition']
    }));

    // Compression
    app.use(compression({
        filter: (req, res) => {
            if (req.headers['x-no-compression']) return false;
            return compression.filter(req, res);
        },
        level: 6,
        threshold: 1024
    }));
};

/**
 * Request parsing middleware
 */
export const setupParsing = (app) => {
    app.use(express.json({ 
        limit: '10mb',
        strict: true
    }));
    app.use(express.urlencoded({ 
        extended: true, 
        limit: '10mb' 
    }));
};

/**
 * Logging middleware with custom format
 */
export const setupLogging = (app) => {
    const logFormat = process.env.NODE_ENV === 'production' ? 
        'combined' : 'dev';

    app.use(morgan(logFormat, {
        skip: (req) => req.url === '/health',
        stream: process.stdout
    }));
};

/**
 * API Key validation middleware
 */
export const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.API_SECRET || 'claude_api_secret_2024_change_me';
    
    if (apiKey !== expectedKey) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Invalid API key',
            timestamp: new Date().toISOString()
        });
    }
    
    next();
};

/**
 * Error handling middleware
 */
export const setupErrorHandling = (app) => {
    // 404 handler
    app.use('*', (req, res) => {
        res.status(404).json({
            error: 'Not Found',
            message: `Route ${req.method} ${req.originalUrl} not found`,
            timestamp: new Date().toISOString()
        });
    });

    // Global error handler
    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        
        const status = err.status || err.statusCode || 500;
        const message = process.env.NODE_ENV === 'production' ? 
            'Internal Server Error' : err.message;

        res.status(status).json({
            error: 'Server Error',
            message,
            timestamp: new Date().toISOString(),
            ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
        });
    });
};

/**
 * Request timeout middleware
 */
export const timeoutMiddleware = (timeout = 30000) => (req, res, next) => {
    res.setTimeout(timeout, () => {
        res.status(408).json({
            error: 'Request Timeout',
            message: 'Request took too long to process',
            timestamp: new Date().toISOString()
        });
    });
    next();
};

/**
 * Rate limiting middleware (simple in-memory implementation)
 */
const requests = new Map();
export const rateLimitMiddleware = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!requests.has(ip)) {
            requests.set(ip, []);
        }

        const userRequests = requests.get(ip);
        const validRequests = userRequests.filter(time => time > windowStart);
        requests.set(ip, validRequests);

        if (validRequests.length >= maxRequests) {
            return res.status(429).json({
                error: 'Too Many Requests',
                message: 'Rate limit exceeded',
                retryAfter: Math.ceil(windowMs / 1000),
                timestamp: new Date().toISOString()
            });
        }

        validRequests.push(now);
        requests.set(ip, validRequests);

        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', maxRequests - validRequests.length);
        res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

        next();
    };
};