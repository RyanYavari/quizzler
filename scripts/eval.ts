/**
 * Quizzler RAG Evaluation Script
 *
 * Tests the full RAG pipeline with session-based tutor endpoint:
 *   1. Uploads sample study content to create a session
 *   2. Sends test questions to /api/tutor with the sessionId
 *   3. Evaluates responses on:
 *      - Citation presence — Does the response include a [Source: ...] citation?
 *      - Hallucination detection — Does the model refuse off-topic questions?
 *      - Latency — End-to-end response time per question
 *
 * Usage:
 *   npm run eval
 *
 * Requires the dev server running on http://localhost:3000
 */

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';

// ============================================================================
// Sample Study Content
// ============================================================================

const SAMPLE_STUDY_CONTENT = `
# Biology Study Guide: Cellular Processes

## Chapter 1: Photosynthesis

Photosynthesis is the process by which green plants and some other organisms use sunlight to synthesize nutrients from carbon dioxide and water. Photosynthesis in plants generally involves the green pigment chlorophyll and generates oxygen as a by-product.

The overall equation for photosynthesis is:
6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂

This process occurs in two main stages:
1. Light-dependent reactions (occur in the thylakoid membranes)
2. Light-independent reactions or Calvin cycle (occur in the stroma)

## Chapter 2: Cellular Respiration

Cellular respiration is the process by which cells break down glucose and other molecules to produce ATP (adenosine triphosphate), the energy currency of the cell. This process occurs in three main stages:

1. **Glycolysis** — Occurs in the cytoplasm, breaks down glucose into pyruvate, producing 2 ATP molecules
2. **Krebs Cycle (Citric Acid Cycle)** — Occurs in the mitochondrial matrix, produces electron carriers
3. **Electron Transport Chain** — Occurs in the inner mitochondrial membrane, produces approximately 34 ATP molecules

The overall equation: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ATP

## Chapter 3: Cell Division

### Mitosis
Mitosis is the process of cell division that results in two genetically identical daughter cells. The stages are:
- Prophase: Chromatin condenses into chromosomes
- Metaphase: Chromosomes align at the cell's equator
- Anaphase: Sister chromatids separate and move to opposite poles
- Telophase: Nuclear envelopes reform around each set of chromosomes

### Meiosis
Meiosis is a specialized type of cell division that reduces the chromosome number by half, producing four haploid cells (gametes). Key differences from mitosis:
- Involves two successive divisions (Meiosis I and II)
- Results in four non-identical daughter cells
- Includes crossing over and independent assortment for genetic variation
- Produces cells with half the chromosome number (haploid)

## Chapter 4: DNA and Genetics

DNA (deoxyribonucleic acid) is the hereditary material in organisms. The structure consists of:
- Two antiparallel strands forming a double helix
- Nucleotides composed of a sugar (deoxyribose), phosphate group, and nitrogenous base
- Four bases: Adenine (A), Thymine (T), Guanine (G), Cytosine (C)
- Base pairing rules: A pairs with T, G pairs with C

Gene expression involves:
1. Transcription: DNA → mRNA in the nucleus
2. Translation: mRNA → protein at ribosomes in the cytoplasm
`;

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
    question: 'What is photosynthesis according to the study guide?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 2,
    question: 'Explain the three stages of cellular respiration.',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 3,
    question: 'What are the key differences between mitosis and meiosis?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 4,
    question: 'Describe the structure of DNA mentioned in the material.',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 5,
    question: 'What happens during the light-dependent reactions of photosynthesis?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 6,
    question: 'List the four stages of mitosis.',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 7,
    question: 'What is the overall equation for photosynthesis?',
    expectCitation: true,
    expectRefusal: false,
  },
  {
    id: 8,
    question: 'Explain gene expression as described in the study guide.',
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

// Match both numbered citations [1] [2] and source citations [Source: ...]
const CITATION_PATTERN = /\[(?:\d+|Source:\s*[^\]]+)\]/i;
const REFUSAL_PATTERNS = [
  /couldn'?t find/i,
  /cannot find/i,
  /not .* in (?:the|your) (?:provided|study|course|materials?|guide)/i,
  /no relevant/i,
  /don'?t have .* information/i,
  /outside (?:of )?(?:the|your) (?:provided|study|course|materials?|guide)/i,
  /not covered in/i,
  /not mentioned in/i,
];

function hasCitation(text: string): boolean {
  return CITATION_PATTERN.test(text);
}

function isRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(text));
}

// ============================================================================
// API Helpers
// ============================================================================

async function createSession(): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([SAMPLE_STUDY_CONTENT], { type: 'text/plain' });
  formData.append('file', blob, 'biology-study-guide.txt');
  formData.append('questionCount', '10');

  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }

  // Parse SSE stream
  const text = await res.text();
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.sessionId) {
          return data.sessionId;
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  throw new Error('No sessionId found in upload response');
}

async function askQuestion(
  sessionId: string,
  question: string
): Promise<{ text: string; latencyMs: number }> {
  const start = Date.now();

  const res = await fetch(`${BASE_URL}/api/tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      messages: [
        {
          id: `eval-msg-${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: question }],
        },
      ],
      userAnswers: {},
      score: 0,
      total: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API returned ${res.status}: ${body}`);
  }

  // Parse SSE UI message stream
  const body = await res.text();
  const latencyMs = Date.now() - start;

  let text = '';
  for (const line of body.split('\n')) {
    // SSE format: lines starting with "data: " contain JSON events
    if (line.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(line.slice(6));
        // Extract text from text-delta events
        if (parsed.type === 'text-delta' && parsed.delta) {
          text += parsed.delta;
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

  // Setup: Create session
  console.log('📤 Uploading sample study content and creating session...');
  let sessionId: string;
  try {
    sessionId = await createSession();
    console.log(`✅ Session created: ${sessionId}\n`);
  } catch (error) {
    console.error('❌ Failed to create session:', error);
    process.exit(1);
  }

  const results: EvalResult[] = [];

  for (const tc of GOLDEN_DATASET) {
    process.stdout.write(
      `[${tc.id}/${GOLDEN_DATASET.length}] "${tc.question.slice(0, 50)}..." `
    );

    try {
      const { text, latencyMs } = await askQuestion(sessionId, tc.question);

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
        citationPass && hallucinationPass
          ? '\x1b[32mPASS\x1b[0m'
          : '\x1b[31mFAIL\x1b[0m';
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
  const validResults = results.filter((r) => r.latencyMs >= 0);
  const avgLatency =
    validResults.reduce((sum, r) => sum + r.latencyMs, 0) / (validResults.length || 1);

  const overallPass = results.filter((r) => r.citationPass && r.hallucinationPass).length;
  const score = ((overallPass / total) * 100).toFixed(1);

  console.log(`\n📊 Results Summary:`);
  console.log(`   Citation:      ${citationPasses}/${total} passed (${((citationPasses / total) * 100).toFixed(0)}%)`);
  console.log(`   Hallucination: ${hallucinationPasses}/${total} passed (${((hallucinationPasses / total) * 100).toFixed(0)}%)`);
  console.log(`   Avg Latency:   ${Math.round(avgLatency)}ms`);
  console.log(`\n\x1b[1m🎯 Overall Score: ${score}% (${overallPass}/${total})\x1b[0m\n`);

  // Exit with non-zero if any test failed
  if (overallPass < total) {
    console.log('❌ Some tests failed. See details above.\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
  }
}

runEval();
