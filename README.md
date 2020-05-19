# Vue 源码阅读

## initGlobalAPI

-   挂载 Vue 全局的 api 例如 nextTick set 等

```
initGlobalAPI(Vue)
```

## 1、Vue 的数据驱动（源码流程: init --> \$mount --> compile/render --> VNode --> patch --> Dom）

### 1-1、new Vue() 发生了什么

-   首先，Vue 是 Function 出来的

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

-   new Vue 实际上就是执行了 Vue 自身的 \_init 方法, \_init 方法就是初始化 Vue 的，\_init 通过 initMixin(Vue) 往 Vue 原型上添加
-   \_init 方法主要做了一些 options 的合并，初始化命周期，初始化事件中心，初始化渲染，初始化 data、props、computed、watcher 等等。

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

-   initState 初始化 data，对 data 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了 this.\_data.xxx，还有 data 响应式

```
proxy(vm, `_data`, key)
observe(data, true /* asRootData */)
```

-   最后是 \$mount 的挂载

### 1-2、\$mount 的挂载

-   先是缓存了原型上的 \$mount 方法，再重新定义该方法

```
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function ()
```

-   对 el 做了限制，Vue 不能挂载在 body 、 html 这样的根节点上, 因为其会覆盖

```
if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }
```

-   调用原先原型上的 \$mount 方法挂载, 此时实际也是调用重新定义的 mount， 这样做主要是为了复用

```
return mount.call(this, el, hydrating)
```

-   \$mount 主要是执行了 mountComponent, 其核心就是先调用 vm.\_render 方法先生成虚拟 Node，再实例化一个渲染 Watcher ，在它的回调函数中会调用 updateComponent 方法，最终调用 vm.\_update 更新 DOM。 vm.\_rendre() 主要生成 vnode
-   Watcher 在这里起到两个作用，一个是初始化的时候会执行回调函数，另一个是当 vm 实例中的监测 的数据发生变化的时候执行回调函数

```
new Watcher(vm, updateComponent, noop, {
  before () {
    if (vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true /* isRenderWatcher */)
```

-   函数最后判断为根节点的时候设置 vm.\_isMounted 为 true ， 表士这个实例已经挂载了，同时执行 mounted 钩子函数。 vm.\$vnode 表士 Vue 实例的父虚拟 Node，所以它为 Null 则表士当前是根 Vue 的实例。

```
if (vm.$vnode == null) {
  vm._isMounted = true
  callHook(vm, 'mounted')
}
```

### 1-3、\$mount 挂载的 Vue.prototype.\_render

-   主要用处：把实例渲染成一个虚拟 Node
-   执行流程 （\_createElement -> createElement -> \$createElement -> render -> \_render）

### 1-4、createElement

-   Vue.js 利用 createElement 创建 VNode，在 src/core/vdom/create-elemenet.js 中
-   createElement 是对 \_createElement 的封装，在 createElement 中对参数进行处理， 真正创建 VNode 的函数在 \_createElement

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

-   \_createElement 首先对 children 做处理，最终生成统一形式[vnode, vnode, ...]；然后是 VNode 的创建。整体流程就是 （\_createElement -> createElement -> \$createElement -> render -> \_render）；执行完这一系列就是到 vm.\_update

### 1-5、\$mount 挂载的 Vue.prototype.\_update

-   主要作用：把生成的 VNode 渲染, 在 core/instance/lifecyle.js 中定义
-   核心方法 patch

## 2、Vue 的组件化

-   首先在 this.\_init 中调用 initRender 初始化，然后 initRender 中 createElement, 在 createElement 中发现是组件, 那么 createComponent

### 2-1、组件的 VNode (create-element.js、create-component.js、vnode.js、extend.js)

![VNode](/imgs/img1.png)

-   在 create-element.js 中的 \_createElement 时，如果 tag 不是一个标签字符串，而是一个组件对象，此时通过 createComponent 创建一个组件 VNode

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

-   在 create-component.js 的 createComponent 中，会调用 Vue.extend(组件)(即: Ctor = baseCtor.extend(Ctor)), 这里的 extend 主要就是把 Vue 的功能赋给组件，并且合并配置, 在 extend 中会对组件做缓存

```
extend.js

// 判断缓存中有没有存在,有就直接使用
if (cachedCtors[SuperId]) {
  return cachedCtors[SuperId]
}
```

-   通过在 create-component.js 的 createComponent 中安装一些组件的钩子 installComponentHooks(data)
-   在 create-component.js 中创建组件 VNode。组件 VNode 与 普通 VNode 区别: 没有 children, 多了 componentOptions

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

