import { Consumer, makeConsumer, Trigger } from "@/domain/domain";
import { Context, Effect, Fiber, Layer, Runtime, Stream } from "effect";
import React, { useLayoutEffect, useRef } from "react";
import { memo, useEffect, useState } from "react";

/**
 * @since 1.0.0
 * @category types
 */
export type EffectComponent<Args, C, E, R> =
  | Effect.Effect<C, E, R>
  | ((...args: Args[]) => Effect.Effect<C, E, R>);

/**
 * @since 1.0.0
 * @category types
 */
export type EffectComponentExcludeConsumer<EC> = EC extends EffectComponent<
  infer Args,
  infer C,
  infer E,
  infer R
>
  ? EC extends Effect.Effect<C, E, R>
    ? Effect.Effect<C, E, Exclude<R, Consumer>>
    : (...args: Args[]) => Effect.Effect<C, E, Exclude<R, Consumer>>
  : never;

type Component = {
  name: string;
  children: Component[];
  consumer: Consumer;
};

const Component = Context.GenericTag<Component>("@effect/state/component");

/**
 * @since 1.0.0
 * @category constructors
 */
export const component = <
  Args,
  C extends () => JSX.Element,
  E,
  R,
  EC = EffectComponent<Args, C, E, R>
>(
  name: string,
  eff: EC
): EffectComponentExcludeConsumer<EC> => {
  if (Effect.isEffect(eff)) {
    return Effect.gen(function* () {
      const parent = yield* Component;
      const consumer = yield* makeConsumer(`component:${name}`);
      const component: Component = {
        name,
        children: [],
        consumer,
      };
      parent.children.push(component);
      return yield* Effect.provide(
        eff,
        Layer.mergeAll(
          Layer.succeed(Consumer, consumer),
          Layer.succeed(Component, component)
        )
      ).pipe(Effect.withSpan(`${name} component`));
    }) as EffectComponentExcludeConsumer<EC>;
  } else {
    const effect = eff as (...args: Args[]) => Effect.Effect<C, E, R>;
    return ((...args: Args[]) => {
      return Effect.gen(function* () {
        const parent = yield* Component;
        const consumer = yield* makeConsumer(`component:${name}`);
        const component: Component = {
          name,
          children: [],
          consumer,
        };
        parent.children.push(component);
        return yield* effect(...args).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(Consumer, consumer),
              Layer.succeed(Component, component)
            )
          ),
          Effect.withSpan(`${name} component`)
        );
      });
    }) as unknown as EffectComponentExcludeConsumer<EC>;
  }
};

/**
 * @since 1.0.0
 * @category react
 */
export const render = (jsx: () => JSX.Element) => {
  return Effect.gen(function* () {
    const component = yield* Component;
    const renderer = yield* Trigger;
    const runtime = yield* Effect.runtime();
    let resolver: null | (() => void) = null;
    const mount = Effect.promise(() => {
      return new Promise<void>((resolve) => {
        resolver = resolve;
      });
    })
      .pipe(Effect.tap(() => Effect.log("mounted:" + component.name)))
      .pipe(Effect.withSpan("component:mount"));
    const fiber = yield* Effect.fork(mount);
    renderer.fibers.push(fiber);
    console.log("component", component.name);

    return memo(() => {
      const [value, setValue] = useState(0);
      const rerenderRef = useRef<null | (() => void)>(resolver);
      useEffect(() => {
        const fiber = Runtime.runFork(runtime)(
          component.consumer.changes.pipe(
            Stream.runForEach((e) => {
              setValue((d) => d + 1);
              return Effect.gen(function* () {
                if (rerenderRef.current != null) {
                  return;
                }
                const promise = new Promise<void>((resolve) => {
                  rerenderRef.current = resolve;
                });
                const rerender = Effect.promise(() => {
                  return promise;
                })
                  .pipe(
                    Effect.tap(() =>
                      Effect.log("rerendered:" + component.name, e.span?.spanId)
                    )
                  )
                  .pipe(
                    Effect.withSpan("component:rerender", { parent: e.span })
                  );
                const fiber = Runtime.runFork(runtime)(rerender);
                e.trigger.fibers.push(fiber);
                console.log("rerender ref 22", rerenderRef.current, resolver);
              });
            })
          )
        );
        return () => {
          Runtime.runFork(runtime)(
            Fiber.interrupt(fiber).pipe(Effect.withSpan("component:unmount"))
          );
        };
      }, []);

      useEffect(() => {
        if (rerenderRef.current) {
          rerenderRef.current();
          rerenderRef.current = null;
          console.log("rerender ref 33");
        }
      }, [value]);

      useLayoutEffect(() => {
        if (rerenderRef.current) {
          rerenderRef.current();
          rerenderRef.current = null;
        }
      }, []);

      //   const start = performance.now();
      //   // Do a lot of work
      //   for (let i = 0; i < 100000000; i++) {
      //
      //   }
      //   const end = performance.now();
      //   console.log("work", end - start);

      const element = React.createElement(jsx);
      return element;
    });
  });
};

export const mount = <P>(
  app: Effect.Effect<
    React.MemoExoticComponent<() => React.FunctionComponentElement<P>>,
    never,
    Component | Trigger
  >,
  renderer: (
    component: React.MemoExoticComponent<
      () => React.FunctionComponentElement<P>
    >
  ) => void
) => {
  return Effect.gen(function* () {
    const consumer = yield* makeConsumer(`component:root`);
    const component: Component = {
      name: "root",
      children: [],
      consumer,
    };
    const mountRenderer: Trigger = {
      name: "mount",
      fibers: [],
    };
    const App = yield* Effect.provide(
      app,
      Layer.mergeAll(
        Layer.succeed(Trigger, mountRenderer),
        Layer.succeed(Component, component)
      )
    );
    renderer(App);
    for (const fiber of mountRenderer.fibers) {
      yield* Fiber.await(fiber);
    }
    mountRenderer.fibers = [];
  });
};

export const dispatcher = Effect.gen(function* () {
  const consumer = yield* Consumer;
  const runtime = yield* Effect.runtime();
  return <A>(eff: Effect.Effect<A, never, Trigger>) => {
    const renderer: Trigger = {
      name: "dispatcher",
      fibers: [],
    };
    return Runtime.runFork(runtime)(
      Effect.gen(function* () {
        yield* eff.pipe(
          Effect.provide(Layer.succeed(Trigger, renderer)),
          Effect.provide(Layer.succeed(Consumer, consumer))
        );
      })
    );
  };
});
