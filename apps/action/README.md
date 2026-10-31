# DejaView pull-request Action

The entry point is `src/main.ts`. The workflow template is [`workflows/dejaview.yml`](./workflows/dejaview.yml). Copy it into the root of the CPython demo fork at `.github/workflows/dejaview.yml`; GitHub does not discover workflow files in this DejaView repository's `apps/action/` folder.

The template checks out the PR's CPython fork and the DejaView source repository, installs dependencies from the DejaView root lockfile, then runs:

```sh
npx tsx apps/action/src/main.ts
```

Both checkouts set `persist-credentials: false`; the Action receives the GitHub token separately for the API calls it needs. Workflow runs are serialized by repository and PR number and do not cancel an in-progress comment update. A job-level condition skips PRs whose head repository differs from the demo fork, so external fork PRs do not receive either repository secret. GitHub also withholds repository secrets and write access from fork-originated `pull_request` runs by default.

The Action updates only comments containing `<!-- dejaview -->` authored by `github-actions[bot]`. Marker comments from other users are left untouched.

## Fork and repository setup

No CPython demo fork was available in this checkout, and GitHub CLI authentication is not configured here. To prepare the fork:

1. Sign in to the GitHub account that will own the demo fork.
2. Use GitHub's **Fork** action on [`python/cpython`](https://github.com/python/cpython) to create the fork. Keep the upstream repository unchanged.
3. Add `DEJAVIEW_API_URL` and `DEJAVIEW_API_TOKEN` under the fork's **Settings → Secrets and variables → Actions → Repository secrets**.
4. Add the workflow template at `.github/workflows/dejaview.yml` on the fork's default branch. The checkout step currently points at `niteshkumar7557/dejaview` on `main`; adjust that repository/ref if the DejaView project is hosted elsewhere or the Action has not been merged to `main`.
5. Keep `GITHUB_TOKEN` as the GitHub-provided `github.token`; do not create or commit a personal access token for it.

The workflow grants only `contents: read`, `pull-requests: read`, and `issues: write`. Do not disable workflows in the fork without first reviewing which ones are active there.

## Demo PR scenarios

The checkout has no extracted decision dataset or `examples/` decision fixtures, so there are no verified accepted or rejected decisions to use for a live demo yet. Do not present the sample response as evidence that the backend found historical decisions.

After the deployed API contains real linked decisions, a realistic accepted-decision scenario is a small change in `Lib/typing.py` associated with an accepted PEP 698 decision. A rejected-proposal scenario could use a rejected alternative from PEP 701, but select its actual title, rationale, and source links from the API's extracted records first. The scenarios should only be opened after those records and their code anchors have been verified in the dashboard.

## Saved contract example

[`examples/pr-check/input/pr.json`](../../examples/pr-check/input/pr.json) is a deterministic `PrCheckRequest` sample. [`examples/pr-check/output/response.json`](../../examples/pr-check/output/response.json) is a valid no-match `PrCheckResponse` fixture, and [`comment.md`](../../examples/pr-check/output/comment.md) is its exact `commentMarkdown`. The empty result intentionally contains no fabricated decision history. Replace it with a saved real API response when the demo dataset is available.

## Local checks

```sh
npx tsc --noEmit -p apps/action/tsconfig.json
npm test -- apps/action/test/action.test.ts
```
