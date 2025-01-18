import { Effect } from "effect";
import { Domain } from "../src/domain";
import "./App.css";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import { component, dispatcher, render } from "@/react";

export const CounterDomain = Domain.make("counter", () =>
  Effect.gen(function* () {
    const count = yield* Domain.state(0);
    const text = yield* Domain.state("hello");

    return {
      query: {
        count: count.value.pipe(Effect.map((v) => v * 2)),
        text: text.value,
      },
      command: {
        incr: (i: number) => Domain.set(count, (v) => v + i),
        setText: (t: string) => Domain.set(text, t),
      },
    };
  })
);

const XInput = component("Input", () =>
  Effect.gen(function* () {
    const counter = yield* CounterDomain.tag;
    const get = yield* Domain.getter;
    const send = yield* dispatcher;
    return yield* render(() => (
      <>
        <input
          value={get(counter.query.text)}
          onChange={(e) => {
            send(counter.command.setText(e.target.value)).pipe(
              Effect.withSpan("input change")
            );
          }}
        />
        {get(counter.query.count)}
      </>
    ));
  })
);

export const App = component(
  "App",
  Effect.gen(function* () {
    const counter = yield* CounterDomain.tag;
    const get = yield* Domain.getter;
    const dispatch = yield* dispatcher;
    const Input = yield* XInput();
    return yield* render(() => (
      <>
        <div>
          <a href="https://vite.dev" target="_blank">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <h1>Vite + React</h1>
        <div className="card">
          <button
            onClick={() => {
              console.log("do incr");
              dispatch(
                counter.command.incr(1).pipe(Effect.withSpan("button click"))
              );
            }}
          >
            count is {get(counter.query.count)}
          </button>
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR
          </p>
          <Input />
          <Input />
        </div>
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
      </>
    ));
  }).pipe(Effect.provide(CounterDomain.layer))
);
