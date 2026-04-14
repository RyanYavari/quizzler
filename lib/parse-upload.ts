const MAX_PASTE_LENGTH = 10000;
const LLAMAPARSE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

interface ParseResult {
  text: string;
  fileName: string;
  questionCount: number;
}

async function parsePdfWithLlamaParse(file: File): Promise<string> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) throw new Error('LLAMA_CLOUD_API_KEY is not set');

  // Upload file
  const formData = new FormData();
  formData.append('file', file);

  const uploadRes = await fetch(
    'https://api.cloud.llamaindex.ai/api/parsing/upload',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(`LlamaParse upload failed: ${uploadRes.status}`);
  }

  const { id: jobId } = await uploadRes.json();

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < LLAMAPARSE_TIMEOUT_MS) {
    const statusRes = await fetch(
      `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!statusRes.ok) {
      throw new Error(`LlamaParse status check failed: ${statusRes.status}`);
    }

    const status = await statusRes.json();

    if (status.status === 'SUCCESS') {
      // Get markdown result
      const resultRes = await fetch(
        `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      if (!resultRes.ok) {
        throw new Error(`LlamaParse result fetch failed: ${resultRes.status}`);
      }

      const result = await resultRes.json();
      return result.markdown;
    }

    if (status.status === 'ERROR') {
      throw new Error(`LlamaParse parsing failed: ${status.error || 'Unknown error'}`);
    }

    // Wait 1 second before polling again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('LlamaParse parsing timed out');
}

export async function parseUpload(req: Request): Promise<ParseResult> {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const { text, questionCount = 10 } = await req.json();
    if (!text || typeof text !== 'string') {
      throw new Error('Text content is required');
    }
    return {
      text: text.slice(0, MAX_PASTE_LENGTH),
      fileName: 'Pasted Text',
      questionCount: Math.min(20, Math.max(5, questionCount)),
    };
  }

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const questionCount = parseInt(
      (formData.get('questionCount') as string) || '10',
      10
    );

    if (!file) {
      throw new Error('No file uploaded');
    }

    const clampedCount = Math.min(20, Math.max(5, questionCount));
    const fileName = file.name;

    if (fileName.endsWith('.pdf')) {
      const text = await parsePdfWithLlamaParse(file);
      return { text, fileName, questionCount: clampedCount };
    }

    if (fileName.endsWith('.txt')) {
      const text = await file.text();
      return { text, fileName, questionCount: clampedCount };
    }

    throw new Error('Unsupported file type. Please upload a .pdf or .txt file.');
  }

  throw new Error('Invalid request format');
}
