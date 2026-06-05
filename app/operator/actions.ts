import { createGuideSiteGuiService, type GuideSiteGuiActionResult, type GuideSiteGuiServiceDependencies } from "./guide-site-gui-service.ts";

export type GuideSiteOperatorDemoActions = {
  startGuideSiteOperatorDemoAction(formData: FormData): Promise<GuideSiteGuiActionResult>;
  submitGuideSiteOperatorPromptAction(formData: FormData): Promise<GuideSiteGuiActionResult>;
};

function normalizeFormPromptText(formData: FormData): string {
  const value = formData.get("promptText");
  return typeof value === "string" ? value : "";
}

function normalizeFormSessionId(formData: FormData): string | undefined {
  const value = formData.get("sessionId");

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createGuideSiteOperatorDemoActions(
  dependencies: {
    service?: Pick<ReturnType<typeof createGuideSiteGuiService>, "startDemo" | "submitPrompt">;
  } & GuideSiteGuiServiceDependencies = {},
): GuideSiteOperatorDemoActions {
  const service = dependencies.service ?? createGuideSiteGuiService(dependencies);

  return {
    async startGuideSiteOperatorDemoAction(_formData: FormData) {
      return service.startDemo();
    },
    async submitGuideSiteOperatorPromptAction(formData: FormData) {
      return service.submitPrompt({
        promptText: normalizeFormPromptText(formData),
        sessionId: normalizeFormSessionId(formData),
      });
    },
  };
}

const defaultActions = createGuideSiteOperatorDemoActions();

export const startGuideSiteOperatorDemoAction = defaultActions.startGuideSiteOperatorDemoAction;
export const submitGuideSiteOperatorPromptAction = defaultActions.submitGuideSiteOperatorPromptAction;
