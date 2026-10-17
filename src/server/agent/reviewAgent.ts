import { GoogleGenAI, Type } from '@google/genai';
import { Response } from 'express';
import { getFhirSource } from '../fhir/index.ts';
import { Task } from '../fhir/types.ts';
import * as tools from '../tools/deterministicTools.ts';
import { AgentComment, verifyComment } from './verification.ts';

export interface AgentProgressEvent {
  stage: 'plan' | 'tool_call' | 'tool_result' | 'output' | 'verification' | 'tasks_saved' | 'gate' | 'error' | 'done';
  data: any;
}

export function isGeminiConfigured(): { configured: boolean; reason?: string } {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    return {
      configured: false,
      reason: 'GOOGLE_CLOUD_PROJECT environment variable is not set. Run `gcloud auth application-default login` and set GOOGLE_CLOUD_PROJECT.',
    };
  }
  return { configured: true };
}

export async function runReviewAgent(
  encounterId: string,
  onEvent: (event: AgentProgressEvent) => void
): Promise<{ tasks: Task[]; gate: 'Blocked' | 'Needs review' | 'Ready' | 'Not reviewed' }> {
  const configCheck = isGeminiConfigured();
  if (!configCheck.configured) {
    throw new Error(configCheck.reason || 'Gemini not configured: run gcloud auth application-default login');
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GEMINI_LOCATION || 'global';
  const modelName = process.env.REVIEW_MODEL || 'gemini-2.5-pro';

  const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const source = getFhirSource();
  const bundle = await source.getEncounterBundle(encounterId);
  if (!bundle) {
    throw new Error(`Encounter ${encounterId} not found`);
  }

  // Define Function Declarations
  const toolDeclarations = [
    {
      name: 'fhir_search',
      description: 'Search FHIR resources for an encounter or patient',
      parameters: {
        type: Type.OBJECT,
        properties: {
          resourceType: { type: Type.STRING, description: 'FHIR Resource type like ChargeItem, Condition, Coverage' },
          params: { type: Type.OBJECT, description: 'Search parameters key-value object' },
        },
        required: ['resourceType'],
      },
    },
    {
      name: 'get_note_text',
      description: 'Retrieve full verbatim clinical discharge summary note text for this encounter',
      parameters: {
        type: Type.OBJECT,
        properties: {
          encounterId: { type: Type.STRING, description: 'Encounter ID (e.g. ENC-001)' },
        },
        required: ['encounterId'],
      },
    },
    {
      name: 'get_policy_clauses',
      description: 'Retrieve policy clauses and sub-limits from Indian Health Insurance policy (room rent, ICU, exclusions, duplicates, documentation)',
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: 'Topic keyword e.g. "room rent", "icu", "exclusion", "duplicate", "documentation", or "all"' },
        },
      },
    },
    {
      name: 'lookup_diagnosis_code',
      description: 'Look up ICD-10 diagnosis code definition, billability and clinical criteria',
      parameters: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING, description: 'ICD-10 code string e.g. "I21.9", "K80.20", "Z41.1"' },
        },
        required: ['code'],
      },
    },
    {
      name: 'find_duplicate_charges',
      description: 'Analyze all ChargeItems for duplicate codes or duplicate timestamps',
      parameters: {
        type: Type.OBJECT,
        properties: {
          encounterId: { type: Type.STRING, description: 'Encounter ID' },
        },
        required: ['encounterId'],
      },
    },
    {
      name: 'check_charge_totals',
      description: 'Inspect itemized charges, room charge daily rates, and totals in INR',
      parameters: {
        type: Type.OBJECT,
        properties: {
          encounterId: { type: Type.STRING, description: 'Encounter ID' },
        },
        required: ['encounterId'],
      },
    },
    {
      name: 'check_required_documents',
      description: 'Verify presence of mandatory claim submission documents',
      parameters: {
        type: Type.OBJECT,
        properties: {
          encounterId: { type: Type.STRING, description: 'Encounter ID' },
        },
        required: ['encounterId'],
      },
    },
  ];

  const systemInstruction = `You are ClaimSure's autonomous hospital claim-readiness review agent for hospital billing teams and medical directors.
Your role: Review Encounter ${encounterId} against clinical documentation and Navjeevan Demo TPA / Indian Health Insurance policy rules.

SYSTEM RULES:
1. NEVER INVENT OR FABRICATE CLINICAL FACTS:
   - A suggested fix of type "doctor_note" must ONLY restate facts already present verbatim in the clinical record.
   - NEVER invent clinical values, vitals, SpO2 percentages (e.g. 88%), diagnoses, symptoms (e.g. bronchospasm, hypoxia), or clinical complications that do not appear verbatim in the source notes.
   - When the clinical record does not support a charge (e.g. ICU days billed with stable vitals and no documented instability or complications):
     The fix must say so plainly: either the attending doctor adds a clinical justification ONLY IF a real clinical reason existed and was not documented (leave a blank for the doctor to fill with no invented content, e.g. "Attending Physician Addendum: Clinical justification for ICU monitoring: [Document clinical reason: ________]. Otherwise, billing must reclassify days to ward rate."), OR billing reclassifies the days to ward rate.
   - Any doctor_note draft containing clinical values or conditions (vitals, SpO2, diagnoses, events) that do not appear in the encounter's source text will be automatically REJECTED and logged by the verification code.
2. Every comment must quote its source text VERBATIM in evidence.quote.
3. If uncertain, return a low-severity comment with check "needs_review".
4. Plan first: Provide a structured checklist of checks to execute.
5. Then ACT by calling the server-side tools (deterministic TypeScript) to inspect notes, policy, charges, and diagnosis codes.
6. Finally OUTPUT: A JSON array of comments matching the schema:
[
  {
    "check": "string identifying the issue (e.g. icu_justification, diagnosis_support, room_rent_sublimit, policy_exclusion, duplicate_charge, clean)",
    "severity": "high" | "medium" | "low",
    "assignee_role": "billing" | "doctor",
    "focus": "ResourceType/id (e.g. ChargeItem/charge-001-2 or Condition/cond-001)",
    "explanation": "concise explanation under 40 words",
    "evidence": {
      "source": "ResourceType/id or Policy/Clause-X",
      "quote": "EXACT verbatim substring from the clinical note or policy"
    },
    "suggested_fix": {
      "type": "code_change" | "doctor_note" | "document_request" | "charge_correction",
      "draft": "actionable draft fix or addendum note (remember: never invent facts or vitals; leave a blank for undocumented reasons)"
    }
  }
]
If the claim is clean with zero discrepancies, output an empty array [] or a low severity "clean" comment.`;

  // Start chat/loop
  const contents: any[] = [
    {
      role: 'user',
      parts: [
        {
          text: `Please review encounter ${encounterId}. First output your review plan checklist as a JSON object with a "plan" array. Then use the available tools to investigate. Finally output your findings comments.`,
        },
      ],
    },
  ];

  let turn = 0;
  const maxTurns = 12;
  let rawComments: AgentComment[] = [];

  while (turn < maxTurns) {
    turn++;
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        temperature: 0.1,
        tools: [{ functionDeclarations: toolDeclarations as any }],
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content) break;

    contents.push(candidate.content);

    // Extract text output (may contain plan or final output)
    const textPart = candidate.content.parts?.find(p => p.text);
    if (textPart && textPart.text) {
      const text = textPart.text.trim();
      // Try parsing for plan
      if (text.includes('"plan"') || text.includes('checklist')) {
        try {
          const jsonMatch = text.match(/\{[\s\S]*"plan"[\s\S]*\}/);
          if (jsonMatch) {
            const planObj = JSON.parse(jsonMatch[0]);
            onEvent({ stage: 'plan', data: planObj });
          }
        } catch {
          onEvent({ stage: 'plan', data: { text } });
        }
      }

      // Check for comments JSON array
      if (text.includes('[') && text.includes('"check"') && text.includes('"severity"')) {
        try {
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            rawComments = JSON.parse(match[0]);
            onEvent({ stage: 'output', data: rawComments });
          }
        } catch (err) {
          console.warn('Could not parse comments array directly:', err);
        }
      }
    }

    // Check for tool calls
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const toolResponseParts: any[] = [];

      for (const fc of functionCalls) {
        onEvent({
          stage: 'tool_call',
          data: { name: fc.name, args: fc.args, turn },
        });

        let toolResult: any = null;
        try {
          if (fc.name === 'fhir_search') toolResult = await tools.fhir_search(fc.args as any);
          else if (fc.name === 'get_note_text') toolResult = await tools.get_note_text(fc.args as any);
          else if (fc.name === 'get_policy_clauses') toolResult = await tools.get_policy_clauses(fc.args as any);
          else if (fc.name === 'lookup_diagnosis_code') toolResult = await tools.lookup_diagnosis_code(fc.args as any);
          else if (fc.name === 'find_duplicate_charges') toolResult = await tools.find_duplicate_charges(fc.args as any);
          else if (fc.name === 'check_charge_totals') toolResult = await tools.check_charge_totals(fc.args as any);
          else if (fc.name === 'check_required_documents') toolResult = await tools.check_required_documents(fc.args as any);
          else toolResult = { error: `Unknown tool ${fc.name}` };
        } catch (err: any) {
          toolResult = { error: err.message || String(err) };
        }

        onEvent({
          stage: 'tool_result',
          data: { name: fc.name, result: toolResult, turn },
        });

        toolResponseParts.push({
          functionResponse: {
            name: fc.name,
            response: toolResult,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: toolResponseParts,
      });
    } else {
      // No more tool calls; Gemini has finished its generation
      break;
    }
  }

  // Step 3: VERIFICATION done in code, NOT by the model
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
          valueString: comment.suggested_fix.draft,
        },
      ],
    };

    const saved = (await source.create(task)) as Task;
    createdTasks.push(saved);
  }

  // If no issue tasks were created (e.g. clean encounter), record a completed audit task
  // so the encounter transitions from "Not reviewed" to "Ready"
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

  // Step 5: GATE calculation
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
