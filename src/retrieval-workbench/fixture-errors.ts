import { ZodError } from "zod";

export function printFixtureValidationError(header: string, error: unknown): void {
  console.error(header);

  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      console.error(`- ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return;
  }

  if (error instanceof Error) {
    console.error(error.message);
    return;
  }

  console.error(error);
}
