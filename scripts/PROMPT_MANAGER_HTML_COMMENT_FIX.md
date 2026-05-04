# PromptManager HTML Comment Removal Fix

## Problem

When loading prompt templates, `PromptManager` was sending the **entire file content** to the LLM, including the HTML comment on the first line that's used for description metadata.

### Before Fix
```typescript
// loadFromFile method
const content = fs.readFileSync(filePath, 'utf-8');
return PromptTemplate.fromTemplate(content);  // ❌ Includes HTML comment
```

**Example template file:**
```markdown
<!-- Split user goals into independent sub-goals -->
Identify and split the user's request into independent goals.
User input: {{userInput}}
```

**What LLM received:**
```
<!-- Split user goals into independent sub-goals -->
Identify and split the user's request into independent goals.
User input: [actual input]
```

### Issues
1. **Wasted tokens** - HTML comment sent to LLM unnecessarily
2. **Potential confusion** - LLM might try to interpret or respond to the comment
3. **Inconsistent behavior** - Comment is metadata for humans, not part of the prompt

## Solution

Added `removeHtmlComment()` method to strip the HTML comment before passing content to LangChain.

### After Fix
```typescript
// loadFromFile method
const content = fs.readFileSync(filePath, 'utf-8');

// Remove HTML comment from first line if present (used for description)
const cleanedContent = this.removeHtmlComment(content);

// Extract variables {{variable}}
const variables = this.extractVariables(cleanedContent);

return PromptTemplate.fromTemplate(cleanedContent);  // ✅ No HTML comment
```

### Implementation
```typescript
/**
 * Remove HTML comment from first line (used for description metadata)
 */
private removeHtmlComment(content: string): string {
  const lines = content.split('\n');
  
  // Check if first line is an HTML comment
  if (lines[0].trim().startsWith('<!--') && lines[0].trim().endsWith('-->')) {
    // Remove the first line (HTML comment)
    lines.shift();
    // Return remaining content, trim leading empty lines
    return lines.join('\n').replace(/^\s*\n/, '');
  }
  
  return content;
}
```

**What LLM now receives:**
```
Identify and split the user's request into independent goals.
User input: [actual input]
```

## Benefits

1. ✅ **Token efficiency** - No wasted tokens on metadata comments
2. ✅ **Clean prompts** - LLM only sees actual prompt content
3. ✅ **Metadata separation** - Description kept for UI/management, excluded from LLM
4. ✅ **Backward compatible** - Templates without HTML comments work unchanged

## File Format

Templates should follow this format:
```markdown
<!-- Human-readable description (extracted by API, removed before sending to LLM) -->
Actual prompt content with {{variables}} starts here...
```

The HTML comment serves two purposes:
1. **For API/UI**: Extracted and displayed as template description
2. **For LLM**: Removed before sending, so LLM doesn't see it

## Files Modified

- `server/src/llm-interaction/managers/PromptManager.ts`
  - Added `removeHtmlComment()` private method
  - Updated `loadFromFile()` to clean content before creating PromptTemplate

## Testing

After the server rebuilds (hot reload), test with:
```bash
node scripts/test-prompt-comment-removal.js
```

Or manually verify by checking chat responses - they should no longer include HTML comments in the context.
