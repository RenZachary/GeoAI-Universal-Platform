# File-Based Prompt Template System

## Overview

The PromptTemplateService now uses **filesystem-only storage** instead of database, allowing direct editing of built-in prompts in the workspace's `llm/prompts` directory.

---

## Architecture

### Directory Structure

```
workspace/
└── llm/
    └── prompts/
        ├── en-US/
        │   ├── goal-splitting.md
        │   ├── task-planning.md
        │   └── response-summary.md
        └── zh-CN/
            └── (custom templates)
```

### File Format

Each prompt template is a `.md` file with optional description in HTML comment:

```markdown
<!-- This is an optional description -->

# Actual prompt content starts here

You are a geospatial AI assistant...
```

**Description Extraction:**
- First line starting with `<!--` and ending with `-->` is treated as description
- Everything after is the prompt content
- Description is optional

---

## API Endpoints

### List Templates

```http
GET /api/prompt-templates?language=en-US
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "templates": [
    {
      "id": "goal-splitting_en-us",
      "name": "goal-splitting",
      "language": "en-US",
      "description": "Splits user queries into analysis goals",
      "version": "1.0.0",
      "createdAt": "2026-05-04T10:00:00.000Z",
      "updatedAt": "2026-05-04T10:00:00.000Z"
    }
  ]
}
```

### Get Template

```http
GET /api/prompt-templates/goal-splitting_en-us
```

**Response:**
```json
{
  "success": true,
  "template": {
    "id": "goal-splitting_en-us",
    "name": "goal-splitting",
    "language": "en-US",
    "content": "# You are a geospatial AI assistant...\n\n...",
    "description": "Splits user queries into analysis goals",
    "version": "1.0.0",
    "createdAt": "2026-05-04T10:00:00.000Z",
    "updatedAt": "2026-05-04T10:00:00.000Z"
  }
}
```

### Create Template

```http
POST /api/prompt-templates
Content-Type: application/json

{
  "name": "custom-analysis",
  "language": "en-US",
  "content": "# Custom analysis prompt\n\nYou are...",
  "description": "My custom analysis template"
}
```

**Result:** Creates file at `workspace/llm/prompts/en-US/custom-analysis.md`

### Update Template

```http
PUT /api/prompt-templates/custom-analysis_en-us
Content-Type: application/json

{
  "content": "# Updated content\n\nNew prompt text...",
  "description": "Updated description"
}
```

**Result:** Overwrites file content while preserving format

### Delete Template

```http
DELETE /api/prompt-templates/custom-analysis_en-us
```

**Result:** Deletes the `.md` file from filesystem

---

## ID Format

Template IDs follow the pattern: `{name}_{language}`

Examples:
- `goal-splitting_en-us`
- `task-planning_zh-cn`
- `custom-template_en-us`

The service parses this format to determine file location:
```typescript
// ID: "goal-splitting_en-us"
// → Path: workspace/llm/prompts/en-US/goal-splitting.md
```

---

## Benefits

### 1. Direct File Editing
Developers can edit prompts directly in their code editor without API calls:

```bash
# Edit with any text editor
vim workspace/llm/prompts/en-US/goal-splitting.md

# Changes are immediately available
```

### 2. Version Control Friendly
Prompt templates can be committed to Git:

```bash
git add workspace/llm/prompts/en-US/*.md
git commit -m "Update goal splitting prompt"
```

### 3. No Database Migration Required
- No schema changes needed
- No database backups for prompts
- Simpler deployment

### 4. Language Organization
Clear directory structure by language:
```
prompts/
├── en-US/  # English templates
├── zh-CN/  # Chinese templates
└── ja-JP/  # Japanese templates (future)
```

### 5. Hot Reload Support
Changes to `.md` files are detected on next API call (no restart needed).

---

## Implementation Details

### Service Initialization

```typescript
// routes/index.ts
const promptTemplateService = new PromptTemplateService(workspaceBase);
// No database parameter needed!
```

### File Operations

**Listing Templates:**
```typescript
// Scan all language directories
const languages = fs.readdirSync(promptsBaseDir);

// For each language, find .md files
const files = fs.readdirSync(langDir).filter(f => f.endsWith('.md'));

// Extract metadata from filename and file stats
const id = `${name}_${language}`;
const createdAt = stats.birthtime;
```

**Reading Template:**
```typescript
// Parse ID to get name and language
const [name, language] = id.split('_');

// Read file
const filePath = path.join(promptsBaseDir, language, `${name}.md`);
const content = fs.readFileSync(filePath, 'utf-8');

// Extract description from first line if present
if (lines[0].startsWith('<!--')) {
  description = lines[0].slice(4, -3).trim();
}
```

