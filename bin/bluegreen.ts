#!/usr/bin/env node
import "source-map-support/register";
import { BlueGreenApp } from "../lib/bluegreen";
import { App } from "aws-cdk-lib";
import { injectBlueGreenState as injectBlueGreenState } from "../lib/bluegreen/deployment";
import { externalAccess } from "../lib/ip";

async function main() {
  /**
   * as constructors cannot be async and retrieving the current
   * state from AWS Parameter Store is async it has to be done
   * here
   */

  const app = new App();
  await injectBlueGreenState(app); // needs to be performed out here because async unsupported in constructors

  /**
   * having populated the state we can now enter the construct tree
   */

  new BlueGreenApp(app, "bluegreen", {
    namespaceName: "bluegreen",
    externalAccess,
  });
}

main();
