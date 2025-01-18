declare global {
  // eslint-disable-next-line @typescript-eslint/prefer-namespace-keyword, @typescript-eslint/no-namespace
  module JSX {}
}

export type Component = (props: Record<string, unknown>) => unknown;

export const jsx = {
  component(
    component: string | Component,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ) {
    if (!props) props = {};
    props.children = children.flat(Infinity);

    if (typeof component === "function") return component(props);

    const element = document.createElement(component);
    for (const [key, value] of Object.entries(props)) {
      if (key === "children") continue;
      else if (key === "className")
        element.setAttribute("class", value as string);
      else element.setAttribute(key, value as string);
    }

    element.append(...(props.children as Node[]));

    return element;
  },
};