**Writing Template:**
```typescript
// Ensure language directory exists
const langDir = path.join(promptsBaseDir, language);
fs.mkdirSync(langDir, { recursive: true });

// Add description as HTML comment
let fileContent = content;
if (description) {
  fileContent = `<!-- ${description} -->\n${content}`;
}

// Write file
fs.writeFileSync(filePath, fileContent, 'utf-8');
```

---

## Migration from Database

If you previously used the database-backed version:

### Step 1: Export Existing Templates

```sql
-- Export all templates to CSV
sqlite3 geoai-up.db <<EOF
.mode csv
.output templates_export.csv
SELECT name, language, content, description FROM prompt_templates;
EOF
```

### Step 2: Convert to Files

```bash
#!/bin/bash
# migrate_prompts.sh

while IFS=',' read -r name language content description; do
  # Create language directory
  mkdir -p "workspace/llm/prompts/$language"
  
  # Build file content
  file_content=""
  if [ -n "$description" ]; then
    file_content="<!-- $description -->\n"
  fi
  file_content+="$content"
  
  # Write file
  echo -e "$file_content" > "workspace/llm/prompts/$language/$name.md"
done < templates_export.csv
```

### Step 3: Verify

```bash
# Check that all files exist
ls -la workspace/llm/prompts/en-US/
ls -la workspace/llm/prompts/zh-CN/

# Test API
curl http://localhost:3000/api/prompt-templates
```

### Step 4: Remove Database Table (Optional)

```sql
DROP TABLE IF EXISTS prompt_templates;
```

---

## Best Practices

### 1. Use Descriptive Filenames

✅ Good:
```
goal-splitting.md
task-planning.md
response-summary.md
```

❌ Bad:
```
prompt1.md
temp.md
test.md
```

### 2. Include Description Comments

```markdown
<!-- Splits natural language queries into discrete analysis goals -->

You are a geospatial AI assistant...
```

This makes the purpose clear when listing templates via API.

### 3. Organize by Language

Keep language-specific variations in separate directories:

```
en-US/goal-splitting.md    # English version
zh-CN/goal-splitting.md    # Chinese version (if different)
```

### 4. Backup Regularly

Since prompts are now files, include them in your backup strategy:

```bash
# Backup prompts directory
tar -czf prompts_backup_$(date +%Y%m%d).tar.gz workspace/llm/prompts/
```

### 5. Use Git for Version History

```bash
# Track prompt changes
git add workspace/llm/prompts/
git commit -m "Improve goal splitting instructions"

# View history
git log --oneline workspace/llm/prompts/en-US/goal-splitting.md
```

---

## Troubleshooting

### Issue: Template Not Found

**Error:** `Template not found: custom-template_en-us`

**Causes:**
1. File doesn't exist at expected path
2. Filename doesn't match ID format
3. Language directory missing

**Solution:**
```bash
# Verify file exists
ls workspace/llm/prompts/en-US/custom-template.md

# Check directory structure
tree workspace/llm/prompts/

# Create missing directory
mkdir -p workspace/llm/prompts/en-US
```

### Issue: Permission Denied

**Error:** `EACCES: permission denied, open '...'`

**Solution:**
```bash
# Fix permissions (Linux/Mac)
chmod -R 755 workspace/llm/prompts/

# Or run server with appropriate user
sudo chown -R $(whoami) workspace/llm/prompts/
```

### Issue: Invalid ID Format

**Error:** `Invalid template ID format: custom-template`

**Cause:** ID must include language suffix

**Solution:**
```typescript
// Wrong
const id = "custom-template";

// Correct
const id = "custom-template_en-us";
```

---

## Future Enhancements

### 1. Template Validation

Add JSON Schema validation for prompt structure:

```typescript
interface PromptSchema {
  required_sections: string[];
  max_length?: number;
  allowed_variables?: string[];
}
```

### 2. Template Inheritance

Support base templates with overrides:

```
base-prompt.md          # Common instructions
├── en-US/override.md   # English-specific additions
└── zh-CN/override.md   # Chinese-specific additions
```

### 3. Prompt Testing Framework

Automated testing for prompt quality:

```typescript
describe('Goal Splitting Prompt', () => {
  it('should handle simple queries', async () => {
    const result = await testPrompt('goal-splitting', 'Show rivers');
    expect(result.goals.length).toBe(1);
  });
});
```

### 4. A/B Testing Support

Multiple versions of same prompt:

```
goal-splitting_v1.md
goal-splitting_v2.md
goal-splitting_current.md  # Symlink to active version
```

---

## Summary

The file-based prompt template system provides:

✅ **Simplicity** - No database, just files  
✅ **Flexibility** - Edit with any text editor  
✅ **Version Control** - Git-friendly  
✅ **Organization** - Clear language-based structure  
✅ **Performance** - Fast file I/O, no SQL queries  

This aligns with the principle of keeping configuration and content as close to the code as possible, making the system easier to maintain and deploy.
