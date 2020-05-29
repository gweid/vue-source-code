# Vue 源码阅读

![vue](/imgs/img0.png)

## initGlobalAPI

- 挂载 Vue 全局的 api 例如 nextTick set 等

```
initGlobalAPI(Vue)
```

## 1、Vue 的数据驱动（源码流程: init --> \$mount --> compile/render --> VNode(render) --> patch --> DOM）

![Vue数据驱动](/imgs/img17.png)

### 1-1、new Vue() 发生了什么

- 首先，Vue 是 Function 出来的

```
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    // 判断如果不是通过 new 的方式调用，则抛出警告
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 初始化 Vue
  // options = {
  //   el: "#app",
  //   data: {},
  //   methods: {},
  //   ...
// }
this._init(options)
}
```

- new Vue 实际上就是执行了 Vue 自身的 \_init 方法, \_init 方法就是初始化 Vue 的，\_init 通过 initMixin(Vue) 往 Vue 原型上添加
- \_init 方法主要做了一些 options 的合并，初始化命周期，初始化事件中心，初始化渲染，初始化 data、props、computed、watcher 等等。

```
initLifecycle(vm) // 初始化生命周期
initEvents(vm) // 初始化事件中心
initRender(vm) // 初始化渲染
callHook(vm, 'beforeCreate')
initInjections(vm) // resolve injections before data/props  在 data/props 之前解决注入
initState(vm)  // 初始化 data
initProvide(vm) // resolve provide after data/props
callHook(vm, 'created')
```

- initState 初始化 data，对 data 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了 this.\_data.xxx，还有 data 响应式

```
proxy(vm, `_data`, key)
observe(data, true /* asRootData */)
```

- 最后是 \$mount 的挂载

### 1-2、\$mount 的挂载

![$mount](/imgs/img6.png)

#### 1-2-1、最先的 Vue.prototype.\$mount

```
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}
```

#### 1-2-2、重新定义 Vue.prototype.\$mount,会做一些处理：

- 先是缓存了原型上的 \$mount 方法，再重新定义该方法
- 获取挂载元素，并且挂载元素不能为根节点 html、body 之类的，因为会覆盖
- 判断需不需要编译，因为渲染有的是通过 template 的，有的是通过手写 render 函数，template 的需要编译
- 最后调用缓存的 mount，缓存的 mount 中会执行 mountComponent

```
const mount = Vue.prototype.$mount

// 重新定义 $mount,为包含编译器和不包含编译器的版本提供不同封装，最终调用的是缓存原型上的 $mount 方法
Vue.prototype.$mount = function (el, hydrating) {
  // 获取挂载元素
  el = el && query(el);
  // 挂载元素不能为根节点 html、body 之类的，因为会覆盖
  if (el === document.body || el === document.documentElement) {
    warn(
      "Do not mount Vue to <html> or <body> - mount to normal elements instead."
    );
    return this
  }
  var options = this.$options;
  // 需要编译 or 不需要编译
  // render 选项不存在，代表是 template 模板的形式，此时需要进行模板的编译过程
  if (!options.render) {
    ···
    // 使用内部编译器编译模板
  }
  // 无论是 template 模板还是手写 render 函数最终调用缓存的 $mount 方法
  return mount.call(this, el, hydrating)
}
```

**\$mount 主要是执行了 mountComponent, 其核心就是先调用 vm.\_render 方法先生成 VNode，再实例化一个渲染 Watcher ，在它的回调函数中会调用 updateComponent 方法，最终调用 vm.\_update 转化为真实的 DOM**

**Watcher 在这里起到两个作用，一个是初始化的时候会执行回调函数，另一个是当 vm 实例中的监测的数据发生变化的时候执行回调函数**

```
// lifecycle.js

function mountComponent(vm, el, hydrating) {
  // 定义 updateComponent 方法，在 watcher 回调时调用。
  updateComponent = function () {
    // render 函数渲染成虚拟 DOM， 虚拟 DOM 渲染成真实的 DOM
    vm._update(vm._render(), hydrating);
  };
  // 实例化渲染 watcher
  new Watcher(vm, updateComponent, noop, {})
}
```

### 1-3、模板编译 compiler

- 1、parse
  - 使用正则解释 template 中的 Vue 指令(v-xxx)变量等，形成 AST 语法树
- 2、optimize
  - 标记一些静态节点，用于优化，在 diff 比较的时候略过。
- 3、generate
  - 把 parse 生成的 AST 语法树转换为渲染函数 render function

#### 1-3-1、编译的入口

在 entry-runtime-with-compiler.js 中的 \$mount 过程，如果发现没有 render 函数，那么会启动编译流程把模板编译成 render 函数, 而 compileToFunctions 就是编译的入口

```
const mount = Vue.prototype.$mount
// 再重新定义 $mount
Vue.prototype.$mount = function (){
  ...

  if (template) {
    const { render, staticRenderFns } = compileToFunctions(template, {
      outputSourceRange: process.env.NODE_ENV !== 'production',
      shouldDecodeNewlines,
      shouldDecodeNewlinesForHref,
      delimiters: options.delimiters,
      comments: options.comments
    }, this)
  }
  // 调用原先原型上的 $mount 方法挂载, 此时实际也是调用重新定义的 mount，这样做主要是为了复用
  return mount.call(this, el, hydrating)
}
```

compileToFunctions 在 platfroms/web/compiler/index 由 compiler/index 的 createCompiler 执行后得到

```
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
```

createCompiler 又是由 create-compiler.js 的 createCompilerCreator 得到

```
export const createCompiler = createCompilerCreator(function baseCompile (){})
```

createCompilerCreator: const { compile, compileToFunctions } = createCompiler(baseOptions) 可以看出，compile 是 createCompilerCreator 中的 createCompiler 的 compile， 而 compileToFunctions 由 to-function.js 的 createCompileToFunctionFn 得到

```
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {

    function compile () {}

    ...

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```

**得到，编译的入口是 to-function.js 的 createCompileToFunctionFn**

to-function.js 的 createCompileToFunctionFn 执行编译的是 compile，这个由参数传进来 compileToFunctions: createCompileToFunctionFn(compile)

而 compile 函数执行的编译函数 baseCompile 也是由参数传进来

```
// create-compiler.js
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile () {

      // baseCompile 传进来的函数，真正执行编译三步 parse、optimize、generate
      const compiled = baseCompile(template.trim(), finalOptions)
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
```

baseCompile 中执行编译的三步 parse、optimize、generate

```
// compiler/index.js
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // parse 过程，转换为 ast 树
  const ast = parse(template.trim(), options)
  // optimize 标记静态节点等优化
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  // generate:
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})

```

**总结：实际上进行的编译三部曲是通过 baseCompile 这个参数函数中的 parse、optimize、generate 执行**

#### 1-3-2、parse：使用正则解释 template 编译成 AST 语法树

#### 1-3-3、optimize：标记一些静态节点，用于优化，在 diff 比较的时候略过

#### 1-3-4、generate：把 parse 生成的 AST 语法树转换为渲染函数 render function

### 1-4、updateComponent 渲染 DOM 流程

在渲染 DOM 的过程，Vue 使用了虚拟 DOM 的概念，这使得 Vue 中对 DOM 的操作大多都在虚拟 DOM 中，通过对比将要改动的部分，通知更新到真实的 DOM。虚拟 DOM 其实是一个 js 对象，操作 js 的性能开销比直接操作浏览器 DOM 的低很多，并且虚拟 DOM 会把多个 DOM 的操作合并，减少真实 DOM 的回流重绘次数，这很好的解决了频繁操作 DOM 所带来的性能问题。

#### 1-4-1、首先是 VNode 构造器

构造器定义了 tag：标签、data：数据、children：子节点、elm：node 节点等

```
// vdom/vnode.js

export default class VNode {
  ...

  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {}
}
```

#### 1-4-2、vm.\_render 生成虚拟 DOM

![vm._render](/imgs/img8.png)

在 \$mount 挂载的时候会执行 mountComponent, 这个的核心之一是 vm.\_render 生成虚拟 DOM

```
Vue.prototype.$mount = function(el, hydrating) {
    ···
    return mountComponent(this, el)
}

function mountComponent() {
    ···
    updateComponent = function () {
        vm._update(vm._render(), hydrating);
    };
}
```

**执行流程：（\_createElement -> createElement -> \$createElement -> render -> \_render）**

1、\_render: 在最开始为 Vue 拓展方法的时候有一个 renderMixin, renderMixin 为 Vue 的原型拓展了 \_render, \_render 函数的核心是 render.call(vm.\_renderProxy, vm.\$createElement)

```
// Vue 本质： 实际就是一个 Function 实现的类
function Vue (options) {
  ...

  this._init(options)
}

renderMixin(Vue)

// render.js
export function renderMixin (Vue: Class<Component>) {

  // 把实例渲染成一个虚拟 Node
  Vue.prototype._render = function (): VNode {
    const { render, _parentVnode } = vm.$options

    try {
      // vm.$createElement 在 initRender 中赋值
      // vm._renderProxy 在 init 中处理 vm._renderProxy = vm
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      ...
    } finally {
      ...
    }
    ...
    return vnode
  }
}
```

2、render：这里的 render 是来自 vm.\$options

```
// render.js
export function renderMixin (Vue: Class<Component>) {

  // 把实例渲染成一个虚拟 Node
  Vue.prototype._render = function (): VNode {
    const { render, _parentVnode } = vm.$options

    try {
      // vm.$createElement 在 initRender 中赋值
      // vm._renderProxy 在 init 中处理 vm._renderProxy = vm
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      ...
    } finally {
      ...
    }
    ...
    return vnode
  }
}

// 实际使用
new Vue({
    el: '#app',
    render: function() {}
})
```

