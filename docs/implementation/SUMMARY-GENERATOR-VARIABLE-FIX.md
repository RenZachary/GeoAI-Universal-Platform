# Summary Generator - Variable Name Mismatch Fix

## Date
May 5, 2026

## Executive Summary

Fixed critical variable name mismatch in SummaryGenerator that caused LLM-based summary generation to fail with "Missing value for input failedGoals" error. The issue was that `prepareLLMContext` was using `failCount` instead of `failedGoals`, which didn't match the template's expected variable names.

---

## 🔍 Problem Analysis

### Error Message
```
[Summary Generator] LLM generation failed, falling back to template: 
Error: (f-string) Missing value for input failedGoals

Troubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/INVALID_PROMPT_INPUT/
```

### Root Cause

The template file [response-summary.md](file://e:/codes/GeoAI-UP/workspace/llm/prompts/en-US/response-summary.md) expects these variables:
```markdown
Goals completed: {{completedGoals}}
Goals failed: {{failedGoals}}          ← Expected this

Results:
{{resultsSummary}}
```

But `prepareLLMContext` was providing:
```typescript
context.completedGoals = state.goals.length.toString();
context.failCount = failCount.toString();  // ❌ Wrong variable name!
// Missing: context.failedGoals
```

When LangChain's PromptTemplate tried to format the prompt with the context, it couldn't find `failedGoals` and threw an INVALID_PROMPT_INPUT error.

---

## 🔧 Solution

### Changes Made

#### 1. Fixed `prepareLLMContext` Method

**File:** [SummaryGenerator.ts](file://e:/codes/GeoAI-UP/server/src/llm-interaction/workflow/SummaryGenerator.ts#L207-L267)

**Before:**
```typescript
context.successCount = successCount.toString();
context.failCount = failCount.toString();  // ❌ Not in template
context.totalCount = results.length.toString();
```

**After:**
```typescript
// Use template variable names (failedGoals, not failCount)
context.failedGoals = failCount.toString();  // ✅ Matches template
context.successCount = successCount.toString();
context.totalCount = results.length.toString();

// Format results summary for template
context.resultsSummary = this.formatResultsSummary(results, successCount, failCount);
```

Also added fallback values when no execution results exist:
```typescript
} else {
  context.failedGoals = '0';  // ✅ Ensure variable always exists
  context.successCount = '0';
  context.totalCount = '0';
  context.resultsSummary = 'No execution results available.';
  // ...
}
```

#### 2. Fixed `prepareTemplateVariables` Method

**File:** [SummaryGenerator.ts](file://e:/codes/GeoAI-UP/server/src/llm-interaction/workflow/SummaryGenerator.ts#L120-L154)

**Before:**
```typescript
variables.completedGoals = state.goals.length.toString();
variables.failedGoals = '0'; // ❌ Always zero, not calculated
```

**After:**
```typescript
variables.completedGoals = state.goals.length.toString();

// Calculate failed goals from execution results
let failedGoalsCount = 0;
if (state.executionResults) {
  const results = Array.from(state.executionResults.values());
  failedGoalsCount = results.filter(r => r.status === 'failed').length;
}
variables.failedGoals = failedGoalsCount.toString();  // ✅ Dynamic calculation
```

---

## 📊 Impact Analysis

### Before Fix

**Flow:**
```
User Request → Workflow Execution → Summary Generation
                                        ↓
                              Try LLM Generation
                                        ↓
                              prepareLLMContext()
                                        ↓
                              Missing 'failedGoals' variable
                                        ↓
                              ❌ INVALID_PROMPT_INPUT Error
                                        ↓
                              Fallback to Template Substitution
                                        ↓
                              Still missing 'failedGoals' (was '0')
                                        ↓
                              ⚠️ Inaccurate summary
```

**Result:** 
- LLM generation always failed
- Template fallback showed incorrect data (always 0 failed goals)
- User saw robotic, inaccurate summaries

### After Fix

**Flow:**
```
User Request → Workflow Execution → Summary Generation
                                        ↓
                              Try LLM Generation
                                        ↓
                              prepareLLMContext()
                                        ↓
                              ✅ All variables present & correct
                                        ↓
                              LLM generates natural language summary
                                        ↓
                              ✨ Humanized, contextual response
```

**Result:**
- LLM generation succeeds
- Natural, conversational summaries
- Accurate failure counts
- Better user experience

---

## 🎯 Key Learnings

### 1. Template Variable Names Must Match Exactly

LangChain's PromptTemplate uses Python f-string syntax where variable names are case-sensitive and must match exactly. There's no fuzzy matching or aliasing.

**Best Practice:**
```typescript
// ❌ Bad: Using different names
context.failCount = '5';  // Template expects 'failedGoals'

// ✅ Good: Exact match
context.failedGoals = '5';
```

### 2. Always Provide Fallback Values

When preparing context for templates, ensure all expected variables have default values even if the source data is missing.

**Best Practice:**
```typescript
if (state.executionResults) {
  // Calculate from real data
  context.failedGoals = failCount.toString();
} else {
  // Provide sensible default
  context.failedGoals = '0';
}
```

### 3. Centralize Variable Name Definitions

To avoid mismatches, consider defining template variable names as constants:

**Future Enhancement:**
```typescript
const TEMPLATE_VARIABLES = {
  COMPLETED_GOALS: 'completedGoals',
  FAILED_GOALS: 'failedGoals',
  RESULTS_SUMMARY: 'resultsSummary',
  // ...
} as const;

// Then use consistently:
context[TEMPLATE_VARIABLES.FAILED_GOALS] = failCount.toString();
```

---

## 🧪 Testing Verification

### Test Case 1: Successful Operations Only

**Input:**
- Goals: 1 (buffer analysis)
- Results: 2 successful, 0 failed
- Services: 2 generated

**Expected Output:**
```
Goals completed: 1
Goals failed: 0

Results:
Total: 2, Success: 2, Failed: 0

Successful:
- buffer_analysis
- mvt_publisher
```

**Status:** ✅ Pass

---

### Test Case 2: Mixed Success/Failure

**Input:**
- Goals: 1 (buffer + publish)
- Results: 1 successful, 1 failed
- Services: 1 generated

**Expected Output:**
```
Goals completed: 1
Goals failed: 1

Results:
Total: 2, Success: 1, Failed: 1

Successful:
- buffer_analysis

Failed:
- mvt_publisher: Unsupported data source type
```

**Status:** ✅ Pass

---

### Test Case 3: No Execution Results

**Input:**
- Goals: 0
- Results: undefined
- Services: 0

**Expected Output:**
```
Goals completed: 0
Goals failed: 0

Results:
No execution results available.
```

**Status:** ✅ Pass (fallback values used)

---

## 📝 Related Files

### Modified Files
1. [SummaryGenerator.ts](file://e:/codes/GeoAI-UP/server/src/llm-interaction/workflow/SummaryGenerator.ts)
   - Fixed `prepareLLMContext` method (lines 207-267)
   - Fixed `prepareTemplateVariables` method (lines 120-154)

### Template File
2. [response-summary.md](file://e:/codes/GeoAI-UP/workspace/llm/prompts/en-US/response-summary.md)
   - Defines expected variables: `completedGoals`, `failedGoals`, `resultsSummary`

### Related Documentation
3. [LLM Summary Generation Fix](file://e:/codes/GeoAI-UP/scripts/LLM-SUMMARY-GENERATION-FIX.md)
   - Original implementation of LLM-based summaries
4. [Chat UI Components Implementation](file://e:/codes/GeoAI-UP/scripts/CHAT-UI-COMPONENTS-IMPLEMENTATION.md)
   - Frontend components for displaying summaries

---

## 🚀 Future Improvements

### 1. Automated Template Validation

Add a validation step that checks if all template variables are provided before invoking LLM:

```typescript
private validateContext(template: string, context: Record<string, any>): void {
  const requiredVars = extractTemplateVariables(template);
  const missingVars = requiredVars.filter(v => !(v in context));
  
  if (missingVars.length > 0) {
    throw new Error(`Missing template variables: ${missingVars.join(', ')}`);
  }
}
```

### 2. Template Schema Definition

Create a TypeScript interface for each template's expected variables:

```typescript
interface ResponseSummaryVariables {
  completedGoals: string;
  failedGoals: string;
  resultsSummary: string;
  // ...
}

// Type-safe context preparation
private prepareLLMContext(state: GeoAIStateType): ResponseSummaryVariables {
  return {
    completedGoals: ...,
    failedGoals: ...,
    resultsSummary: ...,
  };
}
```

### 3. Unit Tests for Variable Matching

Add tests that verify context objects contain all required variables:

```typescript
describe('SummaryGenerator', () => {
  it('provides all required template variables', () => {
    const context = generator.prepareLLMContext(mockState);
    const template = loadTemplate('response-summary');
    
    const requiredVars = extractVariables(template);
    requiredVars.forEach(varName => {
      expect(context).toHaveProperty(varName);
    });
  });
});
```

---

## 🎉 Conclusion

This fix resolves the persistent "Missing value for input failedGoals" error by ensuring variable names in the context object exactly match those expected by the template. The changes are minimal but critical:

1. ✅ Changed `failCount` → `failedGoals` in `prepareLLMContext`
2. ✅ Added dynamic calculation of `failedGoals` in `prepareTemplateVariables`
3. ✅ Added fallback values for all variables when data is missing

**Result:** LLM-based summary generation now works correctly, producing natural, conversational summaries with accurate failure counts.

The fix also improves robustness by calculating `failedGoals` dynamically from execution results rather than hardcoding it to '0', ensuring accurate summaries even in edge cases.
