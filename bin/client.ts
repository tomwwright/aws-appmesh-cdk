#!/usr/bin/env node

import fetch from "node-fetch";

async function main() {
  const hostname = process.argv[2];
  if (!hostname) {
    console.error("Usage: yarn start [hostname]");
    process.exit(1);
  }
  const url = `http://${hostname}`;

  console.log(`Running against ${url}`);
  setInterval(() => request(url), 1000);
}

const state: Record<string, number> = {};

async function request(url: string) {
  const response = await fetch(url);
  const { service, version } = await response.json();

  const key = `${service}:${version}`;
  state[key] = key in state ? state[key] + 1 : 1;

  const report = Object.entries(state)
    .map(([key, count]) => `${key}=${count}`)
    .sort()
    .join(" ");
  console.log(`${response.status} ${response.statusText} ${report}`);
}

main();
