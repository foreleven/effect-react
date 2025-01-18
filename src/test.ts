import { Context, Layer } from "effect";

class MyTag extends Context.Tag("MyTag")<MyTag, { readonly myNum: number }>() {
  static Live = Layer.succeed(this, { myNum: 108 });
}

Context.make(MyTag, { myNum: 111 });
