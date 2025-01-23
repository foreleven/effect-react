import { Effect, Fiber, Ref } from "effect";
import { Domain } from "../src/domain";
import "./App.css";
import { component, dispatcher, getter, render } from "@/react";

const Executors = {
  single: () => {
    return Effect.gen(function* () {
      const isPending = yield* Domain.state(false);
      const fiberRef = yield* Ref.make<Fiber.RuntimeFiber<
        void,
        unknown
      > | null>(null);

      return {
        isPending: isPending,
        invoke: <E, R>(eff: Effect.Effect<void, E, R>) =>
          Effect.gen(function* () {
            const trigger = yield* Domain.Trigger;
            const prevFiber = yield* Ref.get(fiberRef);
            if (prevFiber !== null) {
              yield* Fiber.interrupt(prevFiber).pipe(
                Effect.withSpan("interrupt")
              );
            }
            yield* Domain.set(isPending, true);
            const fiber = yield* Effect.fork(
              eff.pipe(Effect.andThen(() => Domain.set(isPending, false)))
            );
            yield* Ref.set(fiberRef, fiber);
            trigger.fibers.push(fiber);
          }),
      };
    });
  },
};

export const CounterDomain = Domain.make("counter", () =>
  Effect.gen(function* () {
    const count = yield* Domain.state(0);
    const executor = yield* Executors.single();
    return {
      query: {
        isPending: executor.isPending.value,
        count: count.value,
        total: count.value.pipe(Effect.map((v) => v * 9999)),
      },
      command: {
        update: (i: number) =>
          executor.invoke(
            Effect.gen(function* () {
              yield* Effect.sleep(1000);
              yield* Domain.set(count, i);
            })
          ),
        reset: () => Domain.set(count, 0),
      },
    };
  })
);

const total = component("Total", function* () {
  const domain = yield* CounterDomain.tag;
  const get = yield* getter;
  return yield* render(() => (
    <div className="total">
      <span>Total:</span>
      <span>
        {get(domain.query.isPending) ? "Pending..." : get(domain.query.total)}
      </span>
    </div>
  ));
});

const item = component("Item", function* () {
  const domain = yield* CounterDomain.tag;
  const dispatch = yield* dispatcher;
  return yield* render(() => (
    <div className="item">
      <span>Eras Tour Tickets</span>
      <label htmlFor="name">Quantity: </label>
      <input
        type="number"
        onChange={(e) =>
          dispatch(
            "change count",
            domain.command.update(Number(e.target.value))
          )
        }
        defaultValue={0}
        min={1}
      />
    </div>
  ));
});

export const App = component("App", function* () {
  const Total = yield* total;
  const Item = yield* item;
  return yield* render(() => (
    <>
      <div>
        <h1>Checkout</h1>
        <Item />
        <hr />
        <Total />
      </div>
    </>
  ));
}).pipe(Effect.provide(CounterDomain.layer));

console.log("1", App);
