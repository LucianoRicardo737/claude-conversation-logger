# 🔧 Token Usage Fix - OpenTelemetry Compliance

## ❌ **Problema Identificado**

El sistema anterior de registro de tokens **NO cumplía** con la especificación OpenTelemetry:

### **Problemas Específicos:**
1. **Estructura incorrecta**: Se enviaba `usage` completo sin mapear tipos
2. **Sin separación por tipo**: OpenTelemetry requiere eventos separados por cada tipo de token
3. **Metadatos faltantes**: `cost_usd`, `duration_ms` no se calculaban
4. **Mapeo incorrecto**: Los campos de Claude no se mapeaban a tipos OpenTelemetry

## ✅ **Solución Implementada**

### **1. Mapeo Correcto según OpenTelemetry**
```python
# Mapeo Claude → OpenTelemetry
{
    'input_tokens': 'input',           # Tokens de entrada
    'output_tokens': 'output',         # Tokens de salida  
    'cache_creation_input_tokens': 'cacheCreation',  # Creación de caché
    'cache_read_input_tokens': 'cacheRead'          # Lectura de caché
}
```

### **2. Funciones Nuevas Implementadas**

#### `parse_usage_tokens(usage_data)`
- **Propósito**: Mapea datos de usage a tipos OpenTelemetry
- **Input**: `{"input_tokens": 45, "output_tokens": 25, ...}`
- **Output**: `[{"type": "input", "token_count": 45}, {"type": "output", "token_count": 25}]`

#### `estimate_cost_usd(usage_data, model)`
- **Propósito**: Calcula costo estimado en USD
- **Precios**: Claude 3.5 Sonnet aproximados
- **Precisión**: 6 decimales

#### Mejoras en `parse_transcript_for_last_assistant_message()`
- **Cálculo de duración**: Basado en timestamps
- **Costo automático**: Calculado por modelo
- **Metadatos completos**: Todos los campos requeridos

### **3. Registro Separado por Tipo**

**ANTES (❌ Incorrecto):**
```python
# Un solo evento con usage completo
{
    'metadata': {
        'usage': {'input_tokens': 45, 'output_tokens': 25}  # ❌ No OpenTelemetry compliant
    }
}
```

**DESPUÉS (✅ Correcto):**
```python
# Evento principal + eventos separados de tokens
{
    'metadata': {
        'usage': {...},           # ✅ Mantiene compatibilidad
        'cost_usd': 0.001125,     # ✅ Nuevo
        'duration_ms': 2666       # ✅ Nuevo  
    }
}

# + Eventos separados por tipo
{
    'hook_event': 'TokenUsage',
    'message_type': 'token_metric',
    'metadata': {
        'token_type': 'input',    # ✅ OpenTelemetry compliant
        'token_count': 45,        # ✅ Específico
        'model': 'claude-3-5-sonnet-20241022'
    }
}
```

## 🧪 **Validación Completa**

### **Tests Implementados:**
```bash
cd examples/
python3 test-corrected-tokens.py
```

### **Resultados de Tests:**
- ✅ **Token parsing**: 3 tipos mapeados correctamente
- ✅ **Estimación de costos**: $0.011130 calculado correctamente  
- ✅ **Parsing de transcript**: Contenido + metadatos + duración
- ✅ **Compliance OpenTelemetry**: Todos los tipos requeridos presentes

## 📊 **Métricas OpenTelemetry Generadas**

El sistema ahora genera exactamente lo que espera OpenTelemetry:

### **claude_code.token.usage**
```json
{
    "attributes": {
        "type": "input",                    // ✅ OpenTelemetry type
        "model": "claude-3-5-sonnet-20241022",
        "session.id": "session_123",
        "token_count": 45                   // ✅ Valor específico
    }
}
```

### **claude_code.cost.usage**
```json
{
    "attributes": {
        "model": "claude-3-5-sonnet-20241022",
        "cost_usd": 0.001125,              // ✅ Calculado automáticamente
        "duration_ms": 2666                // ✅ Tiempo real de respuesta
    }
}
```

## 🔄 **Compatibilidad**

### **Backward Compatible:**
- ✅ Mantiene el endpoint `/api/log` existente
- ✅ Conserva estructura de metadata original
- ✅ No rompe sistema actual de logging

### **Forward Compatible:**
- ✅ Agrega endpoint `/api/token-usage` para métricas
- ✅ Sigue especificación OpenTelemetry exacta
- ✅ Preparado para integración directa

## 🚀 **Beneficios**

### **Antes del Fix:**
- ❌ Tokens mal reportados
- ❌ Sin costos calculados  
- ❌ Sin duración de requests
- ❌ Incompatible con herramientas OpenTelemetry

### **Después del Fix:**
- ✅ **Precisión**: Tokens reportados por tipo exacto
- ✅ **Costos**: Estimación automática por modelo
- ✅ **Performance**: Duración de requests tracked
- ✅ **Estándar**: 100% compatible con OpenTelemetry spec
- ✅ **Monitoreo**: Listo para Prometheus, Grafana, DataDog

## 📋 **Próximos Pasos**

1. **Backup del archivo anterior**: `cp api-logger.py api-logger.py.backup`
2. **Implementar en producción**: Usar la versión corregida
3. **Monitorear**: Verificar logs de token-usage en dashboard
4. **Optimizar**: Ajustar precios cuando tengamos datos reales

---

## 🔗 **Referencias**

- **[OpenTelemetry Token Metrics](https://opentelemetry.io/docs/specs/otel/metrics/api/)**: Especificación oficial
- **[Claude Code Monitoring](https://docs.anthropic.com/en/docs/claude-code/monitoring-usage)**: Documentación específica  
- **[Test Results](./test-corrected-tokens.py)**: Tests de validación completos