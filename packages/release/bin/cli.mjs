#!/usr/bin/env node
import { runCli } from '@hartii/ops-core';
import { execute } from '../src/index.mjs';
await runCli('release', execute);
