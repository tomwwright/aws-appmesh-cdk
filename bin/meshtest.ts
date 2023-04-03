#!/usr/bin/env node
import "source-map-support/register";
import { Peer } from "aws-cdk-lib/aws-ec2";
import { MeshTestApp } from "../lib/app";

new MeshTestApp({
  namespaceName: "meshtest",
  externalAccess: Peer.ipv4("14.202.217.89/32"),
});
