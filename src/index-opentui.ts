#!/usr/bin/env bun

import { runCliWithHandlers } from "./app";
import { main } from "./ui/opentui-main";

await runCliWithHandlers(main);
