# ClaimSure — Hospital Claim-Readiness Agent

ClaimSure is an institutional claim-readiness platform for hospital billing teams and medical directors. It analyzes synthetic inpatient encounters, validates clinical notes against hospital billing policies, detects audit risks (e.g., ICU sub-limits, unsupported diagnoses, exclusion clauses, duplicate charges), and generates actionable FHIR R4 Tasks with automated evidence verification.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions have been confirmed and incorporated into the design:

- **Confirmed Decision 1 (Vertex AI ADC Handling)**: Never fake or simulate Gemini outputs. If Application Default Credentials (`gcloud auth application-default login`) or Vertex AI configuration are missing, the UI displays a clear instructional banner (`Gemini not configured: run gcloud auth application-default login`) and disables the AI Review trigger. All local FHIR browsing, worklist operations, manual comments, overrides, task resolutions, and Claim export continue to function seamlessly without credentials.
- **Confirmed Decision 2 (Default Desk Persona)**: The application defaults to the **Billing Specialist desk**, with a quick role toggle to the **Physician / Medical Director desk**.
- **Confirmed Decision 3 (Audit Logging & Status Rules)**: Reason text is required strictly for billing overrides (`status: "cancelled"`, `statusReason.text: reason`). Resolving comments and doctor note approvals are single-click operations, with every status transition logged in the FHIR Task's `.note` array with role, timestamp, and audit trail.
- **Confirmed Decision 4 (Server Port Binding for Cloud Run)**: The Express server listens on `process.env.PORT || 3000` to bind properly to Google Cloud Run container port environments while supporting local development.
- **Confirmed Decision 5 (Indian Healthcare Context & TPA Billing)**:
  - Synthetic data utilizes invented Indian patient names.
  - All charges and room fees are denominated in Indian Rupees (INR, ₹).
  - Payer is structured as an Indian Third Party Administrator (TPA) / Health Insurer (e.g. *MediAssist TPA / Star Health Allied Insurance*).
  - Policy clauses reflect standard Indian health insurance terms: numbered clauses on Room Rent sub-limits (e.g., 1% of Sum Insured or ₹5,000/day for normal ward, ₹10,000/day for ICU), clinical ICU necessity criteria, exclusions (e.g., non-trauma cosmetic procedures, vitamins/supplements), and mandatory claim documents.
- **Design Tokens & Banner**: Professional healthcare visual design utilizing Hospital Teal (`#0B7A70`), Deep Clinical Navy (`#0F2A3D`), and crisp neutral surfaces. Persistent header banner: *"Demo uses synthetic data only."*

---

## 1. Overview & Core Concept

ClaimSure bridges the gap between clinical documentation and hospital revenue cycle management:
- **Worklist & Readiness Gating**: Inpatient encounters categorized as **Blocked** (high-severity issues), **Needs Review** (medium-severity issues), or **Ready** (clean or resolved).
- **Autonomous Agentic Review Loop**: 12-turn Gemini agent loop with function calling to plan checks, execute server-side deterministic tools, and draft targeted fixes.
- **Strict Verbatim Code Verification**: Server-side programmatic validation ensuring every cited quote appears verbatim in patient notes or policies before saving.
- **FHIR R4 Native Architecture**: Everything is stored and tracked as FHIR resources (`Patient`, `Encounter`, `Coverage`, `Condition`, `Procedure`, `ChargeItem`, `DocumentReference`, `Task`, `Claim`).
- **Dual Data Source Support**: In-memory local file store and Google Cloud Healthcare API FHIR store.
- **Legacy & Document Ingestion**: CSV importer for messy legacy HIS data and multimodal extraction for scanned medical bills.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Worklist Dashboard (Billing Desk)**:
   - High-density encounter list with patient name, encounter ID, admission dates, primary diagnosis, TPA payer coverage, and readiness gate status.
   - Quick filters (All, Blocked, Needs Review, Ready) and live search.
   - Global demo controls: Data Source indicator, "Reset Demo" button, and Role Switcher (Billing vs. Doctor).
