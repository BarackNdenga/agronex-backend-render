/// <reference types="@cloudflare/workers-types" />
import "./cloudflare-env-bootstrap";
import { httpServerHandler } from "cloudflare:node";
import express from "express";
import { configureExpressApp } from "./app";

const app = express();
configureExpressApp(app);
app.listen(3000);

export default httpServerHandler({ port: 3000 });
