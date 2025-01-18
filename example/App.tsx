import { Effect } from "effect";
import { Domain } from "../src/domain";
import "./App.css";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import { component, dispatcher, getter, render } from "@/react";

export const CounterDomain = Domain.make("counter", () =>
  Effect.gen(function* () {
    const count = yield* Domain.state(0);

    return {
      query: {
        count: count.value.pipe(Effect.map((v) => v * 2)),
      },
      command: {
        incr: (i: number) => Domain.set(count, (v) => v + i),
      },
    };
  })
);

const CounterButton = component(
  "CounterButton",
  Effect.gen(function* () {
    const domain = yield* CounterDomain.tag;
    const get = yield* getter;
    const dispatch = yield* dispatcher;
    return yield* render(() => (
      <button
        onClick={() => {
          dispatch(domain.command.incr(1));
        }}
      >
        {get(domain.query.count)}
      </button>
    ));
  })
);

export const App = component(
  "App",
  Effect.gen(function* () {
    const domain = yield* CounterDomain.tag;
    const get = yield* getter;
    const Counter = yield* CounterButton.component;
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
          <Counter />
          <p>The counter is {get(domain.query.count)}</p>
        </div>
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
      </>
    ));
  }).pipe(Effect.provide(CounterDomain.layer))
);