3、vm.\$createElement：Vue 初始化 \_init 的时候，会调用 initRender(vm), vm.\$createElement 在这里定义

```
// init.js
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    ...
    initRender(vm) // 初始化渲染
    ...
  }
}

// render.js
export function initRender (vm: Component) {
  ...

  // vm._c 是template内部编译成render函数时调用的方法
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // vm.$createElement是手写render函数时调用的方法
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  ...
}
```

4、createElement：在 initRender 中的 vm.\$createElement 由 createElement 创建 vm.\$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

- createElement 是对 \_createElement 的封装，在 createElement 中先对参数做处理

```
// create-element.js
export function createElement (
  context: Component, // vm 实例
  tag: any, // 标签
  data: any, // 节点相关数据，属性
  children: any, // 子节点
  normalizationType: any,
  alwaysNormalize: boolean // 区分内部编译生成的render还是手写render
): VNode | Array<VNode> {
  // 主要是判断 data 是否存在，不存在把后面的参数往前移
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  // 根据是alwaysNormalize 区分是内部编译使用的，还是用户手写render使用的
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}
```

5、\_createElement: 这里是真正创建 VNode 的地方

```
export function _createElement (
  context: Component, // VNode 的上下文环境
  tag?: string | Class<Component> | Function | Object, // 标签
  data?: VNodeData, // VNode 数据
  children?: any, // VNode 的子节点
  normalizationType?: number // 子节点规范的类型
): VNode | Array<VNode> {
  ...

  if (typeof tag === 'string') {
    // 如果是标签
    if (config.isReservedTag(tag)) {
      // new 一个 VNode 构造器创建 VNode
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    }
    ...
  }

  ...

  return vnode
}
```

#### 1-4-3、vm.\_update 渲染真实 DOM

- 主要作用：把生成的 VNode 转化为真实的 DOM
- 调用时机: 有两个，一个是发生在初次渲染阶段，这个时候没有旧的虚拟 dom；另一个发生数据更新阶段，存在新的虚拟 dom 和旧的虚拟 dom
- 核心方法 patch，patch 的本质是将新旧 vnode 进行比较，创建、删除或者更新 DOM 节点/组件实例

1、定义：在 core/instance/lifecyle.js 中的 lifecycleMixin 定义，lifecycleMixin 在为 Vue 拓展方法的时候调用

```
// lifecyle.js

updateComponent = function () {
  // render生成虚拟DOM，update渲染真实DOM
  vm._update(vm._render(), hydrating);
}

// 首次渲染和更新数据都会调用 _update 去做页面更新
export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode // // prevVnode为旧vnode节点
    const restoreActiveInstance = setActiveInstance(vm) // 在 _update 中把 vm 赋值给 activeInstance
    vm._vnode = vnode

    // 通过判断是否有旧节点，来确认是初次渲染还是更新
    if (!prevVnode) {
      // 初次渲染
      // initial render
      // vm.$el: 真实的 dom   vnode: 虚拟 vnode
      // 首次定义 vm.__patch__ 是在 runtime/index.js
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // 更新
      vm.$el = vm.__patch__(prevVnode, vnode)
    }

    ...
  }

  // 强制通过调用 watcher 的 update 调用回调函数 upateComponent 进行重新渲染
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  // 注销
  Vue.prototype.$destroy = function () {}
}
```

2、vm.\_\_patch\_\_ 是一个 patch 函数，patch 函数由 createPatchFunction 返回, createPatchFunction 定义在 vdom/patch.js, 在 createPatchFunction 里定义了一系列的函数进行真实 DOM 渲染，并返回一个 patch 函数

```
// platfroms/web/runtime/index.js
Vue.prototype.__patch__ = inBrowser ? patch : noop

// platfroms/web/runtime/patch.js
export const patch: Function = createPatchFunction({ nodeOps, modules })

// vdom/patch.js
export function createPatchFunction (backend) {
  ...

  // 返回一个 patch 函数
  return function patch (oldVnode, vnode, hydrating, removeOnly) {}
}
```

3、patch

- 如果是首次 patch，就创建一个新的节点
- 老节点存在

  - 老节点不是真实 DOM 并且和新 VNode 节点判定为同一节点(都是 Vnode，又是相同类型节点，才有必要 diff)

    - 调用 patchVnode 修改现有节点，这一步是 diff

  - 新老节点不相同
    - 如果老节点是真实 DOM，创建对应的 vnode 节点
    - 为新的 Vnode 创建元素/组件实例，若 parentElm 存在，则插入到父元素上
    - 如果组件根节点被替换，遍历更新父节点 elm
    - 然后移除老节点

```
export function createPatchFunction (backend) {
  ...
  return function patch(oldVnode, vnode, hydrating, removeOnly) {
    // 如果新节点没有，但是老节点存在，就会直接删掉老节点
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    // 如果是首次渲染，即老节点不存在，就创建一个新节点
    if (isUndef(oldVnode)) {
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } else {
      // 检查是否有真实 DOM，有 nodeType 就是真实的
      const isRealElement = isDef(oldVnode.nodeType)
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        // 老节点不是真实 DOM 并且和新 VNode 节点判定为同一节点时会进行 patchVnode 这个过程，这个过程就是 diff
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        // 是真实 DOM
        if (isRealElement) {
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              ...
            }
          }
          oldVnode = emptyNodeAt(oldVnode)
        }

        const oldElm = oldVnode.elm
        // 找到父节点，对于初始化的节点来说，那就是 body
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        createElm(
          vnode,
          insertedVnodeQueue,
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        ...

        // 删除旧的节点
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }

    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
```

3、createElm：创建元素

创建 VNode 的 VNode.elm，不同类型的 VNode，其 vnode.elm 创建过程也不一样。对于组件占位 VNode，会调用 createComponent 来创建组件占位 VNode 的组件实例；对于非组件占位 VNode 会创建对应的 DOM 节点

- 元素类型的 VNode:

  - 创建 vnode 对应的 DOM 元素节点 vnode.elm
  - 设置 vnode 的 scope
  - 递归调用 createChildren 去创建子节点
  - 执行 create 钩子函数
  - 将 DOM 元素插入到父元素中

- 注释和本文节点

  - 创建注释/文本节点 vnode.elm，并插入到父元素中

- 组件节点：调用 createComponent

```
// 把 vnode 转换为元素节点
function createElm(
  vnode,
  insertedVnodeQueue,
  parentElm,
  refElm,
  nested,
  ownerArray,
  index
) {
  if (isDef(vnode.elm) && isDef(ownerArray)) {
    // This vnode was used in a previous render!
    // now it's used as a new node, overwriting its elm would cause
    // potential patch errors down the road when it's used as an insertion
    // reference node. Instead, we clone the node on-demand before creating
    // associated DOM element for it.
    vnode = ownerArray[index] = cloneVNode(vnode)
  }

  vnode.isRootInsert = !nested // for transition enter check
  // 组件的 patch
  if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
    return
  }

  const data = vnode.data
  const children = vnode.children
  const tag = vnode.tag
  if (isDef(tag)) {
    if (process.env.NODE_ENV !== 'production') {
      if (data && data.pre) {
        creatingElmInVPre++
      }
      if (isUnknownElement(vnode, creatingElmInVPre)) {
        warn(
          'Unknown custom element: <' + tag + '> - did you ' +
          'register the component correctly? For recursive components, ' +
          'make sure to provide the "name" option.',
          vnode.context
        )
      }
    }

    vnode.elm = vnode.ns ?
      nodeOps.createElementNS(vnode.ns, tag) :
      nodeOps.createElement(tag, vnode)
    setScope(vnode)

    /* istanbul ignore if */
    if (__WEEX__) {
      // in Weex, the default insertion order is parent-first.
      // List items can be optimized to use children-first insertion
      // with append="tree".
      const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
      if (!appendAsTree) {
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        insert(parentElm, vnode.elm, refElm)
      }
      createChildren(vnode, children, insertedVnodeQueue)
      if (appendAsTree) {
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        insert(parentElm, vnode.elm, refElm)
      }
    } else {
      // 递归调用 createChildren 去创建子节点
      createChildren(vnode, children, insertedVnodeQueue)
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }
      insert(parentElm, vnode.elm, refElm)
    }

    if (process.env.NODE_ENV !== 'production' && data && data.pre) {
      creatingElmInVPre--
    }
  } else if (isTrue(vnode.isComment)) {
    vnode.elm = nodeOps.createComment(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  } else {
    vnode.elm = nodeOps.createTextNode(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  }
}
```

4、 patchVnode

- 如果新旧 VNode 都是静态的，同时它们的 key 相同（代表同一节点），并且新的 VNode 是 clone 或者是标记了 once（标记 v-once 属性，只渲染一次），那么只需要替换 elm 以及 componentInstance 即可。
- 新老节点均有 children 子节点，则对子节点进行 diff 操作，调用 updateChildren，这个 updateChildren 是 diff 的核心
- 如果老节点没有子节点而新节点存在子节点，先清空子 elm 的文本内容，然后为当前节点加入子节点
- 当新节点没有子节点而老节点有子节点的时候，则移除该 DOM 节点的所有子节点
- 当新老节点都无子节点的时候，只是文本的替换

