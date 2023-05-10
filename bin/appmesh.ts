#!/usr/bin/env node
import "source-map-support/register";
import { Peer } from "aws-cdk-lib/aws-ec2";
import { AppMeshApp } from "../lib/appmesh";

new AppMeshApp({
  namespaceName: "appmesh",
  externalAccess: Peer.ipv4("139.130.21.126/32"),
});
