import { Consumer, makeConsumer } from "@/domain/domain";
import { Context, Effect, Layer } from "effect";
import { YieldWrap } from "effect/Utils";
import type { ComponentType } from "react";

/**
 * @since 1.0.0
 * @category types
 */
export type EffectComponent<C, E, R> = Effect.Effect<C, E, R>;

export type Component = {
  name: string;
  children: Component[];
  consumer: Consumer;
};

export const Component = Context.GenericTag<Component>(
  "@effect/state/component"
);

type ComponentGenerator<
  P,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  E extends YieldWrap<Effect.Effect<any, any, any>>,
  F = ComponentType<P>
> = typeof Effect.gen<E, F>;

/**
 * @since 1.0.0
 * @category constructors
 */
export const component = <
  P,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  E extends YieldWrap<Effect.Effect<any, any, any>>
>(
  name: string,
  generator: Parameters<ComponentGenerator<P, E>>[0]
) => {
  const eff = Effect.gen(function* () {
    const parent = yield* Component;
    const consumer = yield* makeConsumer(`component:${name}`);
    const component: Component = {
      name,
      children: [],
      consumer,
    };

    parent.children.push(component);
    const builder = yield* Effect.provide(
      Effect.gen(generator),
      Layer.mergeAll(
        Layer.succeed(Consumer, consumer),
        Layer.succeed(Component, component)
      )
    ).pipe(Effect.withSpan(`${name} component`));
    return builder;
  });
  return eff;
};