-   组件的 patch 也会调用 patch.js 中的 createElm, 其中与普通元素 patch 不一样的就是 createElm 中的 createComponent 处理
-   在 patch.js 的 createComponent 中, vnode.componentInstance, 这个主要在 create-component.js 中创建组件 VNode 的时候挂载钩子时的，vnode.componentInstance 这个主要就是调用了 createComponentInstanceForVnode 这个去执行 Ctor 组件构造器，这个构造器又会去 init.js 中 initInternalComponent(vm, options) 合并; 继续在 init.js 中 调用 initLifecycle
-   在 lifecycle.js 中 initLifecycle，拿到父组件 vm: let parent = options.parent, options.parent 就是父组件 vm 实例。 在 setActiveInstance 实现每次 \_update 把 vm 赋给 activeInstance

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

-   继续在 create-component.js 中 child.$mount(hydrating ? vnode.elm : undefined, hydrating), 这个就会执行 entry-runtime-with-compiler.js 中的 Vue.prototype.$mount, 后执行 lifecycle.js 中的 mountComponent，执行 render 完成子组件的渲染，然后执行渲染 watcher(子组件的渲染 watcher)

### 2-3、组件的生命周期

-   beforeCreate: data 数据没有初始化之前执行
-   created: data 数据初始化之后执行

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

-   beforeMounted: 页面渲染之前执行
-   mounted: 页面渲染之后执行

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

-   beforeUpdate: 数据更新之前，并且首次渲染不会触发
-   updated: 数据更新之后，并且首次渲染不会触发

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

-   beforeDestroy: 页面卸载之前，此时 data、method 还存在
-   destroyed: 页面卸载之后，此时 data、method 不存在

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

-   总的来说，异步组件的实现通常是 2 次渲染，先渲染成注释节点，组件加载成功后再通过 forceRender 重新渲染，这是异步组件的核心所在。

-   当在 createComponent 中发现是异步组件, 调用 resolveAsyncComponent, 这个是异步组件的核心

#### 2-5-1、工厂函数

-   定义异步请求成功的函数处理，定义异步请求失败的函数处理；
-   执行组件定义的工厂函数；
-   同步返回请求成功的函数处理。
-   异步组件加载完毕，会调用 resolve 定义的方法，方法会通过 ensureCtor 将加载完成的组件转换为组件构造器，并存储在 resolved 属性中
-   组件构造器创建完毕，会进行一次视图的重新渲染。由于 Vue 是数据驱动视图渲染的，而组件在加载到完毕的过程中，并没有数据发生变化，因此需要手动强制更新视图
-   forceRender: 这个中执行 $forceUpdate，$forceUpdate 的逻辑非常简单，就是调用渲染 watcher 的 update 方法，让渲染 watcher 对应的回调函数执行，也就是触发了组件的重新渲染。
-   异步组件加载失败后，会调用 reject 定义的方法，方法会提示并标记错误，最后同样会强制更新视图。

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

-   执行异步过程会同步为加载中的异步组件创建一个注释节点 Vnode

```
createComponent.js

if (Ctor === undefined) {
  // 是创建一个注释节点vnode
  return createAsyncPlaceholder(asyncFactory, data, context, children, tag);
}
```

-   执行 forceRender 触发组件的重新渲染过程时，又会再次调用 resolveAsyncComponent,这时返回值 Ctor 不再为 undefined 了，因此会正常走组件的 render,patch 过程。这时，旧的注释节点也会被取代。

#### 2-5-2、Promise

-   主要是在 res.then(resolve, reject) 这里

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

-   Observer 类，实例化一个 Observer 类会通过 Object.defineProperty 对数据的 getter,setter 方法进行改写，在 getter 阶段进行依赖的收集,在数据发生更新阶段，触发 setter 方法进行依赖的更新
-   watcher 类，实例化 watcher 类相当于创建一个依赖，简单的理解是数据在哪里被使用就需要产生了一个依赖。当数据发生改变时，会通知到每个依赖进行更新，前面提到的渲染 wathcer 便是渲染 dom 时使用数据产生的依赖。
-   Dep 类，既然 watcher 理解为每个数据需要监听的依赖，那么对这些依赖的收集和通知则需要另一个类来管理，这个类便是 Dep,Dep 需要做的只有两件事，收集依赖和派发更新依赖

**总结：处理的核心是在访问数据时对数据所在场景的依赖进行收集，在数据发生更改时，通知收集过的依赖进行更新**

![响应式原理](/imgs/img3.png)

### 3-1、响应式对象

#### 3-1-1、通过 Object.defineProperty 进行数据劫持

#### 3-1-2、initState

-   定义在 state.js 中, 在 Vue 的初始化阶段， \_init ⽅法执⾏的时候, 会执行 initState
-   initState 主要是对 props 、 methods 、 data 、 computed 和 wathcer 等属性做了初 始化操作
-   initState 中的 initProps: 通过 defineReactive 把 props 的属性变成响应式的，并且使用 proxy 将 props 的每个 key 代理到 vm 实例上, 这样 this.xx 就相当于访问 this.\_props.xxx

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

