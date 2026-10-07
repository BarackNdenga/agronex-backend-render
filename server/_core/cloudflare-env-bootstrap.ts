/// <reference types="@cloudflare/workers-types" />
import { env } from "cloudflare:workers";
import { configureR2Bucket } from "../storage";
import { setCloudflareEnvironment } from "./runtime-bindings";

const workerEnvironment = env as unknown as Record<string, unknown> & { MEDIA?: Parameters<typeof configureR2Bucket>[0] };
setCloudflareEnvironment(workerEnvironment);
configureR2Bucket(workerEnvironment.MEDIA);
