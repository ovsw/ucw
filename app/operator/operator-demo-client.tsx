"use client";

import React from "react";
import type { GuideSitePresentation } from "../../src/guidesite-mvp/presentation-dto.ts";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

const foundationChecks = [
  "App Router root and operator routes are mounted.",
  "Operator shell stays separate from the Parent-shaped answer canvas.",
  "GuideSite MVP execution code is not imported into client components.",
];

const answerCanvasSection = {
  label: "Answer canvas",
  title: "Parent-shaped output placeholder",
  description:
    "This neutral canvas is where the validated product state will appear once the GUI service boundary is wired in.",
} as const;

const operatorInspectionSection = {
  label: "Operator inspection",
  title: "Foundation checks",
  description:
    "The shell keeps the demo operator focused on the product surface while the implementation details stay one layer deeper.",
} as const;

function FoundationCheckCard({ check }: { check: string }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-900/10 bg-white px-4 py-4">
      <p className="text-sm leading-6 text-slate-700">{check}</p>
    </div>
  );
}

function FoundationCheckItem({ check, index }: { check: string; index: number }) {
  return (
    <li className="flex items-start gap-3 rounded-[1.25rem] border border-slate-900/10 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-950">
        {index + 1}
      </span>
      <span>{check}</span>
    </li>
  );
}

type OperatorDemoActionResult = {
  promptText: string;
  presentation: GuideSitePresentation;
};

type OperatorDemoAction = (formData: FormData) => Promise<OperatorDemoActionResult>;
type FormAction = (formData: FormData) => void | Promise<void>;

type OperatorDemoClientProps = {
  presentation: GuideSitePresentation;
  startDemoAction: OperatorDemoAction;
  submitPromptAction: OperatorDemoAction;
};

export default function OperatorDemoClient({
  presentation,
  startDemoAction,
  submitPromptAction,
}: OperatorDemoClientProps) {
  const answerStateLabel = presentation.answer.status.replace(/_/g, " ");
  const startDemoFormAction = startDemoAction as unknown as FormAction;
  const submitPromptFormAction = submitPromptAction as unknown as FormAction;

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
                Foundation route for the operator-led Ultimate Camp Website demo. This slice proves the
                App Router shell, the Tailwind 4 pipeline, and a neutral surface around the eventual
                Parent-shaped answer presentation.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <span className="rounded-full border border-amber-900/10 bg-amber-950 px-4 py-2 text-sm font-medium text-amber-50">
                Canonical journey
              </span>
              <span className="rounded-full border border-slate-900/10 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                Desktop-first shell
              </span>
            </div>
          </div>
        </header>

        <section
          aria-label="Demo surface foundation"
          className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.65fr)]"
        >
          <article className="rounded-[2rem] border border-black/10 bg-[#fffaf1]/92 p-6 shadow-[0_24px_70px_rgba(48,28,8,0.1)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                {answerCanvasSection.label}
              </p>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">
                {answerStateLabel}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-3xl">
              {answerCanvasSection.title}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
              {answerCanvasSection.description}
            </p>

            <div className="mt-6 rounded-[1.5rem] border border-amber-900/10 bg-gradient-to-br from-amber-50 to-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Canonical prompt</p>
              <p className="mt-3 text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.07em] text-slate-950">
                {canonicalPrompt}
              </p>
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-slate-900/10 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">Current presentation</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-slate-950">
                {presentation.answer.status === "loading"
                  ? presentation.answer.headline
                  : "Service-backed presentation ready"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {presentation.answer.status === "loading"
                  ? presentation.answer.message
                  : "The GUI service and server actions are wired behind the shell for the next iteration."}
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {foundationChecks.map((check) => (
                <FoundationCheckCard key={check} check={check} />
              ))}
            </div>
          </article>

          <aside
            aria-labelledby="operator-inspection-title"
            className="rounded-[2rem] border border-black/10 bg-white/78 p-6 shadow-[0_24px_70px_rgba(48,28,8,0.1)] sm:p-8"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                  {operatorInspectionSection.label}
                </p>
                <h2
                  id="operator-inspection-title"
                  className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-slate-950"
                >
                  {operatorInspectionSection.title}
                </h2>
              </div>
              <span className="rounded-full border border-slate-900/10 bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                shell
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-700">{operatorInspectionSection.description}</p>

            <ul className="mt-6 space-y-3">
              {foundationChecks.map((check, index) => (
                <FoundationCheckItem key={check} check={check} index={index} />
              ))}
            </ul>

            <section className="mt-6 rounded-[1.5rem] border border-amber-900/10 bg-amber-50/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Demo boundary</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                The forms below call server actions only. The client shell does not import the GuideSite
                pipeline, OpenAI provider, Sanity retrieval adapter, or the server service module.
              </p>

              <form action={startDemoFormAction} className="mt-4 space-y-3">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                >
                  Start canonical demo
                </button>
              </form>

              <form action={submitPromptFormAction} className="mt-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.22em] text-amber-800" htmlFor="operator-prompt">
                  Submit prompt
                </label>
                <input
                  id="operator-prompt"
                  name="promptText"
                  defaultValue={canonicalPrompt}
                  className="w-full rounded-[1rem] border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full border border-amber-900/10 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950"
                >
                  Run prompt
                </button>
              </form>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