```
function patchVnode(
  oldVnode,
  vnode,
  insertedVnodeQueue,
  ownerArray,
  index,
  removeOnly
) {
  // 两个节点相同，直接返回
  if (oldVnode === vnode) {
    return
  }

  if (isDef(vnode.elm) && isDef(ownerArray)) {
    // clone reused vnode
    vnode = ownerArray[index] = cloneVNode(vnode)
  }

  const elm = vnode.elm = oldVnode.elm

  if (isTrue(oldVnode.isAsyncPlaceholder)) {
    if (isDef(vnode.asyncFactory.resolved)) {
      hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
    } else {
      vnode.isAsyncPlaceholder = true
    }
    return
  }

  /*
    如果新旧VNode都是静态的，同时它们的 key 相同（代表同一节点），
    并且新的VNode是 clone 或者是标记了 once（标记 v-once 属性，只渲染一次），
    那么只需要替换 elm 以及 componentInstance 即可。
  */
  if (isTrue(vnode.isStatic) &&
    isTrue(oldVnode.isStatic) &&
    vnode.key === oldVnode.key &&
    (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
  ) {
    vnode.componentInstance = oldVnode.componentInstance
    return
  }

  let i
  const data = vnode.data
  if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
    i(oldVnode, vnode)
  }

  const oldCh = oldVnode.children
  const ch = vnode.children
  if (isDef(data) && isPatchable(vnode)) {
    for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
    if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
  }
  if (isUndef(vnode.text)) {
    if (isDef(oldCh) && isDef(ch)) {
      // 新老节点均有 children 子节点，调用 updateChildren 对子节点进行 diff 操作，
      if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
    } else if (isDef(ch)) {
      if (process.env.NODE_ENV !== 'production') {
        checkDuplicateKeys(ch)
      }
      if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
      // 如果老节点没有子节点而新节点存在子节点，先清空子 elm 的文本内容，然后为当前节点加入子节点
      addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
    } else if (isDef(oldCh)) {
      // 当新节点没有子节点而老节点有子节点的时候，则移除所有ele的子节点
      removeVnodes(oldCh, 0, oldCh.length - 1)
    } else if (isDef(oldVnode.text)) {
      // 当新老节点都无子节点的时候，只是文本的替换，因为这个逻辑中新节点text不存在，所以直接去除 ele 的文本
      nodeOps.setTextContent(elm, '')
    }
  } else if (oldVnode.text !== vnode.text) {
    // 当新老节点text不一样时，直接替换这段文本
    nodeOps.setTextContent(elm, vnode.text)
  }
  // 调用 postpatch 钩子
  if (isDef(data)) {
    if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
  }
}
```

4、 updateChildren：当新旧 VNode 都有 children 子节点，对子节点进行 diff

初步看看 diff 算法：首先假设 Web UI 中 DOM 节点跨层级的移动很少，那么就可以只对同一层级的 DOM 进行比较，对于同一层级的一组子节点，它们可以通过唯一 id 进行区分

![diff](/imgs/img9.png)

**图片说明：只对颜色相同的部分进行比较**

Vue 中的 diff

```
function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
  let oldStartIdx = 0 // 旧的第一个下标
  let oldEndIdx = oldCh.length - 1 // 旧的最后一个下标
  let oldStartVnode = oldCh[0] // 旧的第一个节点
  let oldEndVnode = oldCh[oldEndIdx] // 旧的最后一个节点

  let newStartIdx = 0 // 新的第一个下标
  let newEndIdx = newCh.length - 1 // 新的最后一个下标
  let newStartVnode = newCh[0] // 新的第一个节点
  let newEndVnode = newCh[newEndIdx] // 新的最后一个节点

  let oldKeyToIdx // 旧节点 key 和下标的对象集合
  let idxInOld // 新节点 key 在旧节点 key 集合里的下标
  let vnodeToMove // idxInOld对应的旧节点
  let refElm // 参考节点

  // removeOnly is a special flag used only by <transition-group>
  // to ensure removed elements stay in correct relative positions
  // during leaving transitions
  const canMove = !removeOnly

  if (process.env.NODE_ENV !== 'production') {
    // // 检测 newVnode 的 key 是否有重复
    checkDuplicateKeys(newCh)
  }

  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (isUndef(oldStartVnode)) {
      // / 跳过因位移留下的undefined
      oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
    } else if (isUndef(oldEndVnode)) {
      // 跳过因位移留下的undefine
      oldEndVnode = oldCh[--oldEndIdx]
    } else if (sameVnode(oldStartVnode, newStartVnode)) {
      // 对比旧开始和新开始
      patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
      oldStartVnode = oldCh[++oldStartIdx]
      newStartVnode = newCh[++newStartIdx]
    } else if (sameVnode(oldEndVnode, newEndVnode)) {
      // 对比旧结束和新结束
      patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
      oldEndVnode = oldCh[--oldEndIdx]
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
      // 对比旧开始和新结束
      patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
      canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
      oldStartVnode = oldCh[++oldStartIdx]
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
      // 对比旧结束和新开始
      patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
      canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
      oldEndVnode = oldCh[--oldEndIdx]
      newStartVnode = newCh[++newStartIdx]
    } else {
      // 不包括以上四种快捷比对方式
      // 获取旧开始到结束节点的key和下表集合
      if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
      idxInOld = isDef(newStartVnode.key) ? //  // 获取新节点key在旧节点key集合里的下标
        oldKeyToIdx[newStartVnode.key] :
        findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
      if (isUndef(idxInOld)) { // New element
        // 找不到对应的下标，表示新节点是新增的，需要创建新 dom
        createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
      } else {
        // 能找到对应的下标，表示是已有的节点，移动位置即可
        vnodeToMove = oldCh[idxInOld]
        if (sameVnode(vnodeToMove, newStartVnode)) {
          patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
          oldCh[idxInOld] = undefined
          canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
        } else {
          // same key but different element. treat as new element
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        }
      }
      newStartVnode = newCh[++newStartIdx]
    }
  }
  if (oldStartIdx > oldEndIdx) {
    // 如果旧节点列表先处理完，处理剩余新节点
    refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
    addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue) // 添加
  } else if (newStartIdx > newEndIdx) {
    // 如果新节点列表先处理完，处理剩余旧节点
    removeVnodes(oldCh, oldStartIdx, oldEndIdx) // // 删除废弃节点
  }
}
```

**diff 规则**

a、跳过 undefined

- 如果旧开始节点为 undefined，就后移一位；如果旧结束节点为 undefined，就前移一位

b、快捷首尾查找(下面四种按顺序)

- 旧开始和新开始节点比对: 如果匹配，表示它们位置是对的，Dom 不用改，将新旧节点开始的下标后移一位
- 旧结束和新结束节点比对: 如果匹配，表示它们位置是对的，Dom 不用改，将新旧节点结束的下标前移一位
- 旧开始和新结束节点比对: 如果匹配，位置不对需要更新 Dom 视图，将旧开始节点对应的真实 Dom 插入到最后一位，旧开始节点下标后移一位，新结束节点下标前移一位
- 旧结束和新开始节点比对: 如果匹配，位置不对需要更新 Dom 视图，将旧结束节点对应的真实 Dom 插入到旧开始节点对应真实 Dom 的前面，旧结束节点下标前移一位，新开始节点下标后移一位

c、key 值查找

- 如果和已有 key 值匹配: 说明是已有的节点，只是位置不对，就移动节点位置
- 如果和已有 key 值不匹配: 再已有的 key 值集合内找不到，那就说明是新的节点，就创建一个对应的真实 Dom 节点，插入到旧开始节点对应的真实 Dom 前面

**图示说明**

1、起始状态，标记新旧的 start 和 end 位置

![diff1](/imgs/img10.png)

2、首先是首尾快捷对比，找不到就通过 key 值查找，还是没有，代表是新的节点，那么创建 DOM，插入到新节点对应的位置，后新节点的 start 后移一位，后面的 B 先不做处理

![diff2](/imgs/img11.png)

3、处理第二个，首先开始首位快捷查找，没找到，用 key 进行查找，找到，发现是已有节点，只是位置不一样，移动节点位置，将旧节点的 C 位置设置为 ubdefined，后续会直接跳过；新 start 后移一位

![diff3](/imgs/img12.png)

4、继续新第三个节点，发现新旧的开始节点一样，Dom 位置是对的，那么新旧的 start 后移一位

![diff4](/imgs/img13.png)

5、继续处理第四个节点，通过快捷查找，这个时候先满足了旧开始节点和新结束节点的匹配，Dom 位置不对，移动位置；同时旧 start 后移，新 end 前移

![diff5](/imgs/img14.png)

6、处理最后一个，首先会执行跳过 undefined 的逻辑，旧 satrt 再后移，然后再开始快捷比对，匹配到的是新开始节点和旧开始节点，它们各自 start 后移一位，这个时候就会跳出循环了

![diff6](/imgs/img15.png)

7、处理收尾的逻辑

```
function updateChildren(parentElm, oldCh, newCh) {
  ...

  if (oldStartIdx > oldEndIdx) {
    // 如果旧节点列表先处理完，处理剩余新节点
    refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
    addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)  // 添加
  }

  else if (newStartIdx > newEndIdx) {
    // 如果新节点列表先处理完，处理剩余旧节点
    removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)  // 删除废弃节点
  }
}
```

![diff7](/imgs/img16.png)

## 2、Vue 的组件化

