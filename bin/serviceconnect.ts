#!/usr/bin/env node
import "source-map-support/register";
import { Peer } from "aws-cdk-lib/aws-ec2";
import { ServiceConnectApp } from "../lib/serviceconnect";

new ServiceConnectApp({
  namespaceName: "serviceconnect",
  externalAccess: Peer.ipv4("139.130.21.126/32"),
});
