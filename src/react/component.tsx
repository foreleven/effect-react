import { Consumer, makeConsumer, Trigger } from "@/domain/domain";
import { Effect, Fiber, Layer, Runtime, Stream } from "effect";
import React, { ComponentType, useLayoutEffect, useRef } from "react";
import { memo, useEffect, useState } from "react";
import { ComponentContext, withRuntime } from "./Context";
import * as internal from "./internal";

/**
 * @since 1.0.0
 * @category types
 */
export type EffectComponent<Args, C, E, R> = internal.EffectComponent<
  Args,
  C,
  E,
  R
>;

/**
 * @since 1.0.0
 * @category types
 */
export type EffectComponentBuilder<EC> = internal.EffectComponentBuilder<EC>;

export type Component = internal.Component;
export const Component = internal.Component;

/**
 * @since 1.0.0
 * @category constructors
 */
export const component = <
  Args,
  P,
  C extends ComponentType<P>,
  E,
  R,
  EC = EffectComponent<Args, C, E, R>
>(
  name: string,
  eff: EC
): EffectComponentBuilder<EC> => {
  if (Effect.isEffect(eff)) {
    return {
      name,
      component: Effect.gen(function* () {
        const parent = yield* Component;
        const consumer = yield* makeConsumer(`component:${name}`);
        const component: Component = {
          name,
          children: [],
          consumer,
        };

        parent.children.push(component);
        const builder = yield* Effect.provide(
          eff,
          Layer.mergeAll(
            Layer.succeed(Consumer, consumer),
            Layer.succeed(Component, component)
          )
        ).pipe(Effect.withSpan(`${name} component`));
        return builder;
      }),
    } as EffectComponentBuilder<EC>;
  } else {
    const effect = eff as (...args: Args[]) => Effect.Effect<C, E, R>;
    return {
      name,
      component: (...args: Args[]) => {
        return Effect.gen(function* () {
          const parent = yield* Component;
          const consumer = yield* makeConsumer(`component:${name}`);
          const component: Component = {
            name,
            children: [],
            consumer,
          };
          parent.children.push(component);
          const builder = yield* effect(...args).pipe(
            Effect.provide(
              Layer.mergeAll(
                Layer.succeed(Consumer, consumer),
                Layer.succeed(Component, component)
              )
            ),
            Effect.withSpan(`${name} component`)
          );
          return {
            ...component,
            component: builder,
          };
        });
      },
    } as unknown as EffectComponentBuilder<EC>;
  }
};

/**
 * @since 1.0.0
 * @category react
 */
export const render = (
  reactComponent: React.ComponentType
): Effect.Effect<React.ComponentType, never, Component | Trigger> => {
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
      return (
        <ComponentContext.Provider value={{ component, context }}>
          <ReactComponent />
        </ComponentContext.Provider>
      );
    });
  }) as unknown as Effect.Effect<
    React.ComponentType,
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
  return function dispatch<A>(effect: Effect.Effect<A, never, Trigger>) {
    const renderer: Trigger = {
      name: "dispatcher",
      fibers: [],
    };
    return Runtime.runFork(runtime)(
      Effect.gen(function* () {
        yield* effect.pipe(
          Effect.provide(Layer.succeed(Trigger, renderer)),
          Effect.provide(Layer.succeed(Consumer, consumer))
        );
      })
    );
  };
});
