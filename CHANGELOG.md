# Changelog

All notable changes to the Claude Conversation Logger project will be documented in this file.

## [2.1.1] - 2025-08-20

### 🎯 MCP Configuration Improvements
- **Added .mcp.json support** - Project-specific MCP configuration with automatic detection
- **Documented both configuration methods** - .mcp.json vs global settings.json
- **Updated troubleshooting guide** with .mcp.json solutions

### 📚 Documentation
- Enhanced README with comparison between .mcp.json and settings.json
- Updated QUICK_START with both configuration options
- Improved troubleshooting section with MCP-specific solutions

## [2.1.0] - 2025-08-20

### 🎯 Major Fixes
- **Fixed hook configuration structure** - Corrected nested structure required by Claude Code
- **Fixed user message capture** - UserPromptSubmit hook now works correctly
- **Improved token parsing** - Accumulates streaming chunks for accurate token counts

### ✨ Features
- Added real conversation example in documentation
- Enhanced troubleshooting section with common issues
- Improved token usage explanation

### 📚 Documentation
- Updated all configuration examples with correct hook structure
- Translated QUICK_START.md to English
- Added detailed explanation of token types and usage
- Created comprehensive troubleshooting guide

### 🐛 Bug Fixes
- Fixed duplicate hook configurations across settings files
- Corrected parsing logic for streaming assistant responses
- Resolved issue with missing user messages in database

### 🔧 Technical Details

#### Correct Hook Structure
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {"type": "command", "command": "python3 ~/.claude/hooks/api-logger.py"}
        ]
      }
    ]
  }
}
```

#### Token Parsing Improvements
- Accumulates content from all streaming chunks
- Captures usage statistics from final chunk only
- Preserves complete assistant responses

## [2.0.0] - 2025-08-19

### Features
- Initial monolithic container architecture
- Triple Storage System (MongoDB + Redis + Memory)
- MCP server integration
- Automatic failover and redundancy

## [1.0.0] - 2025-08-18

### Features
- Basic conversation logging
- Simple file-based storage
- Initial hook implementation