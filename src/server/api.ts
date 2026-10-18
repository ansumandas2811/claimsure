import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { generateFhirClaim } from './agent/claimExport.ts';
import { recheckTask } from './agent/recheckAgent.ts';
import { calculateGate, isGeminiConfigured, runReviewAgent } from './agent/reviewAgent.ts';
import { extractDocumentMultimodal, saveExtractedBundle } from './documents/documentExtractor.ts';
import { getFhirSource, setFhirSourceBackend } from './fhir/index.ts';
import { ChargeItem, Condition, Coverage, DocumentReference, Encounter, Patient, Task } from './fhir/types.ts';
import { commitLegacyToFhirStore, convertLegacyToFhir, loadLegacyCsvData } from './legacy/legacyAdapter.ts';

export const apiRouter = Router();

/**
 * GET /api/status - System and environment status
 */
apiRouter.get('/status', (req: Request, res: Response) => {
  const source = getFhirSource();
  const geminiCheck = isGeminiConfigured();

  res.json({
    activeBackend: source.backendType,
    backendLabel: source.backendType === 'healthcare_api' ? 'Cloud Healthcare API' : 'Local FHIR files',
    geminiConfigured: geminiCheck.configured,
    geminiReason: geminiCheck.reason,
    env: {
      project: process.env.GOOGLE_CLOUD_PROJECT || '(not set)',
      location: process.env.GOOGLE_CLOUD_LOCATION || '(not set)',
      geminiLocation: process.env.GEMINI_LOCATION || 'global',
      fhirDataset: process.env.FHIR_DATASET || '(not set)',
      fhirStore: process.env.FHIR_STORE || '(not set)',
      reviewModel: process.env.REVIEW_MODEL || 'gemini-3.8-flash',
      extractModel: process.env.EXTRACT_MODEL || 'gemini-3.8-flash',
    },
  });
});

/**
 * POST /api/backend - Switch data backend
 */
apiRouter.post('/backend', (req: Request, res: Response) => {
  const { backend } = req.body;
  if (backend !== 'local' && backend !== 'healthcare_api') {
    res.status(400).json({ error: 'Invalid backend. Must be "local" or "healthcare_api".' });
    return;
  }
  const source = setFhirSourceBackend(backend);
  res.json({
    activeBackend: source.backendType,
    backendLabel: source.backendType === 'healthcare_api' ? 'Cloud Healthcare API' : 'Local FHIR files',
  });
});

/**
 * POST /api/reset - Re-seed the active backend
 */
apiRouter.post('/reset', async (req: Request, res: Response) => {
  try {
    const source = getFhirSource();
    await source.reset();
    res.json({ success: true, message: `Successfully re-seeded ${source.backendType} backend with 6 synthetic encounters.` });
  } catch (err: any) {
    res.status(500).json({ error: `Reset failed: ${err.message || String(err)}` });
  }
});

/**
 * Helper to compute encounter summaries
 */
