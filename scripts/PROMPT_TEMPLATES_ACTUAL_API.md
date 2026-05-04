# Prompt Templates API - Actual Backend Interface Analysis

## Backend Implementation Analysis

Based on actual code review of:
- `server/src/services/PromptTemplateService.ts`
- `server/src/api/controllers/PromptTemplateController.ts`

## Data Model

### PromptTemplateSummary (List Response)
```typescript
{
  id: string;              // Format: "{name}_{language}" lowercase, e.g., "goal-splitting_en-us"
  name: string;            // Filename without .md extension
  language: string;        // Language code, e.g., "en-US", "zh-CN"
  description?: string;    // Extracted from first line HTML comment if present
  version: string;         // Always "1.0.0" for file-based templates
  createdAt: Date;         // File creation time
  updatedAt: Date;         // File modification time
}
```

**Note**: Summary does NOT include `content` field for performance.

### PromptTemplateRecord (Get/Create Response)
```typescript
{
  ...PromptTemplateSummary,
  content: string;         // Full template content from .md file
}
```

### CreateTemplateInput (POST Body)
```typescript
{
  name: string;            // Required - template name (becomes filename)
  language?: string;       // Optional, defaults to "en-US"
  content: string;         // Required - template content
  description?: string;    // Optional - will be saved as HTML comment
  version?: string;        // Optional, defaults to "1.0.0"
}
```

### UpdateTemplateInput (PUT Body)
```typescript
{
  content?: string;        // Optional - new content
  description?: string;    // Optional - new description
  version?: string;        // Optional - new version
}
```

**Important**: Update does NOT accept `name` or `language` fields because the file path is based on `{name}_{language}.md`. Changing these would require deleting and recreating the file.

## API Endpoints

### GET /api/prompts
**Response**: 
```json
{
  "success": true,
  "count": 3,
  "templates": [
    {
      "id": "goal-splitting_en-us",
      "name": "goal-splitting",
      "language": "en-US",
      "description": "Split user goals into sub-goals",
      "version": "1.0.0",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Query Parameters**:
- `language` (optional): Filter by language, e.g., `?language=en-US`

### GET /api/prompts/:id
**Response**:
```json
{
  "success": true,
  "template": {
    "id": "goal-splitting_en-us",
    "name": "goal-splitting",
    "language": "en-US",
    "content": "You are a helpful assistant...",
    "description": "Split user goals into sub-goals",
    "version": "1.0.0",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### POST /api/prompts
**Request Body**:
```json
{
  "name": "my-template",
  "language": "en-US",
  "content": "You are a {{role}} assistant...",
  "description": "My custom template",
  "version": "1.0.0"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "template": {
    "id": "my-template_en-us",
    "name": "my-template",
    "language": "en-US",
    "content": "You are a {{role}} assistant...",
    "description": "My custom template",
    "version": "1.0.0",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### PUT /api/prompts/:id
**Request Body**:
```json
{
  "content": "Updated content...",
  "description": "Updated description"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Template updated successfully"
}
```

**Note**: Does NOT return the updated template. Frontend should call GET to fetch updated data.

### DELETE /api/prompts/:id
**Response**:
```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

## File Storage Structure

Templates are stored as Markdown files in:
```
workspace/llm/prompts/{language}/{name}.md
```

Example:
```
workspace/llm/prompts/en-US/goal-splitting.md
workspace/llm/prompts/zh-CN/my-template.md
```

### File Format
```markdown
<!-- Optional description as HTML comment -->
Template content with {{variables}} here...
```

The description is extracted from the first line if it's an HTML comment `<!-- ... -->`.

## Key Points

1. **No `category` field**: The backend does NOT manage categories. This was frontend臆想.

2. **Description extraction**: Description is automatically extracted from the first line HTML comment in the .md file.

3. **ID format**: Template ID is always `{name}_{language}` in lowercase with spaces replaced by underscores.

4. **List vs Detail**: List endpoint returns summaries (no content) for performance. Detail endpoint returns full template with content.

5. **Update limitations**: Cannot update `name` or `language` via PUT because it would change the file path. To rename, delete and recreate.

6. **Version field**: Always returns "1.0.0" for file-based templates (not actively managed).

7. **Language support**: Templates are organized by language directories (en-US, zh-CN, etc.).

## Frontend Integration Notes

### Correct Fields to Use
- ✅ `name` - Template name
- ✅ `language` - Language code (en-US, zh-CN)
- ✅ `content` - Template content with {{variables}}
- ✅ `description` - Optional description
- ✅ `version` - Version string (usually "1.0.0")
- ✅ `createdAt`, `updatedAt` - Timestamps

### Fields to Remove
- ❌ `category` - Does NOT exist in backend

### Best Practices
1. When editing a template, fetch full template via GET /api/prompts/:id to get content
2. List view can use summaries without content for better performance
3. When creating, provide language (defaults to en-US if omitted)
4. When updating, only send fields that changed (content, description, or version)
