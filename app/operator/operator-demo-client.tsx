"use client";

import React from "react";
import type {
  GuideSiteOperatorInspection,
  GuideSitePresentation,
  GuideSitePresentationSection,
  GuideSiteRequiredQuestion,
} from "../../src/guidesite-mvp/presentation-dto.ts";
import { GUIDESITE_GUI_SESSION_COOKIE } from "../../src/guidesite-mvp/gui-session.ts";

type GuideSiteGuiActionResult = {
  promptText: string;
  presentation: GuideSitePresentation;
};

type OperatorDemoAction = (formData: FormData) => Promise<GuideSiteGuiActionResult>;
type FormAction = (formData: FormData) => void | Promise<void>;

type OperatorDemoClientProps = {
  result: GuideSiteGuiActionResult;
  startDemoAction: OperatorDemoAction;
  submitPromptAction: OperatorDemoAction;
};

function StatusChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-slate-900/10 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
      {label}
    </span>
  );
}

function formatAnswerStatusLabel(answer: GuideSitePresentation["answer"], isActionPending: boolean): string {
  if (isActionPending) {
    return "Updating";
  }

  switch (answer.status) {
    case "assembled_answer":
      return "Answer ready";
    case "context_gathering_response":
      return "Needs info";
    case "responsible_abstention":
      return "Needs source support";
    case "technical_failure":
      return "Error";
    case "loading":
      return "Loading";
    default:
      return "Unavailable";
  }
}

function getParentPromptText(presentation: GuideSitePresentation, fallbackPromptText: string): string {
  return presentation.journeyTimeline?.prompts[0]?.text ?? fallbackPromptText;
}

function hasVisitorFact(presentation: GuideSitePresentation, key: string): boolean {
  return presentation.journeyTimeline?.visitorContext.some((fact) => fact.key === key) ?? false;
}

function readableRunStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function cleanOperatorCopy(text: string): string {
  return text
    .replace("Required Visitor Context is complete.", "Required details are complete.")
    .replace(
      "The source-backed Fit answer is yes: overnight camp is a supported fit for this Child.",
      "Yes — overnight camp looks like a supported fit for this child.",
    )
    .replace(
      "The source-backed Fit answer is not yet: overnight camp is not a supported fit for this Child until readiness concerns are resolved.",
      "Not yet — readiness concerns should be resolved before recommending overnight camp.",
    )
    .replace(/\bVisitor Context\b/g, "details")
    .replace(/\bChild Readiness\b/g, "readiness")
    .replace(/\bOvernight Camp Program\b/g, "overnight camp program")
    .replace(/\bCamp Program\b/g, "camp program")
    .replace(/\bParent Communication Policy\b/g, "parent communication policy")
    .replace(/\bFit\b/g, "fit")
    .replace(/\bChild\b/g, "child")
    .replace(/\bParent\b/g, "parent");
}

function cleanSectionTitle(title: string): string {
  switch (title) {
    case "Fit Answer":
      return "Recommendation";
    case "Readiness Context":
      return "Readiness";
    case "Homesickness and Parent Communication":
      return "Homesickness and communication";
    default:
      return cleanOperatorCopy(title);
  }
}

const SANITY_ADMIN_BASE_PATH = "/admin";

function createSanityAdminIntentPath(source: {
  sourceId: string;
  sourceType: string;
  fieldPath?: string;
}): string {
  const params = new URLSearchParams({
    id: source.sourceId,
    type: source.sourceType,
  });

  if (source.fieldPath) {
    params.set("path", source.fieldPath);
  }

  return `${SANITY_ADMIN_BASE_PATH}/intent/edit?${params.toString()}`;
}

