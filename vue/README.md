### initGlobalAPI

- 挂载 Vue 全局的 api 例如 nextTick set 等

```
initGlobalAPI(Vue)
```

### 1、Vue 的数据驱动（源码流程: init --> \$mount --> compile/render --> VNode --> patch --> Dom）

#### 1-1、new Vue() 发生了什么

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

#### 1-2、\$mount 的挂载

- 先是缓存了原型上的 \$mount 方法，再重新定义该方法

```
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function ()
```

- 对 el 做了限制，Vue 不能挂载在 body 、 html 这样的根节点上, 因为其会覆盖

```
if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }
```

- 调用原先原型上的 \$mount 方法挂载, 此时实际也是调用重新定义的 mount， 这样做主要是为了复用

```
return mount.call(this, el, hydrating)
```

- \$mount 主要是执行了 mountComponent, 其核心就是先调用 vm.\_render 方法先生成虚拟 Node，再实例化一个渲染 Watcher ，在它的回调函数中会调用 updateComponent 方法，最终调用 vm.\_update 更新 DOM。 vm.\_rendre() 主要生成 vnode
- Watcher 在这里起到两个作用，一个是初始化的时候会执行回调函数，另一个是当 vm 实例中的监测 的数据发生变化的时候执行回调函数

```
new Watcher(vm, updateComponent, noop, {
  before () {
    if (vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true /* isRenderWatcher */)
```

- 函数最后判断为根节点的时候设置 vm.\_isMounted 为 true ， 表士这个实例已经挂载了，同时执行 mounted 钩子函数。 vm.\$vnode 表士 Vue 实例的父虚拟 Node，所以它为 Null 则表士当前是根 Vue 的实例。

```
if (vm.$vnode == null) {
  vm._isMounted = true
  callHook(vm, 'mounted')
}
```

#### 1-3、\$mount 挂载的 Vue.prototype.\_render

- 主要用处：把实例渲染成一个虚拟 Node
- 执行流程 （\_createElement -> createElement -> \$createElement -> render -> \_render）

#### 1-4、createElement

- Vue.js 利用 createElement 创建 VNode，在 src/core/vdom/create-elemenet.js 中
- createElement 是对 \_createElement 的封装，在 createElement 中对参数进行处理， 真正创建 VNode 的函数在 \_createElement

```
export function createElement (
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}
```

- \_createElement 首先对 children 做处理，最终生成统一形式[vnode, vnode, ...]；然后是 VNode 的创建。整体流程就是 （\_createElement -> createElement -> \$createElement -> render -> \_render）；执行完这一系列就是到 vm.\_update

#### 1-5、\$mount 挂载的 Vue.prototype.\_update

- 主要作用：把生成的 VNode 渲染
- 核心方法 patch

### 2、Vue 的组件化

#### 2-1、createComponent

- 在 \_createElement 时，如果 tag 不是一个标签字符串，而是一个组件对象，此时通过 createComponent 创建一个组件 VNode

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
