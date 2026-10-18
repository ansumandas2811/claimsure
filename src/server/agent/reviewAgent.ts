import { GoogleGenAI, Type } from '@google/genai';
import { getFhirSource } from '../fhir/index.ts';
import { Task } from '../fhir/types.ts';
import * as tools from '../tools/deterministicTools.ts';
import { AgentComment, verifyComment } from './verification.ts';

export interface AgentProgressEvent {
  stage: 'plan' | 'tool_call' | 'tool_result' | 'output' | 'verification' | 'tasks_saved' | 'gate' | 'error' | 'done';
  data: any;
}

export function isGeminiConfigured(): { configured: boolean; reason?: string } {
  if (process.env.GEMINI_API_KEY) {
    return { configured: true };
  }
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    return { configured: true };
  }
  return {
    configured: false,
    reason: 'Neither GEMINI_API_KEY nor GOOGLE_CLOUD_PROJECT environment variable is configured',
  };
}

export function getGeminiClient(): { ai: GoogleGenAI; modelName: string } | null {
  const modelName = process.env.REVIEW_MODEL || 'gemini-3.8-flash';
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    return {
      ai: new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }),
      modelName,
    };
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (project) {
    const location = process.env.GEMINI_LOCATION || 'global';
    return {
      ai: new GoogleGenAI({
        vertexai: true,
        project,
        location,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }),
      modelName,
    };
  }

  return null;
}

const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  fhir_search: tools.fhir_search,
  get_note_text: tools.get_note_text,
  get_policy_clauses: tools.get_policy_clauses,
  lookup_diagnosis_code: tools.lookup_diagnosis_code,
  find_duplicate_charges: tools.find_duplicate_charges,
  check_charge_totals: tools.check_charge_totals,
  check_required_documents: tools.check_required_documents,
};

