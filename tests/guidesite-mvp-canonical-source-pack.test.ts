import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePackPath = "fixtures/guidesite-mvp/canonical-source-pack.json";

type SanityReference = {
  _type: "reference";
  _ref: string;
};

type CanonicalSource = {
  _id: string;
  _type: string;
  _rev: string;
  title: string;
  contentMap?: string;
  summary?: string;
  body?: string;
  relatedConcerns?: SanityReference[];
  contextNeeds?: string[];
};

type CanonicalSourcePack = {
  fixtureVersion: 1;
  description: string;
  documents: CanonicalSource[];
};

const requiredSourceIds = [
  "program_overnight",
  "policy_homesickness",
  "policy_parent_communication",
  "concern_homesickness",
  "prompt_template_sleepaway_experience",
  "prompt_template_child_readiness",
] as const;

async function readSourcePack(): Promise<CanonicalSourcePack> {
  const rawFixture = await readFile(sourcePackPath, "utf8");
  return JSON.parse(rawFixture) as CanonicalSourcePack;
}

test("canonical GuideSite MVP source pack satisfies issue #22 fixture contract", async () => {
  const sourcePack = await readSourcePack();
  const documentsById = new Map(sourcePack.documents.map((document) => [document._id, document]));

  assert.equal(sourcePack.fixtureVersion, 1);
  assert.match(sourcePack.description, /canonical/i);
  assert.deepEqual([...documentsById.keys()].sort(), [...new Set(documentsById.keys())].sort());

  for (const sourceId of requiredSourceIds) {
    const source = documentsById.get(sourceId);
    assert.ok(source, `Missing required canonical source: ${sourceId}`);
    assert.equal(source._id, sourceId);
    assert.match(source._type, /\S/, `${sourceId} needs an explicit source type`);
    assert.match(source.title, /\S/, `${sourceId} needs a title`);
    assert.match(source._rev, /^mock_rev_/, `${sourceId} needs mock revision metadata`);
    assert.ok(source.summary || source.body || source.contentMap, `${sourceId} needs body, summary, or contentMap`);
  }

  assert.equal(documentsById.get("program_overnight")?._type, "campProgram");
  assert.equal(documentsById.get("policy_homesickness")?._type, "policy");
  assert.equal(documentsById.get("policy_parent_communication")?._type, "policy");
  assert.equal(documentsById.get("concern_homesickness")?._type, "concern");
  assert.equal(documentsById.get("prompt_template_sleepaway_experience")?._type, "promptTemplate");
  assert.equal(documentsById.get("prompt_template_child_readiness")?._type, "promptTemplate");

  assert.match(documentsById.get("policy_homesickness")?.summary ?? "", /homesick|homesickness/i);
  assert.match(documentsById.get("policy_parent_communication")?.summary ?? "", /parent communication|contact/i);
  assert.deepEqual(documentsById.get("prompt_template_sleepaway_experience")?.contextNeeds, [
    "prior_sleepaway_experience",
  ]);
  assert.deepEqual(documentsById.get("prompt_template_child_readiness")?.contextNeeds, ["child_readiness"]);
});

test("canonical source pack can normalize into MVP citation source refs", async () => {
  const sourcePack = await readSourcePack();

  const sourceRefs = sourcePack.documents.map((source) => ({
    sourceId: source._id,
    sourceType: source._type,
    title: source.title,
    fieldPath: source.summary ? "summary" : source.body ? "body" : "contentMap",
    sourceRevision: source._rev,
  }));

  assert.ok(sourceRefs.length >= requiredSourceIds.length);

  for (const sourceRef of sourceRefs) {
    assert.match(sourceRef.sourceId, /\S/);
    assert.match(sourceRef.sourceType, /\S/);
    assert.match(sourceRef.title, /\S/);
    assert.match(sourceRef.fieldPath, /^(summary|body|contentMap)$/);
    assert.match(sourceRef.sourceRevision, /^mock_rev_/);
  }
});
