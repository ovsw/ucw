import React from "react";

export default function OperatorLoading() {
  return (
    <main className="min-h-screen px-4 py-4 text-slate-950 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center">
        <section
          aria-labelledby="operator-loading-title"
          aria-live="polite"
          className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm sm:px-10"
        >
          <p className="text-sm font-medium text-slate-500">GuideSite demo</p>
          <h1
            id="operator-loading-title"
            className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950"
          >
            Loading the operator view
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-700">
            Preparing the parent question, progress panel, and answer state.
          </p>
        </section>
      </div>
    </main>
  );
}
