/**
 * Quizzler RAG Evaluation Script
 *
 * Sends a golden dataset of 10 study-focused questions to the /api/chat endpoint
 * and evaluates each response on three criteria:
 *   1. Citation present  — Does the response contain a [Source: ...] citation?
 *   2. Hallucination check — Does the response avoid answering when no sources exist,
 *      or does it only reference provided documents?
 *   3. Latency           — How long did the full request take?
 *
 * Usage:
 *   npm run eval
 *
 * Requires the dev server running on http://localhost:3000
 */

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';

// ============================================================================
// Golden Dataset
// ============================================================================

interface TestCase {
  id: number;
  question: string;
  expectCitation: boolean;
  /** If true, the question is intentionally off-topic — we expect the model to decline. */
  expectRefusal: boolean;
}

const GOLDEN_DATASET: TestCase[] = [
  {
    id: 1,
    question: 'What are the main topics covered in chapter 1?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 2,
    question: 'Can you summarize the key concepts from the lecture notes?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 3,
    question: 'What is the definition of photosynthesis according to the textbook?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 4,
    question: 'How does supply and demand affect market equilibrium?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 5,
    question: 'What are the three branches of the US government and their roles?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 6,
    question: 'Explain the process of cellular respiration as described in the study guide.',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 7,
    question: 'What were the main causes of World War I mentioned in the readings?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 8,
    question: 'Compare and contrast mitosis and meiosis based on the course material.',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 9,
    question: 'What is the recipe for chocolate chip cookies?',
    expectCitation: false,
    expectRefusal: true,
  },
  {
    id: 10,
    question: 'Who won the Super Bowl last year?',
    expectCitation: false,
    expectRefusal: true,
  },
];

// ============================================================================
// Evaluation Helpers
// ============================================================================

const CITATION_PATTERN = /\[Source:\s*[^\]]+\]/i;
const REFUSAL_PATTERNS = [
  /couldn'?t find/i,
  /cannot find/i,
  /not .* in (?:the|your) (?:provided|study|course)/i,
  /no relevant/i,
  /don'?t have .* information/i,
  /outside (?:of )?(?:the|your) (?:provided|study|course)/i,
];

function hasCitation(text: string): boolean {
  return CITATION_PATTERN.test(text);
}

function isRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(text));
}

// ============================================================================
// Chat API Caller
// ============================================================================

async function askQuestion(question: string): Promise<{ text: string; latencyMs: number }> {
  const start = Date.now();

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          id: 'eval-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: question }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API returned ${res.status}: ${body}`);
  }

  // The response is a UI message stream — collect all text chunks
  const body = await res.text();
  const latencyMs = Date.now() - start;

  // Parse the stream format: extract text parts from the streamed response
  let text = '';
  for (const line of body.split('\n')) {
    // UI message stream format: lines starting with 0: contain text deltas
    if (line.startsWith('0:')) {
      try {
        const parsed = JSON.parse(line.slice(2));
        if (typeof parsed === 'string') {
          text += parsed;
        }
      } catch {
        // skip non-JSON lines
      }
    }
  }

  return { text, latencyMs };
}

// ============================================================================
// Evaluation Runner
// ============================================================================

interface EvalResult {
  id: number;
  question: string;
  citationPass: boolean;
  hallucinationPass: boolean;
  latencyMs: number;
  responseSnippet: string;
}

async function runEval(): Promise<void> {
  console.log('=== Quizzler RAG Evaluation ===\n');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Test cases: ${GOLDEN_DATASET.length}\n`);

  const results: EvalResult[] = [];

  for (const tc of GOLDEN_DATASET) {
    process.stdout.write(`[${tc.id}/${GOLDEN_DATASET.length}] "${tc.question.slice(0, 50)}..." `);

    try {
      const { text, latencyMs } = await askQuestion(tc.question);

      const foundCitation = hasCitation(text);
      const foundRefusal = isRefusal(text);

      // Citation check: if we expect a citation, the response should have one
      const citationPass = tc.expectCitation ? foundCitation : true;

      // Hallucination check:
      //   - Off-topic questions (expectRefusal=true): model should refuse
      //   - On-topic questions: model should NOT refuse (it should answer from docs)
      const hallucinationPass = tc.expectRefusal ? foundRefusal : !foundRefusal;

      results.push({
        id: tc.id,
        question: tc.question,
        citationPass,
        hallucinationPass,
        latencyMs,
        responseSnippet: text.slice(0, 120).replace(/\n/g, ' '),
      });

      const status =
        citationPass && hallucinationPass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`${status} (${latencyMs}ms)`);
    } catch (error) {
      console.log(`\x1b[31mERROR\x1b[0m`);
      results.push({
        id: tc.id,
        question: tc.question,
        citationPass: false,
        hallucinationPass: false,
        latencyMs: -1,
        responseSnippet: `ERROR: ${error instanceof Error ? error.message : 'Unknown'}`,
      });
    }
  }

  // ---- Summary Table ----
  console.log('\n' + '='.repeat(110));
  console.log(
    'ID'.padEnd(4) +
      'Question'.padEnd(55) +
      'Citation'.padEnd(12) +
      'Halluc.'.padEnd(12) +
      'Latency'.padEnd(12) +
      'Snippet'
  );
  console.log('-'.repeat(110));

  for (const r of results) {
    const citIcon = r.citationPass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const halIcon = r.hallucinationPass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const latency = r.latencyMs >= 0 ? `${r.latencyMs}ms` : 'ERR';
    console.log(
      String(r.id).padEnd(4) +
        r.question.slice(0, 53).padEnd(55) +
        citIcon.padEnd(12 + 9) + // +9 for ANSI escape codes
        halIcon.padEnd(12 + 9) +
        latency.padEnd(12) +
        r.responseSnippet.slice(0, 40)
    );
  }
  console.log('='.repeat(110));

  // ---- Final Score ----
  const total = results.length;
  const citationPasses = results.filter((r) => r.citationPass).length;
  const hallucinationPasses = results.filter((r) => r.hallucinationPass).length;
  const avgLatency =
    results.filter((r) => r.latencyMs >= 0).reduce((sum, r) => sum + r.latencyMs, 0) /
    (results.filter((r) => r.latencyMs >= 0).length || 1);

  const overallPass = results.filter((r) => r.citationPass && r.hallucinationPass).length;
  const score = ((overallPass / total) * 100).toFixed(1);

  console.log(`\nCitation:      ${citationPasses}/${total} passed`);
  console.log(`Hallucination: ${hallucinationPasses}/${total} passed`);
  console.log(`Avg Latency:   ${Math.round(avgLatency)}ms`);
  console.log(`\n\x1b[1mOverall Score: ${score}% (${overallPass}/${total})\x1b[0m\n`);

  // Exit with non-zero if any test failed
  if (overallPass < total) {
    process.exit(1);
  }
}

runEval();
