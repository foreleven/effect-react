import React, { useContext, useMemo } from "react";
import { Store } from "../store";
import { Effect, Layer } from "effect";
import { StoreContext } from "./StoreContext";

export interface StoreProviderProps {
  children: React.ReactNode;
  layer: Layer.Layer<Store.Store>;
}

export function StoreProvider({ children, layer }: StoreProviderProps) {
  const parent = useContext(StoreContext);
  const combined = useMemo(() => {
    if (parent) {
      const newLayer = Layer.effect(
        Store.Store,
        Effect.gen(function* () {
          const _parent = yield* Store.Store;
          const _current = yield* Store.Store.pipe(Effect.provide(layer));
          _current.parent = _parent;
          return _current;
        }).pipe(Effect.provide(parent))
      );
      return Layer.mergeAll(parent, newLayer);
    }
    return layer;
  }, [layer, parent]);
  return (
    <StoreContext.Provider value={combined}>{children}</StoreContext.Provider>
  );
}
