import { Cause, Context, Effect, Exit, Layer, Runtime } from "effect";
import React, { lazy, Suspense, useContext, useMemo } from "react";
import * as internal from "./internal";

export const RuntimeContext =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  React.createContext<Runtime.Runtime<any> | null>(null);

export interface RuntimeProviderProps<R> {
  runtime: Runtime.Runtime<R>;
  children: React.ReactNode;
}

export const RuntimeProvider = <R,>({
  runtime,
  children,
}: RuntimeProviderProps<R>) => (
  <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>
);

export const withRuntime = <R, P>(
  runtime: Runtime.Runtime<R>,
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> => {
  return (props: P) => (
    <RuntimeProvider runtime={runtime}>
      <WrappedComponent
        {...(props as unknown as JSX.IntrinsicAttributes & P)}
      />
    </RuntimeProvider>
  );
};

export const ComponentContext = React.createContext<{
  component: internal.Component;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Context.Context<any>;
} | null>(null);

export interface ComponentProps<E, R> {
  component: Effect.Effect<React.ComponentType, E, R>;
  onCause?: (cause: Cause.Cause<E>) => React.ComponentType;
}

export const Loader = <E, R>({ component, onCause }: ComponentProps<E, R>) => {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error("Runtime not found");
  }
  const cc = useContext(ComponentContext);
  if (!cc) {
    throw new Error("Component not found");
  }
  const WrappedComponent = useMemo(() => {
    return lazy(() => {
      return Runtime.runPromiseExit(runtime)(
        component.pipe(
          Effect.provide(Layer.succeed(internal.Component, cc.component)),
          Effect.provide(cc.context)
        )
      ).then((exit) => {
        console.log("exit", exit);
        if (Exit.isFailure(exit)) {
          return { default: onCause?.(exit.cause) ?? (() => null) };
        }
        return { default: exit.value };
      });
    });
  }, [component, cc, onCause, runtime]);
  return (
    <Suspense>
      <WrappedComponent />
    </Suspense>
  );
};
