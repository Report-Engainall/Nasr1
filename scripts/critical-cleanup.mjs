/** Run safety-critical database cleanup steps in order and stop on the first failure. */
export async function runCriticalCleanup(label, steps, reportError) {
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      reportError(
        `[${label}] ${step.name} failed; stopping cleanup and requiring connection close`,
        error,
      );
      throw error;
    }
  }
}
