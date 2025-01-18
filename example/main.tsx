import { mount } from "@/react";
import { Effect, ManagedRuntime } from "effect";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";
import { TraceLive } from "./store";

const runtime = ManagedRuntime.make(TraceLive);

runtime.runFork(
  Effect.gen(function* () {
    const root = createRoot(document.getElementById("root")!);
    yield* mount(App.component, (Root) => {
      root.render(<Root />);
    });
  })
);
