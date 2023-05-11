#!/usr/bin/env node
import "source-map-support/register";
import { AppMeshApp } from "../lib/appmesh";
import { externalAccess } from "../lib/ip";

new AppMeshApp({
  namespaceName: "appmesh",
  externalAccess,
});
