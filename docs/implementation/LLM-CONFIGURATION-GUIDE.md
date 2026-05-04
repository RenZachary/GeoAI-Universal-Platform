# LLM Configuration Guide

This guide explains how to configure Large Language Models (LLM) for GeoAI-UP.

## Overview

LLM configuration is stored in the workspace directory at `workspace/llm/config/llm-config.json`. This allows users to manage their LLM settings through the frontend interface without modifying server environment variables.

## Configuration File Location

```
workspace/
  └── llm/
      └── config/
          └── llm-config.json    # Active configuration
          └── llm-config.json.example        # Example OpenAI config
          └── llm-config-qwen.json.example   # Example Qwen config
```

## Supported Providers

### 1. OpenAI

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "apiKey": "sk-your-openai-api-key",
  "temperature": 0.7,
  "maxTokens": 2000,
  "streaming": true
}
```

**Available Models:**
- `gpt-4` - Most capable model
- `gpt-4-turbo` - Faster GPT-4
- `gpt-3.5-turbo` - Cost-effective option

### 2. Alibaba Qwen (通义千问)

```json
{
  "provider": "qwen",
  "model": "qwen-plus",
  "apiKey": "your-dashscope-api-key",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "temperature": 0.7,
  "maxTokens": 2000,
  "streaming": true
}
```

**Available Models:**
- `qwen-turbo` - Fast and cost-effective
- `qwen-plus` - Balanced performance (recommended)
- `qwen-max` - Highest quality
- `qwen-long` - Extended context window

**How to Get API Key:**
1. Visit [DashScope Console](https://dashscope.console.aliyun.com/)
2. Create an account or login
3. Generate your API key
4. Copy the key to the configuration

### 3. Anthropic Claude

```json
{
  "provider": "anthropic",
  "model": "claude-3-opus-20240229",
  "apiKey": "sk-ant-your-api-key",
  "temperature": 0.7,
  "maxTokens": 2000,
  "streaming": true
}
```

**Available Models:**
- `claude-3-opus-20240229` - Most powerful
- `claude-3-sonnet-20240229` - Balanced
- `claude-3-haiku-20240307` - Fastest

### 4. Ollama (Local Models)

```json
{
  "provider": "ollama",
  "model": "llama3",
  "baseUrl": "http://localhost:11434",
  "temperature": 0.7,
  "maxTokens": 2000,
  "streaming": true
}
```

**Note:** Ollama doesn't require an API key as it runs locally.

## Configuration Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `provider` | string | Yes | LLM provider: `openai`, `qwen`, `anthropic`, or `ollama` |
| `model` | string | Yes | Model name/identifier |
| `apiKey` | string | Conditional | API key (not required for ollama) |
| `baseUrl` | string | No | Custom API endpoint URL |
| `temperature` | number | No | Sampling temperature (0.0-1.0, default: 0.7) |
| `maxTokens` | number | No | Maximum tokens in response (default: 2000) |
| `streaming` | boolean | No | Enable streaming responses (default: true) |

## How to Configure

### Method 1: Frontend Interface (Recommended)

1. Open GeoAI-UP in your browser
2. Navigate to **Settings** → **LLM Configuration**
3. Select your provider from the dropdown
4. Enter your API key
5. Choose a model
6. Adjust temperature and max tokens if needed
7. Click **Test Connection** to verify
8. Click **Save Configuration**

The configuration will be automatically saved to `workspace/llm/config/llm-config.json`.

### Method 2: Manual File Editing

1. Copy an example file:
   ```bash
   cp workspace/llm/config/llm-config.json.example workspace/llm/config/llm-config.json
   ```

2. Edit the file with your preferred text editor:
   ```bash
   nano workspace/llm/config/llm-config.json
   ```

3. Update the values with your configuration

4. Restart the server to apply changes

## API Endpoints

The backend provides REST API endpoints for LLM configuration management:

### Get Current Configuration
```http
GET /api/llm/config
```

Response:
```json
{
  "success": true,
  "config": {
    "provider": "qwen",
    "model": "qwen-plus",
    "apiKey": "***",
    "temperature": 0.7,
    "maxTokens": 2000,
    "streaming": true,
    "updatedAt": "2026-05-04T12:00:00.000Z"
  }
}
```

### Save Configuration
```http
POST /api/llm/config
Content-Type: application/json

{
  "provider": "qwen",
  "model": "qwen-plus",
  "apiKey": "your-api-key",
  "temperature": 0.7,
  "maxTokens": 2000,
  "streaming": true
}
```

### Test Connection
```http
POST /api/llm/config/test
Content-Type: application/json

{
  "provider": "qwen",
  "model": "qwen-plus",
  "apiKey": "your-api-key"
}
```

### Delete Configuration
```http
DELETE /api/llm/config
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **API Key Protection**: The API key is masked (`***`) when retrieved via API to prevent accidental exposure
2. **File Permissions**: Ensure `workspace/llm/config/llm-config.json` has appropriate file permissions
3. **Version Control**: Add `workspace/llm/config/llm-config.json` to `.gitignore` to prevent committing API keys
4. **Backup**: Regularly backup your configuration file (excluding the API key)

## Troubleshooting

### Issue: "No API key provided"

**Solution:** 
- Verify the API key is correctly set in the configuration
- Check that you're using the correct provider
- For Ollama, no API key is needed

### Issue: "Invalid API key"

**Solution:**
- Double-check your API key for typos
- Ensure your account has sufficient balance/credits
- Verify the API key hasn't expired

### Issue: "Model not found"

**Solution:**
- Check the model name is correct for your provider
- Verify your account has access to the selected model
- Review provider documentation for available models

### Issue: Configuration not loading

**Solution:**
- Check file exists at `workspace/llm/config/llm-config.json`
- Verify JSON syntax is valid
- Check file permissions allow reading
- Review server logs for error messages

## Migration from Environment Variables

If you previously configured LLM via environment variables:

1. Remove LLM-related variables from `.env`:
   - `LLM_PROVIDER`
   - `OPENAI_API_KEY`
   - `LLM_MODEL`
   - `LLM_TEMPERATURE`
   - `LLM_MAX_TOKENS`

2. Configure LLM through the frontend Settings page

3. The system will now use `workspace/llm/config/llm-config.json`

## Example Configurations

See the example files in `workspace/llm/config/`:
- `llm-config.json.example` - OpenAI configuration
- `llm-config-qwen.json.example` - Alibaba Qwen configuration

Copy and modify these examples to get started quickly.
