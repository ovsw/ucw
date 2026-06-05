import { NextStudio } from "next-sanity/studio";
import config from "../../../sanity.config.ts";

export const dynamic = "force-static";

export { metadata, viewport } from "next-sanity/studio";

export default function AdminStudioPage() {
  return <NextStudio config={config} />;
}