function SectionCard({ section }: { section: GuideSitePresentationSection }) {
  const citations = section.citations;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">{cleanSectionTitle(section.title)}</h3>
        {citations.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2" aria-label="Sources">
            {citations.map((citation) => (
              <span
                key={citation.label}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950"
              >
                {citation.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{cleanOperatorCopy(section.body)}</p>
      {section.items && section.items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {section.items.map((item) => (
            <li key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {cleanOperatorCopy(item)}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function RequiredQuestionCard({
  question,
  sessionId,
  submitPromptAction,
}: {
  question: GuideSiteRequiredQuestion;
  sessionId: string;
  submitPromptAction: FormAction;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold leading-6 text-slate-950">{question.text}</h3>
      {question.controlledReplies.length > 0 ? (
        <div className="mt-4 grid gap-2" aria-label="Suggested replies">
          {question.controlledReplies.map((reply) => (
            <PromptButton
              key={reply.id}
              promptText={reply.text}
              sessionId={sessionId}
              submitPromptAction={submitPromptAction}
            />
          ))}
        </div>
      ) : null}

      <FreeformReplyCard questionText={question.text} sessionId={sessionId} submitPromptAction={submitPromptAction} />
    </article>
  );
}

function FreeformReplyCard({
  questionText,
  sessionId,
  submitPromptAction,
}: {
  questionText: string;
  sessionId: string;
  submitPromptAction: FormAction;
}) {
  return (
    <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35">
        Type a custom reply
      </summary>
      <form action={submitPromptAction} className="mt-3 space-y-3">
        <input
          name="promptText"
          aria-label={`Custom reply for ${questionText}`}
          placeholder="Type the parent’s reply"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/30"
        />
        <SessionIdField sessionId={sessionId} />
        <input type="hidden" name="operatorAction" value="submitPrompt" />
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/35"
        >
          Submit reply
        </button>
      </form>
    </details>
  );
}

function PromptButton({
  promptText,
  sessionId,
  submitPromptAction,
}: {
  promptText: string;
  sessionId: string;
  submitPromptAction: FormAction;
}) {
  return (
    <form action={submitPromptAction}>
      <input type="hidden" name="promptText" value={promptText} />
      <input type="hidden" name="operatorAction" value="submitPrompt" />
      <SessionIdField sessionId={sessionId} />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:border-amber-400 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35"
      >
        <span className="min-w-0 break-words">{promptText}</span>
        <span aria-hidden="true" className="shrink-0 text-slate-400">→</span>
      </button>
    </form>
  );
}

function SessionIdField({ sessionId }: { sessionId: string }) {
  return <input type="hidden" name="sessionId" value={sessionId} />;
}

function TechnicalFailureCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 px-5 py-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Technical failure</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-700">{message}</p>
    </div>
  );
}

function renderAnswerContent(
  answer: GuideSitePresentation["answer"],
  submitPromptAction: FormAction,
  sessionId: string,
) {
  switch (answer.status) {
    case "loading":
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Loading</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{answer.headline}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">{answer.message}</p>
        </div>
      );
    case "context_gathering_response":
      return (
        <div className="space-y-5">
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="needed-info-title">
            <p className="text-sm font-medium text-amber-900">Next step</p>
            <h2 id="needed-info-title" className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
              Get the missing parent details.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Pick the closest reply. If neither fits, type a custom reply under the question.
            </p>
          </section>

          <section aria-labelledby="questions-title">
            <div className="flex items-center justify-between gap-4">
              <h2 id="questions-title" className="text-lg font-semibold tracking-[-0.03em] text-slate-950">
                Questions to ask
              </h2>
              <StatusChip label={`${answer.requiredQuestions.length} remaining`} />
            </div>

            <div className="mt-3 grid gap-3">
              {answer.requiredQuestions.map((question) => (
                <RequiredQuestionCard
                  key={question.id}
                  question={question}
                  sessionId={sessionId}
                  submitPromptAction={submitPromptAction}
                />
              ))}
            </div>
          </section>

          {answer.suggestedPrompts.length > 0 ? (
            <details className="rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35">
                Other suggested next steps
              </summary>
              <div className="mt-3 grid gap-2">
                {answer.suggestedPrompts.map((prompt) => (
                  <PromptButton
                    key={prompt.id}
                    promptText={prompt.text}
                    sessionId={sessionId}
                    submitPromptAction={submitPromptAction}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      );
    case "assembled_answer":
      return (
        <div className="space-y-5">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-medium text-emerald-900">Answer ready</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
              Review the recommendation.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {answer.completeness === "partial"
                ? "This answer has source support, but is still limited by available details."
                : "This answer has source support and is ready to review."}
            </p>
          </section>

          <div className="grid gap-3">
            {answer.sections.map((section) => (
              <SectionCard key={section.title} section={section} />
            ))}
          </div>
        </div>
      );
    case "responsible_abstention":
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-900">Can’t answer yet</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            {cleanOperatorCopy(answer.conversationalFraming)}
          </h2>
          <div className="mt-4 grid gap-2">
            {answer.nextSteps.map((nextStep) => (
              <div key={nextStep} className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                {nextStep}
              </div>
            ))}
          </div>
        </div>
      );
    case "technical_failure":
      return <TechnicalFailureCard title={answer.title} message={answer.message} />;
    default:
      return (
        <TechnicalFailureCard
          title="Technical failure"
          message="The GuideSite turn failed before a product answer could be rendered."
        />
      );
  }
}
function ProgressPanel({ presentation }: { presentation: GuideSitePresentation }) {
  const safeTimeline = presentation.journeyTimeline ?? {
    prompts: [],
    visitorContext: [],
    concerns: [],
    sessionSummary: null,
  };
  const progressItems = [
    {
      key: "prior_sleepaway_experience",
      label: "Sleepaway experience",
      complete: hasVisitorFact(presentation, "prior_sleepaway_experience"),
    },
    {
      key: "child_readiness",
      label: "Readiness",
      complete: hasVisitorFact(presentation, "child_readiness"),
    },
  ];

  return (
    <aside aria-labelledby="progress-title" className="rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Progress</p>
          <h2 id="progress-title" className="mt-1 text-xl font-semibold tracking-[-0.04em] text-slate-950">
            Parent path
          </h2>
        </div>
        <StatusChip label={formatAnswerStatusLabel(presentation.answer, false)} />
      </div>

      <ol className="mt-5 grid gap-2">
        {progressItems.map((item) => (
          <li key={item.key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span
              aria-hidden="true"
              className={`grid size-5 place-items-center rounded-full text-xs font-semibold ${
                item.complete ? "bg-emerald-600 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"
              }`}
            >
              {item.complete ? "✓" : ""}
            </span>
            <span className="text-sm font-medium text-slate-800">{item.label}</span>
          </li>
        ))}
      </ol>


      <details className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35">
          Show history
        </summary>
        <div className="mt-3 grid gap-4">
          <section aria-labelledby="history-prompts-title">
            <h3 id="history-prompts-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Prompts
            </h3>
            <div className="mt-2 grid gap-2">
              {safeTimeline.prompts.length > 0 ? (
                safeTimeline.prompts.map((prompt, index) => (
                  <div key={prompt.runId.length > 0 ? prompt.runId : `prompt-${index}`} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-xs font-medium text-slate-500">Prompt {index + 1}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-800">{prompt.text}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  No prompts yet.
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="history-context-title">
            <h3 id="history-context-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Collected details
            </h3>
            <div className="mt-2 grid gap-2">
              {safeTimeline.visitorContext.length > 0 ? (
                safeTimeline.visitorContext.map((fact) => (
                  <div key={fact.key} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-xs font-medium text-slate-500">{fact.label}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-800">{fact.value}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  No details collected yet.
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="history-concerns-title">
            <h3 id="history-concerns-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Checks
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {safeTimeline.concerns.length > 0 ? (
                safeTimeline.concerns.map((concern) => (
                  <span
                    key={concern.key}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {concern.label}: {concern.status}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                  No checks yet
                </span>
              )}
            </div>
          </section>
        </div>
      </details>
    </aside>
  );
}


function InspectionSummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[1rem] border border-slate-900/10 bg-white px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-slate-800">{value}</dd>
    </div>
  );
}

function InspectionList({ emptyLabel, items }: { emptyLabel: string; items: string[] }) {
  if (items.length === 0) {
    return <span className="text-slate-500">{emptyLabel}</span>;
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function formatInspectionValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value).replace(/_/g, " ");
}

function RawStructuredOutputDetails({ inspection }: { inspection: GuideSiteOperatorInspection }) {
  const rawStructuredOutput = inspection.rawStructuredOutput;
  const rawSummaryEntries = Object.entries(rawStructuredOutput?.summary ?? {});
  const rawDetails = rawStructuredOutput?.details ?? null;

  return (
    <details className="mt-5 rounded-[1.25rem] border border-dashed border-slate-900/20 bg-white px-4 py-4">
      <summary className="cursor-pointer rounded-[0.75rem] text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35">
        Raw structured output
      </summary>
      <div className="mt-4 grid gap-3">
        {rawSummaryEntries.length > 0 ? (
          rawSummaryEntries.map(([key, value]) => (
            <div key={key} className="rounded-[1rem] bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
              <span className="font-semibold">{key}</span>: {formatInspectionValue(value)}
            </div>
          ))
        ) : (
          <div className="rounded-[1rem] bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
            Raw structured output summary is not available.
          </div>
        )}
        <pre className="max-h-96 overflow-auto rounded-[1rem] bg-slate-950 p-4 text-xs leading-5 text-slate-100">
          {JSON.stringify(rawDetails, null, 2)}
        </pre>
      </div>
    </details>
  );
}

function InspectionCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.25rem] border border-slate-900/10 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-slate-950">{title}</h3>
      <dl className="mt-3 grid gap-2">{children}</dl>
    </section>
  );
}

function renderDiagnostics(presentation: GuideSitePresentation, promptText: string) {
  const { operatorDiagnostics, operatorInspection } = presentation;
  const promptSummary = operatorInspection.promptUnderstanding.summary;
  const retrievalSummary = operatorInspection.retrieval.summary;
  const validationSummary = operatorInspection.validation.summary;
  const providerSummary = operatorInspection.providerMetadata.summary;

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-2 py-2 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35">
          <div>
            <p className="text-sm font-medium text-slate-500">Debug</p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">Run details</h2>
          </div>
          <span className="flex flex-col items-end gap-2">
            <StatusChip label={readableRunStatus(operatorDiagnostics.runStatus)} />
            <span className="text-xs font-semibold text-slate-500 group-open:hidden">Show</span>
            <span className="hidden text-xs font-semibold text-slate-500 group-open:inline">Hide</span>
          </span>
        </summary>

        <div className="mt-4 grid gap-4">
          <InspectionCard eyebrow="Run context" title="Prompt and run">
            <InspectionSummaryRow label="Prompt" value={promptText || "Pending"} />
            <InspectionSummaryRow
              label="Run"
              value={`${operatorDiagnostics.runId ?? "Pending"} / ${operatorDiagnostics.sessionId ?? "Pending"}`}
            />
          </InspectionCard>

          <InspectionCard eyebrow="Prompt understanding" title="What the prompt asks for">
            <InspectionSummaryRow label="Goal" value={formatInspectionValue(promptSummary.goal)} />
            <InspectionSummaryRow label="Prompt type" value={formatInspectionValue(promptSummary.promptType)} />
            <InspectionSummaryRow label="Fit question" value={formatInspectionValue(promptSummary.fitQuestion)} />
            <InspectionSummaryRow label="Facts" value={promptSummary.factCount} />
            <InspectionSummaryRow label="Concerns" value={promptSummary.concernCount} />
            <InspectionSummaryRow
              label="Retrieval needs"
              value={<InspectionList emptyLabel="No retrieval needs" items={promptSummary.retrievalNeeds} />}
            />
            <InspectionSummaryRow
              label="Context needs"
              value={<InspectionList emptyLabel="No context needs" items={promptSummary.contextNeeds} />}
            />
          </InspectionCard>

          <InspectionCard eyebrow="Retrieval/source coverage" title="Source support">
            <InspectionSummaryRow label="Coverage" value={formatInspectionValue(retrievalSummary.coverageStatus)} />
            <InspectionSummaryRow label="Adapter" value={retrievalSummary.adapterLabel ?? retrievalSummary.adapterId ?? "Not run"} />
            <InspectionSummaryRow label="Matched sources" value={retrievalSummary.matchedSourceCount} />
            <InspectionSummaryRow label="Retrieved sources" value={retrievalSummary.retrievedSourceCount} />
            <InspectionSummaryRow label="Coverage summary" value={retrievalSummary.coverageExplanation} />
            <InspectionSummaryRow
              label="Needs"
              value={<InspectionList emptyLabel="No retrieval needs" items={retrievalSummary.needs} />}
            />
            <InspectionSummaryRow
              label="Concerns"
              value={<InspectionList emptyLabel="No retrieval concerns" items={retrievalSummary.concerns} />}
            />
            <InspectionSummaryRow
              label="Retrieval diagnostics"
              value={<InspectionList emptyLabel="No retrieval diagnostics" items={retrievalSummary.retrievalDiagnostics} />}
            />
            <InspectionSummaryRow
              label="Editorial gaps"
              value={<InspectionList emptyLabel="No editorial gaps" items={retrievalSummary.editorialGaps} />}
            />
          </InspectionCard>

          {operatorInspection.retrieval.sourceCoverage.length > 0 || operatorInspection.retrieval.details ? (
            <section className="rounded-[1.25rem] border border-slate-900/10 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Source coverage details</p>
              {operatorInspection.retrieval.sourceCoverage.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  {operatorInspection.retrieval.sourceCoverage.map((source) => (
                    <li key={`${source.sourceId}:${source.rank}`} className="rounded-[1rem] bg-slate-50 px-3 py-2">
                      <div className="font-semibold text-slate-800">
                        {source.matched ? "Matched" : "Retrieved"} · {source.title} · {source.sourceType}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-600">
                        Source ID: {source.sourceId} · Field path: {source.fieldPath || "Not available"} · Revision:{" "}
                        {source.sourceRevision || "Not available"}
                      </div>
                      <a
                        href={createSanityAdminIntentPath(source)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:border-amber-500 hover:bg-amber-50"
                      >
                        Inspect source in Sanity admin
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-[1rem] bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  No source metadata was retrieved for this turn.
                </p>
              )}
              <details className="mt-3 rounded-[1rem] border border-dashed border-slate-900/20 bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Raw source diagnostics
                </summary>
                <pre className="mt-3 max-h-72 overflow-auto rounded-[1rem] bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {JSON.stringify(operatorInspection.retrieval.details, null, 2)}
                </pre>
              </details>
            </section>
          ) : null}

          <InspectionCard eyebrow="Validation/product-state reasoning" title="Why this state rendered">
            <InspectionSummaryRow label="Answer disposition" value={formatInspectionValue(validationSummary.answerDisposition)} />
            <InspectionSummaryRow label="Prompt validation" value={formatInspectionValue(validationSummary.promptUnderstandingValid)} />
            <InspectionSummaryRow label="Answer validation" value={formatInspectionValue(validationSummary.answerCompositionValid)} />
            <InspectionSummaryRow
              label="Reasoning"
              value={<InspectionList emptyLabel="No validation reasoning" items={validationSummary.reasoning} />}
            />
          </InspectionCard>

          <InspectionCard eyebrow="Diagnostics" title="Provider and diagnostics">
            <InspectionSummaryRow label="Provider" value={providerSummary.provider ?? "Not available"} />
            <InspectionSummaryRow label="Model" value={providerSummary.model ?? "Not available"} />
            <InspectionSummaryRow label="Provider diagnostics" value={providerSummary.diagnosticCount} />
            <InspectionSummaryRow
              label="Diagnostics notes"
              value={<InspectionList emptyLabel="No diagnostics" items={operatorInspection.diagnostics.summary} />}
            />
          </InspectionCard>

          <RawStructuredOutputDetails inspection={operatorInspection} />
        </div>
      </details>
    </aside>
  );
}
export default function OperatorDemoClient({ result, startDemoAction, submitPromptAction }: OperatorDemoClientProps) {
  const [currentResult, operatorDemoFormAction, isActionPending] = React.useActionState(
    async (_previousResult: GuideSiteGuiActionResult, formData: FormData) => {
      const requestedAction = formData.get("operatorAction");
      return requestedAction === "startDemo" ? startDemoAction(formData) : submitPromptAction(formData);
    },
    result,
  );
  const startDemoFormAction = operatorDemoFormAction as unknown as FormAction;
  const submitPromptFormAction = operatorDemoFormAction as unknown as FormAction;
  const { presentation } = currentResult;
  const { answer, camp } = presentation;
  const sessionId = presentation.operatorDiagnostics.sessionId ?? "";
  const parentPromptText = getParentPromptText(presentation, currentResult.promptText);
  const statusLabel = formatAnswerStatusLabel(answer, isActionPending);

  React.useEffect(() => {
    if (!sessionId) {
      return;
    }

    document.cookie = `${GUIDESITE_GUI_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; path=/; samesite=lax`;
  }, [sessionId]);

  return (
    <main aria-labelledby="operator-title" className="min-h-screen px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{camp.campName}</p>
              <h1 id="operator-title" className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                GuideSite demo
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusChip label={statusLabel} />
              <a
                href={SANITY_ADMIN_BASE_PATH}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-amber-400 hover:bg-amber-50"
              >
                Admin
              </a>
              <form action={startDemoFormAction}>
                <input type="hidden" name="operatorAction" value="startDemo" />
                <button
                  type="submit"
                  className="inline-flex rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/35"
                >
                  New demo
                </button>
              </form>
            </div>
          </div>
        </header>

        <section
          aria-label="Operator workspace"
          className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"
        >
          <article
            data-camp-id={camp.campId}
            data-answer-accent={camp.answerAccent}
            data-surface-tone={camp.surfaceTone}
            className="min-w-0 rounded-2xl border border-slate-200 bg-[color:var(--ucw-answer-surface)] p-5 shadow-sm sm:p-6"
          >
            <section aria-labelledby="parent-question-title" className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Parent question</p>
              <h2 id="parent-question-title" className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                {parentPromptText}
              </h2>
            </section>

            <div className="mt-5">{renderAnswerContent(answer, submitPromptFormAction, sessionId)}</div>

            <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35">
                Ask a different question
              </summary>
              <form action={submitPromptFormAction} className="mt-4 space-y-3">
                <input
                  id="operator-prompt"
                  name="promptText"
                  aria-label="Ask a different question"
                  placeholder="Type a parent question or follow-up"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/30"
                />
                <SessionIdField sessionId={sessionId} />
                <input type="hidden" name="operatorAction" value="submitPrompt" />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35"
                >
                  Submit question
                </button>
              </form>
            </details>
          </article>

          <div className="space-y-5">
            <ProgressPanel presentation={presentation} />
            {renderDiagnostics(presentation, currentResult.promptText)}
          </div>
        </section>
      </div>
    </main>
  );
}
