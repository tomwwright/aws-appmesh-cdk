#!/usr/bin/env node
import "source-map-support/register";
import { createApp } from "../lib/app";

const port = process.env.SERVICE_PORT ?? 3000;
const service = process.env.SERVICE_NAME ?? "unknown";

const app = createApp(service);

app.listen(port, () => {
  console.log(`Service '${service}' running on port: ${port}`);
});