- 1.加载渲染过程：父 beforeCreate -> 父 created -> 父 beforeMount -> 子 beforeCreate -> 子 created -> 子 beforeMount -> 子 mounted -> 父 mounted
- 2.子组件更新过程：父 beforeUpdate -> 子 beforeUpdate -> 子 updated -> 父 updated
- 3.父组件更新过程：父 beforeUpdate -> 父 updated
- 4.销毁过程：父 beforeDestroy -> 子 beforeDestroy -> 子 destroyed -> 父 destroyed

当父在创建真实节点的过程中，遇到组件会进行组件的初始化和实例化，实例化会执行挂载 \$mount 的过程，这又到了组件的 vm.\_render 和 vm.\_update 过程

- 1.从根实例入手进行实例的挂载，如果有手写的 render 函数，则直接进入 \$mount 挂载流程
- 2.只有 template 模板则需要对模板进行解析，这里分为两个阶段，一个是将模板解析为 AST 树，另一个是根据不同平台生成执行代码，例如 render 函数
- 3.\$mount 流程也分为两步，第一步是将 render 函数生成 Vnode 树，子组件会以 vue-componet- 为 tag 标记，另一步是把 Vnode 渲染成真正的 DOM 节点
- 4.创建真实节点过程中，如果遇到子的占位符组件会进行子组件的实例化过程，这个过程又将回到流程的第一步

首先在 this.\_init 中调用 initRender 初始化，然后 initRender 中 createElement, 在 createElement 中发现是组件, 那么 createComponent

### 2-1、组件的 VNode (create-element.js、create-component.js、vnode.js、extend.js)

![VNode](/imgs/img1.png)

- 在 create-element.js 中的 \_createElement 时，如果 tag 不是一个标签字符串，而是一个组件对象，此时通过 createComponent 创建一个组件 VNode

```
export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {

  if (typeof tag === 'string') {

  } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      vnode = createComponent(Ctor, data, context, children, tag)
  }
}
```

- 在 create-component.js 的 createComponent 中，会调用 Vue.extend(组件)(即: Ctor = baseCtor.extend(Ctor)), 这里的 extend 主要就是把 Vue 的功能赋给组件，并且合并配置, 在 extend 中会对组件做缓存

```
extend.js

// 判断缓存中有没有存在,有就直接使用
if (cachedCtors[SuperId]) {
  return cachedCtors[SuperId]
}
```

- 通过在 create-component.js 的 createComponent 中安装一些组件的钩子 installComponentHooks(data)
- 在 create-component.js 中创建组件 VNode。组件 VNode 与 普通 VNode 区别: 没有 children, 多了 componentOptions

```
const vnode = new VNode(
  `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
  data, undefined, undefined, undefined, context,
  { Ctor, propsData, listeners, tag, children },
  asyncFactory
)
```

### 2-2、组件的 patch 过程 (patch.js、create-component.js、init.js)

#### 组件 patch 的整体流程(组件 VNode 渲染成真实 Dom)

![VNode](/imgs/img2.png)

- 组件的 patch 也会调用 patch.js 中的 createElm, 其中与普通元素 patch 不一样的就是 createElm 中的 createComponent 处理
- 在 patch.js 的 createComponent 中, vnode.componentInstance, 这个主要在 create-component.js 中创建组件 VNode 的时候挂载钩子时的，vnode.componentInstance 这个主要就是调用了 createComponentInstanceForVnode 这个去执行 Ctor 组件构造器，这个构造器又会去 init.js 中 initInternalComponent(vm, options) 合并; 继续在 init.js 中 调用 initLifecycle
- 在 lifecycle.js 中 initLifecycle，拿到父组件 vm: let parent = options.parent, options.parent 就是父组件 vm 实例。 在 setActiveInstance 实现每次 \_update 把 vm 赋给 activeInstance

```
export function initLifecycle (vm: Component) {
  // 这个 vm 是子组件实例
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent  // 此时的 parent 其实是 activeInstance，也是父组件 vm 实例
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 将子组件实例放到父组件的 $children
    parent.$children.push(vm)
  }

  // 父组件挂载到子组件的 $parent 上
  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm
}
```

- 继续在 create-component.js 中 child.$mount(hydrating ? vnode.elm : undefined, hydrating), 这个就会执行 entry-runtime-with-compiler.js 中的 Vue.prototype.$mount, 后执行 lifecycle.js 中的 mountComponent，执行 render 完成子组件的渲染，然后执行渲染 watcher(子组件的渲染 watcher)

### 2-3、组件的生命周期

- beforeCreate: data 数据没有初始化之前执行
- created: data 数据初始化之后执行

```
// 在 init.js 中

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {

    initLifecycle(vm)
    initEvents(vm) // 初始化事件中心
    initRender(vm) // 初始化渲染
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props  在 data/props 之前解决注入
    initState(vm)  // 初始化 data
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

  }
}
```

- beforeMounted: 页面渲染之前执行
- mounted: 页面渲染之后执行

```
// 在 lifecycle.js 中

export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {

  // 数据渲染之前 beforeMount
  callHook(vm, 'beforeMount')

  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
  }

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // vm.$vnode 表示 Vue 实例的父虚拟 node，为 null 则表示当前是根 Vue 实例
  // 设置 vm._isMounted 为 true，表示该实例已经挂载
  // 最后调用 mounted 钩子函数
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}
}
```

- beforeUpdate: 数据更新之前，并且首次渲染不会触发
- updated: 数据更新之后，并且首次渲染不会触发

```
// 在 lifecycle.js 中  _isMounted 为 true 表示已挂载

