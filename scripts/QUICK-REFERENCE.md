# LLM Configuration Quick Reference

## 🚀 Quick Start with Qwen

### 1. Get API Key
Visit: https://dashscope.console.aliyun.com/

### 2. Configure (3 Options)

#### Option A: Frontend (Easiest)
1. Go to Settings → LLM Configuration
2. Select "Qwen (Alibaba)"
3. Enter API key
4. Click Save

#### Option B: PowerShell
```powershell
$body = @{
  provider='qwen'
  model='qwen-plus'
  apiKey='YOUR_API_KEY'
  baseUrl='https://dashscope.aliyuncs.com/compatible-mode/v1'
  temperature=0.7
  maxTokens=2000
  streaming=$true
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:3000/api/llm/config' `
  -Method Post -Body $body -ContentType 'application/json'
```

#### Option C: Test Script
```powershell
$env:QWEN_API_KEY="YOUR_API_KEY"
npx tsx scripts/test-llm-workflow.ts
```

---

## 📋 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/llm/config` | Get current config |
| POST | `/api/llm/config` | Save config |
| POST | `/api/llm/config/test` | Test connection |
| DELETE | `/api/llm/config` | Delete config |

---

## 🎯 Qwen Models

| Model | Best For |
|-------|----------|
| qwen-turbo | Speed & cost |
| **qwen-plus** | **General use (recommended)** |
| qwen-max | Quality |
| qwen-long | Long context |

---

## 🧪 Test Scripts

```bash
# Automated tests
npx tsx scripts/test-llm-config.ts

# Workflow demo
npx tsx scripts/test-llm-workflow.ts

# Interactive tool
npx tsx scripts/test-llm-interactive.ts
```

---

## 📁 Config Location
`workspace/llm/config/llm-config.json`

---

## ✅ Verification
```powershell
# Check current config
Invoke-RestMethod http://localhost:3000/api/llm/config

# Check file exists
Test-Path workspace\llm\config\llm-config.json
```

---

**Status**: ✅ All endpoints working  
**Priority**: Qwen (Alibaba DashScope)  
**Last Updated**: 2026-05-04
