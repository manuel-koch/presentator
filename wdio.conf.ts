import type { Options } from "@wdio/types";
import { spawn, spawnSync } from "child_process";

// Path to the compiled Tauri app bundle (built before running e2e tests)
const APP_PATH =
  "src-tauri/target/release/bundle/macos/presentator.app/Contents/MacOS/presentator";

export const config: Options.Testrunner = {
  runner: "local",
  specs: ["./e2e/**/*.spec.ts"],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error tauri capability
      "tauri:options": {
        application: APP_PATH,
      },
      browserName: "wry",
    },
  ],
  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 30000,
  },
  // Start tauri-driver before the test session
  onPrepare: () =>
    new Promise((resolve) => {
      process.env.TAURI_DRIVER = spawnSync("which", ["tauri-driver"]).stdout
        .toString()
        .trim();
      const driver = spawn(process.env.TAURI_DRIVER, [], {
        stdio: "inherit",
      });
      process.env.TAURI_DRIVER_PID = String(driver.pid);
      setTimeout(resolve, 500); // give the driver time to start
    }),
  // Stop tauri-driver after the test session
  onComplete: () => {
    if (process.env.TAURI_DRIVER_PID) {
      process.kill(Number(process.env.TAURI_DRIVER_PID));
    }
  },
};