new Watcher(vm, updateComponent, noop, {
  before () {
    if (vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true /* isRenderWatcher */)
```

- beforeDestroy: 页面卸载之前，此时 data、method 还存在
- destroyed: 页面卸载之后，此时 data、method 不存在

### 2-4、组件的注册

#### 2-4-1、全局注册：全局注册组件就是 Vue 实例化前创建一个基于 Vue 的子类构造器，并将组件的信息加载到实例 options.components 对象中

```
在全局 api 的 assets.js

// 组件的注册
export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        if (type === 'component' && isPlainObject(definition)) {
          // 组件名称设置
          definition.name = definition.name || id
          // Vue.extend() 创建子组件，返回子类构造器
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 为Vue.options 上的 component 属性添加将子类构造器
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
```

#### 2-4-2、局部注册: 在 createElement 中, 发现是组件标签，就调用 createComponent

```
// create-element.js

if (typeof tag === 'string') {

    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // 如果是组件
      // component
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {

  }
```

### Vue 异步组件

- 总的来说，异步组件的实现通常是 2 次渲染，先渲染成注释节点，组件加载成功后再通过 forceRender 重新渲染，这是异步组件的核心所在。

- 当在 createComponent 中发现是异步组件, 调用 resolveAsyncComponent, 这个是异步组件的核心

#### 2-5-1、工厂函数

- 定义异步请求成功的函数处理，定义异步请求失败的函数处理；
- 执行组件定义的工厂函数；
- 同步返回请求成功的函数处理。
- 异步组件加载完毕，会调用 resolve 定义的方法，方法会通过 ensureCtor 将加载完成的组件转换为组件构造器，并存储在 resolved 属性中
- 组件构造器创建完毕，会进行一次视图的重新渲染。由于 Vue 是数据驱动视图渲染的，而组件在加载到完毕的过程中，并没有数据发生变化，因此需要手动强制更新视图
- forceRender: 这个中执行 $forceUpdate，$forceUpdate 的逻辑非常简单，就是调用渲染 watcher 的 update 方法，让渲染 watcher 对应的回调函数执行，也就是触发了组件的重新渲染。
- 异步组件加载失败后，会调用 reject 定义的方法，方法会提示并标记错误，最后同样会强制更新视图。

```
Vue.component('async-example', function (resolve, reject) {
  // 这个特殊的 require 语法告诉 webpack
  // 自动将编译后的代码分割成不同的块，
  // 这些块将通过 Ajax 请求自动下载。
  require(['./my-async-component'], resolve)
})
```

```
export function resolveAsyncComponent(
  factory: Function,
  baseCtor: Class < Component >
): Class < Component > | void {
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner)
  }

  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;
    (owner: any).$on('hook:destroyed', () => remove(owners, owner))

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        // $forceUpdate 的逻辑非常简单，就是调用渲染 watcher 的 update 方法，让渲染 watcher 对应的回调函数执行，也就是触发了组件的重新渲染。
        // 之所以这么做是因为 Vue 通常是数据驱动视图重 新渲染，但是在整个异步组件加载过程中是没有数据发生变化的，所以通过执行 $forceUpdate 可以强制组件重新渲染一次。
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    // once 确保包装的函数只执行一次
    const resolve = once((res: Object | Class < Component > ) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    // 普通工厂函数异步组件执行
    const res = factory(resolve, reject)
  }
}
```

- 执行异步过程会同步为加载中的异步组件创建一个注释节点 Vnode

```
createComponent.js

if (Ctor === undefined) {
  // 是创建一个注释节点vnode
  return createAsyncPlaceholder(asyncFactory, data, context, children, tag);
}
```

- 执行 forceRender 触发组件的重新渲染过程时，又会再次调用 resolveAsyncComponent,这时返回值 Ctor 不再为 undefined 了，因此会正常走组件的 render,patch 过程。这时，旧的注释节点也会被取代。

#### 2-5-2、Promise

- 主要是在 res.then(resolve, reject) 这里

```
Vue.component( 'async-webpack-example', () => import('./my-async-component') )
```

```
export function resolveAsyncComponent(
  factory: Function,
  baseCtor: Class < Component >
): Class < Component > | void {

    // once 确保包装的函数只执行一次
    const resolve = once((res: Object | Class < Component > ) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    // 普通工厂函数异步组件执行
    const res = factory(resolve, reject)

    if (isObject(res)) {
      // promise 形式异步组件
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {

      }
    }
  }
}
```

#### 2-5-3、高级异步组件

```
const AsyncComp = () => ({
  // 需要加载的组件。应当是一个 Promise
  component: import('./MyComp.vue'),
  // 加载中应当渲染的组件
  loading: LoadingComp,
  // 出错时渲染的组件
  error: ErrorComp,
  // 渲染加载中组件前的等待时间。默认：200ms。
  delay: 200,
  // 最长等待时间。超出此时间则渲染错误组件。默认：Infinity
  timeout: 3000
})
Vue.component('async-example', AsyncComp)
```

```
export function resolveAsyncComponent(
  factory: Function,
  baseCtor: Class < Component >
): Class < Component > | void {

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;
    (owner: any).$on('hook:destroyed', () => remove(owners, owner))

    const forceRender = (renderCompleted: boolean) => {
      for (let i = 0, l = owners.length; i < l; i++) {
        // $forceUpdate 的逻辑非常简单，就是调用渲染 watcher 的 update 方法，让渲染 watcher 对应的回调函数执行，也就是触发了组件的重新渲染。
        // 之所以这么做是因为 Vue 通常是数据驱动视图重 新渲染，但是在整个异步组件加载过程中是没有数据发生变化的，所以通过执行 $forceUpdate 可以强制组件重新渲染一次。
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    // once 确保包装的函数只执行一次
    const resolve = once((res: Object | Class < Component > ) => {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    // 普通工厂函数异步组件执行
    const res = factory(resolve, reject)

    if (isObject(res)) {
      // promise 形式异步组件
      if (isPromise(res)) {
      } else if (isPromise(res.component)) {
        // 高级异步组件
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            factory.loading = true
          } else {
            timerLoading = setTimeout(() => {
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production' ?
                `timeout (${res.timeout}ms)` :
                null
              )
            }
          }, res.timeout)
        }
      }
    }
  }
}
```

## 3、响应式原理

- Observer 类，实例化一个 Observer 类会通过 Object.defineProperty 对数据的 getter,setter 方法进行改写，在 getter 阶段进行依赖的收集,在数据发生更新阶段，触发 setter 方法进行依赖的更新
- watcher 类，实例化 watcher 类相当于创建一个依赖，简单的理解是数据在哪里被使用就需要产生了一个依赖。当数据发生改变时，会通知到每个依赖进行更新，前面提到的渲染 wathcer 便是渲染 dom 时使用数据产生的依赖。
- Dep 类，既然 watcher 理解为每个数据需要监听的依赖，那么对这些依赖的收集和通知则需要另一个类来管理，这个类便是 Dep,Dep 需要做的只有两件事，收集依赖和派发更新依赖

**总结：处理的核心是在访问数据时对数据所在场景的依赖进行收集，在数据发生更改时，通知收集过的依赖进行更新**

响应式原理

![响应式原理](/imgs/img3.png)

响应式流程

![响应式流程](/imgs/img7.png)

### 3-1、响应式对象

#### 3-1-1、通过 Object.defineProperty 进行数据劫持

#### 3-1-2、initState

- 定义在 state.js 中, 在 Vue 的初始化阶段， \_init 方法执行的时候, 会执行 initState
- initState 主要是对 props 、 methods 、 data 、 computed 和 wathcer 等属性做了初 始化操作
- initState 中的 initProps: 通过 defineReactive 把 props 的属性变成响应式的，并且使用 proxy 将 props 的每个 key 代理到 vm 实例上, 这样 this.xx 就相当于访问 this.\_props.xxx

```
function initProps (vm: Component, propsOptions: Object) {
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 主要就是把 props 变成响应式的
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }

    if (!(key in vm)) {
      // 对 props 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了this._props.xxx
      proxy(vm, `_props`, key)
    }
  }
}
```

- initState 中的 initData: 跟 initProps 相似, proxy 逐个代理 data 的 key 到 vm 实例, observe 响应式处理,
  并且在这之前会先判断 key 是否有跟 props 重复的

```
function initData (vm: Component) {
  let data = vm.$options.data
  // 判断 data 是函数还是对象，并把 vm.$options.data 挂到 vm._data 上
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 如果 data 不是 object 类型，就报警告
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    // 循环做一个对比， 是 data 里面定义的属性名不能跟 props 中的一样
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 对 vm 下的 key 逐个代理
      // 对 data 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了this._data.xxx
      proxy(vm, `_data`, key)
    }
  }
  // 响应式数据的处理
  // observe data
  observe(data, true /* asRootData */)
}
```

- observe 中会 new 一个 Observer, 这个里面的 walk 会调用 defineReactive 执行 Object.defineProperty 进行数据劫持; 若传入的是数组，调用 observeArray，遍历数组对数组的每一项进行观察

```
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    if (Array.isArray(value)) {
      // 传入是数组
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      // 遍历对数组的每一个元素进行观察
      observe(items[i])
    }
  }
}
```

- defineReactive 做 Object.defineProperty, 当对象的某一个 key 的值也是一个对象，就会继续调用 observe， let childOb = !shallow && observe(val)

```
export function defineReactive () {
  const dep = new Dep()

  // 当对象的某一个 key 的值也是一个对象，就会继续调用 observe
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      if (Dep.target) {
        dep.depend()
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      ...

      dep.notify()
    }
  })
}
```

### 3-2、依赖收集

#### 3-2-1、首先，get 会 new Dep()

#### 3-2-2、判断是否存在 Dep.target, Dep.target 其实就是一个 watcher

- 在 Vue 进行 \$mount 的时候会调用 mountComponent，在 mountComponent 中会 new Watcher, watcher 会调用它自己的 get 方法去调用 pushTargrt，这样就把 watcher 添加到 Dep.target 上了

```
// dep.js
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

// watcher.js
export default class Watcher {
  constructor () {
    this.get()
  }

  get () {
    pushTarget(this)
  }
}

```

```
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep();

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 主要做依赖收集
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val;
      // Dep.target 就是一个 watcher
      if (Dep.target) {
        dep.depend();
        if (childOb) {
          childOb.dep.depend();
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }
      return value;
    }
  });
}
```

#### 3-2-3、get 中 dep.depend() 调用 watcher 的 addDep 将 watcher 添加到 Dep 的 subs 上： watcher 类相当于创建一个依赖，简单的理解是数据在哪里被使用就需要产生了一个依赖

```
// observer/index.js
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep();

  Object.defineProperty(obj, key, {
    get: function reactiveGetter() {
      if (Dep.target) {
        dep.depend();
      }
      return value;
    }
  });
}

// dep.js
export default class Dep {
  // 依赖收集
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }
}

// watcher.js
export default class Watcher {
  constructor(
    this.get()
  }

  get() {
    // 将 watcher 添加到 Dep.target
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  addDep(dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }
}
```

#### 3-2-4、总结依赖收集: 每个数据就是一个依赖管理器，而每个使用数据的地方就是一个依赖。当访问到数据时，会将当前访问的场景作为一个依赖收集到依赖管理器中，同时也会为这个场景的依赖收集拥有的数据。依赖收集就是订阅数据的 watcher 的收集，目的是为了当这些响应式数据变化，能知道应该通知哪些订阅者去做相应逻辑的处理。

### 3-3、派发更新

- 判断数据更改前后是否一致，如果数据相等则不进行任何派发更新操作。
- 新值为对象时，会对该值的属性进行依赖收集过程。
- 通知该数据收集的 watcher 依赖,遍历每个 watcher 进行数据更新,这个阶段是调用该数据依赖收集器的 dep.notify 方法进行更新的派发。

派发更新过程： 通过 set 调用 dep.notify(), 在 notify 中会把 subs 中的依赖 watcher 逐个执行 update ( subs[i].update() ), watcher 的 update 把需要执行的 watcher 通过 queueWatcher 放到队列 queue 中，调用 flushSchedulerQueue 执行 queue 队列的每一个 watcher 的 run，执行 watcher 相关的回调函数去处理数据的更新。。在执行 run 之前会根据 watcher 的 id 对 watcher 进行排列，因为组件的更新是从父到子的，所以要保证父的 watcher 在前面，而且当父组件被销毁，那么子组件的更新也不需要执行了。

```
// dep.js
Dep.notify = function () {
  // stabilize the subscriber list first
  const subs = this.subs.slice()
  if (process.env.NODE_ENV !== 'production' && !config.async) {
    // subs aren't sorted in scheduler if not running async
    // we need to sort them now to make sure they fire in correct
    // order
    subs.sort((a, b) => a.id - b.id)
  }
  for (let i = 0, l = subs.length; i < l; i++) {
    subs[i].update()
  }
}

// watcher.js
watcher.update = function () {
  /* istanbul ignore else */
  // lazy 为 true 代表是 computed
  if (this.lazy) {
    // 是 computed
    this.dirty = true;
  } else if (this.sync) {
    // 是否是同步 watcher
    this.run();
  } else {
    // 把需要更新的 watcher 往一个队列里面推
    queueWatcher(this);
  }
}
```

**总结：派发更新就是当数据发生变化，通知所有订阅了这个数据变化的 watcher 执行 update**

### 3-4、数组检测

1、Object.defineProperty 只能检测到对象的属性变化, 对于数组的变化无法监听到，所以，在 vue2.x 中对七个数组的方法重写了，在保留原数组功能的前提下，对数组进行额外的操作处理。

2、七个方法分别是：push、pop、shift、unshift、unshift、sort、reverse

#### 3-4-1、数组的重写

```
// 新建一个继承于 Array 的对象
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]
```

对数组的重写

```
// 对数组方法设置了代理，执行数组那七种方法的时候会执行 mutator 函数
methodsToPatch.forEach(function (method) {
  // cache original method
  // 缓冲原始数组的方法
  const original = arrayProto[method]
  // 利用 Object.defineProperty 对方法的执行进行改写
  def(arrayMethods, method, function mutator(...args) {})
})

