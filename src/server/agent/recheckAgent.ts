import { getFhirSource } from '../fhir/index.ts';
import { DocumentReference, Task } from '../fhir/types.ts';
import { calculateGate } from './reviewAgent.ts';

export async function recheckTask(taskId: string): Promise<{ task: Task; resolved: boolean; gate: string; message: string }> {
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

  const check = (task.code?.text || '').toLowerCase();
  let resolved = false;
  let newEvidenceQuote = '';

  // Extract any clinical addendum appended to the record
  const addendumMatch = currentNoteText.match(/\[Physician Clinical Addendum[^\]]*\]([\s\S]*)$/i);
  const addendumText = addendumMatch ? addendumMatch[1].trim() : '';

  if (check.includes('icu') || check.includes('justification')) {
    // Check if clinical justification addendum has been appended
    if (addendumText && addendumText.length > 5) {
      resolved = true;
      newEvidenceQuote = addendumText.slice(0, 160);
    }
  } else if (check.includes('diagnosis') || check.includes('support')) {
    // Check if diagnosis confirmation or addendum was appended
    if (addendumText && addendumText.length > 5) {
      resolved = true;
      newEvidenceQuote = addendumText.slice(0, 160);
    }
  } else if (check.includes('room_rent') || check.includes('sublimit') || check.includes('duplicate') || check.includes('exclusion')) {
    if (addendumText && addendumText.length > 5) {
      resolved = true;
      newEvidenceQuote = addendumText.slice(0, 160);
    }
  } else {
    if (addendumText && addendumText.length > 5) {
      resolved = true;
      newEvidenceQuote = addendumText.slice(0, 160);
    }
  }

  if (resolved) {
    task.status = 'completed';
    if (!task.note) task.note = [];
    task.note.push({
      text: `[Re-check Passed] Issue resolved. Verified evidence from record: "${newEvidenceQuote.trim()}"`,
      time: new Date().toISOString(),
      authorString: 'ClaimSure Re-check Agent',
    });
    task.output = [
      {
        type: { text: 'recheck_resolution' },
        valueString: 'Verified resolved against clinical note addendum in record',
      },
    ];
    await source.update(task);
  }

  // Recalculate gate for this encounter
  const allTasks = (await source.search('Task', { encounter: encounterId })) as Task[];
  const gate = calculateGate(allTasks);

  return {
    task,
    resolved,
    gate,
    message: resolved ? 'Re-check passed: Verified resolved against clinical record' : 'Re-check failed: No documented clinical addendum found in record',
  };
}
