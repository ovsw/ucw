import OperatorDemoClient from "./operator-demo-client.tsx";
import { createGuideSiteGuiService, type GuideSiteGuiActionResult } from "./guide-site-gui-service.ts";
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

export default function OperatorPage() {
  return (
    <OperatorDemoClient
      presentation={guiService.createInitialPresentation()}
      startDemoAction={startGuideSiteOperatorDemoAction}
      submitPromptAction={submitGuideSiteOperatorPromptAction}
    />
  );
}
