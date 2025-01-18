import { Context, Effect, Layer } from "effect";
import { Domain } from "../domain";

export interface Store {
  domains: WeakMap<Effect.Effect<Domain.Domain>, Domain.Domain>;
  parent?: Store;
}

export const Store = Context.GenericTag<Store>("effect/state/store");

export const layer = () => {
  return Layer.succeed(Store, { domains: new WeakMap() });
};
