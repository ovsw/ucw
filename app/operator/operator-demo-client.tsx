"use client";

import React from "react";
import type {
  GuideSiteCitation,
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
    <span className="rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}

function SelectedContentEntityStub({ citation }: { citation: GuideSiteCitation }) {
  return (
    <div className="rounded-[1.1rem] border border-slate-900/10 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{citation.label}</p>
        <span className="rounded-full border border-amber-900/10 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-950">
          {citation.sourceType}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        {citation.fieldPath} · {citation.sourceRevision}
      </p>
    </div>
  );
}

function SectionCard({ section }: { section: GuideSitePresentationSection }) {
  const citations = section.citations;

  return (
    <article className="rounded-[1.5rem] border border-slate-900/10 bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">{section.title}</p>
        {citations.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {citations.map((citation) => (
              <span
                key={citation.sourceId}
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected content entities</p>
          {citations.map((citation) => (
            <SelectedContentEntityStub key={citation.sourceId} citation={citation} />
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
          className="w-full rounded-[1rem] border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus:border-amber-500"
        />
        <SessionIdField sessionId={sessionId} />
        <input type="hidden" name="operatorAction" value="submitPrompt" />
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center rounded-full border border-slate-900/10 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-amber-500 hover:bg-amber-50"
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
        className="inline-flex w-full items-center justify-between rounded-[1.25rem] border border-slate-900/10 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:border-amber-500 hover:bg-amber-50"
      >
        <span>{promptText}</span>
        <span className="text-xs uppercase tracking-[0.18em] text-amber-800">{badgeLabel}</span>
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

function renderDiagnostics(presentation: GuideSitePresentation, promptText: string) {
  const { operatorDiagnostics } = presentation;

  return (
    <aside className="rounded-[1.75rem] border border-black/10 bg-white/78 p-5 shadow-[0_24px_70px_rgba(48,28,8,0.1)] sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">Operator inspection</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.05em] text-slate-950">Diagnostics</h2>
        </div>
        <StatusChip label={operatorDiagnostics.runStatus} />
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-slate-700">
        <div className="rounded-[1.25rem] border border-slate-900/10 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Prompt</dt>
          <dd className="mt-1 leading-6 text-slate-800">{promptText}</dd>
        </div>
        <div className="rounded-[1.25rem] border border-slate-900/10 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Run</dt>
          <dd className="mt-1 leading-6 text-slate-800">
            {operatorDiagnostics.runId ?? "Pending"} / {operatorDiagnostics.sessionId ?? "Pending"}
          </dd>
        </div>
        <div className="rounded-[1.25rem] border border-slate-900/10 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Provider</dt>
          <dd className="mt-1 leading-6 text-slate-800">
            {operatorDiagnostics.provider ?? "Not available"}
            {operatorDiagnostics.model ? ` · ${operatorDiagnostics.model}` : ""}
          </dd>
        </div>
      </dl>

      {operatorDiagnostics.diagnostics.length > 0 ? (
        <div className="mt-5 rounded-[1.25rem] border border-slate-900/10 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Diagnostics notes</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {operatorDiagnostics.diagnostics.map((message) => (
              <li key={message} className="rounded-[1rem] bg-slate-50 px-3 py-2">
                {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
    <main aria-labelledby="operator-title" className="min-h-screen px-4 py-6 text-slate-950 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col gap-6">
        <header className="rounded-[2rem] border border-black/10 bg-white/72 px-6 py-5 shadow-[0_24px_70px_rgba(48,28,8,0.1)] backdrop-blur-sm sm:px-8">
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
          <article className="rounded-[2rem] border border-black/10 bg-[#fffaf1]/92 p-6 shadow-[0_24px_70px_rgba(48,28,8,0.1)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
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

            <div className="mt-6 rounded-[1.5rem] border border-slate-900/10 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">New demo</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Start a fresh operator demo to clear the current prompt path and begin a new Parent journey.
              </p>
              <form action={startDemoFormAction} className="mt-4">
                <input type="hidden" name="operatorAction" value="startDemo" />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  Open a new demo
                </button>
              </form>
            </div>
          </article>

          {renderDiagnostics(presentation, currentResult.promptText)}
        </section>

        <section aria-label="Prompt controls" className="rounded-[2rem] border border-black/10 bg-white/82 p-6 shadow-[0_24px_70px_rgba(48,28,8,0.1)] sm:p-8">
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
                  className="w-full rounded-[1rem] border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus:border-amber-500"
                />
                <SessionIdField sessionId={sessionId} />
                <input type="hidden" name="operatorAction" value="submitPrompt" />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full border border-amber-900/10 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950"
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
