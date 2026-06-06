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
    <article className="overflow-hidden rounded-[1.5rem] border border-slate-900/10 bg-white px-5 py-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">{section.title}</p>
        {citations.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {citations.map((citation) => (
              <span
                key={citation.label}
                className="rounded-full border border-amber-900/10 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950"
              >
                {citation.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{section.body}</p>
      {section.items && section.items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {section.items.map((item) => (
            <li
              key={item}
              className="rounded-[1rem] border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {citations.length > 0 ? (
        <div className="mt-4 grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cited source labels</p>
          {citations.map((citation) => (
            <div key={citation.label} className="rounded-[1rem] bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
              {citation.label}
            </div>
          ))}
        </div>
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
    <article className="rounded-[1.5rem] border border-amber-900/10 bg-amber-50/80 px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Required question</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">{question.text}</p>
      {question.rationale ? <p className="mt-2 text-sm leading-6 text-slate-700">{question.rationale}</p> : null}
      {question.controlledReplies.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Controlled replies</p>
          <div className="mt-3 grid gap-3">
            {question.controlledReplies.map((reply) => (
              <PromptButton
                key={reply.id}
                promptText={reply.text}
                sessionId={sessionId}
                submitPromptAction={submitPromptAction}
                badgeLabel="Controlled reply"
              />
            ))}
          </div>
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
    <div className="mt-4 rounded-[1.25rem] border border-slate-900/10 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Freeform reply</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        Answer in your own words if the controlled replies do not cover the context you want to provide.
      </p>
      <form action={submitPromptAction} className="mt-3 space-y-3">
        <input
          name="promptText"
          aria-label={`Freeform reply for ${questionText}`}
          placeholder="Answer in your own words"
          className="w-full rounded-[1rem] border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/30"
        />
        <SessionIdField sessionId={sessionId} />
        <input type="hidden" name="operatorAction" value="submitPrompt" />
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-full border border-slate-900/10 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-amber-500 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35"
        >
          Submit freeform reply
        </button>
      </form>
    </div>
  );
}

function PromptButton({
  promptText,
  sessionId,
  submitPromptAction,
  badgeLabel = "Prompt",
}: {
  promptText: string;
  sessionId: string;
  submitPromptAction: FormAction;
  badgeLabel?: string;
}) {
  return (
    <form action={submitPromptAction}>
      <input type="hidden" name="promptText" value={promptText} />
      <input type="hidden" name="operatorAction" value="submitPrompt" />
      <SessionIdField sessionId={sessionId} />
      <button
        type="submit"
        className="inline-flex w-full items-start justify-between gap-4 rounded-[1.25rem] border border-slate-900/10 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:border-amber-500 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35"
      >
        <span className="min-w-0 break-words">{promptText}</span>
        <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-amber-800">{badgeLabel}</span>
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
        <div className="rounded-[1.75rem] border border-slate-900/10 bg-white px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Loading</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{answer.headline}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">{answer.message}</p>
        </div>
      );
    case "context_gathering_response":
      return (
        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-amber-900/10 bg-gradient-to-br from-amber-50 to-white px-5 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
              Context Gathering Response
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
              {answer.conversationalFraming}
            </h2>
          </div>

          <section aria-labelledby="required-context-title">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Required context</p>
                <h3 id="required-context-title" className="mt-2 text-xl font-semibold tracking-[-0.05em]">
                  Questions the system needs before answering
                </h3>
              </div>
              <StatusChip label="Primary path" />
            </div>

            <div className="mt-4 grid gap-4">
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
            <section aria-labelledby="suggested-prompts-title">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
                    Suggested prompts
                  </p>
                  <h3 id="suggested-prompts-title" className="mt-2 text-xl font-semibold tracking-[-0.05em]">
                    Controlled follow-up options
                  </h3>
                </div>
                <StatusChip label="Secondary path" />
              </div>

              <div className="mt-4 grid gap-3">
                {answer.suggestedPrompts.map((prompt) => (
                  <PromptButton
                    key={prompt.id}
                    promptText={prompt.text}
                    sessionId={sessionId}
                    submitPromptAction={submitPromptAction}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      );
    case "assembled_answer":
      return (
        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-amber-900/10 bg-gradient-to-br from-amber-50 to-white px-5 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Assembled answer</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
              {answer.conversationalFraming}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {answer.completeness === "partial"
                ? "The answer is source-backed but still limited by the available context."
                : "The answer is source-backed and validated for the current demo state."}
            </p>
          </div>

          <div className="grid gap-4">
            {answer.sections.map((section) => (
              <SectionCard key={section.title} section={section} />
            ))}
          </div>
        </div>
      );
    case "responsible_abstention":
      return (
        <div className="rounded-[1.75rem] border border-slate-900/10 bg-white px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Responsible abstention</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
            {answer.conversationalFraming}
          </h2>
          <div className="mt-5 grid gap-3">
            {answer.nextSteps.map((nextStep) => (
              <div key={nextStep} className="rounded-[1.25rem] border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
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
function JourneyTimeline({ timeline }: { timeline: GuideSitePresentation["journeyTimeline"] | undefined }) {
  const safeTimeline = timeline ?? {
    prompts: [],
    visitorContext: [],
    concerns: [],
    sessionSummary: null,
  };
  return (
    <aside
      aria-labelledby="journey-timeline-title"
      className="rounded-[2rem] border border-black/10 bg-white/82 p-5 shadow-[0_24px_70px_rgba(48,28,8,0.1)]"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Journey Timeline</p>
      <h2 id="journey-timeline-title" className="mt-3 text-xl font-semibold tracking-[-0.05em] text-slate-950">
        Secondary operator context
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        Compact Prompt path, learned Visitor Context, and Concerns. This panel is context only, not a replay surface.
      </p>

      <div className="mt-5 grid gap-4">
        <section aria-labelledby="journey-prompts-title">
          <p id="journey-prompts-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Prior prompts
          </p>
          <div className="mt-2 grid gap-2">
            {safeTimeline.prompts.length > 0 ? (
              safeTimeline.prompts.map((prompt, index) => (
                <div key={prompt.runId || `prompt-${index}`} className="rounded-[1rem] border border-slate-900/10 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Prompt {index + 1} · {prompt.source.replace(/_/g, " ")}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-800">{prompt.text}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[1rem] border border-slate-900/10 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                No prior Prompts in this GuideSite Session yet.
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="journey-context-title">
          <p id="journey-context-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Visitor Context
          </p>
          <div className="mt-2 grid gap-2">
            {safeTimeline.visitorContext.length > 0 ? (
              safeTimeline.visitorContext.map((fact) => (
                <div key={fact.key} className="rounded-[1rem] border border-slate-900/10 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{fact.label}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-800">
                    {fact.value} <span className="text-slate-500">({fact.source})</span>
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1rem] border border-slate-900/10 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                No learned Visitor Context yet.
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="journey-concerns-title">
          <p id="journey-concerns-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Concerns
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {safeTimeline.concerns.length > 0 ? (
              safeTimeline.concerns.map((concern) => (
                <span
                  key={concern.key}
                  className="rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  {concern.label}: {concern.status}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                No open or addressed Concerns yet
              </span>
            )}
          </div>
        </section>

        {safeTimeline.sessionSummary ? (
          <div className="rounded-[1rem] border border-amber-900/10 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
            {safeTimeline.sessionSummary}
          </div>
        ) : null}
      </div>
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
    <aside className="rounded-[1.75rem] border border-black/10 bg-white/72 p-4 shadow-[0_18px_48px_rgba(48,28,8,0.08)] backdrop-blur-sm sm:p-5 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-auto">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[1.25rem] border border-slate-900/10 bg-slate-50 px-4 py-3 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Operator inspection</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-slate-950">Inspection drawer</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Secondary summaries for debugging the current answer state.
            </p>
          </div>
          <span className="flex flex-col items-end gap-2">
            <StatusChip label={operatorDiagnostics.runStatus} />
            <span className="text-xs font-semibold text-slate-500 group-open:hidden">Expand</span>
            <span className="hidden text-xs font-semibold text-slate-500 group-open:inline">Collapse</span>
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
  const answerStateLabel = answer.status.replace(/_/g, " ");

  React.useEffect(() => {
    if (!sessionId) {
      return;
    }

    document.cookie = `${GUIDESITE_GUI_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; path=/; samesite=lax`;
  }, [sessionId]);

  return (
    <main aria-labelledby="operator-title" className="min-h-screen px-3 py-4 text-slate-950 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-5 lg:min-h-[calc(100vh-4rem)] lg:gap-6">
        <header className="rounded-[1.75rem] border border-black/10 bg-white/72 px-5 py-5 shadow-[0_24px_70px_rgba(48,28,8,0.1)] backdrop-blur-sm sm:rounded-[2rem] sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
                Operator Demo Surface
              </p>
              <h1 id="operator-title" className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
                GuideSite operator shell
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
                The GUI opens directly into the canonical Parent journey for one configured Ultimate Camp Website
                instance. Controlled prompts stay visible, and the main canvas stays focused on the validated
                product output.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={SANITY_ADMIN_BASE_PATH}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-amber-500 hover:bg-amber-50"
              >
                Open Sanity admin
              </a>
              <StatusChip label="Canonical journey" />
              <StatusChip label="Desktop-first" />
              <StatusChip label={isActionPending ? "updating" : answerStateLabel} />
            </div>
          </div>
        </header>

        <section
          aria-label="Demo surface"
          className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]"
        >
          <article
            data-camp-id={camp.campId}
            data-answer-accent={camp.answerAccent}
            data-surface-tone={camp.surfaceTone}
            className="min-w-0 rounded-[1.75rem] border border-black/10 bg-[color:var(--ucw-answer-surface)] p-4 shadow-[0_24px_70px_rgba(48,28,8,0.1)] sm:rounded-[2rem] sm:p-8"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Answer Presentation</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-3xl">
                  Parent-shaped output
                </h2>
              </div>
              <StatusChip label={camp.campName} />
            </div>

            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
              {answer.status === "context_gathering_response"
                ? "The first visible product output is a context gathering response because the canonical Parent prompt still lacks required Visitor Context."
                : "The validated product output is ready for the operator surface."}
            </p>

            <div className="mt-6">{renderAnswerContent(answer, submitPromptFormAction, sessionId)}</div>

            <div className="mt-6 rounded-[1.5rem] border border-slate-900/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">New demo</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Start a fresh operator demo to clear the current prompt path and begin a new Parent journey.
              </p>
              <form action={startDemoFormAction} className="mt-4">
                <input type="hidden" name="operatorAction" value="startDemo" />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/35"
                >
                  Open a new demo
                </button>
              </form>
            </div>
          </article>

          <div className="space-y-6">
            <JourneyTimeline timeline={presentation.journeyTimeline} />
            {renderDiagnostics(presentation, currentResult.promptText)}
          </div>
        </section>

        <section aria-label="Prompt controls" className="rounded-[1.75rem] border border-black/10 bg-white/82 p-5 shadow-[0_24px_70px_rgba(48,28,8,0.1)] backdrop-blur-sm sm:rounded-[2rem] sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Prompt controls</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                Controlled prompts first, typed prompt second
              </h2>
            </div>
            <StatusChip label="Session state is not editable here" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
            <div className="space-y-4">
              <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Controlled suggested prompts
                </p>
                <div className="mt-4 grid gap-3">
                  {answer.status === "context_gathering_response" && answer.suggestedPrompts.length > 0 ? (
                    answer.suggestedPrompts.map((prompt) => (
                      <PromptButton
                        key={prompt.id}
                        promptText={prompt.text}
                        sessionId={sessionId}
                        submitPromptAction={submitPromptFormAction}
                      />
                    ))
                  ) : (
                    <div className="rounded-[1.25rem] border border-slate-900/10 bg-white px-4 py-4 text-sm leading-6 text-slate-700">
                      Suggested prompts will appear when the current turn needs more context or wants to offer a controlled next step.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-900/10 bg-white px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Typed prompt</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Use freeform input for secondary exploration. This keeps the surface flexible without exposing direct session editing.
              </p>
              <form action={submitPromptFormAction} className="mt-4 space-y-3">
                <input
                  id="operator-prompt"
                  name="promptText"
                  defaultValue={currentResult.promptText}
                  aria-label="Typed prompt"
                  className="w-full rounded-[1rem] border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus-visible:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500/30"
                />
                <SessionIdField sessionId={sessionId} />
                <input type="hidden" name="operatorAction" value="submitPrompt" />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full border border-amber-900/10 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35"
                >
                  Run typed prompt
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
