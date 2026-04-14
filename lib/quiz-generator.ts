import { generateText } from 'ai';
import { traceable } from 'langsmith/traceable';
import { tracedModel } from './rag-pipeline';
import type { QuizQuestion } from './types';
import fs from 'fs';
import path from 'path';

const quizPromptTemplate = fs.readFileSync(
  path.join(process.cwd(), 'prompts/quiz-generator.md'),
  'utf-8'
);

export const generateQuiz = traceable(
  async (content: string, n: number): Promise<QuizQuestion[]> => {
    const systemPrompt = quizPromptTemplate.replace('{n}', String(n));

    const { text } = await generateText({
      model: tracedModel,
      system: systemPrompt,
      prompt: content,
    });

    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        throw new Error('Expected JSON array');
      }

      return parsed.map(
        (
          q: {
            question: string;
            options: string[];
            correctIndex: number;
            explanation: string;
          },
          i: number
        ) => ({
          id: `q${i + 1}`,
          question: q.question,
          options: q.options as [string, string, string, string],
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })
      );
    } catch (error) {
      console.error('[Quiz Generator] Failed to parse quiz JSON:', error);
      throw new Error('Failed to generate quiz — invalid response from LLM');
    }
  },
  { name: 'generate_quiz', run_type: 'chain' }
);
