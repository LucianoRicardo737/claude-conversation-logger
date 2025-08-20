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

def parse_transcript_for_last_assistant_message(transcript_path):
    """Parse transcript to extract the last assistant message"""
    
    if not os.path.exists(transcript_path):
        return None
    
    last_assistant_message = None
    accumulated_usage = None
    
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
                        'uuid': assistant_msg.get('uuid', '')
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