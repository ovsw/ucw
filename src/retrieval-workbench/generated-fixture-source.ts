import type { ContentEntityDocument, ParentPromptExpectation, SanityReference } from "./types.js";

function reference(ref: string): SanityReference {
  return { _type: "reference", _ref: ref };
}

export const generatedFixtureDocuments: ContentEntityDocument[] = [
  {
    _id: "policy-bullying-response",
    _type: "policy",
    title: "Bullying detection and response policy",
    contentMap:
      "Counselors monitor cabin time, meals, activities, and transitions. Camp uses a reporting process for campers who feel unsafe and escalates concerns when needed.",
    relatedConcerns: [reference("concern-homesickness-readiness"), reference("concern-cabin-social-fit")],
    sourceKind: "sourceOfTruth",
    policyOwner: "Camp Director",
    sensitiveUse: true,
  },
  {
    _id: "testimonial-shy-first-time-camper",
    _type: "testimonial",
    title: "Parent story about a shy first-time camper",
    contentMap:
      "A parent describes a nervous first-time camper, letters home, staff reassurance, and the child growing in confidence by pickup.",
    relatedConcerns: [reference("concern-homesickness-readiness")],
    sourceKind: "supportingSource",
  },
  {
    _id: "program-day-camp",
    _type: "program",
    title: "Day camp alternative",
    contentMap:
      "A day camp option for families who want a gentler starting point than overnight camp, with daily pickup and a shorter separation window.",
    relatedConcerns: [reference("concern-homesickness-readiness"), reference("concern-pricing-affordability")],
    sourceKind: "sourceOfTruth",
    format: "day",
  },
  {
    _id: "policy-parent-communication",
    _type: "policy",
    title: "Parent communication and escalation policy",
    contentMap:
      "Explains when the camp contacts parents, how routine updates work, and how families reach the office when a child is nervous or needs attention.",
    relatedConcerns: [reference("concern-homesickness-readiness"), reference("concern-allergy-medical-safety")],
    sourceKind: "sourceOfTruth",
    communicationChannels: ["camp office", "letters", "emergency call"],
  },
  {
    _id: "staff-standard-supervision",
    _type: "staffStandard",
    title: "Counselor supervision standard",
    contentMap:
      "Describes supervision ratios, transition coverage, and when counselors stay with campers during activities and at the waterfront.",
    relatedConcerns: [reference("concern-swimming-water-safety"), reference("concern-cabin-social-fit")],
    sourceKind: "sourceOfTruth",
    supervisionContext: ["activities", "transitions", "waterfront"],
  },
  {
    _id: "policy-registration-cancellation",
    _type: "policy",
    title: "Registration and cancellation policy",
    contentMap:
      "Explains registration deadlines, payment timing, refund cutoffs, and what families should do if plans change before camp begins.",
    relatedConcerns: [reference("concern-pricing-affordability"), reference("concern-transportation-logistics")],
    sourceKind: "sourceOfTruth",
    policyOwner: "Registrar",
  },
];

export const generatedFixtureGoldSet: ParentPromptExpectation[] = [
  {
    _id: "prompt-bullying-and-homesickness",
    prompt:
      "My child is shy and I worry they could get bullied or overwhelmed during the first few days. What support do you have?",
    expectedConcernIds: ["concern-homesickness-readiness", "concern-cabin-social-fit"],
    evaluationNotes: ["semanticFailure"],
    requiredContentEntityIds: [
      "policy-bullying-response",
      "testimonial-shy-first-time-camper",
      "procedure-homesickness-support",
    ],
    supportingContentEntityIds: ["guide-first-time-overnight", "claim-small-cabin-groups"],
    requiredSourceOfTruthIds: ["policy-bullying-response", "procedure-homesickness-support"],
  },
  {
    _id: "prompt-day-camp-alternative",
    prompt: "If overnight camp is too much right now, do you have a day camp or another gentler option?",
    expectedConcernIds: ["concern-homesickness-readiness", "concern-pricing-affordability"],
    requiredContentEntityIds: ["program-day-camp", "guide-first-time-overnight"],
    supportingContentEntityIds: ["testimonial-parent-readiness"],
    requiredSourceOfTruthIds: ["program-day-camp"],
  },
];
