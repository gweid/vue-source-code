/* @flow */

export default class VNode {
  tag: string | void;
  data: VNodeData | void;
  children: ?Array<VNode>;
  text: string | void;
  elm: Node | void;
  ns: string | void;
  context: Component | void; // rendered in this component's scope
  key: string | number | void;
  componentOptions: VNodeComponentOptions | void;
  componentInstance: Component | void; // component instance
  parent: VNode | void; // component placeholder node

  // strictly internal
  raw: boolean; // contains raw HTML? (server only)
  isStatic: boolean; // hoisted static node
  isRootInsert: boolean; // necessary for enter transition check
  isComment: boolean; // empty comment placeholder?
  isCloned: boolean; // is a cloned node?
  isOnce: boolean; // is a v-once node?
  asyncFactory: Function | void; // async component factory function
  asyncMeta: Object | void;
  isAsyncPlaceholder: boolean;
  ssrContext: Object | void;
  fnContext: Component | void; // real context vm for functional nodes
  fnOptions: ?ComponentOptions; // for SSR caching
  devtoolsMeta: ?Object; // used to store functional render context for devtools
  fnScopeId: ?string; // functional scope id support

  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    this.tag = tag // 标签属性
    this.data = data // 渲染成真实DOM后，节点上到class attr style 事件等...
    this.children = children // 子节点
    this.text = text // 文本
    this.elm = elm // 对应着真实的 dom 节点
    this.ns = undefined //当前节点的 namespace（命名空间）
    this.context = context // 该 VNode 对应实例
    this.fnContext = undefined // 函数化组件上下文
    this.fnOptions = undefined // 函数化组件配置项
    this.fnScopeId = undefined // 函数化组件 ScopeId
    this.key = data && data.key // 数据的 key，在 diff 的过程中可以提高性能，例如：v-for 的 key
    this.componentOptions = componentOptions // 通过vue组件生成的vnode对象，若是普通dom生成的vnode，则此值为空
    this.componentInstance = undefined // 当前组件实例
    this.parent = undefined // vnode组件的占位符节点
    this.raw = false // 是否为原生 HTML 标签或只是普通文本
    this.isStatic = false // 是否静态节点
    this.isRootInsert = true // 是否作为根节点插入
    this.isComment = false // 是否是注释节点
    this.isCloned = false // 是否是克隆节点
    this.isOnce = false // 是否是v-noce节点
    this.asyncFactory = asyncFactory // 异步工厂方法
    this.asyncMeta = undefined //  异步meta
    this.isAsyncPlaceholder = false // 是否为异步占位符
  }

  // DEPRECATED: alias for componentInstance for backwards compat.
  /* istanbul ignore next */
  get child (): Component | void {
    return this.componentInstance
  }
}

// 这样创建的是一个注释类型的节点
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode()
  node.text = text
  node.isComment = true
  return node
}

// 创建文本vnode节点
export function createTextVNode (val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
// 克隆vnode
export function cloneVNode (vnode: VNode): VNode {
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    // #7975
    // clone children array to avoid mutating original in case of cloning
    // a child.
    vnode.children && vnode.children.slice(),
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
