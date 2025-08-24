#!/usr/bin/env python3
"""
Claude Conversation Logger Hook - Optimized Production Ready
Captures complete conversations using Claude Code hooks and Triple Storage System.

Features:
- UserPromptSubmit: Captures user messages
- Stop: Extracts assistant responses from transcript with improved token parsing
- SessionStart/SessionEnd: Logs session lifecycle
- PreToolUse/PostToolUse: Tracks tool execution
- Triple Storage: MongoDB (primary) → Redis (cache) → Memory (buffer)
- Auto-failover and 90-day TTL
- Duplicate Prevention: Prevents excessive logging within 5-second window
- Token Tracking: OpenTelemetry compliant usage metrics (no pricing data)

Version: 2.3 - Optimized with Duplicate Prevention
"""
import json
import sys
import requests
import os
import time
import hashlib
from datetime import datetime

# API Configuration - Environment variables with fallbacks
API_BASE_URL = os.environ.get('CLAUDE_LOGGER_URL', 'http://localhost:3003')
API_KEY = os.environ.get('CLAUDE_LOGGER_API_KEY', 'claude_api_secret_2024_change_me')

# Duplicate prevention cache (in memory, per process)
_request_cache = {}
_cache_timeout = 5  # seconds - prevent duplicates within 5 seconds

def is_duplicate_request(data, hook_event):
    """Check if this request is a duplicate within the cache timeout"""
    current_time = time.time()
    
    # Clean expired cache entries
    expired_keys = [k for k, v in _request_cache.items() if current_time - v > _cache_timeout]
    for key in expired_keys:
        del _request_cache[key]
    
    # Generate unique key for this request
    key_data = {
        'hook_event': hook_event,
        'session_id': data.get('session_id', ''),
        'content_hash': hashlib.md5(str(data.get('content', '')).encode()).hexdigest()[:8]
    }
    key = f"{key_data['hook_event']}:{key_data['session_id']}:{key_data['content_hash']}"
    
    # Check if we've seen this request recently
    if key in _request_cache:
        return True
    
    # Record this request
    _request_cache[key] = current_time
    return False

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

# Cost estimation removed - pricing data not needed for logging purposes

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
        
        # Check for duplicates first (except for SessionStart/SessionEnd which should always be logged)
        if hook_event not in ['SessionStart', 'SessionEnd']:
            if is_duplicate_request(input_data, hook_event):
                # This is a duplicate request within the timeout window
                sys.exit(0)
        
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
                                'duration_ms': assistant_msg.get('duration_ms', 0),
                                'uuid': assistant_msg.get('uuid', ''),
                                'timestamp': assistant_msg.get('timestamp', '')
                            }
                        })
            
        elif hook_event == 'UserPromptSubmit':
            prompt = input_data.get('prompt', '[prompt not captured]')
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
            
        elif hook_event == 'PreToolUse':
            tool_name = input_data.get('tool_name', 'unknown')
            tool_input = input_data.get('tool_input', {})
            
            # Create readable tool summary for pre-use
            content = f"About to use tool: {tool_name}"
            if tool_name == 'Bash':
                command = tool_input.get('command', '')
                content = f"Bash (preparing): {command[:100]}{'...' if len(command) > 100 else ''}"
            elif tool_name in ['Edit', 'Write', 'Read', 'MultiEdit']:
                file_path = tool_input.get('file_path', '')
                content = f"{tool_name} (preparing): {file_path}"
            elif tool_name in ['Grep', 'Glob']:
                pattern = tool_input.get('pattern', '') or tool_input.get('query', '')
                content = f"{tool_name} (preparing): {pattern[:50]}{'...' if len(pattern) > 50 else ''}"
            
            send_to_api('log', {
                'session_id': session_id,
                'project_name': project_name,
                'hook_event': hook_event,
                'message_type': 'tool_pre',
                'content': content,
                'metadata': {
                    'tool_name': tool_name,
                    'tool_input': tool_input,
                    'source': 'tool_pre_hook'
                }
            })
            
        elif hook_event == 'PostToolUse':
            tool_name = input_data.get('tool_name', 'unknown')
            tool_input = input_data.get('tool_input', {})
            tool_output = input_data.get('tool_output', '')
            
            # Create readable tool summary
            content = f"Used tool: {tool_name}"
            if tool_name == 'Bash':
                command = tool_input.get('command', '')
                content = f"Bash: {command}"
            elif tool_name in ['Edit', 'Write', 'Read', 'MultiEdit']:
                file_path = tool_input.get('file_path', '')
                content = f"{tool_name}: {file_path}"
            elif tool_name in ['Grep', 'Glob']:
                pattern = tool_input.get('pattern', '') or tool_input.get('query', '')
                content = f"{tool_name}: {pattern}"
            elif tool_name.startswith('mcp__'):
                # MCP tool usage
                content = f"MCP Tool: {tool_name.replace('mcp__', '')}"
            
            # Track tool success/failure
            tool_success = 'error' not in tool_output.lower() if tool_output else True
            
            send_to_api('log', {
                'session_id': session_id,
                'project_name': project_name,
                'hook_event': hook_event,
                'message_type': 'tool',
                'content': content,
                'metadata': {
                    'tool_name': tool_name,
                    'tool_input': tool_input,
                    'tool_success': tool_success,
                    'output_length': len(str(tool_output)) if tool_output else 0,
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
                    'start_source': source,
                    'timestamp': datetime.utcnow().isoformat() + 'Z'
                }
            })
            
        elif hook_event == 'SessionEnd':
            source = input_data.get('source', 'unknown')
            send_to_api('log', {
                'session_id': session_id,
                'project_name': project_name,
                'hook_event': hook_event,
                'message_type': 'system',
                'content': f'Session ended (source: {source})',
                'metadata': {
                    'source': 'session_end_hook',
                    'end_source': source,
                    'timestamp': datetime.utcnow().isoformat() + 'Z'
                }
            })
        
        else:
            # Handle unknown hooks gracefully
            send_to_api('log', {
                'session_id': session_id,
                'project_name': project_name,
                'hook_event': hook_event,
                'message_type': 'system',
                'content': f'Unknown hook event: {hook_event}',
                'metadata': {
                    'source': 'unknown_hook',
                    'original_data': input_data
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