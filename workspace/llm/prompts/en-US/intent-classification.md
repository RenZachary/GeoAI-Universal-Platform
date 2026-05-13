<!-- Classify user query intent for conditional workflow routing -->
Classify the user query into one of these intent categories to enable intelligent workflow routing.

## Intent Categories

### 1. GIS_ANALYSIS
**Definition**: Queries that require spatial operations, geometric computations, or map-based visualization.

**Classification Principles**:
- **Action Verbs**: If the query contains verbs like calculate, compute, create, generate, show, display, render, visualize, measure, count, or find, it is likely an analysis task.
- **Spatial Terms**: Presence of terms related to geometry (buffer, intersect, overlay, distance, area) indicates spatial processing.
- **Visualization Requests**: Any request to "show on map", "display in [color]", or "visualize" MUST be classified as GIS_ANALYSIS.

### 2. KNOWLEDGE_QUERY
**Definition**: Queries asking about policies, regulations, standards, definitions, or document content.

**Classification Principles**:
- **Information Seeking**: Queries starting with "what is", "explain", "define", or "describe" regarding concepts or rules.
- **Document References**: Mentions of policies, regulations, standards, guidelines, laws, or reports.
- **Compliance Checks**: Questions about requirements, restrictions, limitations, or prohibitions.

### 3. HYBRID
**Definition**: Queries that combine spatial analysis with policy/regulation context or knowledge requirements.

**Classification Principles**:
- **Dual Requirements**: Contains BOTH spatial operation keywords AND policy/knowledge keywords.
- **Contextual Analysis**: Requires retrieving documents to filter or interpret spatial data (e.g., filtering based on regulatory criteria).

### 4. GENERAL_CHAT
**Definition**: Casual conversation, greetings, or non-task-oriented interactions, or the answer was mentioned in the 'User Query' and 'User Mentioned Info' directly and exactly.

**Classification Principles**:
- **Social Interactions**: Greetings, small talk, gratitude, or farewells.
- **Non-Task Input**: Inputs that do not contain any actionable geographic or analytical intent.

## User Query

{{userQuery}}

## User Mentioned Info

{{spatialContext}}

## Classification Instructions

**IMPORTANT**: The user query may be in any language and may contain technical identifiers (like @mentions or IDs). You MUST look past these identifiers to find the core action verbs.

Analyze the user query carefully and determine the most appropriate intent category based on the principles above.

**CRITICAL RULES**:
- If the answer was contained in the question directly and exactly, it is **GENERAL_CHAT**
- If the query mentions spatial operations (buffer, area, distance) or visualization (show, display, color), it is ALWAYS **GIS_ANALYSIS**.
- If the query is a simple greeting or small talk, it is **GENERAL_CHAT**.
- Do NOT be misled by technical IDs or @mentions; focus on the human-readable instructions.

## Response Format

**CRITICAL**: Output ONLY the raw JSON string. Do NOT use markdown code blocks. Do NOT include any explanation outside the JSON.

{
  "type": "GIS_ANALYSIS" | "KNOWLEDGE_QUERY" | "HYBRID" | "GENERAL_CHAT",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation in 1 sentence about why this classification was chosen"
}

**Confidence Guidelines**:
- 0.9-1.0: Very clear intent with strong keyword matches
- 0.7-0.9: Clear intent with some ambiguity
- 0.5-0.7: Moderate confidence, multiple interpretations possible
- <0.5: Low confidence, query is ambiguous or unclear
