import { Consumer, makeConsumer } from "@/domain/domain";
import { Context, Effect, Layer } from "effect";
import type { ComponentType } from "react";

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
export type EffectComponentBuilder<EC> = EC extends EffectComponent<
  infer Args,
  infer C,
  infer E,
  infer R
>
  ? EC extends Effect.Effect<C, E, R>
    ? { name: string; component: Effect.Effect<C, E, Exclude<R, Consumer>> }
    : {
        name: string;
        component: (
          ...args: Args[]
        ) => Effect.Effect<C, E, Exclude<R, Consumer>>;
      }
  : never;

export type Component = {
  name: string;
  children: Component[];
  consumer: Consumer;
};

export const Component = Context.GenericTag<Component>(
  "@effect/state/component"
);

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
