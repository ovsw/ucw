import React from "react";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

import OperatorDemoClient from "./operator-demo-client.tsx";
import { createGuideSiteGuiService, type GuideSiteGuiActionResult } from "./guide-site-gui-service.ts";
import { GUIDESITE_GUI_SESSION_COOKIE, normalizeGuideSiteSessionId } from "../../src/guidesite-mvp/gui-session.ts";
import {
  startGuideSiteOperatorDemoAction as invokeStartGuideSiteOperatorDemoAction,
  submitGuideSiteOperatorPromptAction as invokeSubmitGuideSiteOperatorPromptAction,
} from "./actions.ts";

const guiService = createGuideSiteGuiService();

async function startGuideSiteOperatorDemoAction(formData: FormData): Promise<GuideSiteGuiActionResult> {
  "use server";
  return invokeStartGuideSiteOperatorDemoAction(formData);
}

async function submitGuideSiteOperatorPromptAction(formData: FormData): Promise<GuideSiteGuiActionResult> {
  "use server";
  return invokeSubmitGuideSiteOperatorPromptAction(formData);
}

async function readInitialGuideSiteSessionId(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return normalizeGuideSiteSessionId(cookieStore.get(GUIDESITE_GUI_SESSION_COOKIE)?.value);
  } catch (error) {
    if (error instanceof Error && /outside a request scope/i.test(error.message)) {
      return undefined;
    }

    throw error;
  }
}

export default async function OperatorPage() {
  const sessionId = await readInitialGuideSiteSessionId();
  const initialPresentation = await guiService.restoreDemo({
    sessionId,
  });

  return (
    <OperatorDemoClient
      result={initialPresentation}
      startDemoAction={startGuideSiteOperatorDemoAction}
      submitPromptAction={submitGuideSiteOperatorPromptAction}
    />
  );
}
