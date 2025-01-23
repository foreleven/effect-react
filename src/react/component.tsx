import { Consumer, makeConsumer, Trigger } from "@/domain/domain";
import { Effect, Fiber, Layer, Runtime, Stream } from "effect";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { memo, useEffect, useState } from "react";
import { ComponentContext, withRuntime } from "./Context";
import * as internal from "./internal";

export type Component = internal.Component;
export const Component = internal.Component;

/**
 * @since 1.0.0
 * @category constructors
 */
export const component = internal.component;

/**
 * @since 1.0.0
 * @category react
 */
export const render = <P,>(
  reactComponent: React.ComponentType<P>
): Effect.Effect<React.ComponentType<P>, never, Component | Trigger> => {
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
      .pipe(Effect.withSpan(`component:mount:${component.name}`));
    const fiber = yield* Effect.fork(mount);
    renderer.fibers.push(fiber);
    const context = yield* Effect.context();

    return memo((props: P) => {
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
                console.log("trace id:", e.span?.traceId);
                const promise = new Promise<void>((resolve) => {
                  rerenderRef.current = resolve;
                });
                const rerender = Effect.promise(() => {
                  return promise;
                }).pipe(
                  Effect.withSpan(`component:rerender:${component.name}`, {
                    parent: e.span,
                  })
                );
                const fiber = Runtime.runFork(runtime)(rerender);
                e.trigger.fibers.push(fiber);
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
        }
      }, [value]);

      useLayoutEffect(() => {
        if (rerenderRef.current) {
          rerenderRef.current();
          rerenderRef.current = null;
        }
      }, []);

      const ReactComponent = reactComponent;
      const cc = useMemo(() => ({ component, context }), []);
      return (
        <ComponentContext.Provider value={cc}>
          <ReactComponent {...(props as JSX.IntrinsicAttributes & P)} />
        </ComponentContext.Provider>
      );
    });
  }) as unknown as Effect.Effect<
    React.ComponentType<P>,
    never,
    Component | Trigger
  >;
};

export const mount = <P extends object>(
  app: Effect.Effect<React.ComponentType<P>, never, Component | Trigger>,
  renderer: (component: React.ComponentType<P>) => void
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
    const runtime = yield* Effect.runtime();

    const App = yield* Effect.provide(
      app,
      Layer.mergeAll(
        Layer.succeed(Trigger, mountRenderer),
        Layer.succeed(Component, component)
      )
    );

    const WrappedApp = withRuntime(runtime, App);
    renderer(WrappedApp);
    for (const fiber of mountRenderer.fibers) {
      yield* Fiber.await(fiber);
    }
    mountRenderer.fibers = [];
  });
};

export const getter = Effect.gen(function* () {
  const consumer = yield* Consumer;
  const runtime = yield* Effect.runtime();
  return function get<V>(effect: Effect.Effect<V, never, Consumer>) {
    return Runtime.runSync(runtime)(
      Effect.provide(effect, Layer.succeed(Consumer, consumer))
    );
  };
});

export const dispatcher = Effect.gen(function* () {
  const consumer = yield* Consumer;
  const runtime = yield* Effect.runtime();
  return function dispatch<
    A
  >(action: string, effect: Effect.Effect<A, never, Trigger>) {
    const renderer: Trigger = {
      name: "dispatcher",
      fibers: [],
    };
    return Runtime.runFork(runtime)(
      Effect.gen(function* () {
        yield* effect.pipe(
          Effect.provide(Layer.succeed(Trigger, renderer)),
          Effect.provide(Layer.succeed(Consumer, consumer)),
          Effect.withSpan(`dispatch:${action}`)
        );

        for (const fiber of renderer.fibers) {
          yield* Fiber.join(fiber);
        }
        renderer.fibers = [];
      }).pipe(Effect.andThen(Effect.interrupt))
    );
  };
});
