import React from "react";

export default function OperatorLoading() {
  return (
    <main className="min-h-screen px-4 py-6 text-slate-950 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl items-center justify-center">
        <section
          aria-labelledby="operator-loading-title"
          className="w-full max-w-2xl rounded-[2rem] border border-black/10 bg-white/85 px-6 py-8 text-center shadow-[0_24px_70px_rgba(48,28,8,0.1)] backdrop-blur-sm sm:px-10"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
            Operator Demo Surface
          </p>
          <h1
            id="operator-loading-title"
            className="mt-4 text-3xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-4xl"
          >
            Loading the validated GuideSite presentation
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-700">
            The canonical Parent journey is being prepared for the operator shell. The page will open
            directly into the validated demo state once the presentation DTO is ready.
          </p>
        </section>
      </div>
    </main>
  );
}
