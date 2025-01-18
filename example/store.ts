import { Store } from "../src/store";
import { WebSdk } from "@effect/opentelemetry";
import {
  BatchSpanProcessor,
  // ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export const TraceLive = WebSdk.layer(() => {
  return {
    resource: { serviceName: "example" },
    spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
  };
});

export const store = Store.layer();
// .pipe(Layer.merge(TraceLive));
