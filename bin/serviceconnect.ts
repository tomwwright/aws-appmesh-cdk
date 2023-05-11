#!/usr/bin/env node
import "source-map-support/register";
import { Peer } from "aws-cdk-lib/aws-ec2";
import { ServiceConnectApp } from "../lib/serviceconnect";
import { externalAccess } from "../lib/ip";

new ServiceConnectApp({
  namespaceName: "serviceconnect",
  externalAccess,
});
