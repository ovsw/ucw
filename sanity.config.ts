'use client';

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { readSanityStudioConfig } from "./sanity/studio-env.ts";
import { studioSchemaTypes } from "./sanity/schema.ts";

const studioConfig = readSanityStudioConfig();

export default defineConfig({
  basePath: "/admin",
  projectId: studioConfig.projectId,
  dataset: studioConfig.dataset,
  plugins: [structureTool()],
  schema: {
    types: studioSchemaTypes,
  },
});
