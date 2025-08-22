#!/usr/bin/env python3
"""
Claude Conversation Logger Hook - Production Ready
Captures complete conversations using Claude Code hooks and Triple Storage System.

Features:
- UserPromptSubmit: Captures user messages
- Stop: Extracts assistant responses from transcript with improved token parsing
- SessionStart: Logs session initialization  
- Triple Storage: MongoDB (primary) → Redis (cache) → Memory (buffer)
- Auto-failover and 90-day TTL
- Improved Token Accuracy: Accumulates streaming response chunks for precise usage statistics

Version: 2.1 - Enhanced Token Parsing
"""
import json
import sys
import requests
import os
from datetime import datetime

# API Configuration
API_BASE_URL = 'http://localhost:3003'
API_KEY = 'claude_api_secret_2024_change_me'

def send_to_api(endpoint, data):
    """Send data to the logging API"""
    try:
        url = f"{API_BASE_URL}/api/{endpoint}"
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
        }
        
        response = requests.post(
            url, 
            json=data, 
            headers=headers,
            timeout=5
        )
        
        if response.status_code in [200, 202]:
            return True
        else:
            print(f"API error: {response.status_code} - {response.text}", file=sys.stderr)
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"Network error: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return False

def parse_usage_tokens(usage_data):
    """Parse usage data according to OpenTelemetry specification"""
    if not usage_data or not isinstance(usage_data, dict):
        return []
    
    token_records = []
    
    # Map Claude usage fields to OpenTelemetry token types
    token_mapping = {
        'input_tokens': 'input',
        'output_tokens': 'output', 
        'cache_creation_input_tokens': 'cacheCreation',
        'cache_read_input_tokens': 'cacheRead'
    }
    
    for usage_field, otel_type in token_mapping.items():
        token_count = usage_data.get(usage_field, 0)
        if token_count > 0:  # Only record non-zero token counts
            token_records.append({
                'type': otel_type,
                'token_count': token_count
            })
    
    return token_records

def estimate_cost_usd(usage_data, model):
    """Estimate cost in USD based on usage and model"""
    if not usage_data or not isinstance(usage_data, dict):
        return 0.0
    
    # Approximate pricing for Claude models (as of 2024)
    # These are estimates - actual costs may vary
    pricing = {
        'claude-3-5-sonnet-20241022': {
            'input': 0.000003,   # $3 per 1M tokens
            'output': 0.000015,  # $15 per 1M tokens
            'cache_read': 0.0000003,   # $0.30 per 1M tokens
            'cache_write': 0.000003    # $3.75 per 1M tokens
        }
    }
    
    model_pricing = pricing.get(model, pricing['claude-3-5-sonnet-20241022'])
    
    total_cost = 0.0
    total_cost += usage_data.get('input_tokens', 0) * model_pricing['input']
    total_cost += usage_data.get('output_tokens', 0) * model_pricing['output']
    total_cost += usage_data.get('cache_read_input_tokens', 0) * model_pricing['cache_read']
    total_cost += usage_data.get('cache_creation_input_tokens', 0) * model_pricing['cache_write']
    
    return round(total_cost, 6)  # Round to 6 decimal places

def extract_session_description(content, max_length=80):
    """Extract a meaningful description from the first user message"""
    if not content or not isinstance(content, str):
        return "Sin descripción"
    
    # Clean the content
    content = content.strip()
    
    # Remove common prefixes
    prefixes_to_remove = [
        "necesito", "quiero", "puedes", "ayuda", "ayúdame", 
        "me puedes", "podrías", "quisiera", "tengo que",
        "hola", "buenas", "good", "hello"
    ]
    
    content_lower = content.lower()
    for prefix in prefixes_to_remove:
        if content_lower.startswith(prefix):
            content = content[len(prefix):].strip()
            break
    
    # Remove question marks and exclamations from start
    content = content.lstrip('¿?¡!')
    
    # Truncate to max length preserving word boundaries
    if len(content) <= max_length:
        return content.capitalize()
    
    # Find last space before max_length
    truncated = content[:max_length]
    last_space = truncated.rfind(' ')
    
    if last_space > max_length * 0.7:  # Only cut at word boundary if it's not too short
        truncated = content[:last_space]
    
    return (truncated + "...").capitalize()

