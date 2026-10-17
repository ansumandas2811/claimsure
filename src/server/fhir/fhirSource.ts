import { Bundle, FhirResource } from './types.ts';

export interface FhirSource {
  readonly backendType: 'local' | 'healthcare_api';

  /**
   * Retrieves all resources related to an Encounter (Patient, Encounter, Coverage,
   * Conditions, Procedures, ChargeItems, DocumentReferences, Tasks).
   */
  getEncounterBundle(encounterId: string): Promise<Bundle | null>;

  /**
   * Searches for resources of a given type matching the provided parameters.
   */
  search(type: string, params: Record<string, string>): Promise<FhirResource[]>;

  /**
   * Creates a new resource.
   */
  create(resource: FhirResource): Promise<FhirResource>;

  /**
   * Updates an existing resource.
   */
  update(resource: FhirResource): Promise<FhirResource>;

  /**
   * Executes a FHIR transaction bundle.
   */
  executeTransaction(bundle: Bundle): Promise<Bundle>;

  /**
   * Re-seeds the data store from seed bundles.
   */
  reset(): Promise<void>;
}