function def (obj, key, val, enumerable) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  });
}
```

当执行 arrayMethods 时， 会代理执行 mutator 函数

当在访问数组时，如何不调用原生的数组方法，而是将过程指向这个新的类

当支持 \_\_proto\_\_ 时，执行 protoAugment 会将当前数组的原型指向新的数组类 arrayMethods,如果不支持 \_\_proto\_\_，则通过代理设置，在访问数组方法时代理访问新数组类中的数组方法。

- protoAugment 是通过原型指向的方式，将数组指定的七个方法指向 arrayMethods
- copyAugment 通过数据代理的方式, 将数组指定的七个方法指向 arrayMethods

有了这两步的处理，接下来我们在实例内部调用 push, unshift 等数组的方法时，会执行 arrayMethods 类的方法。这也是数组进行依赖收集和派发更新的前提。

```
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    this.value = value;
    this.dep = new Dep();
    this.vmCount = 0;
    // 将__ob__属性设置成不可枚举属性。外部无法通过遍历获取。
    def(value, "__ob__", this);
    if (Array.isArray(value)) {
      // 传入是数组
      // hasProto 用来判断当前环境下是否支持__proto__属性
      // protoAugment 是通过原型指向的方式，将数组指定的七个方法指向 arrayMethods
      // copyAugment 通过数据代理的方式, 将数组指定的七个方法指向 arrayMethods
      // 当支持__proto__时，执行protoAugment会将当前数组的原型指向新的数组类arrayMethods,如果不支持__proto__，则通过代理设置，在访问数组方法时代理访问新数组类中的数组方法。
      if (hasProto) { // export const hasProto = '__proto__' in {}
        protoAugment(value, arrayMethods);
      } else {
        copyAugment(value, arrayMethods, arrayKeys);
      }
      // 通过上面两步，接下来在实例内部调用push, unshift等数组的方法时，会执行 arrayMethods 类的方法。这也是数组进行依赖收集和派发更新的前提。
      this.observeArray(value);
    } else {
      // 对象
      this.walk(value);
    }
  }
}
```

#### 3-4-2、数组的依赖收集

当为数组，会递归数组的每一项，子项添加依赖

```
export class Observer {
  ...

  constructor(value: any) {
    if (Array.isArray(value)) {
      ...

      this.observeArray(value);
    } else {
      // 对象
      this.walk(value);
    }
  }

  observeArray(items: Array < any > ) {
    for (let i = 0, l = items.length; i < l; i++) {
      // 遍历对数组的每一个元素进行观察
      observe(items[i]);
    }
  }
}
```

#### 3-4-3、数组的派发更新

当调用数组的方法去添加或者删除数据时，数据的 setter 方法是无法拦截的，所以唯一可以拦截的过程就是调用数组方法的时候，数组方法的调用会代理到新类 arrayMethods 的方法中,而 arrayMethods 的数组方法是进行重写过的

- 首先调用原始的数组方法进行运算，这保证了与原始数组类型的方法一致性
- inserted 变量用来标志数组是否是增加了元素，如果增加的元素不是原始类型，而是数组对象类型，则需要触发 observeArray 方法，对每个元素进行依赖收集。
- 调用 ob.dep.notify(), 进行依赖的派发更新

```
// 对数组方法设置了代理，执行数组那七种方法的时候会执行 mutator 函数
methodsToPatch.forEach(function (method) {
  // cache original method
  // 缓冲原始数组的方法
  const original = arrayProto[method]
  // 利用 Object.defineProperty 对方法的执行进行改写
  def(arrayMethods, method, function mutator(...args) {
    // 执行原数组方法，保证了与原始数组类型的方法一致性
    const result = original.apply(this, args)
    const ob = this.__ob__
    // inserted变量用来标志数组是否是增加了元素，如果增加的元素不是原始类型，而是数组对象类型，则需要触发 observeArray 方法，对每个元素进行依赖收集。
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 进行依赖的派发更新
    ob.dep.notify()
    return result
  })
})
```

**数组改写的方法或者通过 Vue.set 本质上就是手动的调用 dep.notify() 去通知渲染 watcher 进行更新**

**总结：总的来说。数组的改变不会触发 setter 进行依赖更新，所以 Vue 创建了一个新的数组类，重写了数组的方法，将数组方法指向了新的数组类。**
**同时在访问到数组时依旧触发 getter 进行依赖收集，在更改数组时，触发数组新方法运算，并进行依赖的派发。**

### 3-5、nextTick

- nextTick：就是将任务放到异步队列里面，等到主线程执行完再执行
- 在 Vue 中，进行数据操作的时候，Vue 并没有马上去更新 DOM 数据，而是将这个操作放进一个队列中，如果重复执行的话，队列还会进行去重操作；等待同一事件循环中的所有数据变化完成之后，会将队列中的事件拿出来处理。这样做主要是为了提升性能，因为如果在主线程中更新 DOM，循环 100 次就要更新 100 次 DOM；但是如果等事件循环完成之后更新 DOM，只需要更新 1 次。也就是说数据改变后触发的渲染 watcher 的 update 是在 nextTick 中的。

```
// scheduler.js 中的 queueWatcher

export function queueWatcher(watcher: Watcher) {
    ...

    if (!waiting) {
      waiting = true;
      ...

      nextTick(flushSchedulerQueue); // 将更新 DOM 的操作放到异步队列里面
    }
  }
}
```

#### 3-5-1、nextTick 的实现原理

- 将回调函数放到 callbacks 中等待执行

```
const callbacks = []
let pending = false
let timerFunc

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    timerFunc()
  }
}

```

- 将执行函数放到微任务或者宏任务中: 这里 Vue 做了兼容性的处理，尝试使用原生的 Promise.then、MutationObserver 和 setImmediate，上述三个都不支持最后使用 setTimeout； 其中 Promise.then、MutationObserver 是微任务，setImmediate 和 setTimeout 是宏任务。

```
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  //判断1：是否原生支持 Promise
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  //判断2：是否原生支持 MutationObserver
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  //判断3：是否原生支持 setImmediate
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  //判断4：上面都不行，直接用 setTimeout
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}
```

- 最后依次执行 callbacks 中的回调

```
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}
```

### 3-6、computed

![computed](/imgs/img4.png)

#### 3-6-1、computed 的依赖收集

在初始化 computed 的过程，会遍历 computed 的每一个属性值，并为每一个属性值添加一个计算 watcher，{lazy: true} 代表计算 watcher，get 最后调用 defineComputed 将数据设置为响应式

```
// state.js

// computed watcher 的标志，lazy 属性为 true
const computedWatcherOptions = {
  lazy: true
}

function initComputed(vm: Component, computed: Object) {
  ...

  // 遍历 computed 中的每一个属性值，为每一个属性值实例化一个计算 watcher
  for (const key in computed) {
    ...

    if (!isSSR) {
      // create internal watcher for the computed property.
      // lazy 为 true 的 watcher 代表计算 watcher
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions  // const computedWatcherOptions = { lazy: true }
      )
    }

    if (!(key in vm)) {
      // 调用 defineComputed 将数据设置为响应式数据，对应源码如下
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      ...
    }
  }
}
```

在 new watcher 中会把 dirty 声明为 true

```
export default class Watcher {
  constructor(){
    ...
    
    this.dirty = this.dirty = this.lazy; // for lazy watchers
  }
}
```

defineComputed: 计算属性的计算结果会被缓存，缓存的意义在于，只有在相关响应式数据发生变化时，computed 才会重新求值，其余情况多次访问计算属性的值都会返回之前计算的结果，这就是缓存的优化, 缓存的主要根据是 dirty 字段；最终调用 Object.defineProperty 进行数据拦截

```
// state.js