async function getEncounterSummaries() {
  const source = getFhirSource();
  const encounters = (await source.search('Encounter', {})) as Encounter[];
  const summaries = [];

  for (const enc of encounters) {
    const bundle = await source.getEncounterBundle(enc.id);
    if (!bundle || !bundle.entry) continue;

    const resources = bundle.entry.map(e => e.resource).filter(Boolean);
    const patient = resources.find((r): r is Patient => r?.resourceType === 'Patient');
    const coverage = resources.find((r): r is Coverage => r?.resourceType === 'Coverage');
    const condition = resources.find((r): r is Condition => r?.resourceType === 'Condition');
    const charges = resources.filter((r): r is ChargeItem => r?.resourceType === 'ChargeItem');
    const tasks = resources.filter((r): r is Task => r?.resourceType === 'Task');

    const totalInr = charges.reduce((acc, c) => acc + (c.priceOverride?.value || 0), 0);
    const gate = calculateGate(tasks);

    const givenName = patient?.name?.[0]?.given?.join(' ') || '';
    const familyName = patient?.name?.[0]?.family || '';
    const patientName = `${givenName} ${familyName}`.trim() || 'Unknown Patient';

    const payorDisplay = coverage?.payor?.[0]?.display || 'Navjeevan Demo TPA / Kavach Demo General Insurance';
    const planName = coverage?.class?.[0]?.name || coverage?.class?.[0]?.value || 'Corporate Health Suraksha';

    const openTasks = tasks.filter(t => t.status === 'requested' || t.status === 'in-progress');

    summaries.push({
      id: enc.id,
      patientId: patient?.id || '',
      patientName,
      gender: patient?.gender || 'unknown',
      birthDate: patient?.birthDate || '',
      period: enc.period || {},
      payorDisplay,
      payerPlan: `${planName} (${payorDisplay})`,
      diagnosis: condition?.code?.text || condition?.code?.coding?.[0]?.display || 'Uncoded Diagnosis',
      diagnosisCode: condition?.code?.coding?.[0]?.code || '',
      totalInr,
      gate,
      tasksCount: {
        total: tasks.length,
        open: openTasks.length,
        high: openTasks.filter(t => t.businessStatus?.text?.toLowerCase() === 'high').length,
        medium: openTasks.filter(t => t.businessStatus?.text?.toLowerCase() === 'medium').length,
        low: openTasks.filter(t => t.businessStatus?.text?.toLowerCase() === 'low').length,
      },
      openTasks: openTasks.map(t => ({
        id: t.id,
        check: t.code?.text || 'unspecified_check',
        severity: (t.businessStatus?.text?.toLowerCase() || 'medium') as 'high' | 'medium' | 'low',
        description: t.description || '',
        owner: t.owner?.display || 'Billing',
      })),
    });
  }

  // Sort by encounter ID
  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

/**
 * GET /api/tasks - List all open and closed tasks across all encounters
 */
apiRouter.get('/tasks', async (req: Request, res: Response) => {
  try {
    const source = getFhirSource();
    const tasks = (await source.search('Task', {})) as Task[];
    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * GET /api/encounters - List all encounters with readiness pill
 */
apiRouter.get('/encounters', async (req: Request, res: Response) => {
  try {
    const list = await getEncounterSummaries();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * GET /api/encounters/:id - Full encounter details
 */
apiRouter.get('/encounters/:id', async (req: Request, res: Response) => {
  try {
    const source = getFhirSource();
    const bundle = await source.getEncounterBundle(req.params.id);
    if (!bundle || !bundle.entry) {
      res.status(404).json({ error: `Encounter ${req.params.id} not found` });
      return;
    }

    const resources = bundle.entry.map(e => e.resource).filter(Boolean);
    const encounter = resources.find((r): r is Encounter => r?.resourceType === 'Encounter');
    const patient = resources.find((r): r is Patient => r?.resourceType === 'Patient');
    const coverage = resources.find((r): r is Coverage => r?.resourceType === 'Coverage');
    const conditions = resources.filter((r): r is Condition => r?.resourceType === 'Condition');
    const charges = resources.filter((r): r is ChargeItem => r?.resourceType === 'ChargeItem');
    const docRefs = resources.filter((r): r is DocumentReference => r?.resourceType === 'DocumentReference');
    const tasks = resources.filter((r): r is Task => r?.resourceType === 'Task');

    // Decode docRef plain text
    const documents = docRefs.map(doc => {
      let text = doc.description || '';
      if (doc.content?.[0]?.attachment?.data) {
        try {
          const decoded = Buffer.from(doc.content[0].attachment.data, 'base64').toString('utf-8');
          if (decoded) text = decoded;
        } catch {}
      }
      return {
        id: doc.id,
        title: doc.content?.[0]?.attachment?.title || doc.type?.text || 'Discharge Summary',
        text,
      };
    });

    const gate = calculateGate(tasks);
    const totalInr = charges.reduce((acc, c) => acc + (c.priceOverride?.value || 0), 0);

    res.json({
      encounter,
      patient,
      coverage,
      conditions,
      charges,
      documents,
      tasks,
      gate,
      totalInr,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /api/review/:encounterId - Run agent loop with SSE streaming
 */
apiRouter.post('/review/:encounterId', async (req: Request, res: Response) => {
  const { encounterId } = req.params;

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const config = isGeminiConfigured();
    if (!config.configured) {
      const errorMsg = `Not reviewed: Gemini unavailable (${config.reason || 'configuration missing'}). No findings were created.`;
      console.error(`[api] ${errorMsg}`);
      sendEvent({
        stage: 'error',
        data: {
          error: errorMsg,
        },
      });
      res.end();
      return;
    }

    await runReviewAgent(encounterId, event => {
      sendEvent(event);
    });

    res.end();
  } catch (err: any) {
    const errorMsg = `Not reviewed: Gemini unavailable (${err.message || String(err)}). No findings were created.`;
    console.error('Review agent error:', errorMsg);
    sendEvent({
      stage: 'error',
      data: { error: errorMsg },
    });
    res.end();
  }
});

/**
 * POST /api/review-all - Batch audit all encounters
 */
apiRouter.post('/review-all', async (req: Request, res: Response) => {
  try {
    const config = isGeminiConfigured();
    if (!config.configured) {
      res.status(503).json({
        error: `Not reviewed: Gemini unavailable (${config.reason || 'configuration missing'}). No findings were created.`,
      });
      return;
    }
    const source = getFhirSource();
    const encounters = (await source.search('Encounter', {})) as Encounter[];
    const audited = [];
    for (const enc of encounters) {
      const outcome = await runReviewAgent(enc.id, () => {});
      audited.push({ encounterId: enc.id, gate: outcome.gate, taskCount: outcome.tasks.length, error: outcome.error });
    }
    res.json({ success: true, auditedCount: audited.length, audited });
  } catch (err: any) {
    res.status(500).json({ error: `Not reviewed: Gemini unavailable (${err.message || String(err)}). No findings were created.` });
  }
});

/**
 * POST /api/tasks/:taskId/resolve - Billing resolves a Task
 */
apiRouter.post('/tasks/:taskId/resolve', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const source = getFhirSource();
    const tasks = (await source.search('Task', { _id: taskId })) as Task[];
    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = tasks[0];
    task.status = 'completed';
    if (!task.note) task.note = [];
    task.note.push({
      text: 'Issue resolved by Billing Specialist',
      time: new Date().toISOString(),
      authorString: 'Billing Specialist',
    });

    await source.update(task);

    // Get updated gate
    const encounterRef = task.encounter?.reference;
    const encounterId = encounterRef?.replace('Encounter/', '') || '';
    const allTasks = (await source.search('Task', { encounter: encounterId })) as Task[];
    const gate = calculateGate(allTasks);

    res.json({ success: true, task, gate });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /api/tasks/:taskId/override - Billing overrides with mandatory reason
 */
apiRouter.post('/tasks/:taskId/override', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'An override reason is mandatory to document regulatory compliance.' });
      return;
    }

    const source = getFhirSource();
    const tasks = (await source.search('Task', { _id: taskId })) as Task[];
    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = tasks[0];
    task.status = 'cancelled';
    task.statusReason = { text: reason.trim() };

    if (!task.note) task.note = [];
    task.note.push({
      text: `[Billing Override] Reason: "${reason.trim()}"`,
      time: new Date().toISOString(),
      authorString: 'Billing Specialist',
    });

    await source.update(task);

    // Get updated gate
    const encounterRef = task.encounter?.reference;
    const encounterId = encounterRef?.replace('Encounter/', '') || '';
    const allTasks = (await source.search('Task', { encounter: encounterId })) as Task[];
    const gate = calculateGate(allTasks);

    res.json({ success: true, task, gate });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /api/tasks/:taskId/doctor-approve - Doctor edits/approves drafted note
 */
apiRouter.post('/tasks/:taskId/doctor-approve', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { noteDraft } = req.body;

    if (!noteDraft || !noteDraft.trim()) {
      res.status(400).json({ error: 'Approved note text cannot be empty.' });
      return;
    }

    const source = getFhirSource();
    const tasks = (await source.search('Task', { _id: taskId })) as Task[];
    if (tasks.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const task = tasks[0];
    const encounterRef = task.encounter?.reference;
    const encounterId = encounterRef?.replace('Encounter/', '') || '';

    // Find and update the encounter's DocumentReference
    const bundle = await source.getEncounterBundle(encounterId);
    if (!bundle || !bundle.entry) {
      res.status(404).json({ error: 'Encounter bundle not found' });
      return;
    }

    const doc = bundle.entry
      .map(e => e.resource)
      .find((r): r is DocumentReference => r?.resourceType === 'DocumentReference');

    if (doc) {
      let existingText = doc.description || '';
      if (doc.content?.[0]?.attachment?.data) {
        try {
          const decoded = Buffer.from(doc.content[0].attachment.data, 'base64').toString('utf-8');
          if (decoded) existingText = decoded;
        } catch {}
      }

      const appendMarker = `\n\n[Physician Clinical Addendum - ${new Date().toLocaleDateString('en-IN')}]\n${noteDraft.trim()}`;
      const updatedText = existingText + appendMarker;

      doc.description = updatedText;
      if (doc.content && doc.content.length > 0 && doc.content[0].attachment) {
        doc.content[0].attachment.data = Buffer.from(updatedText, 'utf-8').toString('base64');
      }
      await source.update(doc);
    }

    // Add note to task
    if (!task.note) task.note = [];
    task.note.push({
      text: `[Doctor Note Approved & Appended]: "${noteDraft.trim()}"`,
      time: new Date().toISOString(),
      authorString: 'Treating Physician',
    });
    await source.update(task);

    // Trigger instant recheck
    const recheckResult = await recheckTask(taskId);

    res.json({
      success: true,
      task: recheckResult.task,
      gate: recheckResult.gate,
      resolved: recheckResult.resolved,
      message: recheckResult.message,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /api/recheck/:taskId - Re-check single task
 */
apiRouter.post('/recheck/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const result = await recheckTask(taskId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * GET /api/export/:encounterId - Download valid FHIR R4 Claim
 */
apiRouter.get('/export/:encounterId', async (req: Request, res: Response) => {
  try {
    const { encounterId } = req.params;
    const claim = await generateFhirClaim(encounterId);
    res.setHeader('Content-Type', 'application/fhir+json');
    res.setHeader('Content-Disposition', `attachment; filename="Claim_${encounterId}_institutional.json"`);
    res.json(claim);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * GET /api/policy - Return policy text and clauses
 */
apiRouter.get('/policy', (req: Request, res: Response) => {
  const policyPath = path.resolve(process.cwd(), 'data', 'policy.txt');
  if (!fs.existsSync(policyPath)) {
    res.status(404).json({ error: 'Policy file not found' });
    return;
  }
  const content = fs.readFileSync(policyPath, 'utf-8');
  res.json({ policyText: content });
});

/**
 * GET /api/legacy/preview - Preview legacy CSVs and converted FHIR
 */
apiRouter.get('/legacy/preview', (req: Request, res: Response) => {
  try {
    const data = loadLegacyCsvData();
    const bundle = convertLegacyToFhir();
    res.json({
      rawCsvs: data.raw,
      parsedRows: data.parsed,
      fhirBundle: bundle,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /api/legacy/commit - Write converted legacy data into FHIR store
 */
apiRouter.post('/legacy/commit', async (req: Request, res: Response) => {
  try {
    const result = await commitLegacyToFhirStore();
    res.json({
      success: true,
      ...result,
      message: `Successfully imported ${result.importedEncounters} encounters (${result.totalResources} FHIR resources) from legacy HIS CSVs.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /api/documents/extract - Multimodal extraction of scanned bill/doc
 */
apiRouter.post('/documents/extract', async (req: Request, res: Response) => {
  try {
    const { base64Data, mimeType } = req.body;
    if (!base64Data) {
      res.status(400).json({ error: 'Missing base64Data in request body' });
      return;
    }
    const result = await extractDocumentMultimodal(base64Data, mimeType || 'image/jpeg');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/**
 * POST /api/documents/confirm - Save extracted bundle to FHIR store
 */
apiRouter.post('/documents/confirm', async (req: Request, res: Response) => {
  try {
    const { bundle } = req.body;
    if (!bundle) {
      res.status(400).json({ error: 'Missing bundle in request body' });
      return;
    }
    await saveExtractedBundle(bundle);
    res.json({ success: true, message: 'Extracted encounter successfully saved to FHIR store.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});
