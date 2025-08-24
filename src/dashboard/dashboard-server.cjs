const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from dashboard directory
app.use('/dashboard', express.static(__dirname));
app.use(express.static(__dirname));

// Mock data endpoints
app.get('/api/stats', (req, res) => {
  res.json({
    total_messages: 1366,
    messages_last_24h: 89,
    total_sessions: 9,
    active_projects: 5,
    projects: 5,
    project_activity: [
      { name: 'claude-conversation-logger', messages: 1166, sessions: 3, cost: 1.85 },
      { name: 'uniCommerce', messages: 192, sessions: 5, cost: 0.76 },
      { name: 'back_sync_tech_products', messages: 78, sessions: 1, cost: 0.31 },
      { name: 'scripts', messages: 35, sessions: 1, cost: 0.14 },
      { name: 'test-project', messages: 12, sessions: 3, cost: 0.05 }
    ],
    active_sessions: 1,
    total_cost: 2.73,
    estimated_cost: 2.73,
    total_tokens: 204500
  });
});

app.get('/api/conversations/tree', (req, res) => {
  res.json({
    projects: [
      {
        project_name: 'claude-conversation-logger',
        total_messages: 1166,
        message_count: 1166,
        last_activity: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
        sessions: [
          {
            session_id: 'ses_74bb1bdc_001',
            message_count: 42,
            last_message: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
            description: 'Dashboard functionality restoration',
            status: 'active',
            recent_messages: [
              {
                id: 'msg_001',
                type: 'user',
                content: 'estoy teniendo problemas con el dashboard, no carga',
                timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString()
              },
              {
                id: 'msg_002', 
                type: 'assistant',
                content: '¡Excelente! El dashboard está completamente funcional con todas las características restauradas',
                timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString()
              }
            ]
          },
          {
            session_id: 'ses_12345_test_002',
            message_count: 28,
            last_message: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
            description: 'gRPC to REST migration',
            status: 'completed',
            recent_messages: []
          },
          {
            session_id: 'ses_98765_test_003',
            message_count: 15,
            last_message: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            description: 'API service implementation',
            status: 'completed',
            recent_messages: []
          }
        ]
      },
      {
        project_name: 'uniCommerce',
        total_messages: 192,
        message_count: 192,
        last_activity: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        sessions: [
          {
            session_id: 'ses_unicom_001',
            message_count: 67,
            last_message: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            description: 'Microservices architecture review',
            status: 'completed',
            recent_messages: []
          },
          {
            session_id: 'ses_unicom_002',
            message_count: 45,
            last_message: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
            description: 'Docker configuration optimization',
            status: 'completed',
            recent_messages: []
          }
        ]
      },
      {
        project_name: 'back_sync_tech_products',
        total_messages: 78,
        message_count: 78,
        last_activity: new Date(Date.now() - 240 * 60 * 1000).toISOString(), // 4 hours ago
        sessions: [
          {
            session_id: 'ses_sync_001',
            message_count: 25,
            last_message: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
            description: 'NewBytes integration debugging',
            status: 'completed',
            recent_messages: []
          }
        ]
      },
      {
        project_name: 'scripts', 
        total_messages: 35,
        message_count: 35,
        last_activity: new Date(Date.now() - 360 * 60 * 1000).toISOString(), // 6 hours ago
        sessions: [
          {
            session_id: 'ses_scripts_001',
            message_count: 12,
            last_message: new Date(Date.now() - 360 * 60 * 1000).toISOString(),
            description: 'Automation script development',
            status: 'completed',
            recent_messages: []
          }
        ]
      },
      {
        project_name: 'test-project',
        total_messages: 12,
        message_count: 12,
        last_activity: new Date(Date.now() - 480 * 60 * 1000).toISOString(), // 8 hours ago
        sessions: [
          {
            session_id: 'ses_test_001',
            message_count: 3,
            last_message: new Date(Date.now() - 480 * 60 * 1000).toISOString(),
            description: 'Testing functionality',
            status: 'completed',
            recent_messages: []
          }
        ]
      }
    ],
    total_projects: 5,
    total_sessions: 9,
    total_messages: 1366
  });
});

app.get('/api/conversations/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  // Determine project based on session ID
  let project_name = 'claude-conversation-logger';
  let messages = [];
  
  if (sessionId.includes('74bb1bdc')) {
    project_name = 'claude-conversation-logger';
    messages = [
      {
        id: 'msg_001',
        type: 'user',
        content: 'estoy teniendo problemas con el dashboard, no carga\\n\\nUncaught TypeError: El especificador "@grpc/grpc-js" era un especificador básico, pero no se reasignó a nada\\n\\nusa playwgrith mcp para controlar y arreglarlo hasta que ande',
        timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString()
      },
      {
        id: 'msg_002',
        type: 'assistant', 
        content: 'Voy a ayudarte a solucionar el problema del dashboard usando Playwright MCP para controlar y arreglar el problema hasta que funcione correctamente.',
        timestamp: new Date(Date.now() - 119 * 60 * 1000).toISOString()
      },
      {
        id: 'msg_003',
        type: 'assistant',
        content: 'He identificado el problema: `grpc-service.js` estaba importando `@grpc/grpc-js` (biblioteca de Node.js) en el navegador, lo cual no es compatible.',
        timestamp: new Date(Date.now() - 89 * 60 * 1000).toISOString()
      },
      {
        id: 'msg_004',
        type: 'assistant',
        content: '¡Excelente! El dashboard está completamente funcional con todas las características restauradas:\\n\\n✅ Carga sin errores de `@grpc/grpc-js`\\n✅ Todas las secciones disponibles\\n✅ Navegación fluida entre vistas\\n✅ Estadísticas en tiempo real',
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      }
    ];
  } else {
    messages = [
      {
        id: 'msg_001',
        type: 'user',
        content: 'Sample conversation message',
        timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      },
      {
        id: 'msg_002',
        type: 'assistant',
        content: 'Sample assistant response',
        timestamp: new Date(Date.now() - 59 * 60 * 1000).toISOString()
      }
    ];
  }
  
  res.json({
    session_id: sessionId,
    project_name: project_name,
    created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    messages: messages,
    total_messages: messages.length,
    total_tokens: messages.length * 425,
    estimated_cost: messages.length * 0.012
  });
});

// Search endpoint
app.get('/api/search/advanced', (req, res) => {
  const { q } = req.query;
  
  res.json({
    results: [
      {
        session_id: 'ses_74bb1bdc_001',
        project_name: 'claude-conversation-logger',
        message_excerpt: `Problema con dashboard: ${q || 'search query'}`,
        message_count: 42,
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      }
    ],
    total_results: 1,
    query: q
  });
});

// Default route serves the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 3005;
app.listen(PORT, () => {
  console.log('🚀 Dashboard test server running on http://localhost:3005');
  console.log('📊 Mock data includes:');
  console.log('   - 1366 total messages');
  console.log('   - 9 total sessions');
  console.log('   - 5 active projects');
  console.log('   - $2.73 estimated cost');
  console.log('   - Real-time session: 74bb1bdc (En vivo)');
});