def categorize_message(content):
    """Automatically categorize a message based on keywords"""
    if not content or not isinstance(content, str):
        return "📝 General"
    
    content_lower = content.lower()
    
    # Define categories with their keywords
    categories = {
        "🐛 Bug Fix": [
            "error", "fix", "bug", "problema", "falla", "fail", "reparar", 
            "corregir", "solucionar", "rompe", "broken", "issue"
        ],
        "✨ Feature": [
            "agregar", "nueva", "nuevo", "implementar", "crear", "add", "create",
            "feature", "funcionalidad", "añadir", "develop", "build"
        ],
        "🔧 Config": [
            "configurar", "config", "setup", "instalar", "install", "docker",
            "environment", "env", "variable", "setting", "deploy"
        ],
        "📚 Docs": [
            "documentación", "docs", "readme", "explicar", "explain", 
            "documentation", "comment", "comentario", "describe"
        ],
        "🎨 UI/UX": [
            "diseño", "design", "frontend", "css", "style", "componente", 
            "component", "interfaz", "ui", "ux", "visual", "theme"
        ],
        "🔄 Refactor": [
            "refactorizar", "refactor", "mejorar", "improve", "optimizar", 
            "optimize", "clean", "restructure", "reorganize"
        ],
        "🔍 Debug": [
            "debug", "debuggear", "investigate", "investigar", "analizar", 
            "analyze", "check", "revisar", "trace", "log"
        ],
        "🗄️ Database": [
            "database", "db", "mongo", "sql", "query", "tabla", "collection",
            "schema", "migration", "datos", "data"
        ],
        "🔐 Security": [
            "security", "auth", "authentication", "authorization", "login",
            "seguridad", "permisos", "permissions", "token", "oauth"
        ],
        "🚀 Deploy": [
            "deploy", "deployment", "production", "prod", "release", 
            "kubernetes", "k8s", "staging", "publish"
        ]
    }
    
    # Count matches for each category
    category_scores = {}
    for category, keywords in categories.items():
        score = sum(1 for keyword in keywords if keyword in content_lower)
        if score > 0:
            category_scores[category] = score
    
    # Return the category with highest score, or default
    if category_scores:
        return max(category_scores, key=category_scores.get)
    
    return "📝 General"

def send_session_description_update(session_id, project_name, description, category):
    """Send session description update to the API"""
    try:
        url = f"{API_BASE_URL}/api/sessions/{session_id}/description"
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
        }
        
        data = {
            'session_id': session_id,
            'project_name': project_name,
            'description': description,
            'category': category,
            'updated_at': datetime.now().isoformat()
        }
        
        response = requests.post(url, json=data, headers=headers, timeout=5)
        
        if response.status_code in [200, 201, 202]:
            return True
        else:
            print(f"Description update failed: {response.status_code}", file=sys.stderr)
            return False
            
    except Exception as e:
        print(f"Description update error: {e}", file=sys.stderr)
        return False