export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 不是服务端渲染，代表需要缓存， shouldCache = true
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache ?
      createComputedGetter(key) :
      createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get ?
      shouldCache && userDef.cache !== false ?
      createComputedGetter(key) :
      createGetterInvoker(userDef.get) :
      noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```

当访问到 computed 时，会触发 getter 进行依赖收集, 在 createComputedGetter

dirty 是标志是否已经执行过计算结果，如果执行过则不会执行 watcher.evaluate 重复计算，这也是缓存的原理

在 watcher.evaluate() 会执行 watcher.get()进行求值，后把 dirty 置为 false, watcher.get()会通过 pushTarget(this) 将 watcher 挂到 Dep.target

```
// state.js
function createComputedGetter(key) {
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // dirty 是标志是否已经执行过计算结果，如果执行过则不会执行 watcher.evaluate 重复计算，这也是缓存的原理
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

// watcher.js
// 执行 watcher.get(), 将 dirty 设置为 false
watcher.prototype.evaluate = function() {
  this.value = this.get();
  // computed 标记为已经执行过更新
  this.dirty = false;
}

// watcher.js
// 添加 Dep.target
watcher.prototype.get = function() {
  // 将 watcher 添加到 Dep.target
  pushTarget(this);
  let value;
  const vm = this.vm;
  try {
    value = this.getter.call(vm, vm);
  } catch (e) {
    if (this.user) {
      handleError(e, vm, `getter for watcher "${this.expression}"`);
    } else {
      throw e;
    }
  } finally {
    // "touch" every property so they are all tracked as
    // dependencies for deep watching
    if (this.deep) {
      traverse(value);
    }
    // 将 Dep.target 置空
    popTarget();
    this.cleanupDeps();
  }
  return value;
}

```

watcher.depend() 中调用 Dep.depend 进行依赖收集

```
// watcher.js
watcher.depend = function () {
  let i = this.deps.length;
  while (i--) {
    this.deps[i].depend();
  }
}

// dep.js
dep.depend = function() {
  if (Dep.target) {
    Dep.target.addDep(this)
  }
}
```

#### 3-6-2、computed 的派发更新

派发更新的前提是 data 中数据发生改变

- 当计算属性依赖的数据发生更新时，由于数据的 Dep 收集过 computed watch 这个依赖，所以会调用 dep 的 notify 方法，对依赖进行状态更新。
- 此时 computed watcher 和之前介绍的 watcher 不同，它不会立刻执行依赖的更新操作，而是通过一个 dirty 进行标记。

```
Dep.prototype.notify = function() {
  ···
   for (var i = 0, l = subs.length; i < l; i++) {
      subs[i].update();
    }
}

Watcher.prototype.update = function update () {
  // 如果是计算属性
  if (this.lazy) {
    this.dirty = true;
  } else if (this.sync) {
    this.run();
  } else {
    queueWatcher(this);
  }
};
```

所以，当为计算属性，会进入 lazy，这里面不会进行更新操作，而是把 dirty 标记为 true

**由于 data 数据拥有渲染 watcher 这个依赖，所以同时会执行 updateComponent 进行视图重新渲染,而 render 过程中会访问到计算属性,此时由于 this.dirty 值为 true,又会对计算属性重新求值**

### 3-7、watch

![watch](/imgs/img5.png)

最基本的用法

```
watch: {
  a: {
    handler(newName, oldName) {
      console.log('obj.a changed');
    },
    immediate: true,
    // deep: true
  },
  b() {

  }
}
```

#### 3-7-1、watch 的依赖收集

首先初始化调用 initWatch 初始化 watch， initWatch 的核心是 createWatcher

```
// state.js

function initWatch(vm: Component, watch: Object) {
  // 遍历 watch
  for (const key in watch) {
    const handler = watch[key]
    // handler可以是数组的形式，执行多个回调
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options ? : Object
) {
  // 如果是对象形式的 watch
  // watch: {
  //   a: {
  //     handler(newName, oldName) {
  //       console.log('obj.a changed');
  //     },
  //     immediate: true, // 立即执行一次 handler
  //     // deep: true
  //   }
  // }
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}
```

无论是选项的形式，还是 api 的形式，最终都会调用实例的 \$watch 方法，其中 expOrFn 是监听的字符串，handler 是监听的回调函数，options 是相关配置

```
// state.js

export function stateMixin(Vue: Class < Component > ) {
  ...

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options ? : Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // options.user 这个是用户定义 watcher 的标志
    options.user = true
    // 创建一个user watcher，在实例化 user watcher 的时候会执行一次 getter 求值，这时，user watcher 会作为依赖被数据所收集
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 如果有 immediate，立即执行回调函数
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}
```

- options.user = true：表示为用户定义的 watch 的 watcher
- new Watcher(vm, expOrFn, cb, options)：创建一个 user watcher，在实例化 watcher 的时候，会执行 watcher.getter 对 vm.xxx 进行取值，并让 vm.xxx 的 dep 收集当前的用户 watcher

```
export default class Watcher {
  constructor() {
    ...

    this.value = this.lazy ? undefined : this.get();
  }

  get() {
    // 将 user watcher 添加到 Dep.target
    pushTarget(this);

    // getter 回调函数，触发依赖收集（因为 watch 监听的是 data 或者 props 的数据，当访问 data 的数据是，触发 get 去把 user watcher 添加到 dep）
    value = this.getter.call(vm, vm);
  }
}
```

#### 3-7-2、watch 的派发更新

watch 派发更新的过程: 数据发生改变时，setter 拦截对依赖进行更新，而此前 user watcher 已经被当成依赖收集了。这个时候依赖的更新就是回调函数的执行。

## 4、Vue 的一些扩展功能

### 4-1、Vue 的事件机制 event

### 4-2、Vue 的插槽

#### 4-2-1、普通插槽

#### 4-2-2、具名插槽

#### 4-2-3、作用域插槽 lh-1

### 4-3、Vue 的 v-model

#### 4-3-1、v-model 实现机制

v-model 会把它关联的响应式数据（如 message），动态地绑定到表单元素的 value 属性上，然后监听表单元素的 input 事件：当 v-model 绑定的响应数据发生变化时，表单元素的 value 值也会同步变化；当表单元素接受用户的输入时，input 事件会触发，input 的回调逻辑会把表单元素 value 最新值同步赋值给 v-model 绑定的响应式数据

```
<input type="text" :value="message" @input="(e) => { this.message = e.target.value }" >
```

#### 4-3-2、v-model 实现原理

首先，在模板解析阶段，v-model 跟其他指令一样，会被解析到 el.directives

```
// compiler/parse/index.js

function processAttrs(el) {
  var list = el.attrsList;
  var i, l, name, rawName, value, modifiers, syncGen, isDynamic;
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name; // v-on:click
    value = list[i].value; // doThis
    if (dirRE.test(name)) { // 1.针对指令的属性处理
      ···
      if (bindRE.test(name)) { // v-bind分支
        ···
      } else if(onRE.test(name)) { // v-on分支
        ···
      } else { // 除了v-bind，v-on之外的普通指令
        ···
        // 普通指令会在AST树上添加 directives 属性
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i]);
        if (name === 'model') {
          checkForAliasModel(el, value);
        }
      }
    } else {
      // 2. 普通html标签属性
    }

  }
}
```

然后，在 render 函数生成阶段，genData 会对模板的诸多属性进行处理,最终返回拼接好的字符串模板，而对指令的处理会进入 genDirectives 流程

```
function genData(el, state) {
  var data = '{';
  // 指令的处理
  var dirs = genDirectives(el, state);
  ··· // 其他属性，指令的处理
  // 针对组件的 v-model 处理
  if (el.model) {
    data += "model:{value:" + (el.model.value) + ",callback:" + (el.model.callback) + ",expression:" + (el.model.expression) + "},";
  }
  return data
}

function genDirectives (el, state) {
    ...
    for (i = 0, l = dirs.length; i < l; i++) {
      ...
      // 对指令ast树的重新处理
      var gen = state.directives[dir.name];
    }
  }
```

state.directives 实际上就是 model 函数

```
function model (el,dir,_warn) {
  warn$1 = _warn;
  // 绑定的值
  var value = dir.value;
  var modifiers = dir.modifiers;
  var tag = el.tag;
  var type = el.attrsMap.type;
  {
    // 这里遇到 type 是 file 的 html，如果还使用双向绑定会报出警告。
    // 因为File inputs 是只读的
    if (tag === 'input' && type === 'file') {
      warn$1(
        "<" + (el.tag) + " v-model=\"" + value + "\" type=\"file\">:\n" +
        "File inputs are read only. Use a v-on:change listener instead.",
        el.rawAttrsMap['v-model']
      );
    }
  }
  //组件上 v-model 的处理
  if (el.component) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false
  } else if (tag === 'select') {
    // select 表单
    genSelect(el, value, modifiers);
  } else if (tag === 'input' && type === 'checkbox') {
    // checkbox 表单
    genCheckboxModel(el, value, modifiers);
  } else if (tag === 'input' && type === 'radio') {
    // radio 表单
    genRadioModel(el, value, modifiers);
  } else if (tag === 'input' || tag === 'textarea') {
    // 普通 input，如 text, textarea
    genDefaultModel(el, value, modifiers);
  } else if (!config.isReservedTag(tag)) {
    genComponentModel(el, value, modifiers);
    // component v-model doesn't need extra runtime
    return false
  } else {
    // 如果不是表单使用 v-model，同样会报出警告，双向绑定只针对表单控件。
    warn$1(
      "<" + (el.tag) + " v-model=\"" + value + "\">: " +
      "v-model is not supported on this element type. " +
      'If you are working with contenteditable, it\'s recommended to ' +
      'wrap a library dedicated for that purpose inside a custom component.',
      el.rawAttrsMap['v-model']
    );
  }

  return true
}
```

对普通表单的处理在 genDefaultModel 中

```
function genDefaultModel (el,value,modifiers) {
    var type = el.attrsMap.type;

    // v-model 和 v-bind 值相同值，有冲突会报错
    {
      var value$1 = el.attrsMap['v-bind:value'] || el.attrsMap[':value'];
      var typeBinding = el.attrsMap['v-bind:type'] || el.attrsMap[':type'];
      if (value$1 && !typeBinding) {
        var binding = el.attrsMap['v-bind:value'] ? 'v-bind:value' : ':value';
        warn$1(
          binding + "=\"" + value$1 + "\" conflicts with v-model on the same element " +
          'because the latter already expands to a value binding internally',
          el.rawAttrsMap[binding]
        );
      }
    }
    // modifiers 存贮的是 v-model 的修饰符。
    var ref = modifiers || {};
    // lazy,trim,number 是可供 v-model 使用的修饰符
    var lazy = ref.lazy;
    var number = ref.number;
    var trim = ref.trim;
    var needCompositionGuard = !lazy && type !== 'range';
    // lazy 修饰符将触发同步的事件从 input 改为 change
    var event = lazy ? 'change' : type === 'range' ? RANGE_TOKEN : 'input';

    var valueExpression = '$event.target.value';
    // 过滤用户输入的首尾空白符
    if (trim) {
      valueExpression = "$event.target.value.trim()";
    }
    // 将用户输入转为数值类型
    if (number) {
      valueExpression = "_n(" + valueExpression + ")";
    }
    // genAssignmentCode 函数是为了处理 v-model 的格式，允许使用以下的形式： v-model="a.b" v-model="a[b]"
    var code = genAssignmentCode(value, valueExpression);
    if (needCompositionGuard) {
      //  保证了不会在输入法组合文字过程中得到更新
      code = "if($event.target.composing)return;" + code;
    }
    //  添加 value 属性
    addProp(el, 'value', ("(" + value + ")"));
    // 绑定事件
    addHandler(el, event, code, null, true);
    if (trim || number) {
      addHandler(el, 'blur', '$forceUpdate()');
    }
  }

