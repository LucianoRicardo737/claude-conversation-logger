#!/usr/bin/env python3
"""
Test script for the corrected token usage system
Tests the new OpenTelemetry-compliant token parsing and reporting
"""

import json
import sys
import os
sys.path.insert(0, '/home/uni/Escritorio/unicorp/unicorp/uniCommerce/claude-conversation-logger/examples')

# Import the corrected functions
sys.path.append('/home/uni/Escritorio/unicorp/unicorp/uniCommerce/claude-conversation-logger/examples')
import importlib.util
spec = importlib.util.spec_from_file_location("api_logger", "/home/uni/Escritorio/unicorp/unicorp/uniCommerce/claude-conversation-logger/examples/api-logger.py")
api_logger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api_logger)

parse_usage_tokens = api_logger.parse_usage_tokens
estimate_cost_usd = api_logger.estimate_cost_usd
parse_transcript_for_last_assistant_message = api_logger.parse_transcript_for_last_assistant_message

def test_parse_usage_tokens():
    """Test the token parsing function"""
    print("🧪 Testing parse_usage_tokens()")
    
    # Test case 1: Normal usage data
    usage_data = {
        "input_tokens": 45,
        "output_tokens": 25,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 8
    }
    
    result = parse_usage_tokens(usage_data)
    print(f"✅ Test 1 - Normal usage: {len(result)} token records")
    for record in result:
        print(f"   - {record['type']}: {record['token_count']} tokens")
    
    # Test case 2: Empty usage data
    result_empty = parse_usage_tokens({})
    print(f"✅ Test 2 - Empty usage: {len(result_empty)} token records")
    
    # Test case 3: None input
    result_none = parse_usage_tokens(None)
    print(f"✅ Test 3 - None input: {len(result_none)} token records")

def test_estimate_cost_usd():
    """Test the cost estimation function"""
    print("\n💰 Testing estimate_cost_usd()")
    
    usage_data = {
        "input_tokens": 1000,
        "output_tokens": 500,
        "cache_creation_input_tokens": 200,
        "cache_read_input_tokens": 100
    }
    
    model = "claude-3-5-sonnet-20241022"
    cost = estimate_cost_usd(usage_data, model)
    print(f"✅ Estimated cost for {model}: ${cost:.6f}")
    
    # Manual calculation for verification
    expected = (1000 * 0.000003) + (500 * 0.000015) + (200 * 0.000003) + (100 * 0.0000003)
    print(f"✅ Manual calculation: ${expected:.6f}")
    print(f"✅ Match: {abs(cost - expected) < 0.000001}")

def test_transcript_parsing():
    """Test parsing the sample transcript"""
    print("\n📄 Testing transcript parsing")
    
    transcript_path = "/home/uni/Escritorio/unicorp/unicorp/uniCommerce/claude-conversation-logger/examples/sample-transcript.jsonl"
    
    if os.path.exists(transcript_path):
        result = parse_transcript_for_last_assistant_message(transcript_path)
        if result:
            print("✅ Transcript parsed successfully")
            print(f"   - Content length: {len(result.get('content', ''))}")
            print(f"   - Model: {result.get('model', 'N/A')}")
            print(f"   - Usage: {result.get('usage', {})}")
            print(f"   - Cost: ${result.get('cost_usd', 0):.6f}")
            print(f"   - Duration: {result.get('duration_ms', 0)}ms")
            
            # Test token parsing
            if result.get('usage'):
                token_records = parse_usage_tokens(result['usage'])
                print(f"   - Token records: {len(token_records)}")
                for record in token_records:
                    print(f"     * {record['type']}: {record['token_count']}")
        else:
            print("❌ No assistant message found in transcript")
    else:
        print("❌ Sample transcript not found")

def test_opentelemetry_compliance():
    """Test OpenTelemetry specification compliance"""
    print("\n🔍 Testing OpenTelemetry compliance")
    
    # According to the documentation, these are the required token types
    expected_types = ['input', 'output', 'cacheRead', 'cacheCreation']
    
    usage_data = {
        "input_tokens": 100,
        "output_tokens": 50,
        "cache_creation_input_tokens": 20,
        "cache_read_input_tokens": 10
    }
    
    token_records = parse_usage_tokens(usage_data)
    
    # Check that all types are mapped correctly
    found_types = [record['type'] for record in token_records]
    
    print(f"✅ Expected types: {expected_types}")
    print(f"✅ Found types: {found_types}")
    print(f"✅ All types present: {all(t in found_types for t in expected_types)}")
    
    # Check record structure
    for record in token_records:
        has_type = 'type' in record
        has_count = 'token_count' in record
        is_positive = record.get('token_count', 0) > 0
        print(f"✅ Record {record['type']}: has_type={has_type}, has_count={has_count}, positive={is_positive}")

if __name__ == "__main__":
    print("🚀 Testing Corrected Token Usage System\n")
    
    try:
        test_parse_usage_tokens()
        test_estimate_cost_usd()
        test_transcript_parsing()
        test_opentelemetry_compliance()
        
        print("\n🎉 All tests completed!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()