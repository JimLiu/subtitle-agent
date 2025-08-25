import { defineConfig } from "vitest/config";
import { sharedConfig } from "@subtitle-agent/vitest-config";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    // Package-specific overrides if needed
  },
});
