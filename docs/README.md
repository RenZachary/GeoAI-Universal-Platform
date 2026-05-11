# GeoAI-UP Documentation

> ⚠️ **Note**: This project is under active development. Documentation may lag behind the latest code changes as we prioritize feature implementation and architectural refinement.

This directory contains all project documentation, organized by category.

## Directory Structure

### `/architecture`
Core architecture design documents, including:
- System architecture and design decisions
- Module designs (API, LLM, Plugin, Storage, Data Access layers)
- Database schema and migrations
- API specifications
- Integration designs (LangChain, plugins)

### `/implementation`
Implementation reports and technical documentation for specific features:
- Feature implementation details
- Technical solutions and fixes
- Integration guides
- Code walkthroughs
- Test reports (in `test-reports/` subdirectory)

Files follow the pattern: `IMPLEMENTATION-{FEATURE-NAME}.md`

### `/progress`
Project progress tracking and status reports:
- Daily summaries
- Development progress reports
- Implementation status updates
- Architecture implementation progress

### `/analysis`
Analysis documents and gap assessments:
- Requirements gap analysis
- System capability analysis
- Technical assessments
- Architecture evaluations

### `/requirements`
Requirements documentation:
- Project requirements overview
- Functional specifications
- User stories and use cases

## Documentation Standards

1. **Naming Convention**: ALL UPPERCASE with hyphens for filenames (e.g., `IMPLEMENTATION-FEATURE-NAME.md`, `API-SPECIFICATION.md`)
2. **Date Stamps**: Historical implementation files had dates (YYYY-MM-DD) removed during organization for cleaner names
3. **Language**: Primary documentation language is English
4. **Format**: All documents use Markdown format
5. **Categorization**: Files are organized by purpose (architecture, implementation, progress, analysis, requirements)

## Recent Organization

All markdown files have been consolidated into this `docs` directory from the project root. Files were categorized and moved on 2026-05-04 to improve project organization and maintainability.

On 2026-05-07, additional documentation from the `scripts/` directory was archived:
- Test reports moved to `implementation/test-reports/`
- Fix summaries and implementation notes moved to `implementation/`
- Quick reference guides moved to `implementation/`
- Redundant README removed from scripts directory
