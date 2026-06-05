import OperatorDemoClient from "./operator-demo-client.tsx";
import { createGuideSiteGuiService } from "./guide-site-gui-service.ts";
import {
  startGuideSiteOperatorDemoAction as invokeStartGuideSiteOperatorDemoAction,
  submitGuideSiteOperatorPromptAction as invokeSubmitGuideSiteOperatorPromptAction,
} from "./actions.ts";

const guiService = createGuideSiteGuiService();

async function startGuideSiteOperatorDemoAction(formData: FormData): Promise<void> {
  "use server";
  await invokeStartGuideSiteOperatorDemoAction(formData);
}

async function submitGuideSiteOperatorPromptAction(formData: FormData): Promise<void> {
  "use server";
  await invokeSubmitGuideSiteOperatorPromptAction(formData);
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
