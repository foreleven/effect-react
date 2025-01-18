import {
  Context,
  Effect,
  Equal,
  Fiber,
  Layer,
  PubSub,
  Ref,
  Runtime,
  Stream,
  SubscriptionRef,
  Tracer,
} from "effect";
import { dual } from "effect/Function";

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId: unique symbol = Symbol.for("@effect/state/domain");

/**
 * @since 1.0.0
 * @category type ids
 */
export type TypeId = typeof TypeId;

/**
 * @since 1.0.0
 * @category models
 */
export interface Domain<
  Query extends Queries = Queries,
  Command extends Commands = Commands
> {
  query: Query;
  command: Command;
}

/**
 * @since 1.0.0
 * @category context
 */
export const Domain = Context.GenericTag<Domain, Domain>(
  "@effect/state/domain"
);

class DomainImpl<
  Q extends Queries = Queries,
  C extends Commands = Commands,
  E = unknown,
  R = unknown
> implements Domain<Q, C>
{
  private _queries: Queries = {};
  private _commands: Commands = {};

  constructor(
    readonly _tag: Context.Tag<Domain<Q, C>, Domain<Q, C>>,
    readonly effect: Effect.Effect<{ query: Q; command: C }, E, R>
  ) {}

  get query() {
    return this._queries as Q;
  }

  get command() {
    return this._commands as C;
  }

  setQueries(queries: Q) {
    return Effect.gen(this, function* () {
      for (const key of Object.keys(queries)) {
        const query = queries[key];
        const handler = yield* makeQuery(key, query);
        this._queries[key] = handler;
      }
    });
  }

  setCommands(commands: C) {
    return Effect.gen(this, function* () {
      for (const key of Object.keys(commands)) {
        const command = commands[key];
        const handler = yield* makeCommand(key, command);
        this._commands[key] = handler;
      }
    });
  }
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const make = <Query extends Queries, Command extends Commands, E, R>(
  key: string,
  creator: () => Effect.Effect<{ query: Query; command: Command }, E, R>
) => {
  const tag = Context.GenericTag<Domain<Query, Command>>(key);
  const domain = Effect.gen(function* () {
    const domain = new DomainImpl<Query, Command, E, R>(tag, creator());
    const { query, command } = yield* Effect.provide(
      domain.effect,
      Layer.succeed(Domain, domain)
    );
    yield* domain.setQueries(query);
    yield* domain.setCommands(command);
    return domain as Domain<Query, Command>;
  });
  return {
    tag,
    domain,
    layer: Layer.effect(tag, domain),
  };
};

/**
 * @since 1.0.0
 * @category type ids
 */
const State = Context.GenericTag("@effect/state/state");

/**
 * @since 1.0.0
 * @category models
 */
export interface State<D = unknown> {
  readonly _tag: typeof State;
  readonly ref: SubscriptionRef.SubscriptionRef<D>;
  readonly value: Effect.Effect<D, never, Consumer>;
  readonly consumers: Set<Consumer>;
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const state = <Value>(value: Value) =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(value);
    const state: State<Value> = {
      _tag: State,
      ref,
      consumers: new Set(),
      value: Effect.gen(function* () {
        const value = yield* Ref.get(ref);
        const consumer = yield* Consumer;
        state.consumers.add(consumer);
        return value;
      }),
    };
    return state;
  });

/**
 * @since 1.0.0
 * @category models
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Command<Args = any, E = unknown, R = unknown> = (
  ...args: Args[]
) => Effect.Effect<void, E, R>;

/**
 * @since 1.0.0
 * @category models
 */
export interface Commands {
  [key: string]: Command;
}

/**
 * @since 1.0.0
 * @category constructors
 */