2. **Encounter Review & Interactive Agent Console**:
   - Split-screen workspace: Left panel displays patient details, TPA insurance coverage, itemized charges in ₹, discharge summary notes, and policy excerpts.
   - Right panel features the **Claim Readiness Agent Console**. When clicking "Run Readiness Review":
     - Live Server-Sent Events (SSE) stream the Agent Plan and step-by-step tool executions.
     - Real-time comment cards appear with severity tags, assigned roles, explanations, and exact quotes.
3. **Role-Based Resolution & Action Desk**:
   - **Billing Specialist**: Can resolve verified comments or trigger an Override modal requiring an audit rationale.
   - **Doctor Desk**: Filtered view for physician-assigned tasks (e.g., missing clinical justification). Doctors can review drafted addenda, edit note text, and approve with a single click—automatically appending the text to the patient's `DocumentReference` and triggering an instant re-check (`/api/recheck/:taskId`).
4. **Export FHIR Claim**:
   - Once all high and medium tasks are cleared, the encounter flips to **Ready**.
   - An "Export FHIR Claim" action generates and downloads a validated FHIR R4 Institutional Claim JSON.
5. **Data Adapters**:
   - **Legacy HIS Importer**: Side-by-side view showing raw CSV data (messy dates, unstructured diagnoses) and normalized FHIR bundles.
   - **Scanned Document Extractor**: Upload PDF/image, inspect multimodal Gemini extraction, preview extracted FHIR resources, and confirm insertion.

### Visual Identity & Theme
- **Primary Teal**: `#0B7A70` (CTAs, active tabs, verified badges)
- **Deep Navy**: `#0F2A3D` (Sidebar, header accents, high-contrast structural text)
- **Status Accents**:
  - Blocked: `#DC2626` (Red)
  - Needs Review: `#D97706` (Amber)
  - Ready: `#16A34A` (Emerald)
- **Typography**: Clean sans display font (`Plus Jakarta Sans`) paired with dense body typography (`Public Sans` / `DM Sans`) and tabular numerals (`JetBrains Mono` / `tabular-nums`).
- **Layout Presence**: Full 1440px enterprise desktop layout, strict 3-zone top bar, unboxed metadata with bullet separators (`·`), and single-elevation cards.

---

## 3. Key Product Decisions & Trade-Offs

