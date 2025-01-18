import { useContext } from "react";
import { StoreContext } from "./StoreContext";

export function useStore() {
  const store = useContext(StoreContext);

  if (!store) {
    throw new Error("store not provide");
  }
  return store;
}
