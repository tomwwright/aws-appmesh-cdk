#!/usr/bin/env node
import "source-map-support/register";
import { Peer } from "aws-cdk-lib/aws-ec2";
import { BlueGreenApp } from "../lib/blue-green-app";
import { App } from "aws-cdk-lib";
import { injectBlueGreenState as injectBlueGreenState } from "../lib/blue-green";

async function main() {
  const app = new App();
  await injectBlueGreenState(app);

  new BlueGreenApp(app, "bluegreen", {
    namespaceName: "bluegreen",
    externalAccess: Peer.ipv4("14.202.217.89/32"),
  });
}

main();
