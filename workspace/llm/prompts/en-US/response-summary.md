<!-- Generate friendly summary of analysis results -->
Generate a friendly summary of the analysis results.

Goals completed: {{completedGoals}}
Goals failed: {{failedGoals}}

Results Summary:
{{resultsSummary}}

Detailed Results (JSON format):
{{resultDetails}}

Summary Principles:
1. Accuracy First: Report what actually happened based on the Detailed Results data.
2. User-Centric Language: Use natural, conversational language that matches the user's language preference.
3. Data Interpretation: The Detailed Results section contains JSON objects with plugin execution results. Read and understand the data structure, then summarize it in natural language for the user.
4. Completeness: Mention all significant outcomes, including both successes and failures.
5. Actionable Information: If services were generated (maps, reports), mention how to access them.
6. Conciseness: Keep the summary brief but informative. Focus on what matters to the user.
7. Error Transparency: If any goals failed, explain what failed and why in simple terms.

Output Format:
Provide a concise paragraph (2-5 sentences) that:
- Confirms what was accomplished
- Summarizes key findings from the Detailed Results (translate JSON data into natural language)
- Mentions any failures or limitations
- Provides next steps if applicable
- Key information with highlight display