def parse_transcript_for_last_assistant_message(transcript_path):
    """Parse transcript to extract the last assistant message with improved token parsing"""
    
    if not os.path.exists(transcript_path):
        return None
    
    last_assistant_message = None
    accumulated_usage = None
    first_timestamp = None
    last_timestamp = None
    
    try:
        with open(transcript_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                    
                try:
                    entry = json.loads(line)
                    
                    # Look for assistant messages and accumulate content
                    if entry.get('type') == 'assistant' and entry.get('message'):
                        content_array = entry['message'].get('content', [])
                        text_content = ""
                        
                        for item in content_array:
                            if item.get('type') == 'text':
                                text_content += item.get('text', '')
                        
                        # Track timestamps for duration calculation
                        entry_timestamp = entry.get('timestamp', '')
                        if entry_timestamp:
                            if not first_timestamp:
                                first_timestamp = entry_timestamp
                            last_timestamp = entry_timestamp
                        
                        # Get usage from the entry - it may only appear in the last chunk
                        current_usage = entry['message'].get('usage', {})
                        if current_usage and any(current_usage.values()):
                            accumulated_usage = current_usage
                        
                        # Always update with the latest content (accumulates all chunks)
                        if text_content:
                            # If we already have a message, append to it
                            if last_assistant_message and last_assistant_message.get('content'):
                                last_assistant_message['content'] += text_content
                            else:
                                last_assistant_message = {
                                    'content': text_content,
                                    'timestamp': entry.get('timestamp', ''),
                                    'uuid': entry.get('uuid', ''),
                                    'model': entry['message'].get('model', '')
                                }
                            
                            # Update with latest metadata
                            last_assistant_message['timestamp'] = entry.get('timestamp', '')
                            last_assistant_message['uuid'] = entry.get('uuid', '')
                            
                except json.JSONDecodeError:
                    continue
            
            # Apply the accumulated usage to the final message
            if last_assistant_message and accumulated_usage:
                last_assistant_message['usage'] = accumulated_usage
                
                # Calculate duration if we have timestamps
                duration_ms = 0
                if first_timestamp and last_timestamp and first_timestamp != last_timestamp:
                    try:
                        from datetime import datetime
                        first_dt = datetime.fromisoformat(first_timestamp.replace('Z', '+00:00'))
                        last_dt = datetime.fromisoformat(last_timestamp.replace('Z', '+00:00'))
                        duration_ms = int((last_dt - first_dt).total_seconds() * 1000)
                    except:
                        duration_ms = 0
                
                last_assistant_message['duration_ms'] = duration_ms
                last_assistant_message['cost_usd'] = estimate_cost_usd(
                    accumulated_usage, 
                    last_assistant_message.get('model', '')
                )
                    
    except Exception as e:
        print(f"Error parsing transcript: {e}", file=sys.stderr)
    
    return last_assistant_message

def main():
    try:
        # Read hook input
        input_data = json.load(sys.stdin)
        
        session_id = input_data.get('session_id', 'unknown')
        hook_event = input_data.get('hook_event_name', 'unknown')
        cwd = input_data.get('cwd', os.getcwd())
        project_name = os.path.basename(cwd)
        transcript_path = input_data.get('transcript_path', '')
        
        # Skip if API is not available (fail silently)
        try:
            response = requests.get(f"{API_BASE_URL}/health", timeout=2)
            if response.status_code != 200:
                sys.exit(0)
        except:
            sys.exit(0)  # API not available, exit silently
        
        # Handle different hook events
        if hook_event == 'Stop' and transcript_path:
            # Parse the transcript to get the last assistant message
            assistant_msg = parse_transcript_for_last_assistant_message(transcript_path)
            
            if assistant_msg:
                # Send the assistant's response to the API
                send_to_api('log', {
                    'session_id': session_id,
                    'project_name': project_name,
                    'hook_event': 'Stop',
                    'message_type': 'assistant',
                    'content': assistant_msg['content'],
                    'metadata': {
                        'source': 'stop_hook_assistant',
                        'model': assistant_msg.get('model', 'unknown'),
                        'usage': assistant_msg.get('usage', {}),
                        'uuid': assistant_msg.get('uuid', ''),
                        'cost_usd': assistant_msg.get('cost_usd', 0.0),
                        'duration_ms': assistant_msg.get('duration_ms', 0)
                    }
                })
                
                # Send separate token usage events (OpenTelemetry compliant)
                usage_data = assistant_msg.get('usage', {})
                if usage_data:
                    token_records = parse_usage_tokens(usage_data)
                    model = assistant_msg.get('model', 'unknown')
                    
                    for token_record in token_records:
                        send_to_api('token-usage', {
                            'session_id': session_id,
                            'project_name': project_name,
                            'hook_event': 'TokenUsage',
                            'message_type': 'token_metric',
                            'content': f"Token usage: {token_record['type']} = {token_record['token_count']}",
                            'metadata': {
                                'source': 'opentelemetry_token_tracking',
                                'model': model,
                                'token_type': token_record['type'],
                                'token_count': token_record['token_count'],
                                'cost_usd': assistant_msg.get('cost_usd', 0.0),
                                'duration_ms': assistant_msg.get('duration_ms', 0),
                                'uuid': assistant_msg.get('uuid', ''),
                                'timestamp': assistant_msg.get('timestamp', '')
                            }
                        })
            
        elif hook_event == 'UserPromptSubmit':
            prompt = input_data.get('prompt', '[prompt not captured]')
            
            # Send the user message
            send_to_api('log', {
                'session_id': session_id,
                'project_name': project_name,
                'hook_event': hook_event,
                'message_type': 'user',
                'content': prompt,
                'metadata': {
                    'source': 'user_prompt_hook'
                }
            })
            
            # Check if this might be the first user message in the session
            # We'll try to extract description and category
            if prompt and len(prompt.strip()) > 10:  # Only process meaningful messages
                description = extract_session_description(prompt)
                category = categorize_message(prompt)
                
                # Send description update (this will create or update the session description)
                send_session_description_update(session_id, project_name, description, category)
            
        elif hook_event == 'PostToolUse':
            tool_name = input_data.get('tool_name', 'unknown')
            tool_input = input_data.get('tool_input', {})
            
            # Create readable tool summary
            content = f"Used tool: {tool_name}"
            if tool_name == 'Bash':
                command = tool_input.get('command', '')
                content = f"Bash: {command}"
            elif tool_name in ['Edit', 'Write', 'Read']:
                file_path = tool_input.get('file_path', '')
                content = f"{tool_name}: {file_path}"
            
            send_to_api('log', {
                'session_id': session_id,
                'project_name': project_name,
                'hook_event': hook_event,
                'message_type': 'tool',
                'content': content,
                'metadata': {
                    'tool_name': tool_name,
                    'tool_input': tool_input,
                    'source': 'tool_hook'
                }
            })
            
        elif hook_event == 'SessionStart':
            source = input_data.get('source', 'unknown')
            send_to_api('log', {
                'session_id': session_id,
                'project_name': project_name,
                'hook_event': hook_event,
                'message_type': 'system',
                'content': f'Session started (source: {source})',
                'metadata': {
                    'source': 'session_start_hook',
                    'start_source': source
                }
            })
        
        # Always exit successfully to avoid blocking Claude Code
        sys.exit(0)
        
    except Exception as e:
        # Log error but don't interrupt Claude Code
        print(f"API logger error: {e}", file=sys.stderr)
        sys.exit(0)

if __name__ == '__main__':
    main()