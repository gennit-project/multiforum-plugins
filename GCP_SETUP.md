# Setting up plugins in GCP

This guide walks you (or any Multiforum self-hoster) through setting up Google Cloud to publish plugin bundles from GitHub Actions to a private GCS bucket.  
When you tag a release (e.g. `v0.1.0`), your workflow will build plugins, package them deterministically, upload to GCS, and update a `registry.json` that your Multiforum server can read.

---

## Set up environment variables

Replace values with your own project / repo IDs:

```
PROJECT_ID="your-gcp-project-id"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

REGION="us-central1"                      # or your preferred region
BUCKET="mf-plugins-prod"                  # GCS bucket name (must be globally unique)
SA_NAME="mf-plugins-publisher"            # service account name
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

POOL_ID="github-pool"                     # WIF pool id
PROVIDER_ID="github-provider"             # WIF provider id
REPO="your-github-org/your-plugins-repo"  # e.g. CatherineLuse/mf-official-plugins

```

---

## Enable required APIs

```
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  storage.googleapis.com \
  sts.googleapis.com
```

---

## Create the GCS bucket

### Create bucket with uniform bucket-level access

```bash
gcloud storage buckets create "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --uniform-bucket-level-access
```

### (Optional) Enable object versioning

```bash
gcloud storage buckets update "gs://${BUCKET}" --versioning
```

This lets you roll back `registry.json` or plugin bundles.

---

## Create the publisher service account

```bash
gcloud iam service-accounts create "${SA_NAME}" \
  --project="${PROJECT_ID}" \
  --description="Publishes plugin bundles and registry.json to GCS from GitHub Actions" \
  --display-name="MF Plugins Publisher"
```

### Grant bucket-scoped object admin role

```bash
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"
```

> ✅ This grants the SA access **only to this bucket**, not all buckets in the project.

---

## Confirm setup so far

```bash
# List service accounts
gcloud iam service-accounts list --project="${PROJECT_ID}"

# Show bucket IAM policy (verify your SA appears with storage.objectAdmin)
gcloud storage buckets get-iam-policy "gs://${BUCKET}" \
  --format="table(bindings.role, bindings.members)"
```

---

## Create a Workload Identity Federation pool

```bash
gcloud iam workload-identity-pools create "${POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

---

## Create an OIDC provider for GitHub

⚠️ **Permissions:** You need `roles/iam.workloadIdentityPoolAdmin` on the project to create providers.
If you see `PERMISSION_DENIED`, run (or ask an owner to run):

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="user:YOUR_EMAIL" \
  --role="roles/iam.workloadIdentityPoolAdmin"
```

### Create provider with attribute mapping & condition

```bash
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --display-name="GitHub OIDC Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="attribute.repository=='${REPO}' && startsWith(attribute.ref, 'refs/tags/')"
```

* `attribute.repository=='${REPO}'` → only trust tokens from your repo.
* `startsWith(attribute.ref, 'refs/tags/')` → only allow tags (e.g. `v0.1.0`).

---

## Allow your GitHub repo to impersonate the service account

Bind the repo to the SA so jobs can impersonate it:

```bash
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"
```

---

## Get the provider resource name

```bash
WIF_PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
echo "${WIF_PROVIDER_RESOURCE}"
```

You’ll paste this into GitHub as the secret `WIF_PROVIDER`.

---

## Add GitHub repository secrets

In your GitHub repo (Settings → Secrets and variables → Actions), add:

* **`WIF_PROVIDER`** →
  `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL_ID>/providers/<PROVIDER_ID>`

* **`GCP_SA_EMAIL`** →
  `<SA_NAME>@<PROJECT_ID>.iam.gserviceaccount.com`

---

## Optional: Minimal smoke test workflow

```yaml
# .github/workflows/smoke.yml
name: Smoke GCS

on: [workflow_dispatch]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_SA_EMAIL }}

      - uses: google-github-actions/setup-gcloud@v2

      - run: gcloud --version

      - name: List bucket (should succeed)
        run: gcloud storage ls gs://$GCS_BUCKET
```

Run it from the Actions tab; if it lists your bucket (or at least doesn’t 403), your setup is good.

---

## Use the Publish Plugins workflow

Drop the **Publish Plugins** workflow into `.github/workflows/publish-plugins.yml`.

When you push a tag like `v0.1.0`, it will:

* build each plugin,
* create deterministic tarballs (stable hashes),
* upload to `gs://$BUCKET/plugins/<id>/<version>/bundle.tgz` (+ `.sha256` and `plugin.json`),
* write `gs://$BUCKET/registry.json` at the bucket root.

Your Multiforum server will read `registry.json` to know what plugins are available.
