# Runtime Session State is not editorial content

The GuideSite GUI should keep runtime **GuideSite Session** and **Run State** storage separate from editorial **Sources of Truth**. The first local MVP may use filesystem-backed persistence for development, but a deployed operator demo should plan for app-owned runtime storage such as durable KV or a small application database; Sanity remains the content system, not the visitor-session store.