-   initState 中的 initData: 跟 initProps 相似, proxy 逐个代理 data 的 key 到 vm 实例, observe 响应式处理,
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

-   observe 中会 new 一个 Observer, 这个里面的 walk 会调用 defineReactive 执行 Object.defineProperty 进行数据劫持; 若传入的是数组，调用 observeArray，遍历数组对数组的每一项进行观察

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

-   defineReactive 做 Object.defineProperty, 当对象的某一个 key 的值也是一个对象，就会继续调用 observe， let childOb = !shallow && observe(val)

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

-   在 Vue 进行 \$mount 的时候会调用 mountComponent，在 mountComponent 中会 new Watcher, watcher 会调用它自己的 get 方法去调用 pushTargrt，这样就把 watcher 添加到 Dep.target 上了

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

-   判断数据更改前后是否一致，如果数据相等则不进行任何派发更新操作。
-   新值为对象时，会对该值的属性进行依赖收集过程。
-   通知该数据收集的 watcher 依赖,遍历每个 watcher 进行数据更新,这个阶段是调用该数据依赖收集器的 dep.notify 方法进行更新的派发。

派发更新过程： 通过 set 调用 dep.notify(), 在 notify 中会把 subs 中的依赖 watcher 逐个执行 update ( subs[i].update() ), watcher 的 update 把需要执行的 watcher 通过 queueWatcher 放到队列 queue 中，调用 flushSchedulerQueue 执行 queue 队列的每一个 watcher 的 run，执行 watcher 相关的回调函数去处理数据的更新。。在执行 run 之前会根据 watcher 的 id 对 watcher 进行排列，因为组件的更新是从父到子的，所以要保证父的 watcher 在前面，而且当父组件被销毁，那么子组件的更新也不需要执行了。

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

-   protoAugment 是通过原型指向的方式，将数组指定的七个方法指向 arrayMethods
-   copyAugment 通过数据代理的方式, 将数组指定的七个方法指向 arrayMethods

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

-   首先调用原始的数组方法进行运算，这保证了与原始数组类型的方法一致性
-   inserted 变量用来标志数组是否是增加了元素，如果增加的元素不是原始类型，而是数组对象类型，则需要触发 observeArray 方法，对每个元素进行依赖收集。
-   调用 ob.dep.notify(), 进行依赖的派发更新

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

**总结：总的来说。数组的改变不会触发 setter 进行依赖更新，所以 Vue 创建了一个新的数组类，重写了数组的方法，将数组方法指向了新的数组类。**
**同时在访问到数组时依旧触发 getter 进行依赖收集，在更改数组时，触发数组新方法运算，并进行依赖的派发。**

### 3-5、nextTick

-   nextTick：就是将任务放到异步队列里面，等到主线程执行完再执行
-   在 Vue 中，进行数据操作的时候，Vue 并没有马上去更新 DOM 数据，而是将这个操作放进一个队列中，如果重复执行的话，队列还会进行去重操作；等待同一事件循环中的所有数据变化完成之后，会将队列中的事件拿出来处理。这样做主要是为了提升性能，因为如果在主线程中更新 DOM，循环 100 次就要更新 100 次 DOM；但是如果等事件循环完成之后更新 DOM，只需要更新 1 次。也就是说数据改变后触发的渲染 watcher 的 update 是在 nextTick 中的。

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

-   将回调函数放到 callbacks 中等待执行

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

-   将执行函数放到微任务或者宏任务中: 这里 Vue 做了兼容性的处理，尝试使用原生的 Promise.then、MutationObserver 和 setImmediate，上述三个都不支持最后使用 setTimeout； 其中 Promise.then、MutationObserver 是微任务，setImmediate 和 setTimeout 是宏任务。

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

-   最后依次执行 callbacks 中的回调

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

#### 3-6-1、computed 的依赖收集

在初始化 computed 的过程，会遍历 computed 的每一个属性值，并为每一个属性值添加一个计算 watcher，{lazy: true} 代表计算 watcher，最后调用 defineComputed 将数据设置为响应式

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

defineComputed: 计算属性的计算结果会被缓存，缓存的意义在于，只有在相关响应式数据发生变化时，computed 才会重新求值，其余情况多次访问计算属性的值都会返回之前计算的结果，这就是缓存的优化, 缓存的主要根据是 dirty 字段；最终调用 Object.defineProperty 进行数据拦截

```
// state.js

export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
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

在 watcher.evaluate() 会执行 watcher.get(), 这个会通过 pushTarget(this) 将 watcher 挂到 Dep.target

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

-   当计算属性依赖的数据发生更新时，由于数据的 Dep 收集过 computed watch 这个依赖，所以会调用 dep 的 notify 方法，对依赖进行状态更新。
-   此时 computed watcher 和之前介绍的 watcher 不同，它不会立刻执行依赖的更新操作，而是通过一个 dirty 进行标记。

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