export async function runReviewAgent(
  encounterId: string,
  onEvent: (event: AgentProgressEvent) => void
): Promise<{ tasks: Task[]; gate: 'Blocked' | 'Needs review' | 'Ready' | 'Not reviewed'; error?: string }> {
  // Step 0: Ensure Gemini is configured
  const geminiCheck = isGeminiConfigured();
  if (!geminiCheck.configured) {
    const reason = geminiCheck.reason || 'configuration missing';
    const errorMsg = `Not reviewed: Gemini unavailable (${reason}). No findings were created.`;
    console.error(`[reviewAgent] ${errorMsg}`);
    onEvent({ stage: 'error', data: { error: errorMsg } });
    return { tasks: [], gate: 'Not reviewed', error: errorMsg };
  }

  const clientInfo = getGeminiClient();
  if (!clientInfo) {
    const errorMsg = 'Not reviewed: Gemini unavailable (client initialization failed). No findings were created.';
    console.error(`[reviewAgent] ${errorMsg}`);
    onEvent({ stage: 'error', data: { error: errorMsg } });
    return { tasks: [], gate: 'Not reviewed', error: errorMsg };
  }

  const source = getFhirSource();
  const bundle = await source.getEncounterBundle(encounterId);
  if (!bundle) {
    const errorMsg = `Not reviewed: Encounter ${encounterId} not found in FHIR store. No findings were created.`;
    console.error(`[reviewAgent] ${errorMsg}`);
    onEvent({ stage: 'error', data: { error: errorMsg } });
    return { tasks: [], gate: 'Not reviewed', error: errorMsg };
  }

  const toolDeclarations = [
    {
      name: 'fhir_search',
      description: 'Search FHIR resources for an encounter or patient',
      parameters: {
        type: Type.OBJECT,
        properties: {
          resourceType: { type: Type.STRING, description: 'FHIR Resource type' },
          params: { type: Type.OBJECT, description: 'Search parameters' },
        },
        required: ['resourceType'],
      },
    },
    {
      name: 'get_note_text',
      description: 'Retrieve verbatim clinical discharge summary note text',
      parameters: {
        type: Type.OBJECT,
        properties: { encounterId: { type: Type.STRING } },
        required: ['encounterId'],
      },
    },
    {
      name: 'get_policy_clauses',
      description: 'Retrieve policy clauses from Navjeevan Demo TPA',
      parameters: {
        type: Type.OBJECT,
        properties: { topic: { type: Type.STRING } },
      },
    },
    {
      name: 'lookup_diagnosis_code',
      description: 'Look up ICD-10 diagnosis code definition',
      parameters: {
        type: Type.OBJECT,
        properties: { code: { type: Type.STRING } },
        required: ['code'],
      },
    },
    {
      name: 'find_duplicate_charges',
      description: 'Analyze all ChargeItems for duplicate codes or timestamps',
      parameters: {
        type: Type.OBJECT,
        properties: { encounterId: { type: Type.STRING } },
        required: ['encounterId'],
      },
    },
    {
      name: 'check_charge_totals',
      description: 'Inspect itemized charges, room charge daily rates, and totals',
      parameters: {
        type: Type.OBJECT,
        properties: { encounterId: { type: Type.STRING } },
        required: ['encounterId'],
      },
    },
    {
      name: 'check_required_documents',
      description: 'Verify presence of mandatory claim submission documents',
      parameters: {
        type: Type.OBJECT,
        properties: { encounterId: { type: Type.STRING } },
        required: ['encounterId'],
      },
    },
  ];

  const systemInstruction = `You are ClaimSure's autonomous hospital claim-readiness review agent for hospital billing teams and medical directors.
Review Encounter ${encounterId} against clinical documentation and Navjeevan Demo TPA rules.
RULES:
1. NEVER INVENT OR FABRICATE CLINICAL FACTS. Never invent clinical values, vitals, SpO2, diagnoses, symptoms, lab values, or complications that are not verbatim in the notes.
2. Every comment must quote its source text VERBATIM in evidence.quote.
3. When the record does not support a charge (e.g. ICU days with stable vitals), a doctor_note fix must leave a blank "[Document clinical reason: ________]" for the doctor or say billing should reclassify the days to ward rate.
4. Output a JSON array of findings with check, severity, assignee_role, focus, explanation, evidence, and suggested_fix. If the claim is clean and compliant with all policy rules, return an empty array [].`;

  const contents: any[] = [
    {
      role: 'user',
      parts: [{ text: `Review encounter ${encounterId}. Plan first, call tools, and output findings comments as a JSON array.` }],
    },
  ];

  let rawComments: AgentComment[] | null = null;
  const MAX_TURNS = 8;
  let turn = 1;
  let finalResponseText = '';
  let completed = false;

  try {
    while (turn <= MAX_TURNS && !completed) {
      const response = await clientInfo.ai.models.generateContent({
        model: clientInfo.modelName,
        contents,
        config: {
          systemInstruction,
          temperature: 0.1,
          tools: [{ functionDeclarations: toolDeclarations as any }],
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate || !candidate.content) {
        throw new Error('Gemini returned an empty candidate response');
      }

      // Emit plan progress event ONLY if the model actually generated a plan in text
      for (const part of candidate.content.parts || []) {
        if ('text' in part && part.text) {
          const textVal = part.text.trim();
          if (/^plan\b/i.test(textVal) || /audit plan/i.test(textVal)) {
            onEvent({ stage: 'plan', data: { plan: textVal } });
          }
        }
      }

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        // Append model turn with original candidates[0].content unchanged (to keep thought signatures)
        contents.push(candidate.content);

        const functionResponses: any[] = [];
        for (const call of functionCalls) {
          // Emit tool_call only for calls the model actually made
          onEvent({
            stage: 'tool_call',
            data: { name: call.name, args: call.args, id: call.id, turn },
          });

          const callName = call.name || '';
          const handler = callName ? toolHandlers[callName] : undefined;
          let result: any;
          if (handler) {
            try {
              result = await handler(call.args || {});
            } catch (toolErr: any) {
              result = { error: toolErr.message || String(toolErr) };
            }
          } else {
            result = { error: `Tool ${callName} not implemented` };
          }

          // Emit tool_result
          onEvent({
            stage: 'tool_result',
            data: { name: call.name, result, turn },
          });

          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: result,
            },
          });
        }

        // Append user turn with matching functionResponse parts
        contents.push({
          role: 'user',
          parts: functionResponses,
        });

        turn++;
      } else {
        finalResponseText = response.text || '';
        completed = true;
      }
    }

    if (!completed) {
      const errorMsg = `Not reviewed: Gemini unavailable (Review loop hit ${MAX_TURNS} turns limit without completing). No findings were created.`;
      console.error(`[reviewAgent] ${errorMsg}`);
      onEvent({ stage: 'error', data: { error: errorMsg } });
      return { tasks: [], gate: 'Not reviewed', error: errorMsg };
    }

    const trimmed = finalResponseText.trim();
    if (trimmed === '[]') {
      rawComments = [];
    } else {
      const match = trimmed.match(/\[\s*\{[\s\S]*\}\s*\]/) || (trimmed.startsWith('[') && trimmed.endsWith(']') ? [trimmed] : null);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            rawComments = parsed;
          }
        } catch (jsonErr: any) {
          console.error('[reviewAgent] JSON parse error:', jsonErr.message, 'Raw text:', trimmed);
        }
      }
    }

    if (rawComments === null) {
      const errorMsg = `Not reviewed: Gemini unavailable (response cannot be parsed as the expected JSON array of comments). No findings were created.`;
      console.error(`[reviewAgent] ${errorMsg}. Model text: ${finalResponseText}`);
      onEvent({ stage: 'error', data: { error: errorMsg } });
      return { tasks: [], gate: 'Not reviewed', error: errorMsg };
    }

    onEvent({ stage: 'output', data: rawComments });
  } catch (err: any) {
    const reason = err?.message || String(err);
    const errorMsg = `Not reviewed: Gemini unavailable (${reason}). No findings were created.`;
    console.error(`[reviewAgent] ${errorMsg}`);
    onEvent({ stage: 'error', data: { error: errorMsg } });
    return { tasks: [], gate: 'Not reviewed', error: errorMsg };
  }

  // Step 3: Programmatic Verification in code (drops any invalid quotes or fabricated drafts)
  onEvent({ stage: 'verification', data: { rawCount: rawComments.length } });
  const verifiedComments: AgentComment[] = [];

  for (const comment of rawComments) {
    const check = await verifyComment(encounterId, comment);
    if (check.verified) {
      comment.verified = true;
      verifiedComments.push(comment);
    } else {
      console.warn(`Dropped unverified comment: ${comment.check} - ${check.error}`);
    }
  }

  onEvent({
    stage: 'verification',
    data: {
      rawCount: rawComments.length,
      verifiedCount: verifiedComments.length,
      verifiedComments,
    },
  });

  // Step 4: Save comments as FHIR R4 Tasks
  const patientRef = bundle.entry?.find(e => e.resource?.resourceType === 'Patient')?.resource?.id;
  const createdTasks: Task[] = [];

  // Remove existing requested tasks for this encounter first
  const existingTasks = await source.search('Task', { encounter: encounterId });
  for (const t of existingTasks) {
    if (t.status === 'requested') {
      t.status = 'cancelled';
      t.statusReason = { text: 'Superseded by new readiness review' };
      await source.update(t);
    }
  }

  for (const comment of verifiedComments) {
    if (comment.severity === 'low' && comment.check === 'clean') continue;

    const task: Task = {
      resourceType: 'Task',
      id: 'task-' + Math.random().toString(36).substring(2, 9),
      intent: 'proposal',
      status: 'requested',
      for: { reference: `Patient/${patientRef || 'unknown'}` },
      encounter: { reference: `Encounter/${encounterId}` },
      focus: { reference: comment.focus },
      owner: { display: comment.assignee_role === 'billing' ? 'Billing' : 'Doctor' },
      code: { text: comment.check },
      businessStatus: { text: comment.severity },
      description: comment.explanation,
      note: [
        {
          text: `[${comment.evidence.source}] "${comment.evidence.quote}"`,
          time: new Date().toISOString(),
          authorString: 'ClaimSure Agent (Verified)',
        },
      ],
      input: [
        {
          type: { text: 'suggested_fix' },
          valueString: comment.suggested_fix?.draft || '',
        },
      ],
    };

    const saved = (await source.create(task)) as Task;
    createdTasks.push(saved);
  }

  // If no issue tasks created (clean claim or valid empty array), record a completed audit task
  if (createdTasks.length === 0) {
    const cleanTask: Task = {
      resourceType: 'Task',
      id: 'task-' + Math.random().toString(36).substring(2, 9),
      intent: 'proposal',
      status: 'completed',
      for: { reference: `Patient/${patientRef || 'unknown'}` },
      encounter: { reference: `Encounter/${encounterId}` },
      owner: { display: 'ClaimSure Agent' },
      code: { text: 'clean' },
      businessStatus: { text: 'low' },
      description: 'Claim readiness audit complete. All charges, notes, and policy limits verified.',
      note: [
        {
          text: 'Automated claim-readiness audit completed with no discrepancies.',
          time: new Date().toISOString(),
          authorString: 'ClaimSure Agent (Verified)',
        },
      ],
    };
    const saved = (await source.create(cleanTask)) as Task;
    createdTasks.push(saved);
  }

  onEvent({ stage: 'tasks_saved', data: { count: createdTasks.length, tasks: createdTasks } });

  // Step 5: Calculate Gate
  const gate = calculateGate(createdTasks);
  onEvent({ stage: 'gate', data: { gate } });
  onEvent({ stage: 'done', data: { gate, tasksCount: createdTasks.length } });

  return { tasks: createdTasks, gate };
}

export function calculateGate(tasks: Task[]): 'Blocked' | 'Needs review' | 'Ready' | 'Not reviewed' {
  if (!tasks || tasks.length === 0) {
    return 'Not reviewed';
  }

  const openTasks = tasks.filter(t => t.status === 'requested' || t.status === 'in-progress' || t.status === 'ready');
  if (openTasks.length === 0) {
    return 'Ready';
  }

  const hasHigh = openTasks.some(t => t.businessStatus?.text?.toLowerCase() === 'high');
  if (hasHigh) return 'Blocked';

  const hasMedium = openTasks.some(t => t.businessStatus?.text?.toLowerCase() === 'medium');
  if (hasMedium) return 'Needs review';

  return 'Ready';
}