- **Single Container Full-Stack Architecture**: Express server running on `process.env.PORT || 3000` hosts both the `/api` routes (including SSE streaming) and serves the Vite-compiled React SPA. In development, Express leverages Vite middleware for instant HMR; in production, Express serves `/dist` statically.
- **Application Default Credentials (ADC) without Keys**: `@google/genai` is initialized with `{ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION }`. GoogleAuth from `google-auth-library` manages Bearer tokens for Cloud Healthcare API. Zero secrets or keys in client bundles.
- **Deterministic Verbatim Verification in Code**: Gemini proposes comments, but a TypeScript validation function inspects the actual resource text (`discharge-note.txt` or `policy.txt`) to confirm the exact quoted string exists. Unverified or hallucinated quotes are discarded prior to Task creation.
- **FHIR R4 Task State Machine**: Tasks serve as the single source of truth for all claim readiness issues. Task status transitions (`requested` -> `completed` or `cancelled`) automatically re-evaluate the Encounter readiness gate.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ClaimSure React Frontend                        │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ Worklist / Encounters   │  │ Review Desk (Billing & Doctor View) │  │
│  └───────────┬─────────────┘  └──────────────────┬──────────────────┘  │
│              │                                   │                     │
│  ┌───────────┴─────────────┐  ┌──────────────────┴──────────────────┐  │
│  │ Legacy HIS CSV Importer │  │ Multimodal Document Upload & Preview│  │
│  └─────────────────────────┘  └─────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / SSE (/api/*)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Express Full-Stack Server                        │
│              (listening on process.env.PORT || 3000)                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ API Endpoints: /api/encounters, /api/review/:id, /api/tasks      │  │
│  │               /api/recheck/:id, /api/export/:id, /api/reset      │  │
│  │               /api/legacy-import, /api/extract-doc               │  │
│  └──────────────────┬────────────────────────────┬──────────────────┘  │
│                     │                            │                     │
│  ┌──────────────────▼───────────┐  ┌─────────────▼──────────────────┐  │
│  │ Gemini Agent Engine (Vertex) │  │ FhirSource Interface           │  │
│  │ - Checklist Planner          │  │ ├─ LocalJsonFhirSource (/data) │  │
│  │ - Function Calling Loop (x12)│  │ └─ HealthcareApiFhirSource     │  │
│  │ - Quote Verification Gate    │  └────────────────────────────────┘  │
│  └──────────────────────────────┘                                      │
└────────────────────────────────────────────────────────────────────────┘
```

### 6 Synthetic Patient Encounters Seeded (Indian Context):
1. **ENC-001 (Aarav Patel)**: 3 ICU days billed at ₹18,000/day with only routine post-op recovery ward notes and no clinical ICU admission justification.
2. **ENC-002 (Priya Sundaram)**: Claim diagnosis includes Acute Myocardial Infarction (I21.9), but cardiology discharge summary explicitly rules out MI (troponin negative, diagnosed with GERD / non-cardiac chest pain).
3. **ENC-003 (Rajesh Sharma)**: Deluxe Suite Room billed at ₹9,500/night, exceeding MediAssist TPA policy room rent sub-limit of ₹5,000/night.
4. **ENC-004 (Ananya Iyer)**: Rhinoplasty itemized at ₹85,000 under General Surgery, falling directly under Policy Clause 4 Exclusions (elective cosmetic procedure without documented trauma).
5. **ENC-005 (Vikram Malhotra)**: Duplicate itemized charge for Post-Op Chest X-Ray (CPT/NABH 71045, ₹1,800) billed twice with identical service timestamps.
6. **ENC-006 (Sunita Kulkarni)**: Pristine laparoscopic cholecystectomy claim with matching operative notes, authorized stay, verified pre-auth from MediAssist TPA, and clean coding.

---

## 5. Execution Steps

1. **Phase 1: Data Layer & Seeds**:
   - Install `google-auth-library` and create `/data/policy.txt` (Indian health insurance policy with numbered clauses and ₹ limits), `/data/expected.json`, `/data/icd10_subset.json`.
   - Create 6 realistic FHIR R4 JSON transaction bundles in `/data/seed/*.json` with Indian patient names, TPAs, and INR currency.
   - Implement `FhirSource` interface and `LocalJsonFhirSource` with in-memory persistence and file seeding.
   - Implement `POST /api/reset` and CRUD `/api/encounters` endpoints.
2. **Phase 2: Agent, Verification, and Review Desk**:
   - Implement the server-side Gemini function calling engine with SSE streaming (`POST /api/review/:encounterId`).
   - Implement tools: `fhir_search`, `get_note_text`, `get_policy_clauses`, `lookup_diagnosis_code`, `find_duplicate_charges`, `check_charge_totals`, `check_required_documents`.
   - Build server-side verbatim verification check to reject hallucinated quotes.
   - Build FHIR Task generator and Encounter Gate calculator (Blocked / Needs Review / Ready).
   - Build React interface: Worklist, Review Console with live SSE event stream, Role Switcher (Billing vs Doctor), Override modal with rationale tracking, Doctor Note approval flow, instant recheck (`POST /api/recheck/:taskId`), and FHIR Claim Export.
3. **Phase 3: Cloud Healthcare API Backend**:
   - Implement `HealthcareApiFhirSource` using `google-auth-library` GoogleAuth and REST FHIR store.
   - Wire backend switching via `FHIR_BACKEND` env var and display active source badge in header.
4. **Phase 4: Legacy & Document Ingestion**:
   - Create synthetic legacy HIS CSV files in `/data/legacy/` and CSV import mapping tool with side-by-side viewer.
   - Implement multimodal document extraction endpoint using `EXTRACT_MODEL` with visual review before saving.
5. **Packaging & Delivery**:
   - Create multi-stage `Dockerfile` (using `PORT`), and comprehensive `README.md`.
   - Verify build and TypeScript compilation.