const makeCommand = <Args, E, R>(
  key: string,
  handler: (...args: Args[]) => Effect.Effect<void, E, R>
) =>
  Effect.gen(function* () {
    const consumer = yield* makeConsumer(key);
    const live = Layer.succeed(Consumer, consumer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _handler = (...args: any[]) =>
      Effect.provide(handler(...args), live).pipe(
        Effect.withSpan(`command:${key}`)
      );
    return _handler;
  });

/**
 * @since 1.0.0
 * @category type ids
 */
const Query = Context.GenericTag<Query>("@effect/state/query");

/**
 * @since 1.0.0
 * @category models
 */
export type Query<A = unknown, E = unknown, R = unknown> = {
  _tag: typeof Query;
  subscriptions: Set<Consumer>;
  effect: Effect.Effect<A, E, R>;
};

/**
 * @since 1.0.0
 * @category models
 */
export interface Queries {
  [key: string]: Query["effect"];
}

/**
 * @since 1.0.0
 * @category constructors
 */
const makeQuery = <Value, E, R>(
  key: string,
  effect: Effect.Effect<Value, E, R>
) =>
  Effect.gen(function* () {
    // const domain = (yield* Self) as DomainImpl;
    const self = yield* makeConsumer(key);
    const handler = Effect.gen(function* () {
      const consumer = yield* Consumer;
      query.subscriptions.add(consumer);
      yield* Effect.log(`consume query[${key}] by ${consumer.key}`);
      return yield* Effect.provide(effect, Layer.succeed(Consumer, self));
    });
    const query: Query = {
      _tag: Query,
      subscriptions: new Set(),
      effect: handler,
    };
    const runtime = yield* Effect.runtime();
    Runtime.runFork(runtime)(
      self.changes.pipe(
        Stream.runForEach((d) =>
          Effect.gen(function* () {
            for (const c of query.subscriptions) {
              yield* c
                .callback(d.value)
                .pipe(Effect.withSpan(`query:${key}`, { parent: d.span }))
                .pipe(Effect.provide(Layer.succeed(Trigger, d.trigger)));
            }
          })
        )
      )
    );
    return handler;
  });

export interface Consumer<A = unknown> {
  _tag: typeof Consumer;
  key: string;
  callback: (value: A) => Effect.Effect<void, never, Trigger>;
  changes: Stream.Stream<{
    value: A;
    trigger: Trigger;
    span: Tracer.AnySpan | undefined;
  }>;
}

/**
 * @since 1.0.0
 * @category type ids
 */
export const Consumer = Context.GenericTag<Consumer>("@effect/state/consumer");

export const consume = dual<
  (
    key: string
  ) => <A, E, R>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, Exclude<R, Consumer>>,
  <A, E, R>(
    self: Effect.Effect<A, E, R>,
    key: string
  ) => Effect.Effect<A, E, Exclude<R, Consumer>>
>(2, (effect, key) => {
  return Effect.gen(function* () {
    const consumer = yield* makeConsumer(key);
    const live = Layer.succeed(Consumer, consumer);
    return yield* Effect.provide(effect, live);
  });
});

export const makeConsumer = <A = unknown>(key: string) => {
  return Effect.gen(function* () {
    const ps = yield* PubSub.unbounded<{
      value: A;
      trigger: Trigger;
      span: Tracer.AnySpan | undefined;
    }>();
    const consumer: Consumer<A> = {
      _tag: Consumer,
      key,
      changes: Stream.fromPubSub(ps),
      callback: (value: A) =>
        Effect.gen(function* () {
          const trigger = yield* Trigger;
          const span = yield* Effect.currentSpan.pipe(
            Effect.catchAllCause(() => Effect.succeed(undefined))
          );
          console.log("callback", span?.spanId);
          yield* ps.offer({ value, trigger, span });
        }),
    };
    return consumer;
  });
};

export type Setter = <V>(
  state: State<V>,
  updateOrValue: V | ((value: V) => V)
) => Effect.Effect<void, never, Trigger>;

/**
 * @since 1.0.0
 * @category domain
 */
export const set: Setter = <Value>(
  state: State<Value>,
  update: ((value: Value) => Value) | Value
) =>
  Effect.gen(function* () {
    const trigger = yield* Trigger;
    const old = yield* Ref.get(state.ref);
    let newValue: Value;
    if (typeof update === "function") {
      newValue = (update as (value: Value) => Value)(old);
    } else {
      newValue = update;
    }
    yield* Ref.set(state.ref, newValue);
    // check if the value is the same
    if (Equal.equals(old, newValue)) {
      return;
    }

    for (const c of state.consumers) {
      yield* c
        .callback(newValue)
        .pipe(Effect.provide(Layer.succeed(Trigger, trigger)));
    }
  }).pipe(Effect.withSpan("state:change"));

export const getter = Effect.gen(function* () {
  const consumer = yield* Consumer;
  return <V>(eff: Effect.Effect<V, never, Consumer>) => {
    return Effect.runSync(
      Effect.provide(eff, Layer.succeed(Consumer, consumer))
    );
  };
});

export type Trigger = {
  name: string;
  fibers: Array<Fiber.RuntimeFiber<void, never>>;
};

export const Trigger = Context.GenericTag<Trigger>("@effect/state/trigger");
