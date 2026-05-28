# Retrieval Workbench Fixture Contract

The first retrieval workbench fixture is a hand-written JSON file at `fixtures/retrieval-workbench/seed.json`.

The fixture mirrors early Sanity-shaped documents instead of introducing a generic retrieval-only model. Each document has:

- `_id`
- `_type`
- `title`
- `contentMap`

`Concern` documents use `_type: "concern"` and add:

- `concernArea`
- `parentSignals`
- optional `relatedConcerns`

Every non-Concern Content Entity must include `relatedConcerns`, represented as Sanity reference objects:

```json
{ "_type": "reference", "_ref": "concern-allergy-medical-safety" }
```

Type-specific fields stay directly on the document, matching the intended Sanity schema direction. For example, `session` documents can expose `ageRange` and `priceCad`, while a `claim` can expose `claimSources`.

The `goldSet` array contains Parent Prompt expectations:

- `_id`
- `prompt`
- `expectedConcernIds`
- `requiredContentEntityIds`
- optional `supportingContentEntityIds`
- optional `requiredSourceOfTruthIds`

The current validator enforces the first seed corpus bounds from issue 1:

- 6 to 8 Concern documents
- 15 to 25 non-Concern Content Entities
- 8 to 12 gold-set Parent Prompts
- unique document ids
- `relatedConcerns` references that point at existing Concern documents
- gold-set ids that point at existing fixture documents

Run the local validation command with:

```sh
npm run workbench
```
