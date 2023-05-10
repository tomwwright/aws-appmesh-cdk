#!/usr/bin/env node
import "source-map-support/register";
import { Peer } from "aws-cdk-lib/aws-ec2";
import { BlueGreenApp } from "../lib/bluegreen";
import { App } from "aws-cdk-lib";
import { injectBlueGreenState as injectBlueGreenState } from "../lib/bluegreen/deployment";

async function main() {
  const app = new App();
  await injectBlueGreenState(app); // needs to be performed out here because async unsupported in constructors

  new BlueGreenApp(app, "bluegreen", {
    namespaceName: "bluegreen",
    externalAccess: Peer.ipv4("139.130.21.126/32"),
  });
}

main();