function genAssignmentCode (value,assignment) {
  // 处理 v-model 的格式，v-model="a.b" v-model="a[b]"
  var res = parseModel(value);
  if (res.key === null) {
    // 普通情形
    return (value + "=" + assignment)
  } else {
    // 对象形式
    return ("$set(" + (res.exp) + ", " + (res.key) + ", " + assignment + ")")
  }
}
```

genDefaultModel 的逻辑分两部分

- 1.针对修饰符产生不同的事件处理字符串
- 2.为 v-model 产生的 AST 树添加属性和事件相关的属性，为下面两行

```
//  addProp 会为 AST 树添加 props 属性
addProp(el, 'value', ("(" + value + ")"))
// addHandler 会为 AST 树添加事件相关的属性, 在 v-model 相当于在 input 上绑定了 input 事件
addHandler(el, event, code, null, true)
```

总结：

- 1.在编译阶段，如果是 v-model 会被解析到 el.directives
- 2.在 render 阶段，对指令的处理会进入 genDirectives 流程，此时 genDirectives 中的 state.directives[dir.name] 就是 modle 函数
- 3.在 model 函数中，会区分不同表单 select、checkbox、普通表单等
- 4.普通表单在 genDefaultModel 中处理，genDefaultModel 有两部分逻辑，第一个是针对修饰符产生不同的事件处理字符串，第二个是为 v-model 产生的 AST 树添加属性和事件相关的属性，如下：

```
//  addProp 会为 AST 树添加 props 属性
addProp(el, 'value', ("(" + value + ")"))
// addHandler 会为 AST 树添加事件相关的属性, 在 v-model 相当于在 input 上绑定了 input 事件
addHandler(el, event, code, null, true)
```

- 5.然后在 patch 过程根据生成的 VNode 进行 value 绑定，事件 input 监听

### 4-4、Vue 的 keep-alive

被 keep-alive 包裹的组件不会重新渲染

#### 4-4-1、keep-alive 基本使用：

```
<keep-alive exclude="c" max="5">
  <component />
</keep-alive>

// 配合 router 使用
<keep-alive>
    <router-view>
        <!-- 所有路径匹配到的视图组件都会被缓存！ -->
    </router-view>
</keep-alive>
```

#### 4-4-2、keep-alive 首次渲染

**初始渲染流程最关键的一步是对渲染的组件 Vnode 进行缓存，其中也包括了组件的真实节点存储**

![keep-alive首次渲染](/imgs/img18.png)

1.patch 执行阶段会调用 craeteElm 创建真实 Dom，在创建节点时，keep-alive 的 VNode 对象会被认为是一个组件，因此会执行 createComponent

```
function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
  let i = vnode.data // 这个是 组件的 VNodeData
  if (isDef(i)) {
    // isReactivated 用来判断组件是否缓存。
    const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
    if (isDef(i = i.hook) && isDef(i = i.init)) {
      // 执行组件初始化的内部钩子 init
      i(vnode, false /* hydrating */ )
    }

    if (isDef(vnode.componentInstance)) {
      initComponent(vnode, insertedVnodeQueue)
      insert(parentElm, vnode.elm, refElm) // 插入顺序：先子后父
      if (isTrue(isReactivated)) {
        reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
      }
      return true
    }
  }
}
```

2.createComponent 会调用组件内部钩子 init 进行初始化，在 init 过程会有判断是否有 keep-alive 缓存，没有就调用 createComponentInstanceForVnode 进行 keep-alive 组件实例化

```
// 首次渲染只会标记需要缓存
var componentVNodeHooks = {
  init: function init (vnode, hydrating) {
    // 如果 keep-alive 缓存了
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      var mountedNode = vnode; // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      // 没有，就 $mount 挂载子组件
      const child = (vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ));
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  }
}

export function createComponentInstanceForVnode(){
  ...

  // 执行 vue 子组件实例化
  return new vnode.componentOptions.Ctor(options);
}
```

3.然后就是 keep-alive 组件实例化: 在 core/components/keep-alive.js

- keep-alive 本质上只是存缓存和拿缓存的过程

```
export function createComponentInstanceForVnode(){
  ...

  // 执行 vue 子组件实例化
  return new vnode.componentOptions.Ctor(options);
}
```

4.keep-alive 组件实例化之后就是挂载，这又是一个 vm.\_render 跟 vm.\_update 的过程；而在 keep-alive 有 render 函数，所以 render 过程是 keep-alive 内的 render

```
var componentVNodeHooks = {
  init: function init (vnode, hydrating) {
    // 如果 keep-alive 缓存了
    if (
      ...
    } else {
      // 没有，就 $mount 挂载子组件
      const child = (vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ));
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  }
}
```

- 保存 VNode 到 cache
- 标记 vnode.data.keepAlive = true

```
export default {
  name: 'keep-alive',
  abstract: true,

  props: {
    include: patternTypes,  // 哪些需要缓存
    exclude: patternTypes,  // 哪些不需要缓存
    max: [String, Number]   // 缓存的数量上限
  },

  created () {
    // 缓存组件 VNode
    this.cache = Object.create(null)
    // 缓存组件名
    this.keys = []
  },

  destroyed () {
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted () {
    // 监听 include exclue
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  // keep-alive 的渲染函数
  render () {
    // keep-alive 插槽的值
    const slot = this.$slots.default
    // 第一个 VNode 节点
    const vnode: VNode = getFirstComponentChild(slot)
    // 拿到第一个子组件实例
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    // 第一个子组件实例
    if (componentOptions) {
      // check pattern
      // 第一个 VNode 节点的 name
      const name: ?string = getComponentName(componentOptions)
      const { include, exclude } = this
      // 判断子组件是否能够缓存
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const { cache, keys } = this
      const key: ?string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      // 再次命中缓存
      if (cache[key]) {
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        remove(keys, key)
        keys.push(key)
      } else {
        // 初次渲染时，将 vnode 缓存
        cache[key] = vnode
        keys.push(key)
        // prune oldest entry
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      // 为缓存组件打上标志
      vnode.data.keepAlive = true
    }

    // 将渲染的 vnode 返回
    return vnode || (slot && slot[0])
  }
}
```

#### 4-4-3、keep-alive 再次渲染

再次渲染是由于数据发生更新，触发派发更新通知组件去重新渲染，而在重新渲染中的 patch 中，主要的是 patchVnode

patchVnode 中对子组件执行 prepatch 的流程

```
function patchVnode () {
    ···
    // 新 vnode  执行 prepatch 钩子
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
        i(oldVnode, vnode);
    }
    ···
}
```

执行 prepatch 钩子时会拿到新旧组件的实例并执行 updateChildComponent 函数。updateChildComponent 会对针对新的组件实例对旧实例进行状态的更新，最终调用 vm.\$forceUpdate() 进行重新渲染

```
// create-component.js
const componentVNodeHooks = {
  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    // 新组件实例
    const options = vnode.componentOptions;
    // 旧组件实例
    const child = (vnode.componentInstance = oldVnode.componentInstance);

    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    );
  }
}

// instance/lifecycle.js
export function updateChildComponent () {
  ...

  // 迫使实例重新渲染。
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  ...
}

export function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }
}
```

vm.\$forceUpdate() 强迫 keep-alive 进行重新渲染，此时 keep-alive 会再次调用自身的 render 函数，这一次由于第一次对 vnode 的缓存，keep-alive 在实例的 cache 对象中找到了缓存的组件

```
export default {
  name: 'keep-alive',
  abstract: true,

  // keep-alive 的渲染函数
  render () {
    // keep-alive 插槽的值
    const slot = this.$slots.default
    // 第一个 VNode 节点
    const vnode: VNode = getFirstComponentChild(slot)
    // 拿到第一个子组件实例
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    // 第一个子组件实例
    if (componentOptions) {
      // check pattern
      // 第一个 VNode 节点的 name
      const name: ?string = getComponentName(componentOptions)
      const { include, exclude } = this
      // 判断子组件是否能够缓存
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const { cache, keys } = this
      const key: ?string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      // 再次命中缓存
      if (cache[key]) {
        // 直接取出缓存组件
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // keys命中的组件名移到数组末端
        remove(keys, key)
        keys.push(key)
      } else {
        // 初次渲染时，将 vnode 缓存
        cache[key] = vnode
        keys.push(key)
        // prune oldest entry
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      // 为缓存组件打上标志
      vnode.data.keepAlive = true
    }

    // 将渲染的vnode返回
    return vnode || (slot && slot[0])
  }
}
```

## 5、vue-router

## 6、vuex
