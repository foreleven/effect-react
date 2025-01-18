import { Context, Effect } from "effect";
import { set, state, query, make, command, consume } from "./domain/domain";

const program = Effect.gen(function* () {
  const domain = yield* make("counter", () =>
    Effect.gen(function* () {
      const value = yield* state("value", 0);
      const count = yield* query("count", value.value);
      const incr = yield* command("incr", (i: number) =>
        set(value, (v) => v + i),
      );
      return {
        query: {
          count,
        },
        command: {
          incr: incr,
        },
      };
    }),
  );

  yield* Effect.gen(function* () {
    const count = yield* domain.query.count;
    yield* Effect.log(count);
    yield* domain.command.incr(1);
    yield* domain.command.incr(1);
    yield* Effect.log(yield* domain.query.count);
    const count2 = yield* domain.query.count;
    yield* Effect.log("consume: ", count2);
  }).pipe(consume("test"));
});

Effect.runSync(program);
