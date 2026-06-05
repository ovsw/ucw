import { defineCliConfig } from "sanity/cli";
import { readSanityStudioConfig } from "./sanity/studio-env.ts";

const studioConfig = readSanityStudioConfig();

export default defineCliConfig({
  api: {
    projectId: studioConfig.projectId,
    dataset: studioConfig.dataset,
  },
});
