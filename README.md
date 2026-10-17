# ClaimSure — Hospital Claim-Readiness Agent

ClaimSure is an autonomous claim-readiness agent for hospital billing teams and medical directors. Built on **FHIR R4**, **Express (Node.js)**, **React (Vite)**, and **Vertex AI Gemini**, it evaluates inpatient clinical records against insurance policies before claims are submitted to Third Party Administrators (TPAs), catching audit risks and generating verifiable clinical tasks.

> **Notice**: Demo uses synthetic data only (Indian hospital billing specifications, Navjeevan Demo TPA / Kavach Demo General Insurance, amounts in INR ₹).

---

## 1. Architecture

ClaimSure packages the full-stack system in **ONE container**:
- **Frontend**: React 19 SPA styled with Tailwind CSS, supporting dual persona workflows (**Billing Specialist** vs. **Doctor Desk**), live Server-Sent Events (SSE) agent console, legacy HIS import view, multimodal bill scanner, and FHIR Claim export.
- **Backend**: Express server running on port `process.env.PORT || 3000` which serves the Vite-built static bundle and exposes `/api/*` endpoints.
- **FHIR R4 Data Layer (`FhirSource`)**:
  - `local`: In-memory persistence backed by JSON files in `/data/fhir/` and seeded from `/data/seed/*.json`.
  - `healthcare_api`: Direct REST integration with Google Cloud Healthcare API FHIR Store using `google-auth-library` GoogleAuth.
- **Autonomous Agent Loop**:
  - Runs Gemini Pro (`REVIEW_MODEL`) via `@google/genai` with `{ vertexai: true }` and Application Default Credentials (ADC).
  - Temperature 0.1, max 12 turns, with 7 deterministic TypeScript tools (`fhir_search`, `get_note_text`, `get_policy_clauses`, `lookup_diagnosis_code`, `find_duplicate_charges`, `check_charge_totals`, `check_required_documents`).
  - **Deterministic Code Verification**: Every generated comment's `evidence.quote` must exist verbatim in the cited document or policy text. Any hallucinated quote is dropped prior to FHIR Task creation.
  - **Gate State Machine**: Open high-severity task &rarr; **Blocked**; open medium-severity task &rarr; **Needs review**; all cleared &rarr; **Ready**.

---

## 2. Environment Variables

Configure these variables in your `.env` file or Cloud Run environment:

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port on which the Express server listens (Cloud Run sets this automatically) | `3000` |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud Project ID for Vertex AI and Cloud Healthcare API | Required for Vertex AI |
| `GEMINI_LOCATION` | Region/location for Vertex AI Gemini models | `"global"` |
| `GOOGLE_CLOUD_LOCATION` | Cloud Region strictly for Cloud Healthcare API (e.g. `asia-south1`, `us-central1`) | `asia-south1` |
| `FHIR_BACKEND` | Active FHIR store backend: `"local"` or `"healthcare_api"` | `"local"` |
| `FHIR_DATASET` | Cloud Healthcare API Dataset name (when `FHIR_BACKEND=healthcare_api`) | `claimsure-dataset` |
| `FHIR_STORE` | Cloud Healthcare API FHIR Store name | `claimsure-fhir-store` |
| `REVIEW_MODEL` | Gemini Pro-class model for autonomous claim readiness review | `gemini-2.5-pro` |
| `EXTRACT_MODEL` | Gemini Flash model for scanned document & bill multimodal extraction | `gemini-3.8-flash` |

---

## 3. Local Development

### Prerequisites
- Node.js 20+
- Google Cloud SDK (`gcloud`)

### Step 1: Authenticate with Application Default Credentials (ADC)
ClaimSure does **NOT** use API keys anywhere. All Google Cloud calls (Vertex AI Gemini & Cloud Healthcare API) use ADC:
```bash
gcloud auth application-default login
```

### Step 2: Set your Cloud Project
```bash
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GEMINI_LOCATION="global"
export GOOGLE_CLOUD_LOCATION="asia-south1"
export FHIR_BACKEND="local"
```

### Step 3: Install Dependencies and Start
```bash
npm install
npm run dev
```
The application will start on `http://localhost:3000` serving both the React frontend and `/api` routes.

---

## 4. Google Cloud Run Deployment

Deploy ClaimSure directly to Google Cloud Run in a single command using Cloud Build from source:

```bash
gcloud run deploy claimsure \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT="your-gcp-project-id",GEMINI_LOCATION="global",GOOGLE_CLOUD_LOCATION="asia-south1",FHIR_BACKEND="local",REVIEW_MODEL="gemini-2.5-pro",EXTRACT_MODEL="gemini-3.8-flash"
```

Cloud Run will build the container with the included `Dockerfile`, inject `PORT`, and allocate the Cloud Run Service URL.

---

## 5. Synthetic Inpatient Encounters

The seed dataset includes 6 clinical encounters illustrating common billing audit patterns:
1. **ENC-001 (Aarav Patel)**: 3 ICU days billed @ ₹18,000/day with only routine recovery notes and no ICU justification (**Blocked**).
2. **ENC-002 (Priya Sundaram)**: Claim diagnosis includes Acute Myocardial Infarction (I21.9), but cardiology discharge summary definitively ruled out MI and diagnosed GERD (**Blocked**).
3. **ENC-003 (Rajesh Sharma)**: Deluxe Suite Room billed at ₹9,500/night, exceeding policy sub-limit of ₹5,000/night (**Needs review**).
4. **ENC-004 (Ananya Iyer)**: Elective cosmetic rhinoplasty billed under General Surgery, falling under Policy Clause 4 Exclusions (**Blocked**).
5. **ENC-005 (Vikram Malhotra)**: Duplicate itemized charge for Post-Op Chest X-Ray (CPT 71045, ₹1,800) billed twice at identical timestamp (**Needs review**).
6. **ENC-006 (Sunita Kulkarni)**: Clean laparoscopic cholecystectomy claim with matching operative notes, authorized stay, and verified pre-auth (**Ready**).
