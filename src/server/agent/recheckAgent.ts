import { getFhirSource } from '../fhir/index.ts';
import { DocumentReference, Task } from '../fhir/types.ts';
import { calculateGate, getGeminiClient, isGeminiConfigured } from './reviewAgent.ts';

export async function recheckTask(
  taskId: string
): Promise<{ task: Task; resolved: boolean; gate: string; message: string }> {
  // Check if Gemini is configured
  const geminiCheck = isGeminiConfigured();
  if (!geminiCheck.configured) {
    const reason = geminiCheck.reason || 'configuration missing';
    throw new Error(`Re-check failed: Gemini unavailable (${reason}).`);
  }

  const clientInfo = getGeminiClient();
  if (!clientInfo) {
    throw new Error('Re-check failed: Gemini unavailable (client initialization failed).');
  }

  const source = getFhirSource();
  const searchResults = await source.search('Task', { _id: taskId });
  if (searchResults.length === 0) {
    throw new Error(`Task ${taskId} not found`);
  }

  const task = searchResults[0] as Task;
  const encounterRef = task.encounter?.reference;
  const encounterId = encounterRef?.replace('Encounter/', '') || '';

  if (!encounterId) {
    throw new Error('Task has no encounter reference');
  }

  const bundle = await source.getEncounterBundle(encounterId);
  if (!bundle || !bundle.entry) {
    throw new Error(`Encounter bundle for ${encounterId} not found`);
  }

  const doc = bundle.entry
    .map(e => e.resource)
    .find((r): r is DocumentReference => r?.resourceType === 'DocumentReference');

  let currentNoteText = doc?.description || '';
  if (doc?.content?.[0]?.attachment?.data) {
    try {
      const decoded = Buffer.from(doc.content[0].attachment.data, 'base64').toString('utf-8');
      if (decoded) currentNoteText = decoded;
    } catch {}
  }

  // Evaluate genuine clinical evidence resolution via Gemini
  const systemInstruction = `You are ClaimSure's claim-readiness re-check agent for hospital billing teams and medical directors.
Your job is to determine whether a flagged claim discrepancy has been genuinely resolved by newly documented clinical evidence or doctor addendum in the patient record.
RULES:
1. NEVER INVENT OR ACCEPT FABRICATED FACTS. If a physician addendum is empty, contains placeholder brackets like "[Document clinical reason: ________]", or fails to clinically justify the billed service, set resolved to false.
2. If the updated record contains genuine documentation resolving the issue, set resolved to true and extract the exact VERBATIM quote from the record in evidenceQuote.
3. Output a single JSON object with { "resolved": boolean, "evidenceQuote": string, "explanation": string }.`;

  const promptText = `Task check: ${task.code?.text || 'clinical_audit'}
Severity: ${task.businessStatus?.text || 'medium'}
Flagged issue: ${task.description || ''}
Original evidence: ${task.note?.[0]?.text || 'N/A'}
Suggested fix: ${task.input?.find(i => i.type?.text === 'suggested_fix')?.valueString || 'N/A'}

Current Clinical Documentation:
"""
${currentNoteText}
"""

Evaluate whether the updated clinical record resolves this task. Return JSON only.`;

  let parsed: { resolved: boolean; evidenceQuote: string; explanation: string };
  try {
    const res = await clientInfo.ai.models.generateContent({
      model: clientInfo.modelName,
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    const text = res.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Response did not contain a valid JSON object');
    }
    parsed = JSON.parse(match[0]);
  } catch (err: any) {
    const reason = err?.message || String(err);
    throw new Error(`Re-check failed: Gemini unavailable (${reason}).`);
  }

  if (parsed.resolved) {
    task.status = 'completed';
    if (!task.note) task.note = [];
    task.note.push({
      text: `[Re-check Passed] Issue verified resolved against clinical documentation: "${(parsed.evidenceQuote || '').trim()}"`,
      time: new Date().toISOString(),
      authorString: 'ClaimSure Re-check Agent (Gemini Verified)',
    });
    task.output = [
      {
        type: { text: 'recheck_resolution' },
        valueString: parsed.explanation || 'Verified resolved against clinical note addendum in record',
      },
    ];
    await source.update(task);
  }

  // Recalculate gate for this encounter
  const allTasks = (await source.search('Task', { encounter: encounterId })) as Task[];
  const gate = calculateGate(allTasks);

  return {
    task,
    resolved: parsed.resolved,
    gate,
    message: parsed.explanation || (parsed.resolved ? 'Re-check passed: Verified resolved against clinical record' : 'Re-check failed: Insufficient documentation in record'),
  };
}
