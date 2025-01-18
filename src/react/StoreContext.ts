import { Layer } from "effect";
import React from "react";
import { Store } from "../store";

export const StoreContext =
  React.createContext<Layer.Layer<Store.Store> | null>(null);
