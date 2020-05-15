# Vue 源码阅读

## initGlobalAPI

- 挂载 Vue 全局的 api 例如 nextTick set 等

```
initGlobalAPI(Vue)
```

## 1、Vue 的数据驱动（源码流程: init --> \$mount --> compile/render --> VNode --> patch --> Dom）

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

### 1-3、\$mount 挂载的 Vue.prototype.\_render

- 主要用处：把实例渲染成一个虚拟 Node
- 执行流程 （\_createElement -> createElement -> \$createElement -> render -> \_render）

### 1-4、createElement

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

### 1-5、\$mount 挂载的 Vue.prototype.\_update

- 主要作用：把生成的 VNode 渲染, 在 core/instance/lifecyle.js 中定义
- 核心方法 patch

## 2、Vue 的组件化

- 首先在 this.\_init 中调用 initRender 初始化，然后 initRender 中 createElement, 在 createElement 中发现是组件, 那么 createComponent

### 2-1、组件的 VNode (create-element.js、create-component.js、vnode.js、extend.js)

![VNode](/vue/imgs/img1.png)

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

![VNode](/vue/imgs/img2.png)

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
  // vm.$vnode 表示 Vue 实例的父虚拟 node，为 null 则表示 当前是根 Vue 实例
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

### 3-1、响应式对象

#### 3-1-1、通过 Object.defineProperty 进行数据劫持

#### 3-1-2、initState

- 定义在 state.js 中, 在 Vue 的初始化阶段， \_init ⽅法执⾏的时候, 会执行 initState
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
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 当对象的某一个 key 的值也是一个对象，就会继续调用 observe
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()
    }
  })
}
```

### 3-2、依赖收集

#### 3-2-1、首先，get 会 new Dep()

#### 3-2-2、判断是否存在 Dep.target, Dep.target 其实就是一个 watcher

- 在 Vue 进行 \$mount 的时候会调用 mountComponent，在 mountComponent 中会 new Watcher, watcher 会调用它自己的 get 方法去 pushTargrt，这样就把 watcher 添加到 Dep.target 上了

```
// dep.js
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

// watcher.js
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {

    this.value = this.lazy
      ? undefined
      : this.get()
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
