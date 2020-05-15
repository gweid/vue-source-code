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

- 在 create-component.js 的 createComponent 中，会调用 Vue.extend(组件)(即: Ctor = baseCtor.extend(Ctor)), 这里的 extend 主要就是把 Vue 的功能赋给组件，并且合并配置, 在其中会对组件做缓存

```
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

- 全局注册：全局注册组件就是 Vue 实例化前创建一个基于 Vue 的子类构造器，并将组件的信息加载到实例 options.components 对象中

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

- 局部注册: 在 createElement 中, 发现是组件标签，就调用 createComponent

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

### 2-5、异步组件

#### 2-5-1、工厂函数方式

```
// 全局注册：
Vue.component('asyncComponent', function(resolve, reject) {
  require(['./test.vue'], resolve)
})
// 局部注册：
var vm = new Vue({
  el: '#app',
  template: '<div id="app"><asyncComponent></asyncComponent></div>',
  components: {
    asyncComponent: (resolve, reject) => require(['./test.vue'], resolve),
    // 另外写法
    asyncComponent: () => import('./test.vue'),
  }
})
```
