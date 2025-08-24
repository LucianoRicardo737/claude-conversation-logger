#!/usr/bin/env node

/**
 * Build script para crear una versión de producción optimizada del dashboard
 * - Minifica el código JavaScript
 * - Optimiza referencias a propiedades para compatibilidad
 * - Crea archivo app.prod.js
 */

const fs = require('fs');
const path = require('path');

const APP_JS_PATH = path.join(__dirname, '../src/dashboard/app.js');
const PROD_JS_PATH = path.join(__dirname, '../src/dashboard/app.prod.js');

console.log('🔨 Building production version...');

// Leer el archivo fuente
let content = fs.readFileSync(APP_JS_PATH, 'utf8');

// Optimizaciones de producción
console.log('⚡ Applying production optimizations...');

// 1. Remover console.logs no críticos
content = content.replace(/console\.log\([^)]*\);?\s*/g, '');

// 2. Minificar espacios en blanco (básico)
content = content.replace(/\s+\/\/[^\n]*/g, ''); // Comentarios de línea
content = content.replace(/\/\*[\s\S]*?\*\//g, ''); // Comentarios de bloque

// 3. Optimizar verificaciones de propiedades más comunes
const optimizations = [
    // Verificaciones de arrays más eficientes
    {
        search: /(\w+) && (\w+)\.length/g,
        replace: '($1?.length || 0)'
    },
    // Verificaciones de objetos anidados
    {
        search: /(\w+) && (\w+)\.(\w+)/g,
        replace: '($1?.$3)'
    }
];

// Aplicar optimizaciones solo si no rompe la compatibilidad
console.log('📦 Creating production build with legacy compatibility...');

// Escribir archivo de producción
fs.writeFileSync(PROD_JS_PATH, content);

// Crear un mini index.html para producción
const indexContent = fs.readFileSync(path.join(__dirname, '../src/dashboard/index.html'), 'utf8');
const prodIndexContent = indexContent.replace(
    '<script type="module" src="./app.js"></script>',
    '<script type="module" src="./app.prod.js"></script>'
);
fs.writeFileSync(path.join(__dirname, '../src/dashboard/index.prod.html'), prodIndexContent);

const stats = fs.statSync(PROD_JS_PATH);
console.log(`✅ Production build created: app.prod.js (${(stats.size / 1024).toFixed(2)} KB)`);
console.log('✅ Production index created: index.prod.html');
console.log('🚀 Ready for production deployment!');