# Quizzler Prompt System

## Overview

This directory contains all LLM prompts used in Quizzler. Each prompt is structured following production-grade prompt engineering best practices.

- **query-expansion.md** - Transforms student questions into academic search queries for improved RAG retrieval
- **quiz-generator.md** - Generates multiple-choice questions from study materials with difficulty classification
- **tutor-system.md** - Powers the RAG-based study tutor that helps students review quiz results

## Template Variables

All prompts use standard string interpolation (`replace()`). Variables are interpolated at runtime before sending to the LLM.

| Variable | Prompt File | Interpolated By | Runtime Value |
|----------|-------------|-----------------|---------------|
| `{n}` | `quiz-generator.md` | `lib/quiz-generator.ts` | Question count (5-20, default 10) |
| `{chunks}` | `tutor-system.md` | `app/api/tutor/route.ts` | Top 5 reranked document chunks with metadata |
| `{quiz}` | `tutor-system.md` | `app/api/tutor/route.ts` | Full quiz context (questions, answers, explanations) |
| `{score}` | `tutor-system.md` | `app/api/tutor/route.ts` | Student score string (e.g., "7/10") |
| `{filename}` | `tutor-system.md` | `app/api/tutor/route.ts` | Uploaded study material filename |

## Difficulty Field

The `quiz-generator.md` prompt includes a `difficulty` field on each question with three levels:

- **`foundational`** - Tests recall or basic comprehension (definitions, facts, basic concepts)
- **`applied`** - Tests application of concepts to scenarios or examples
- **`nuanced`** - Tests synthesis, comparison, analysis, or critical thinking

### Monitoring in LangSmith

The difficulty field should be monitored in LangSmith traces to ensure balanced quiz generation:

- **Check the distribution** - If 90% of questions are marked `foundational`, the prompt may be generating shallow quizzes
- **Ideal distribution** - Aim for ~40% foundational, ~40% applied, ~20% nuanced
- **Trace location** - Look for `generate_quiz` chain in LangSmith, examine the output JSON

If the distribution is consistently skewed:
1. Review the source materials being uploaded (may be too simple/advanced)
2. Adjust the "Constraints" section in `quiz-generator.md` to emphasize desired difficulty mix
3. Add more examples in the "Examples" section showing the target difficulty level

## Graceful Degradation Contracts

Each prompt defines how it handles edge cases and invalid input:

### query-expansion.md
- **Vague input** - Returns the original query unchanged if question is too vague or non-academic to expand meaningfully
- **Example**: `"stuff"` → `{ "expandedQuery": "stuff" }`

### quiz-generator.md
- **Insufficient material** - Returns fewer than {n} questions (minimum 3) if source content cannot support the requested count. Does NOT fabricate trivial questions.
- **Invalid input** - Returns empty array `[]` if content is gibberish, non-educational, or too short (<100 chars)
- **Example**: User requests 10 questions, but material only supports 6 meaningful questions → returns array of 6 questions
- **Example**: Input is only 45 characters → returns `[]`

### tutor-system.md
- **Missing information** - Returns exact fallback string: **"I couldn't find that in your study materials."**
- **Hallucination guard** - Will not synthesize answers by combining chunks that don't directly support the claim
- **Example**: If chunks mention "unemployment" and "bank failures" separately, tutor will not claim causal relationship without explicit support

## No Dependencies Constraint

All prompts use standard string interpolation (`replace()`) for template variables. Do not add templating libraries (Handlebars, Mustache, Liquid, etc.) to maintain a zero-dependency prompt layer.

**Why**: Keeping prompts as plain markdown/text files makes them:
- Easy to edit without code changes
- Versionable and diffable in git
- Portable across different codebases
- Simple to review by non-engineers (teachers, subject matter experts)

## Prompt Structure

Each prompt follows this consistent structure:

1. **## Role** - One-sentence persona and task definition
2. **## Template Variables** (if applicable) - Documents runtime placeholders
3. **## Instructions** - Clear, numbered task requirements
4. **## Output Format** - Exact JSON schema with typed comment showing structure
5. **## Examples** - Few-shot demonstrations (2-3 examples minimum)
6. **## Constraints** - Hard rules as numbered list with positive framing
7. **## Tone** (if applicable) - Voice and style guidelines

This ordering ensures the model understands: its role → available data → task → output format → sees examples → understands boundaries.

## Editing Prompts

When modifying prompts:

1. **Preserve template variable syntax** - Keep `{variable}` placeholders exactly as shown in the table above
2. **Test with LangSmith** - After changes, run a few test queries and check traces for output quality
3. **Maintain JSON schemas** - Don't change output structure without updating consuming code
4. **Add examples, not just rules** - Few-shot examples are more effective than lengthy instructions
5. **Update this README** - If you add new variables or change degradation contracts, document them here

## Related Files

**Code that loads these prompts:**
- `lib/rag-pipeline.ts` - Loads `query-expansion.md`
- `lib/quiz-generator.ts` - Loads `quiz-generator.md`, interpolates `{n}` placeholder
- `app/api/tutor/route.ts` - Loads `tutor-system.md`, interpolates 4 placeholders

**LangSmith traces:**
- `tutor_rag_pipeline` - Shows expand_query → embed_query → in_memory_search → cohere_rerank → generate chain
- `generate_quiz` - Shows quiz generation with difficulty classification
