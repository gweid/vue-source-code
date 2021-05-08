# Vue 源码阅读

当前阅读的 vue 版本 2.6.11



## 调试方式：

1. 把 vue 源码 clone 下来，cd 进 vue 源码目录，然后 npm i 装包

2. 打开 package.json 文件，修改如下：
   ```js
   {
     "scripts": {
       "dev": "rollup -w -c scripts/config.js --sourcemap --environment TARGET:web-full-dev"
     }
   }
   ```
   就是在原来的基础上加 `--sourcemap`，这样可以在浏览器调试的时候找到对应的源码目录
   
3. 执行 `npm run dev`，会在 `dist` 目录下生成打包后的 `vue` 文件

4. 在 example 目录下新建 test.html 文件如下：
   ```js
   <!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8">
     <meta http-equiv="X-UA-Compatible" content="IE=edge">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <title>Vue源码试</title>
   </head>
   <body>
     <div id="app">
       <div>{{msg}}</div>
     </div>
   
     <script src="../dist/vue.js"></script>
     <script>
       new Vue({
         el: '#app',
         data: {
           msg: 'Hello Vue'
         }
       })
     </script>
   </body>
   </html>
   ```
   
5. 浏览器打开 test.html，打上断点

   ![](/imgs/img20.png)

   **或者直接在源码中写 debugger，也行**
   
   
   
6. 点击断点可以看到进入到源码里面
   ![](/imgs/img21.png)

以上就是基本调试流程



**先是整体流程图：**

![vue入口到构造函数整体流程](/imgs/img19.png)

![vue](/imgs/img0.png)



## 1、new Vue() 发生了什么

new Vue 就是执行了 Vue 的初始化



**首先，Vue 是 Function 出来的**

> vue\src\core\instance\index.js

```js
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

// 定义了 Vue.prototype._init, 初始化 Vue，实际上 new Vue 就是执行的这个方法
initMixin(Vue)

// Vue.prototype.$set Vue.prototype.$watch 等
stateMixin(Vue)

// 在 Vue 原型上，定义 $on, $once, $off, $emit 事件方法，并返回 vm
eventsMixin(Vue)

// 在 Vue.prototype 上定义 _update, $forceUpdate, $destroy 方法
lifecycleMixin(Vue)   // 添加了与生命周期相关的

// 在 Vue 原型上，定义 $nextTick 方法
// Vue原型上，定义 _render 方法，
// _render方法会调用 vm.$createElement 创建虚拟 DOM，如果返回值 vnode 不是虚拟 DOM 类型，将创建一个空的虚拟 DOM
renderMixin(Vue)
```



**new Vue 实际上就是执行了 Vue 自身的 \_init 方法, \_init 方法就是初始化 Vue 的，\_init 通过 initMixin(Vue) 往 Vue 原型上添加**

> vue\src\core\instance\init.js

```js
// Vue 初始化阶段，往 Vue 原型上添加 _init 方法，new Vue 实际上就是执行的这个 _init 方法
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    // 将 this（实际上就是 Vue） 赋值给 vm
    const vm: Component = this
    // 每个 vue 实例都有一个 uid，并且 uid 往上递增
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    vm._isVue = true
    // 组件初始化时的配置合并（通过判断 options 上有没有 _isComponent 属性来确定是否是组件）
    if (options && options._isComponent) {
      /**
       * 每个子组件初始化时走这里，这里只做了一些性能优化
       * 将组件配置对象上的一些深层次属性放到 vm.$options 选项中，以提高代码的执行效率
       */
      initInternalComponent(vm, options)
    } else {
      // new Vue 时的配置合并（new Vue 传入的是用户配置，需要和系统配置合并）
      // 进行 options 的合并,并挂载到 Vue.$options 上，那么 $options.data 可以访问到 data
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }

    if (process.env.NODE_ENV !== 'production') {
      // 设置代理，将 vm 实例上的属性代理到 vm._renderProxy
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }

    vm._self = vm

    // 初始化组件实例关系属性，比如 $parent、$children、$root、$refs、_watcher、_isMounted 等等
    initLifecycle(vm)

    // 初始化事件系统，例如 v-on 或者 @ 定义的事件
    initEvents(vm)

    // 解析插槽 slot，得到 vm.$slot
    // 定义了 vm._c 方法，用于处理 template 模式
    // 定义了 vm.$createElement，用于处理手写 render 模式
    // 无论是 vm._c 还是 vm.$createElement 最终都会调用 createElement 方法
    // 将 vm.$attrs、vm.$listeners 转换为响应式
    initRender(vm)

    // 调用 beforeCreate 生命周期钩子
    // beforeCreate 之前三个处理都和数据无关，
    // 在 beforeCreate 生命周期中只能访问上面三个操作相关的内容
    // 当前周期中是没有数据的，所以在此期间不要做数据操作
    callHook(vm, 'beforeCreate')
    
    // 初始化组件的 inject 注入配置项（处理注入祖辈传递下来的数据）
    // inject 是需要和 provide 配合使用的
    // 父组件通过 provide 提供数据，其他组价可以使用 inject 注入数据
    initInjections(vm) // resolve injections before data/props  在 data/props 之前解决注入

    // 初始化 state, props, methods, computed, watch
    // 其中初始化state, props, methods时，会遍历 data 中所有的 key，检测是否在 props，methods 重复定义
    // props变量有多种写法，vue会进行统一转化，转化成{ a: {type: "xx", default: 'xx'} } 形式
    // 将 data, props 都挂载到vm._data, vm._props上。设置访问数据代理，访问this.xx，实际上访问的是 vm._data[xx], vm._props[xx]
    // 给 _data, _props 添加响应式监听
    initState(vm)

    // 解析组件配置项上的 provide 对象，再挂载一份到 vm._provided 属性上（原本在 vm.$options.provide 上）
    initProvide(vm) // resolve provide after data/props

    // 调用 create 生命周期钩子
    // 在 beforeCreate 和 create 之间做了一系列的数据处理
    // 所以在 create 生命周期可以访问到数据
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 最后, 如果有根元素，那么就挂载
    // options = { el: "#app", data: {}, methods: {}, ... }
    // 有 el 选项，自动调用 $mount 方法，就不需要再手动调用 $mount
    // 没有 el 则必须手动调用 $mount
    if (vm.$options.el) {
      // 调用 $mount 方法，进入挂载阶段
      vm.$mount(vm.$options.el)
    }
  }
}
```

基本上 new vue 就可以总结为：

- 用户传入的配置和系统配置的合并
- 初始化相关属性：$parent、$children、$root、$refs、_watcher、_isMounted 等
- 初始化事件系统，例如 v-on 或者 @ 定义的事件
-  解析插槽，定义 vm._c 处理 template 默认，定义 vm.$createElement 处理手写 render 模式
- 挂载 beforeCreate 生命周期
- 初始化组件的 inject 注入配置项
- 构建响应式系统（props、methods、data、computed、watch）
- 解析组件配置项上的 provide 对象
- 挂载 create 生命周期
- 最后调用 $mount 进行页面挂载



## 2、Vue 渲染流程

首次渲染流程： \$mount --> compile/render --> VNode(render) --> patch --> DOM



![Vue数据驱动](/imgs/img17.png)

总结就是：

1. 确认挂载节点
2. 判断是使用的 template 还是手动 render，如果是 template，需要将 template 转换为 render 函数
3. 根据 render 函数创建虚拟 DOM
4. 对比新旧虚拟 DOM
5. 根据虚拟 DOM 生成真实 DOM
6. 渲染到页面



![$mount](/imgs/img6.png)

### 2-1、\$mount 的定义

目前分在 web 平台，所以定义 $mount 的地方有两个

- src/platform/web/runtime/index.js

- src/platform/web/entry-runtime-with-compiler.js



#### 2-1-1、最先的 Vue.prototype.\$mount

> src/platform/web/runtime/index.js

```
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}
```

这是 $mount 函数最开始定义的地方，里面会做两件事：

- 判断 el 有没有存在以及是不是浏览器环境，两个条件都符合，那么就会通过 query 查找到元素
- 调用 mountComponent 并将结果返回



#### 2-1-2、重新定义 Vue.prototype.\$mount

-   先是缓存了原型上的 \$mount 方法（原型的 $mount 就是 `src/platform/web/runtime/index.js` 这里定义的），再重新定义该方法
-   获取挂载元素，并且挂载元素不能为根节点 html、body 之类的，因为会覆盖
-   判断需不需要编译，因为渲染有的是通过 template 的，有的是通过手写 render 函数，template 的需要编译，调用compileToFunctions方法，返回 render 函数
-   最后调用缓存的 mount，缓存的 mount 中会执行 mountComponent

> src/platform/web/entry-runtime-with-compiler.js

```
const mount = Vue.prototype.$mount

// 重新定义 $mount,为包含编译器和不包含编译器的版本提供不同封装，最终调用的是缓存原型上的 $mount 方法
Vue.prototype.$mount = function (el, hydrating) {
  // 获取挂载元素
  // 通过 query 将 el 转化为 dom 对象
  // 这里的 el 可能是 string 类型，也可能是 element 类型
  // 如果是 string，那么通过 document.query(el) 转换为 element
  el = el && query(el);

  // 挂载元素不能为根节点 html、body 之类的，因为会覆盖
  if (el === document.body || el === document.documentElement) {
    warn(
      "Do not mount Vue to <html> or <body> - mount to normal elements instead."
    );
    return this
  }

  var options = this.$options;

  // 如果有 render 函数，直接执行 mount.call(this, el, hydrating)
  // 没有 render，代表的是 template 模式，就编译 template，转化为 render 函数，再调用 mount
  if (!options.render) {
    if (template) {
       if (typeof template === 'string') {
         // 如果 template 是 '#xxx'，那么根据 id 选择器获取 template 内容
         ...
       } else if () {
         // 如果 tempalte 是一个 nodeType，那么通过 template.innerHTML 得到 template
         ...
       }
    }
    
    if(template) {
      // compileToFunctions 执行编译的函数（将 template 转化为 render）
      // compileToFunctions 方法会返回render函数方法，render 方法会保存到 vm.$options 下面
      const { render, staticRenderFns } = compileToFunctions(template, {...})

      options.render = render
      options.staticRenderFns = staticRenderFns
    }
  }
  // 无论是 template 模板还是手写 render 函数最终调用缓存的 $mount 方法
  return mount.call(this, el, hydrating)
}
```

> 对于调用 compileToFunctions 转换 template 为 render 函数的编译过程，这里暂时先不展开，后面再详细说明编译流程



### 2-2、执行 \$mount

\$mount 主要是执行了 mountComponent，主要的作用：

- 定义 updateComponent 方法，在 watcher 回调时调用
- updateComponent 中：实例化一个渲染 Watcher，在实例化Watcher 的过程会调用 updateComponent 函数：
  - updateComponent  中先调用 vm.\_render 方法先生成 VNode
  - 然后 vm.\_update 转化为真实的 DOM

**Watcher 在这里起到两个作用，一个是初始化的时候会执行回调函数，另一个是当 vm 实例中的监测的数据发生变化的时候执行回调函数**

> vue\src\core\instance\lifecycle.js

```
function mountComponent(vm, el, hydrating) {
  // 首先将 el 做缓存 
  vm.$el = el
  
  // 挂载 beforeMount 生命周期钩子
  callHook(vm, 'beforeMount')

  // 定义 updateComponent 方法，在 watcher 回调时调用。
  updateComponent = function () {
    // vm._render 函数渲染成虚拟 DOM， vm._update 将虚拟 DOM 渲染成真实的 DOM
    vm._update(vm._render(), hydrating);
  };
	
  /**
   * vm 当前实例
   * updateComponent 函数
   * noop 这里指空函数    在 util/index 中
   * {} 配置
   * 魔法注释：isRenderWatcher 标记是否渲染 watcher
   */
  // new Watcher 会执行 Watch 的构造函数 Constructor
  // Constructor 中会调用 Watcher.get 去执行 updateComponent
  // Watcher 在这个有2个作用： 
  //   1、初始化的时候会执行回调函数updateComponent(首次渲染) 
  //   2、当 vm 实例中的监测的数据发生变化的时候执行回调函数updateComponent(响应式)
  new Watcher(vm, updateComponent, noop, {...}, true /* isRenderWatcher */)
}
```

看看与首次渲染相关的 Watcher 

> vue\src\core\observer\watcher.js

```js
export default class Watcher {
     constructor(vm, expOrFn, cb, options, isRenderWatcher) {
         // ...
         if (typeof expOrFn === "function") {
            // expOrFn 实际就是 new Watcher 传进来的 updateComponent
            // 将 expOrFn（updateComponent）赋值给 this.getter
            this.getter = expOrFn;
         } else { ... }

         // 如果是 lazy 代表的是 computed
         // 不是 computed，执行 this.get()
         this.value = this.lazy ? undefined : this.get();
     }

     get() {
         value = this.getter.call(vm, vm);

         return value;
     }
}
```

总结：

- 首先将 el 做缓存 

- 挂载 beforeMount 生命周期钩子

- 定义 updateComponent 方法，在 watcher 回调时调用

- new Watcher 创建渲染 watcher，这个 watcher 在这里有2个作用：

  - 初始化的时候会执行回调函数updateComponent(首次渲染) 
  - 当 vm 实例中的监测的数据发生变化的时候执行回调函数updateComponent(响应式)

- 执行 updateComponent 方法

  1. vm._render() 生成虚拟 DOM

  2. vm._update 将虚拟 DOM 转换为真实 DOM

- 挂载 mount 钩子



### 2-3、updateComponent 渲染 DOM 流程

在渲染 DOM 的过程，Vue 使用了虚拟 DOM 的概念，这使得 Vue 中对 DOM 的操作大多都在虚拟 DOM 中，通过对比将要改动的部分，通知更新到真实的 DOM。虚拟 DOM 其实是一个 js 对象，操作 js 的性能开销比直接操作浏览器 DOM 的低很多，并且虚拟 DOM 会把多个 DOM 的操作合并，减少真实 DOM 的回流重绘次数，这很好的解决了频繁操作 DOM 所带来的性能问题。



#### 2-3-1、首先是 VNode 构造器

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



#### 2-3-2、vm.\_render 生成虚拟 DOM

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

-   createElement 是对 \_createElement 的封装，在 createElement 中先对参数做处理

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



#### 2-3-3、vm.\_update 渲染真实 DOM

-   主要作用：把生成的 VNode 转化为真实的 DOM
-   调用时机: 有两个，一个是发生在初次渲染阶段，这个时候没有旧的虚拟 dom；另一个发生数据更新阶段，存在新的虚拟 dom 和旧的虚拟 dom
-   核心方法 patch，patch 的本质是将新旧 vnode 进行比较，创建、删除或者更新 DOM 节点/组件实例

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

-   如果是首次 patch，就创建一个新的节点
-   老节点存在

    -   老节点不是真实 DOM 并且和新 VNode 节点判定为同一节点(都是 Vnode，又是相同类型节点，才有必要 diff)

        -   调用 patchVnode 修改现有节点，这一步是 diff

    -   新老节点不相同
        -   如果老节点是真实 DOM，创建对应的 vnode 节点
        -   为新的 Vnode 创建元素/组件实例，若 parentElm 存在，则插入到父元素上
        -   如果组件根节点被替换，遍历更新父节点 elm
        -   然后移除老节点

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

-   元素类型的 VNode:

    -   创建 vnode 对应的 DOM 元素节点 vnode.elm
    -   设置 vnode 的 scope
    -   递归调用 createChildren 去创建子节点
    -   执行 create 钩子函数
    -   将 DOM 元素插入到父元素中

-   注释和本文节点

    -   创建注释/文本节点 vnode.elm，并插入到父元素中

-   组件节点：调用 createComponent

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

-   如果新旧 VNode 都是静态的，同时它们的 key 相同（代表同一节点），并且新的 VNode 是 clone 或者是标记了 once（标记 v-once 属性，只渲染一次），那么只需要替换 elm 以及 componentInstance 即可。
-   新老节点均有 children 子节点，则对子节点进行 diff 操作，调用 updateChildren，这个 updateChildren 是 diff 的核心
-   如果老节点没有子节点而新节点存在子节点，先清空子 elm 的文本内容，然后为当前节点加入子节点
-   当新节点没有子节点而老节点有子节点的时候，则移除该 DOM 节点的所有子节点
-   当新老节点都无子节点的时候，只是文本的替换

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

-   如果旧开始节点为 undefined，就后移一位；如果旧结束节点为 undefined，就前移一位

b、快捷首尾查找(下面四种按顺序)

-   旧开始和新开始节点比对: 如果匹配，表示它们位置是对的，Dom 不用改，将新旧节点开始的下标后移一位
-   旧结束和新结束节点比对: 如果匹配，表示它们位置是对的，Dom 不用改，将新旧节点结束的下标前移一位
-   旧开始和新结束节点比对: 如果匹配，位置不对需要更新 Dom 视图，将旧开始节点对应的真实 Dom 插入到最后一位，旧开始节点下标后移一位，新结束节点下标前移一位
-   旧结束和新开始节点比对: 如果匹配，位置不对需要更新 Dom 视图，将旧结束节点对应的真实 Dom 插入到旧开始节点对应真实 Dom 的前面，旧结束节点下标前移一位，新开始节点下标后移一位

c、key 值查找

-   如果和已有 key 值匹配: 说明是已有的节点，只是位置不对，就移动节点位置
-   如果和已有 key 值不匹配: 再已有的 key 值集合内找不到，那就说明是新的节点，就创建一个对应的真实 Dom 节点，插入到旧开始节点对应的真实 Dom 前面

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



## 3、编译 compiler



### 3-1、模板编译 compiler

-   1、parse
    -   使用正则解释 template 中的 Vue 指令(v-xxx)变量等，形成 AST 语法树
-   2、optimize
    -   标记一些静态节点，用于优化，在 diff 比较的时候略过。
-   3、generate
    -   把 parse 生成的 AST 语法树转换为渲染函数 render function



#### 3-3-1、编译的入口

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



#### 3-3-2、parse：使用正则解释 template 编译成 AST 语法树



#### 3-3-3、optimize：标记一些静态节点，用于优化，在 diff 比较的时候略过



#### 3-3-4、generate：把 parse 生成的 AST 语法树转换为渲染函数 render function



## 4、响应式原理

-   Observer 类，实例化一个 Observer 类会通过 Object.defineProperty 对数据的 getter,setter 方法进行改写，在 getter 阶段进行依赖的收集,在数据发生更新阶段，触发 setter 方法进行依赖的更新
-   watcher 类，实例化 watcher 类相当于创建一个依赖，简单的理解是数据在哪里被使用就需要产生了一个依赖。当数据发生改变时，会通知到每个依赖进行更新，前面提到的渲染 wathcer 便是渲染 dom 时使用数据产生的依赖。
-   Dep 类，既然 watcher 理解为每个数据需要监听的依赖，那么对这些依赖的收集和通知则需要另一个类来管理，这个类便是 Dep,Dep 需要做的只有两件事，收集依赖和派发更新依赖

**总结：处理的核心是在访问数据时对数据所在场景的依赖进行收集，在数据发生更改时，通知收集过的依赖进行更新**

响应式原理：

![响应式原理](/imgs/img3.png)

响应式流程(data)：

![响应式流程](/imgs/img7.png)



### 4-1、initState 初始化

首先，在 new Vue 的时候，会执行 initState

> vue\src\core\instance\init.js

```js
Vue.prototype._init = function (options) {
    // ...
    
    // 初始化 state, props, methods, computed, watch
    // 其中初始化state, props, methods时，会遍历 data 中所有的 key，检测是否在 props，methods 重复定义
    // props变量有多种写法，vue会进行统一转化，转化成{ a: {type: "xx", default: 'xx'} } 形式
    // 将 data, props 都挂载到vm._data, vm._props上。设置访问数据代理，访问this.xx，实际上访问的是 vm._data[xx], vm._props[xx]
    // 给 _data, _props 添加响应式监听
    initState(vm)
}
```



#### 4-1-1、initState 初始化函数

initState 会初始化 state, props, methods, computed, watch，将其转换为响应式

> vue\src\core\instance\state.js

```js
// 这里面分别调用不同的函数处理了 props、methods、data、computed、watch
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options

  // 初始化 props，将 props 对象上的每个属性转换为响应式，并代理到 vm
  if (opts.props) initProps(vm, opts.props)

  // 初始化 methods:
  //   校验每个属性的值是否为函数
  //   metheds 里面的每一个 key 不能和 props 中的有冲突
  //   最后得到 vm[key] = methods[key]
  if (opts.methods) initMethods(vm, opts.methods)

  if (opts.data) {
    // initData 做了：
    //   data 对象上的属性不能和 props、methods 对象上的属性相同
    //   将 data 代理到 vm 上
    //   将 data 的每个属性转换为响应式
    initData(vm)
  } else {
    // 用户没有传 data 的情况下，在 vm 上挂载 vm._data 默认值为空对象 {}
    observe(vm._data = {}, true /* asRootData */ )
  }

  // 初始化 computed:
  //   遍历 computed 对象为每一个 computed 添加一个计算 watcher(计算 watcher 的标志是有一个 lazy)
  //   将每个 compulted 代理到 vm 上并转换为响应式
  //   compulted 中的键 key 不能和 data、props 重复
  if (opts.computed) initComputed(vm, opts.computed)

  // 初始化 wathcer:
  //   遍历 watch 对象，为每个 watch 添加一个 user watch 
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
```



#### 4-1-2、initProps 处理 props

```js
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}

  // 定义一个 keys，去缓存 props 中的每个 key 属性，为了性能优化
  const keys = vm.$options._propKeys = []

  // 遍历 props 对象
  for (const key in propsOptions) {
    // 将每一个 key 添加到 keys 中缓存
    keys.push(key)

    // 主要就是把 props 变成响应式的
    defineReactive(props, key, value)

    if (!(key in vm)) {
      // 对 props 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了this._props.xxx
      proxy(vm, `_props`, key)
    }
  }
}
```

上面用到了两个函数：

- defineReactive 转换响应式留到下面依赖收集、派发更新再详细说明
- proxy 的每一个 prop 代理到 vm 上

现在来看看 proxy 函数：可以看到，很简单的逻辑，就是将比如 data 上的每一个属性代理到 vm 上

```js
// 设置代理，将 key 代理到 target 上
// 例如：对于 data 来讲，target 是 vm，sourceKey 是 data 本身 _data，key 就是 data 的每一个 key
// 这样做的好处就是访问 this.xxx 的时候可以直接访问到 this[data].xxx
export function proxy(target: Object, sourceKey: string, key: string) {
  // target: vm  sourceKey: _data  key: key
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key] // vm['_data'].key
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  // 这实际就是把 data 或者 props 等里面的 key 全部挂载到 vm 上
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```



#### 4-1-3、initMethods 处理 methods

```js
function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props
  // 遍历 methods
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {

      // 判断 metheds 里面的每个方法是否都是函数
      if (typeof methods[key] !== 'function') {
          ...
      }

      // metheds 里面的每一个 key 不能和 props 中的有冲突
      if (props && hasOwn(props, key)) {
          ...
      }

      // methods 中的方法与 Vue 实例上已有的内置方法不能重叠
      if ((key in vm) && isReserved(key)) {
          ...
      }
    }
    // 将每一个 method 挂到 vm 上，即 vm[key] = methods[key]
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}
```



#### 4-1-4、initData 处理 data

```js
function initData(vm: Component) {
  let data = vm.$options.data

  // 判断 data 是函数还是对象，data 在跟实例上是对象，在组件实例上是function
  // 是函数，调用 getData 将 data 转换为对象，getData 主要做的事就是调用一下 data 函数
  // 并把 vm.$options.data 挂到 vm._data 上
  data = vm._data = typeof data === 'function' ?
    getData(data, vm) :
    data || {}
  // 处理过的 data 不是 object 类型，就报警告
  if (!isPlainObject(data)) {
      ...
  }

  // 循环
  while (i--) {
    const key = keys[i]
    // 循环做一个对比，data 里面定义的属性名不能跟 props 与 method 中的一样
    if (process.env.NODE_ENV !== 'production') {
      // data 的 key 不能跟 method 中的一样
      if (methods && hasOwn(methods, key)) {
          ...
      }
    }
    // data 的 key 不能跟 props 中的一样
    if (props && hasOwn(props, key)) {
        ...
    } else if (!isReserved(key)) {
      // 对 vm 下的 key 逐个代理
      // 对 data 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了this._data.xxx
      proxy(vm, `_data`, key)
    }
  }

  // 响应式数据的处理
  observe(data, true /* asRootData */ )
}
      
// 如果 data 是函数形式，调用 getData 处理
export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    // 如果 data 是一个函数，简单的调用一下，返回对象
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}
```



剩下的 computed、watch 下面再单独说明



### 4-2、data 依赖收集、派发更新

常常说，vue 的响应式分为依赖收集以及派发更新两个阶段，那么 vue 是怎么进行依赖收集的呢？现在来详细了解一下



#### 4-2-1、data 的依赖收集

**回看 initData 中，将 data 转化为响应式，主要调用了 observe：**

> vue\src\core\instance\state.js

```js
function initData(vm: Component) {
  let data = vm.$options.data
  
  // ...

  // 响应式数据的处理
  observe(data, true /* asRootData */ )
}
```



**那么来看看这个 observe 干了什么：**

> vue\src\core\observer\index.js

```js
// 为对象创建一个观察者实例
// 如果该对象已经被观察，那么返回已有的观察者实例，否则创建新的观察者实例
function observe(value: any, asRootData: ? boolean): Observer | void {
  // 必须是 object 类型，还有不能是 VNode
  // 也就是说非对象、VNode类型都不做响应式处理
  if (!isObject(value) || value instanceof VNode) {
    return;
  }

  let ob: Observer | void;

  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    // 如果 value 对象存在观察者实例 __ob__ ，表示已经被观察，直接返回观察者实例 __ob__
    ob = value.__ob__;
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 通过 new Observer 创建观察者实例
    // new Observer 的时候会执行 Observer 类的构造函数 constructor
    // Observer 构造函数里面会执行 Observer.walk 调用 defineReactive 执行 Object.defineProperty 进行数据劫持
    ob = new Observer(value);
  }
  if (asRootData && ob) {
    ob.vmCount++;
  }
  return ob;
}
```

主要逻辑很简单，主要是两步：

- 判断当前 value 对象有没有被观察过，有被观察过，返回观察者实例
- 没有被观察过，通过 new Observer 创建观察者实例
  - new Observer 的时候会执行 Observer 类的构造函数 constructor
  - Observer 构造函数里面会执行 Observer.walk 调用 defineReactive 执行 Object.defineProperty 



**再来看看 Observer  类：**

> vue\src\core\observer\index.js

```js
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number;
  
  constructor(value: any) {
    this.value = value;
    // 实例化一个 Dep
    this.dep = new Dep();
    this.vmCount = 0;

    // 在 value 对象上设置 __ob__ 属性
    // 代表当前 value 已经存在观察者实例，已经被观察
    def(value, "__ob__", this);

    if (Array.isArray(value)) {
      // 如果是数组...
    } else {
      // 如果是对象
      this.walk(value);
    }
  }

  walk(obj: Object) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]);
    }
  }
}

// vue\src\core\util\lang.js
export function def(obj: Object, key: string, val: any, enumerable ? : boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable, // 两个取反, 如果不传，那么就会是 !!undefined = false, 代表不可枚举
    writable: true,
    configurable: true
  })
}
```

可以看到，new Observer 执行的构造函数 constructor 里面主要的逻辑：

- 实例化一个 Dep，这个后面在进行依赖收集的时候会用到
- 在 value 对象上设置 __ob__ 属性，代表当前 value 已经存在观察者实例，已经被观察
- 接下来，会分为两种情况，因为 data 可能是对象，也可能是数组
- 如果是对象，执行 Observer .walk
- Observer .walk 的主要作用就是调用 defineReactive 将 data 对象转换为响应式

> 这里暂时先不看处理数组的逻辑，后面再分析 data 是数组的处理方式



**接下来看看 defineReactive：**这个是收集依赖，派发更新的核心

```js
/**
 * 拦截 obj[key] 的读取和设置操作：
 *   1、在第一次读取时收集依赖，比如执行 render 函数生成虚拟 DOM 时会有读取操作
 *   2、在更新时设置新值并通知依赖更新
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter ? : ? Function,
  shallow ? : boolean
) {
  // 创建一个 dep 实例
  const dep = new Dep();

  // obj[key] 的属性描述符，发现它是不可配置对象的话直接 return
  // js 对象属性 configurable = false 表示不可通过 delete 删除
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  // 保存记录 getter 和 setter，获取值 val
  const getter = property && property.get;
  const setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  // 当 val 即 obj[key] 的值为对象的情况，递归调用 observe，保证对象中的所有 key 都被观察
  let childOb = !shallow && observe(val);

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // get 拦截 obj[key] 读取操作，做依赖收集
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val;

      // Dep.target 是 Dep 的一个静态属性，值是 watcher，在 new Watcher 的时候设置
      // 在 new Watcher 时会执行回调函数 updateComponent
      // 回调函数中如果有 vm.key 的读取行为，会触发这里进行读取拦截，收集依赖
      // 回调函数执行完以后会将 Dep.target 设置为 null，避免这里重复收集依赖
      if (Dep.target) {
        // 依赖收集，在 dep 中添加 watcher
        dep.depend();
        if (childOb) {
          // 对象中嵌套对象的观察者对象，如果存在也对其进行依赖收集
          childOb.dep.depend();
          if (Array.isArray(value)) {
            // 如果数组元素是数组或者对象，递归去为内部的元素收集相关的依赖
            dependArray(value);
          }
        }
      }
      return value;
    },
    // 派发更新
    set: function reactiveSetter(newVal) {
        // ...
    },
  });
}
```

主要看看依赖收集的逻辑：

1. 通过 new Dep 创建一个 dep 实例，这个 dep 实例就是收集以来的
2. 接下来看看 Object.defineProperty 的 get ：
   - 判断是否存在 Dep.target，Dep.target 是 Dep 的一个静态属性，值是 watcher，在 new Watcher 的时候设置
   - 在 new Watcher 时会执行回调函数 updateComponent 进行实例的挂载
   - 实例挂载过程中，模板会被优先解析为 render 函数，而 render 函数转换成 Vnode 时，会访问到定义的 data数据，这个时候会触发 gettter 调用 dep.depend() 进行依赖收集
   - 回调函数执行完以后会将 Dep.target 设置为 null，避免这里重复收集依赖



先来看看 new Watcher 是怎么设置 Dep.target 的

根据上面 vue 渲染流程知道，在 $mount 进行挂载的时候是调用 mountComponent 函数，mountComponent 函数会进行 new Watcher 操作:

> vue\src\core\instance\lifecycle.js

```js
function mountComponent () {
    // ...
    
    new Watcher(vm, updateComponent, noop, {
        before () {
          if (vm._isMounted && !vm._isDestroyed) {
            callHook(vm, 'beforeUpdate')
          }
        }
      }, true /* isRenderWatcher */)
}
```

再来看看 new Watcher 所做的事:

> vue\src\core\observer\watcher.js

```js
class Watcher {
    constructor() {
        //...

        // 如果是 lazy 代表的是 computed
        // 不是 computed，执行 this.get()
        this.value = this.lazy ? undefined : this.get();
    }
    
    get() {
        // 将 watcher 添加到 Dep.target
    	pushTarget(this)

        // ...
    }
}
```

new Watcher 实际上是调用了 Watcher 本身的 get 方法，get方法中是通过 pushTarget(this) 将 watcher 添加到 Dep.target

再来看看 pushTarget：

> vue\src\core\observer\dep.js

```js
class Dep {...}

// 开放出去的方法，主要用来往 Dep 类上添加 target（也就是 watcher）
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}
```

这就很清晰了：**new Watcher 的过程会调用 Watcher 本身的 get 方法，get方法中是通过 pushTarget(this) 将 watcher 添加到 Dep.target**



接下来是：通过  dep.depend() 进行的依赖收集，那么来看看 dep.depend 的逻辑：

> vue\src\core\observer\dep.js

```js
class Dep {
  constructor () {
    this.id = uid++
    // subs 存储 watcher 的
    this.subs = []
  }
    
  // 将 dep 添加进 watcher
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }
}
```

dep.depend 的逻辑很简单，就是调用 Dep.target 的 addDep 方法，并将 dep 自身传进去。上面已经知道了 Dep.target 其实就是一个 watcher，那么现在还是看回 watcher 身上的 addDep 方法：

> vue\src\core\observer\watcher.js

```js
class Watcher {
    constructor() {
        // ...
        
        this.newDeps = [];
        this.newDepIds = new Set();
    }
    
    addDep(dep: Dep) {
        const id = dep.id;
        if (!this.newDepIds.has(id)) {
          // newDepIds是具有唯一成员是Set数据结构，newDeps是数组
          // 他们用来记录当前 watcher 所拥有的数据，这一过程会进行逻辑判断，避免同一数据添加多次
          this.newDepIds.add(id);
          // 将 dep 添加进 watcher.newDeps 中
          this.newDeps.push(dep);
          if (!this.depIds.has(id)) {
            // 调用 dep.addSub 将 watcher 添加进 dep
            dep.addSub(this);
          }
        }
      }
}
```

Dep.target.addDep(this) = Watcher.addDep(this)，那么可以看出，会将 dep 添加进 watcher 中，主要就是为了避免同一数据添加多次。但最重要的逻辑还是最后调用了 dep.addSub(this)

那么最后来看看 dep.addSub(this)：

> vue\src\core\observer\dep.js

```js
class Dep {
  constructor () {
    this.id = uid++
    // subs 存储 watcher 的
    this.subs = []
  }

  // 在 dep 中添加 watcher
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }
    
  // 将 dep 添加进 watcher
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }
}
```

发现 dep.addSub 就是将 watcher 添加到 dep 中的 subs 数组



自此，data 依赖收集的流程算是走完了，总结一下：

1. 循环遍历 data 的所有数据，通过 Object.defineProperty 为每一项数据添加上 getter
2. 当在执行挂载 $mount 的时候，会实例化一个 Watcher
3. new Watcher 时，会设置当前 Dep 类的静态属性 target，Dep.target 就是一个 watcher
4. new Watcher 的时候，会执行回调函数 updateComponent，updateComponent 的会调用 render 生成虚拟 Dom，这其中会获取 vm._data 数据，那么立即触发 getter 进行拦截
5. 拦截的过程：getter --> dep.depend() --> Dep.target.addDep --> dep.addSub；结果其实就是将 watcher 添加到 Dep 的 subs 数组



#### 4-2-2、data 的派发更新

上面已经完整解析了 data 的依赖收集过程（data[key] 是数组的情况除外），下面来分析一下 data 的派发更新

> vue\src\core\observer\index.js

```js
function defineReactive() {
  // 创建一个 dep 实例
  const dep = new Dep();

  // obj[key] 的属性描述符，发现它是不可配置对象的话直接 return
  // js 对象属性 configurable = false 表示不可通过 delete 删除
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  // 保存记录 getter 和 setter，获取值 val
  const getter = property && property.get;
  const setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  // 当 val 即 obj[key] 的值为对象的情况，递归调用 observe，保证对象中的所有 key 都被观察
  let childOb = !shallow && observe(val);
    
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // get 拦截 obj[key] 读取操作，做依赖收集
    get: function reactiveGetter() {
        // ....
    },

    // 派发更新
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val;
      /* eslint-disable no-self-compare */
      // 如果新值和旧值一样时，return，不会触发响应式更新
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== "production" && customSetter) {
        customSetter();
      }

      // setter 不存在说明该属性是一个只读属性，直接 return
      if (getter && !setter) return;
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      // 对新值进行观察，让新值也是响应式的
      childOb = !shallow && observe(newVal);
      // 依赖派发，通知更新
      dep.notify();
    },
  });
}
```

当对 vm._data 设置值的时候，会被 Object.defineProperty 的 set 拦截：

- 判断如果新值和旧值一样时，return，不会触发响应式更新
- 新值和旧值不一样，对新值进行观察，让新值也是响应式的
- dep.notify() 依赖派发，通知更新

可以知道，最后通过 dep.notify() 去通知更新



来看看 dep.notify 的逻辑：

> vue\src\core\observer\dep.js

```js
class Dep {
  constructor () {
    this.id = uid++
    // subs 存储 watcher 的
    this.subs = []
  }
    
  // 派发更新
  // 通知 dep 中的所有 watcher，执行 watcher.update() 方法
  // watcher.update 中执行 updateComponent 对页面进行重新渲染
  notify () {
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
}
```

dep.notify 的主要作用就是：将 dep.subs 中的 watcher 取出来，执行 watcher.update



再来看看 watcher.update：

> vue\src\core\observer\watcher.js

```js
class Watcher {
  // ...

  // 根据 watcher 配置项，决定接下来怎么走，一般是 queueWatcher
  // 如果是 计算watcher，那么就是将 lazy 标记为 true，代表有脏数据，需要重新计算
  update() {
    /* istanbul ignore else */
    // lazy 为 true 代表是 computed
    if (this.lazy) {
      // 如果是 计算watcher，则将 dirty 置为 true
      // 当页面渲染对计算属性取值时，触发 computed 的读取拦截 computedGetter 函数
      // 然后执行 watcher.evaluate 重新计算取值
      this.dirty = true;
    } else if (this.sync) {
      // 是否是同步 watcher
      // 同步执行，在使用 vm.$watch 或者 watch 选项时可以传一个 sync 选项，
      // 当为 true 时在数据更新时该 watcher 就不走异步更新队列，直接执行 this.run 
      // 方法进行更新
      this.run();
    } else {
      // 把需要更新的 watcher 往一个队列里面推
      // 更新时一般都进到这里
      queueWatcher(this);
    }
  }
}
```

watcher.update 里面会分别处理 computed 的情况、同步 watcher 的情况，还有就是将需要更新的 watcher 往一个通过 queueWatcher 往队列 queue 里面推，接下来就进入了异步更新的过程



### 4-3、异步更新

#### 4-3-1、回顾一下派发更新

上面的派发更新其实就是：设置值的时候被拦截 --> 调用 dep.notify() 去通知更新 --> 调用 watcher.update --> 调用 queueWatcher(this) 将 watcher 往全局队列 queue 中推。然后就是异步更新的过程了

```js
Object.defineProperty(obj, key, {
    set() {
        // ...
        
        dep.notify();
    }
}


Dep.notify = function() {
    // ...
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
}


Watcher.update = function() {
    //...
    // lazy 为 true 代表是 computed
    if (this.lazy) {
      // 如果是 computed，则将 dirty 置为 true
      // 可以让 computedGetter 执行时重新计算 computed 回调函数的执行结果
      this.dirty = true;
    } else if (this.sync) {
      // 是否是同步 watcher
      // 同步执行，在使用 vm.$watch 或者 watch 选项时可以传一个 sync 选项，
      // 当为 true 时在数据更新时该 watcher 就不走异步更新队列，直接执行 this.run 
      // 方法进行更新
      this.run();
    } else {
      // 把需要更新的 watcher 往一个队列里面推
      // 更新时一般都进到这里
      queueWatcher(this);
    }
}
```



#### 4-3-2、queueWatcher

> vue\src\core\observer\scheduler.js

```js
// 定义了全局 queue 数组，用于存储 watcher
const queue: Array<Watcher> = []
let waiting = false;
let flushing = false;

// 将 watcher 放进 watcher 队列 queue 中
export function queueWatcher(watcher: Watcher) {
  const id = watcher.id;
  // 如果 watcher 已经存在，则会跳过，不会重复
  if (has[id] == null) {
    // 缓存 watcher id，主要用来判断 watcher 有没有重复入队
    has[id] = true;
    if (!flushing) {
      // 如果没有处于刷新队列状态，直接如队
      queue.push(watcher);
    } else {
      // 已经在刷新队列了
      // 从队列末尾开始倒序遍历，根据当前 watcher.id 找到它大于的 watcher.id 的位置，然后将自己插入到该位置之后的下一个位置
      // 即将当前 watcher 放入已排序的队列中，且队列仍是有序的
      let i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }
    // queue the flush
    if (!waiting) {
      waiting = true;

      if (process.env.NODE_ENV !== "production" && !config.async) {
        // 如果是同步执行，直接刷新调度队列
        // Vue 默认是异步执行，一般是不会同步执行，如果改为同步执行，性能将会受到很大影响
        flushSchedulerQueue();
        return;
      }
      // nextTick 函数，vm.$nextTick、Vue.nextTick
      //   1、接收一个回调函数 flushSchedulerQueue，并将 flushSchedulerQueue 放入 callbacks 数组
      //   2、通过 pending 控制向浏览器任务队列中添加 flushCallbacks 函数
      //   3、通过事件循环的微任务、宏任务实现异步更新
      nextTick(flushSchedulerQueue);
    }
  }
}
```

queueWatcher 主要的任务就是将 watcher 放进队列 queue 中，然后调用 nextTick，nextTick 接收参数 flushSchedulerQueue 用作回调函数；异步更新的主要逻辑是在 nextTick 中



#### 4-3-3、nextTick

> vue\src\core\util\next-tick.js

```js
const callbacks = [] // 用于存放回调函数数组
let pending = false

// cb：回调函数 flushSchedulerQueue
// ctx：上下文
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 将回调函数 cb（flushSchedulerQueue）放进 callbacks 数组中
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
  
  // 如果 pending 为 false，代表浏览器任务队列为空（即没有 flushCallbacks）
  // 如果 pending 为 true，代表浏览器任务队列存在任务
  // 在执行 flushCallbacks 的时候会再次将 pending 标记为 false
  // 也就是说，pending 在这里的作用就是：保证在同一时刻，浏览器的任务队列中只有一个 flushCallbacks 函数
  if (!pending) {
    pending = true

    // 执行 timerFunc 函数
    // timerFunc 函数的主要作用就是：通过微任务或者宏任务的方式往浏览器添加任务队列
    timerFunc()
  }

  //...
}
```



#### 4-3-4、timerFunc 与 flushCallbacks

看看 timerFunc 函数往浏览器添加任务的逻辑：

> vue\src\core\util\next-tick.js

```js
let timerFunc

if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 如果支持 Promise 则优先使用 Promise
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
  // 使用 MutationObserver
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
  // 使用 setImmediate，其实 setImmediate 已经算是宏任务了，但是性能会比 setTimeout 稍微好点
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // setTimeout 是最后的选择
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}
```

可以看到，timerFunc 的逻辑特别简单：主要就是将 flushCallbacks 放进浏览器的异步任务队列里面。知识中间通过降级的方式处理兼容问题，优先使用 Promise，其次是 MutationObserver，然后是 setImmediate，最后才是使用 setTimeout，也就是优先微任务处理，微任务不行逐步降级到宏任务处理



再看看 flushCallbacks：

> vue\src\core\util\next-tick.js

```js
// 作为 微任务 或者 宏任务 的回调函数
// 例如：setTimeout(flushCallbacks, 0)
function flushCallbacks () {
  // 1、将 pending 置为 false
  pending = false
  // 2、从 callbacks 中取出所有回调回调函数，slice(0)相当于复制一份
  const copies = callbacks.slice(0)
  // 3、将 callbacks 数组置空
  callbacks.length = 0
  // 4、遍历执行每一个回调函数 flushSchedulerQueue
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}
```



#### 4-3-5、最后回到 flushSchedulerQueue

> vue\src\core\observer\scheduler.js

```js
function flushSchedulerQueue() {
  currentFlushTimestamp = getNow();
  flushing = true; // 将 flushing 置为 true，代表正在刷新队列
  let watcher, id;

  // 刷新前先对队列进行排序，保证了：
  //  1、组件的更新顺序为从父级到子级，因为父组件总是在子组件之前被创建
  //  2、一个组件的用户 watcher 在其渲染 watcher 之前被执行，因为用户 watcher 先于渲染 watcher 创建
  //  3、如果一个组件在其父组件的 watcher 执行期间被销毁，则它的 watcher 可以被跳过
  queue.sort((a, b) => a.id - b.id);

  // 使用 queue.length，动态计算队列的长度，没有缓存长度
  // 是因为在执行现有 watcher 期间队列中可能会被 push 进新的 watcher
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    // 如果 watcher 中存在 before，执行 before 钩子
    // new Watcher(vm, updateComponent, noop, {
    //   before () {
    //     if (vm._isMounted && !vm._isDestroyed) {
    //       callHook(vm, 'beforeUpdate')
    //     }
    //   }
    // }, true /* isRenderWatcher */)
    if (watcher.before) {
      watcher.before();
    }
    id = watcher.id;
    has[id] = null;
    // 执行 watcher 的 run 去执行相应的更新函数进行页面更新
    // watcher.run 实际上也就是调用 updateComponent 进到页面挂载
    watcher.run();
      
    // ...
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice();
  const updatedQueue = queue.slice();

  // 重置，将 flushing 置为 false
  resetSchedulerState();

  // 触发 activated
  callActivatedHooks(activatedQueue);
  // 触发 update 生命周期
  callUpdatedHooks(updatedQueue);
}
```

其实，flushSchedulerQueue 的主要作用就是：将之前存进 queue 中的 watcher 拿出来执行 watcher.run



#### 4-3-6、watcher.run 与 watcher.get

> vue\src\core\observer\watcher.js

```js
class Watcher {
    constructor(
    	vm: Component,
        expOrFn: string | Function,
        cb: Function,
        options?: ?Object,
        isRenderWatcher?: boolean
    ) {
      // expOrFn:
      //  1、如果是渲染 watcher（处理 data），就是 new Watcher 传进来的 updateComponent
      //  2、如果是用户 watcher（处理 watch），就是 watch 的键 key（每一个 watch 的名字）
      // 将 expOrFn 赋值给 this.getter
      if (typeof expOrFn === "function") {
        // 如果 expOrFn 是一个函数，比如 渲染watcher 的情况
        this.getter = expOrFn;

      } else {/..../}
    }
    
    get() {
        // ...
        
      // 执行 this.getter
      // 上面已经分析过，this.getter 会根据不同的 watcher 会不一样
      //  1、渲染 watcher：this.getter 是 updateComponent 函数
      //  2、用户 watcher：this.getter 是经过 parsePath() 解析后返回的函数
      value = this.getter.call(vm, vm);
    }
    
    run() {
        // ...
        
        // 执行 watcher.get
        const value = this.get();
    }
}
```

可以知道，调用 watcher.run，watcher.run 又会调用 watcher.get，watcher.get 中,因为是渲染 watcher，会调用 updateComponent 进入页面挂载流程：生成虚拟 dom，patch 对比更新



#### 4-3-7、总结异步更新

异步更新：其实就是通过 Promise 或者 MutationObserver 或者 setImmediate 或者 setTimeout或者将更新操作放到异步任务队列里面，这也是 nextTick 的原理

在 Vue 中，进行数据操作的时候，Vue 并没有马上去更新 DOM 数据，而是将这个操作放进一个队列中，如果重复执行的话，队列还会进行去重操作；等待同一事件循环中的所有数据变化完成之后，会将队列中的事件拿出来处理。这样做主要是为了提升性能，因为如果在主线程中更新 DOM，循环 100 次就要更新 100 次 DOM；但是如果等事件循环完成之后更新 DOM，只需要更新 1 次。也就是说数据改变后触发的渲染 watcher 的 update 是在 nextTick 中的。



### 4-4、响应式对数组的处理

Object.defineProperty 只能检测到对象的属性变化, 对于数组的变化无法监听到，所以，在 vue2.x 中对七个数组的方法重写了，在保留原数组功能的前提下，对数组进行额外的操作处理。

回头来看看当 data[key] 是数组的处理方案：



#### 4-4-1、Observer 类中对数组的处理

在上面分析 Observer 类的时候知道，Observer 类对 data 的数据会分为两种情况，一种是非数组形式，一种是数组形式：

> vue\src\core\observer\index.js

```js
class Observer {
    constructor(value: any) {
    	this.value = value
        
        if (Array.isArray(value)) {
            // 如果是数组

            // 当支持 __proto__ 时，执行 protoAugment 会将当前数组的原型指向新的数组类 arrayMethods,
            // 如果不支持__proto__，则通过copyAugment代理设置，在访问数组方法时代理访问新数组 arrayMethods 中的数组方法
            // 通过上面两步，接下来在实例内部调用 push, unshift 等数组的方法时，会执行 arrayMethods 类的方法
            // 这也是数组进行依赖收集和派发更新的前提
            if (hasProto) { // export const hasProto = '__proto__' in {}
                // hasProto 用来判断当前环境下是否支持 __proto__ 属性
                // protoAugment 是通过原型指向的方式，将数组指定的七个方法指向 arrayMethods
                protoAugment(value, arrayMethods);
            } else {
                // copyAugment 通过数据代理的方式, 将数组指定的七个方法指向 arrayMethods
                copyAugment(value, arrayMethods, arrayKeys);
            }

            // 调用 this.observeArray 遍历数组，为数组的每一项设置观察，处理数组元素为对象的情况
            this.observeArray(value);
        }
    }

    // 遍历数组，对里面的的每一个元素进行观察
    observeArray(items: Array < any > ) {
        for (let i = 0, l = items.length; i < l; i++) {
            observe(items[i]);
        }
    }
}

// 通过更改原型指向的方式
function protoAugment(target, src: Object) {
  target.__proto__ = src;
}


// 通过 Object.defineProperty 代理的方式
function copyAugment(target: Object, src: Object, keys: Array < string > ) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}
```

> vue\src\core\util\lang.js

```js
export function def(obj: Object, key: string, val: any, enumerable ? : boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable, // 两个取反, 如果不传，那么就会是 !!undefined = false, 代表不可枚举
    writable: true,
    configurable: true
  })
}
```

可以看到，当 data[key] 是数组的时候：

- 判断数组是否存在 \_\_proto\_\_ 属性，如果存在，直接通过 protoAugment 更改数组的原型指向 arrayMethods
- 如果不支持 \_\_proto\_\_ 属性，那么通过 Object.defineProperty 代理的方式劫持数组，代理到 arrayMethods
- 最后，通过 Observer.observeArray 对数组的每一项进行响应式处理

上面对数组的两种处理方法，需要一个参数 arrayMethods，来看看 arrayMethods 这个是什么东西



#### 4-4-2、数组的重写

上面 arrayMethods 主要就是对能改变数组的其中方法进行了重写

> vue\src\core\observer\array.js

```
// 对数组的原型进行备份
const arrayProto = Array.prototype
// 通过继承的方式创建新的 arrayMethods
export const arrayMethods = Object.create(arrayProto)

// 当外部访问通过以下7种方法访问数组，会被处理
// 因为这7种方法会改变数组
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 对数组那七种方法进行拦截并执行 mutator 函数
methodsToPatch.forEach(function (method) {
  // cache original method
  // 缓冲原始数组的方法
  const original = arrayProto[method]
  // 利用 Object.defineProperty 对 arrayMethods 进行拦截
  def(arrayMethods, method, function mutator(...args) {
    // 先执行数组原生方法，保证了与原生数组方法的执行结果一致
    // 例如 push.apply()
    const result = original.apply(this, args)

    const ob = this.__ob__
    // 如果 method 是以下三个之一，说明是新插入了元素
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args // 比如：args 是 [{...}]
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 对插入的元素进行响应式处理
    if (inserted) ob.observeArray(inserted)

    // 通过 dep.notify 通知更新
    ob.dep.notify()
    return result
  })
})
```

- 对于新增的元素进行响应式处理
- 操作数组后通过 dep.notify 通知更新



#### 4-4-3、总结响应式对数组的处理

Object.defineProperty 只能劫持对象，对于数组，没办法进行劫持。vue 做的处理就是：对于能够改变数组的七种方法进行了重写，也就是说，当外部访问数组那那七种 ['push','pop','shift','unshift','splice','sort','reverse'] 方法时，进行劫持。里面会进行如下操作：

- 首先使用原生数组方法获取到结果
- 如果有新增元素，对新能元素进行响应式处理
- 最后无论新增还是删除还是对数组重新排序都会通过调用 dep.notify 通知更新



### 4-5、computed

![computed](/imgs/img4.png)



先来看看 computed 的使用方式：

- 函数形式

  ```js
  data: {
    price: 10
  },
  computed: {
    formatPrice() {
      return this.price.toFixed(2)
    }
  }
  ```

- 对象形式

  ```js
  data: {
    msg: 'hello',
    newMsg: ''
  },
  computed: {
    getFullName: {
      get() {
        return this.msg.split()
      },
      set(val) {
        this.newMsg = val;
      }
    }
  }
  ```



#### 4-5-1、computed 初始化

先来看看 computed 的初始化，依然是在 initState 中：

> vue\src\core\instance\state.js

```js
function initState (vm: Component) {
  // ...

  // 初始化 computed:
  //   遍历 computed 对象为每一个 computed 添加一个计算 watcher(计算 watcher 的标志是有一个 lazy)
  //   将每个 compulted 代理到 vm 上并转换为响应式
  //   compulted 中的键 key 不能和 data、props 重复
  if (opts.computed) initComputed(vm, opts.computed)
}
```



可以看到，初始化是在 initComputed 中：

> vue\src\core\instance\state.js

```js
// 定义 computed watcher 标志，lazy 属性为 true
const computedWatcherOptions = { lazy: true }

function initComputed(vm: Component, computed: Object) {
  // 定义一个 watchers 为空对象
  // 并且为 vm 实例上也定义 _computedWatchers 为空对象，用于存储 计算watcher
  // 这使得 watchers 和 vm._computedWatchers 指向同一个对象
  // 也就是说，修改 watchers 和 vm._computedWatchers 的任意一个都会对另外一个造成同样的影响
  const watchers = vm._computedWatchers = Object.create(null)

  // 遍历 computed 中的每一个属性值，为每一个属性值实例化一个计算 watcher
  for (const key in computed) {
    // 获取 key 的值，也就是每一个 computed
    const userDef = computed[key]

    // 用于传给 new Watcher 作为第二个参数
    // computed 可以是函数形式，也可以是对象形式，对象形式的 getter 函数是里面的 get
    // computed: { getName(){} } | computed: { getPrice: { get(){}, set() {} } }
    const getter = typeof userDef === 'function' ? userDef : userDef.get

    if (!isSSR) {
      // 为每一个 computed 添加上 计算watcher；lazy 为 true 的 watcher 代表 计算watcher
      // 在 new watcher 里面会执行 this.dirty = this.lazy; 所以刚开始 dirty 就是 true
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions  // const computedWatcherOptions = { lazy: true }
      )
    }

    // 将 computed 属性代理到 vm 上，使得可以直接 vm.xxx 的方式访问 computed 的属性
    defineComputed(vm, key, userDef)
  }
}
```

initComputed 做的事：

1. 定义 watchers 及 vm._computedWatchers 指向同一个对象，用于存储 `计算watcher`
2. 遍历 computed 的属性，new Watcher 为每一个属性添加上一个 `计算watcher`，`计算watcher` 的标记就是 lazy = true
3. 调用 defineComputed 将 computed 属性代理到 vm 上



接下来先看看 defineComputed

> vue\src\core\instance\state.js

```js
const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  // shouldCache 用来判断是客户还是服务端渲染，客户端需要缓存
  const shouldCache = !isServerRendering()
  
  // 如果是客户端，使用 createComputedGetter 创建 getter
  // 如果是服务端，使用 createGetterInvoker 创建 getter
  // 两者有很大的不同，服务端渲染不会对计算属性缓存，而是直接求值
  if (typeof userDef === 'function') {
    // computed 是函数形式
    sharedPropertyDefinition.get = shouldCache ?
      createComputedGetter(key) :
      createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 如果 computed 是对象形式
    sharedPropertyDefinition.get = userDef.get ?
      shouldCache && userDef.cache !== false ?
      createComputedGetter(key) :
      createGetterInvoker(userDef.get) :
      noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
      
  // 拦截对 computed 的 key 访问，代理到 vm 上
  Object.defineProperty(target, key, sharedPropertyDefinition)
}
```

defineComputed主要做的事：将 computed 代理到 vm 实例上，并且定义了客户端与服务端拦截对 computed 的 key 访问的 getter 函数，客户端使用 createComputedGetter 创建 getter 函数，会针对 computed 进行缓存；而服务端使用 createGetterInvoker 创建 getter 函数，不会针对 computed 进行缓存，而是直接求值。

缓存的意义在于，只有在相关响应式数据发生变化时，computed 才会重新求值，其余情况多次访问计算属性的值都会返回之前计算的结果。



#### 4-5-2、computed 的依赖收集以及缓存原理

接下来，看看 computed 的依赖收集过程。先回到为每一个 computed 创建 `计算watcher` 的时候

> vue\src\core\instance\state.js

```js
// 定义 computed watcher 标志，lazy 属性为 true
const computedWatcherOptions = { lazy: true }

function initComputed(vm: Component, computed: Object) {
  // 并且为 vm 实例上也定义 _computedWatchers 为空对象，用于存储 计算watcher
  // 这使得 watchers 和 vm._computedWatchers 指向同一个对象
  // 也就是说，修改 watchers 和 vm._computedWatchers 的任意一个都会对另外一个造成同样的影响
  const watchers = vm._computedWatchers = Object.create(null)
  
  // 遍历 computed 中的每一个属性值，为每一个属性值实例化一个计算 watcher
  for (const key in computed) {
    // 用于传给 new Watcher 作为第二个参数
    // computed 可以是函数形式，也可以是对象形式，对象形式的 getter 函数是里面的 get
    // computed: { getName(){} } | computed: { getPrice: { get(){}, set() {} } }
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    
    // 为每一个 computed 添加上 计算watcher；lazy 为 true 的 watcher 代表 计算watcher
    // 在 new watcher 里面会执行 this.dirty = this.lazy; 所以刚开始 dirty 就是 true
    watchers[key] = new Watcher(
      vm,
      getter || noop,
      noop,
      computedWatcherOptions  // const computedWatcherOptions = { lazy: true }
    )
  }
}
```

`计算watcher` 的四个参数：

- vm：vm 实例
- getter：就是 computed 的 getter 函数
- noop：空函数
- computedWatcherOptions：{ lazy: true }，lazy=true 标记这个为 `计算watcher`



接下来，看看 new Watcher 对 `计算watcher` 的处理

> vue\src\core\instance\state.js

```js
class Watcher {
  constructor() {
    // ...
      
    // 创建 计算watcher 实例的时候，先把 this.dirty 置为 true
    // 这个 dirty 就是 computed 缓存的关键，dirty=true，代表需要重新计算
    this.dirty = this.lazy; // for lazy watchers
      
    // ...
      
    // expOrFn: 主要看 new Watcher 的时候传进来什么，不同场景会有区别
    //  1、如果是渲染 watcher（处理 data），就是 new Watcher 传进来的 updateComponent
    //  2、如果是用户 watcher（处理 watch），就是 watch:{ msg: function() {} }】 的 msg 函数
    //  3、如果是计算 watcher（处理 computed），就是【computed:{ getName: function() {} }】中的 getName 函数
    // 将 expOrFn 赋值给 this.getter
    if (typeof expOrFn === "function") {
      // 如果 expOrFn 是一个函数，比如 渲染watcher 的情况，是 updateComponent 函数
      this.getter = expOrFn;
    } else {/.../}
      
    // 如果是 lazy 代表的是 computed
    // 不是 computed，执行 this.get()
    this.value = this.lazy ? undefined : this.get();
  }
}
```

实例化 `计算watcher` 的时候：

- 把 this.dirty 置为 true。这个 dirty 就是 computed 缓存的关键，dirty=true，代表有脏数据，需要重新计算
- 将 computed 的 getter 函数赋值给 watcher.getter
- 当前为 `计算watcher`，**this.lazy=true，不会执行 watcher.get()**



然后，回头看看创建 computed 的 getter 的函数，这里主要分析客户端的，在 defineComputed 函数中调用 createComputedGetter 创建

> vue\src\core\instance\state.js

```js
// 用于创建客户端的 conputed 的 getter
// 由于 computed 被代理了，所以当访问到 computed 的时候，会触发这个 getter
function createComputedGetter(key) {
  // 返回一个函数 computedGetter 作为 computed 的 getter 函数
  return function computedGetter() {
    // 每次读取到 computer 触发 getter 时都先获取 key 对应的 watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]

    if (watcher) {
      // dirty 是标志是否已经执行过计算结果；dirty=true，代表有脏数据，需要重新计算
      // dirty 初始值是 true（在 new Watcher 时确定），所以 computed 首次会进行计算，与 watch 略有差别
      // 如果执行过并且依赖数据没有变化则不会执行 watcher.evaluate 重复计算，这也是缓存的原理
      // 在 watcher.evaluate 中，会先调用 watcher.get 进行求值，然后将 dirty 置为 false
      // 在 watcher.get 进行求值的时候，访问到 data 的依赖数据，触发 data 数据的 get，收集 计算watcher
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        // 进行依赖收集
        // 注意，这里收集的是 渲染watcer，而不是 计算watcher
        watcher.depend()
      }

      // 返回结果
      return watcher.value
    }
  }
}
```

createComputedGetter 实际上就是返回一个函数 computedGetter，这个函数就是 computed 的 getter 函数。之前对 computed 的每一个属性进行了代理，当访问到某一个 computed 的时候，触发 getter 函数。

在首次渲染的时候，页面渲染会将 `render Watcher`入栈，并挂载到 `Dep.target`，渲染过程中访问到 template 中的 computed，会对其进行一次取值，调用 watcher.evaluate() 执行 watcher.get 进行求值，并且将 dirty 标记为 false，代表已经求过值。



> vue\src\core\observer\watcher.js

```js
class Watcher {
  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
      // expOrFn: 主要看 new Watcher 的时候传进来什么，不同场景会有区别
      //  3、如果是计算 watcher（处理 computed），就是【computed:{ getName: function() {} }】中的 getName 函数
      // 将 expOrFn 赋值给 this.getter
      if (typeof expOrFn === "function") {
        // 如果 expOrFn 是一个函数，比如 渲染watcher 的情况，是 updateComponent 函数
        this.getter = expOrFn;
      }
    }

    get() {
      // 将 watcher 添加到 Dep.target
      pushTarget(this);
      
      try {
        //  3、如果是计算 watcher（处理 computed），就是【computed:{ getName: function() {} }】中的 getName 函数
        value = this.getter.call(vm, vm);
      } catch(e) {
        // ...
      } finally {
        // ...
        popTarget();
        this.cleanupDeps();
      }
    }

    // 主要是 computed 的
    evaluate() {
      this.value = this.get();
      // computed 标记为已经执行过更新
      this.dirty = false;
    }
}
```

> vue\src\core\observer\dep.js

```js
Dep.target = null
const targetStack = [] // 存储 watcher 的栈

// 开放出去的方法，主要用来往 Dep 类上添加 target（也就是 watcher）
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  // 删除 targetStack 最后一个 watcher
  targetStack.pop()
  // 如果 targetStack=[]，那么 targetStack[targetStack.length - 1] 的结果是 undefined
  Dep.target = targetStack[targetStack.length - 1]
}
```

1. 在页面**首次渲染**的时候，会 new Watcher，这个是 `渲染watcher`，并执行 watcher.get，将`渲染watcher` 放进 `targetStack栈` 中

2. 然后遇到 computed 属性，触发 getter 劫持，执行 `watcher.evaluate` ，在 `watcher.evaluate` 里面调用 `watcher.get` 进行求值，求值完之后将 dirty 置为 false，代表已经求取过值

3. `watcher.get` 中会调用 pushTarget 将 `计算watcher` 推入 `targetStack栈` 中，并且将 Dep.target 设置为 `计算watcher`。那么此时的 `targetStack栈` 就有两个 watcher：[渲染wacher, 计算watcher]

4. 然后 `watcher.get` 中继续执行 `this.getter.call(vm, vm)`，这个实际上就是执行对应的某个 computed，里面访问到依赖的 data 的某个属性，触发 data 属性的 get，执行 dep.depend() 进行依赖收集，因为之前已经将 Dep.target 设置为 `计算watcher`，所以这里收集的就是 `计算watcher`，也就是说，此时 data 属性的 subs 中会收集 [计算watcher]

5. 完了之后继续执行 `watcher.get` 的 popTarget，这个 popTarget 会将 `targetStack栈` 最后一个 watcher 删除，之前 `targetStack栈` 为 [渲染wacher, 计算watcher]，那么现在就只剩下 [渲染watcher]，并且对 Dep.target 重新赋值

   ```js
   Dep.target = targetStack[targetStack.length - 1]
   ```

   这里的意思就是将 Dep.target 置为 `渲染watcher`

6. 然后，继续回到 computed 的 getter 劫持函数，执行：

   ```js
   // vue\src\core\instance\state.js
   if (Dep.target) {
     watcher.depend();
   }
   
   
   // vue\src\core\observer\watcher.js
   depend() {
     let i = this.deps.length;
     while (i--) {
       this.deps[i].depend();
     }
   }
   ```

   上面已经把 Dep.target 置为 `渲染watcher`，那么此处调用 watcher.depend 收集的就是 `渲染watcher`，那么此时 data 属性的 subs 就有两个 watcher，分别为 [计算watcher, 渲染 watcher]

以上，就是 computed 的依赖收集过程。computed 的依赖实际上是被收集进 data 响应式属性中。



**问题：为什么 computed 的依赖收集需要收集 `渲染watcher`？**

> 第一种情况

```js
<template>
  <div>
    <p>{{ msg }}</p>
    <p>{{ getNewMsg }}</p>
  </div>
</template>

export default {
  data(){
    return {
      msg: 'hello'
    }
  },
  computed:{
    getNewMsg(){
      return this.msg + ' world'      
    }
  }
}
```

这种情况，模板 template 中 data 属性和 computed 都有使用到，那么在页面渲染对 data 属性取值时，存储了`渲染Watcher`，所以再执行 `watcher.depend` 会重复收集 `渲染watcher`，但  `watcher` 内部会通过 new Set() 去重



> 第一种情况

```js
<template>
  <div>
    <p>{{ getNewMsg }}</p>
  </div>
</template>

export default {
  data(){
    return {
      msg: 'hello'
    }
  },
  computed:{
    getNewMsg(){
      return this.msg + ' world'      
    }
  }
}
```

这种情况，模板 template 中只使用了 computed，没有使用到 data 属性。那么此时，在页面渲染的时候，就不会访问 data 的属性，那么没有收集 `渲染watcher`，data 属性里只会有 `计算Watcher`，当 data 属性被修改，只会触发 `计算Watcher` 的 `update`。而 `计算watcher` 的 `update` 里仅仅是将 `dirty` 置为 true，并没有求值，那么就不会进行页面更新。

所以需要收集 `渲染Watcher`，在执行完 `计算Watcher` 后，再执行 `渲染Watcher`。页面渲染对计算属性取值，执行 `watcher.evaluate` 才会重新计算求值，页面计算属性更新。



#### 4-5-3、computed 的派发更新

派发更新的前提是计算属性依赖的 data 数据发生改变，当计算属性依赖的 data 数据发生更新时：
- 触发 data 数据的 set，set 中执行 `dep.notify` 通知更新

  ```js
  function defineReactive() {
    Object.defineProperty(obj, key, {
      get: function reactiveGetter() {},
      set: function reactiveSetter(newVal) {
        // 通知更新
        dep.notify()
      }
    }
  }
  ```

- `dep.notify` 主要就是将存储的每个watcher 拿出来，执行 watcher.update

  ```js
  class Dep {
    // ...
  
    notify () {
      // ...
      for (let i = 0, l = subs.length; i < l; i++) {
        subs[i].update()
      }
    }
  }
  ```

- 上面说过，收集的依赖有两个 watcher，分别 [计算watcher, 渲染watcher]

  - 那么先执行 `计算watcher` 的 update，这一步会将 dirty 置为 true，代表有脏数据，需要重新计算
  - 然后执行 `渲染watcher` 的 update，这一步会执行更新函数，然后进行页面重新渲染，当页面渲染对计算属性取值时，触发 computed 的读取拦截，执行 `watcher.evaluate` 重新计算。最后将新结果渲染到页面。

  ```js
  class Watcher {
    // ...
  
    update() {
      /* istanbul ignore else */
      // lazy 为 true 代表是 computed
      if (this.lazy) {
        // 如果是 计算watcher，则将 dirty 置为 true
        // 当页面渲染对计算属性取值时，触发 computed 的读取拦截 computedGetter 函数
        // 然后执行 watcher.evaluate 重新计算取值
        this.dirty = true;
      } else if (this.sync) {
        // 是否是同步 watcher
        // 同步执行，在使用 vm.$watch 或者 watch 选项时可以传一个 sync 选项，
        // 当为 true 时在数据更新时该 watcher 就不走异步更新队列，直接执行 this.run 方法进行更新
        this.run();
      } else {
        // 把需要更新的 watcher 往一个队列里面推
        // 更新时一般都进到这里
        queueWatcher(this);
      }
    }
  }
  ```



### 4-6、watch

![watch](/imgs/img5.png)



先看看使用 watch 的方法：

- 字符串形式

  ```js
  data: {
    userName: ''
  },
  methods: {
      userNameChange() {}
  },
  watch: {
      userName: 'userNameChange'
  }
  ```

- 函数形式

  ```js
  data: {
    a: ''
  },
  watch: {
    a() {}
  }
  ```

- 对象形式

  ```js
  data: {
    a: ''
  },
  watch: {
    a: {
      handler(newName, oldName) {
         console.log('obj.a changed');
      },
      immediate: true, // 立即执行一次 handler
      deep: true
    }
  }
  ```

- 数组形式

  ```js
  data: {
    info: {
      size: ''
    }
  },
  watch: {
    'info.size': [
      'handler',
      handle2 () {},
      {
        handler: function handle3 () {},
      }
    ],  
  },
  methods: {
    handler () {}
  }
  ```

- 直接 this.$watch

  ```js
  data: {
    msg: ''
  },
  
  this.$watch('msg', () => {})
  ```



#### 4-6-1、初始化 watch

> vue\src\core\instance\state.js

```js
function initState (vm: Component) {
    // ...
    
    // 初始化 wathcer:
    //   遍历 watch 对象，为每个 watch 添加一个 user watch 
    if (opts.watch && opts.watch !== nativeWatch) {
        initWatch(vm, opts.watch)
    }
}
```

主要就是调用 initWatch 去初始化 watch

> vue\src\core\instance\state.js

```js
function initWatch(vm: Component, watch: Object) {
  // 遍历 watch 对象
  for (const key in watch) {
    // 获取 handler = watch[key]
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
```

initWatch 主要就是遍历 watch 对象，得到每一个 watch，然后调用 createWatcher。这里会处理数组形式的 watch 使用



#### 4-6-2、watch 的依赖收集

看看 createWatcher 函数：

> vue\src\core\instance\state.js

```
function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options ? : Object
) {
  // 如果 handler(watch[key]) 是一个对象，那么获取其中的 handler 方法
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
    // 如果是对象，那么 options 就是 watch[key]
    options = handler
    // handler 是 watch[key].handler
    handler = handler.handler
  }

  // watch 也可以是字符串形式
  // methods: {
  //   userNameChange() {}
  // },
  // watch: {
  //   userName: 'userNameChange'
  // }
  // 如果 handler(watch[key]) 是字符串类型
  if (typeof handler === 'string') {
    // 找到 vm 实例上的 handler
    handler = vm[handler]
  }

  // handler(watch[key]) 不是对象也不是字符串，那么不需要处理 handler，直接执行 vm.$watch
  // 例如：watch: { a(newName, oldName) {} }
  /**
   * expOrFn: 就是每一个 watch 的名字(key 值)
   * handler: watch[key]
   * options: 如果是对象形式，options 有值，不是，可能是 undefined
   */
  return vm.$watch(expOrFn, handler, options)
}
```

对一下几种 watch 使用方法做兼容处理：

- 对象形式

- 字符串形式

- 函数形式（不用处理）


无论是哪种形式，最后都是调用了 vm.$watch



下面来看看 vm.$watch，在 stateMixin 方法上被定义

> vue\src\core\instance\state.js

```
export function stateMixin(Vue: Class < Component > ) {
  // ...

  /**
   * expOrFn: key，也就是 watch 名字
   * cb: handler 回调函数
   * options: 配置项，当 watch 是对象时，或者直接调用 $watch 都可能存在，其他情况可能是 undefined
   */
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options ? : Object
  ): Function {
    const vm: Component = this

    // 先判断一下 handler 回调函数会不会是对象，是对象，继续调用 createWatcher 处理
    // 这里是因为有这种情况：this.$watch('msg', { handler: () => {} })
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }

    // 如果 options 是 undefined，将 options 赋值为空对象 {}
    options = options || {}

    // options.user 这个是用户定义 watcher 的标志
    options.user = true

    // 创建一个user watcher
    // 在实例化 user watcher 的时候会执行一次 getter 求值，这时，user watcher 会作为依赖被数据所收集
    const watcher = new Watcher(vm, expOrFn, cb, options)

    // 如果有 immediate，立即执行回调函数 handler
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }

    // 返回 unwatch 函数，用于取消 watch 监听
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}
```

vm.$watch 主要做的事：

1. 先判断一下 handler 回调函数会不会是对象，是对象，继续调用 createWatcher 处理
2. 处理 options（如果 options 是 undefined，将 options 赋值为空对象 {}）
3. options.user 设置为 true，标记当前为 `用户watcher`，也就是标记这个是 watch 响应式
4. new Watcher 创建一个 `user watcher`
   - 在实例化 `user watcher` 的时候会执行一次 getter 求值，这时，`user watcher` 会作为依赖被数据所收集
5. 如果有 immediate，立即执行回调函数 handler
6. 返回 unwatch 函数，用于取消 watch 监听



最后回顾一下 Watcher 实例化所做的事：

> vue\src\core\observer\watcher.js

```
export default class Watcher {
  constructor() {
    // ...

    // expOrFn: 主要看 new Watcher 的时候传进来什么，不同场景会有区别
    //  1、如果是渲染 watcher（处理 data），就是 new Watcher 传进来的 updateComponent
    //  2、如果是用户 watcher（处理 watch），就是 watch 的键 key（每一个 watch 的名字）
    //  3、如果是计算 watcher（处理 computed），就是 computed 的 getter 函数
    // 将 expOrFn 赋值给 this.getter
    if (typeof expOrFn === "function") {
      // 如果 expOrFn 是一个函数，比如 渲染watcher 的情况，是 updateComponent 函数
      this.getter = expOrFn;
    } else {
      // 不是函数，比如 用户watcher 的情况，是 watch 的 key
      this.getter = parsePath(expOrFn);
    }
    
    // 如果是 lazy 代表的是 computed
    // 不是 computed，执行 this.get()
    this.value = this.lazy ? undefined : this.get();
  }

  get() {
    // 将 user watcher 添加到 Dep.target
    pushTarget(this);
    
    // 执行 this.getter
    // 上面已经分析过，this.getter 会根据不同的 watcher 会不一样
    // 这里是用户 watcher：this.getter 是经过 parsePath() 解析后返回的函数
    value = this.getter.call(vm, vm);
  }
}
```

new Watcher 的时候，会执行：

- constructor：这里面主要就是定义了 this.getter 是什么；因为是 `用户watcher`，在 new Watcher 的时候，expOrFn 传进来的是 watch 的 key，所以使用了 parsePath(expOrFn) 方法解析得到 this.getter
- Watcher.get：pushTarget(this) 将 `user watcher` 添加到 Dep.target；执行在 constructor 中定义的 this.getter



看完 new Watcher 很迷惑，没发现什么时候进行了依赖收集呀？其实是有的，答案就在   parsePath(expOrFn) 中：

> vue\src\core\util\lang.js

```js
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)
export function parsePath(path: string): any {
  if (bailRE.test(path)) {
    return
  }
  // 这里为什么要用 path.split('.') 呢？
  // data() {
  //   return {
  //     msg: '',
  //     info: { size: '' }
  //   }
  // }
  // watch: {
  //   msg() {},
  //   'info.size'() {}
  // }
  // 如果是 msg，那么 'msg'.split('.') 返回 ['msg']
  // 如果是 info.size，那么 'info.size'.split('.') 返回 ['info', 'size']
  const segments = path.split('.')

  // 在调用的时候，传入的是 obj 是 vm
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      // 如果是 ['msg']，那么这里就是 obj = vm[[msg][0]]
      // 这就相当于访问了 data 的 msg，那么就会触发 data 的 getter 进行依赖收集

      // 如果是 ['info', 'size'], 那么就分两次
      //  1、obj = vm[['info', 'size'][0]]，得到 obj = vm['info']，相当于访问了 data 的 info
      //  2、obj = vm['info'][['info', 'size'][1]]，相当于访问了 info['size']
      // 上面一次访问 data 的 info 以及第二次访问的 info.size 都会触发 data 的 getter 进行依赖收集

      // 并且，收集的依赖是 user watcher，区别于 渲染watcher
      obj = obj[segments[i]]
    }
    // 将 info['size'] 返回
    return obj
  }
}
```

实际上，watch 的依赖收集还是通过访问 data 中相关的数据触发 getter 进行依赖收集，只是这时收集的是 `user watcher`



#### 4-6-3、watch 的派发更新

经过上面的依赖收集可以知道，其实每一个 data 的数据身上至少会有两个 watcher，['user watcher',  'render watcher', ...]，这里 user watcher 的是会在 render watcher 前面的，因为 render watcher 是在 $mount 进行挂载的时候才 new Watcher 创建，而 user watcher 是在 initState 期间就会创建，initState 先于 $mount 执行

```js
function initMixin (Vue: Class<Component>) {
    // ...
    
    initState(vm)
    
    // ...
    
    if (vm.$options.el) {
      // 调用 $mount 方法，进入挂载阶段
      vm.$mount(vm.$options.el)
    }
}
```



执行 user watcher 实际就是执行 Watcher.run 方法:

```js
export default class Watcher {
  constructor(
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    // ...
  }
    
  get() {
    // ...
    value = this.getter.call(vm, vm);
    return value
  }
    
  run() {
    // 首先就执行 watcher.get，watcher.get 中执行 this.getter 得到 value
    const value = this.get();
      
    if (this.user) {
      // 执行 handler 回调
      this.cb.call(this.vm, value, oldValue);

    }else {/.../}
  }
}
```

对于 `user watcher` 的 Watcher.run，主要是：

- 先调用 watcher.get，watcher.get 中执行 this.getter 得到新的 value
- this.cb.call(this.vm, value, oldValue)，这个 this.cb 对于 user watcher 来说就是每一个 watch 的 handler，在 new Watcher 的时候传入



watch 派发更新的过程:  data 数据发生改变时，触发 setter 拦截，将收集到的 watcher 遍历出来，逐个执行，最后执行 render watcher，调用更新函数 updateComponent 进行视图更新



## 5、Vue 的组件化

-   1.加载渲染过程：父 beforeCreate -> 父 created -> 父 beforeMount -> 子 beforeCreate -> 子 created -> 子 beforeMount -> 子 mounted -> 父 mounted
-   2.子组件更新过程：父 beforeUpdate -> 子 beforeUpdate -> 子 updated -> 父 updated
-   3.父组件更新过程：父 beforeUpdate -> 父 updated
-   4.销毁过程：父 beforeDestroy -> 子 beforeDestroy -> 子 destroyed -> 父 destroyed

当父在创建真实节点的过程中，遇到组件会进行组件的初始化和实例化，实例化会执行挂载 \$mount 的过程，这又到了组件的 vm.\_render 和 vm.\_update 过程

-   1.从根实例入手进行实例的挂载，如果有手写的 render 函数，则直接进入 \$mount 挂载流程
-   2.只有 template 模板则需要对模板进行解析，这里分为两个阶段，一个是将模板解析为 AST 树，另一个是根据不同平台生成执行代码，例如 render 函数
-   3.\$mount 流程也分为两步，第一步是将 render 函数生成 Vnode 树，子组件会以 vue-componet- 为 tag 标记，另一步是把 Vnode 渲染成真正的 DOM 节点
-   4.创建真实节点过程中，如果遇到子的占位符组件会进行子组件的实例化过程，这个过程又将回到流程的第一步

首先在 this.\_init 中调用 initRender 初始化，然后 initRender 中 createElement, 在 createElement 中发现是组件, 那么 createComponent



### 5-1、组件的 VNode (create-element.js、create-component.js、vnode.js、extend.js)

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



### 5-2、组件的 patch 过程 (patch.js、create-component.js、init.js)

**组件 patch 的整体流程(组件 VNode 渲染成真实 Dom)**

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



### 5-3、组件的生命周期

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



### 5-4、组件的注册

#### 5-4-1、全局注册：全局注册组件就是 Vue 实例化前创建一个基于 Vue 的子类构造器，并将组件的信息加载到实例 options.components 对象中

```
// 全局注册组件的方式
Vue.component('my-test', {
    template: '<div>{{test}}</div>',
    data () {
        return {
            test: 1212
        }
    }
})

// 在全局 api 的 assets.js

var ASSET_TYPES = [
    'component',
    'directive',
    'filter'
]

// 组件的注册(全局注册： Vue.component)
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



#### 5-4-2、局部注册: 在 createElement 中, 发现是组件标签，就调用 createComponent

**局部注册和全局注册区别**

-   1.局部注册添加的对象配置是在某个组件下，而全局注册添加的子组件是在根实例下
-   2.局部注册添加的是一个子组件的配置对象，而全局注册添加的是一个子类构造器

因此局部注册中缺少了一步构建子类构造器的过程，这个过程放在 createComponent 中, 源码中根据选项是对象还是函数来区分局部和全局注册组件，如果选项的值是对象，则该组件是局部注册的组件，此时在创建子 Vnode 时会调用 父类的 extend 方法去创建一个子类构造器

```
// create-element.js

function createComponent (...) {
  ...
  var baseCtor = context.$options._base;

  // 针对局部组件注册场景
  if (isObject(Ctor)) {
      Ctor = baseCtor.extend(Ctor);
  }
}
```



### 5-5、Vue 异步组件

-   总的来说，异步组件的实现通常是 2 次渲染，先渲染成注释节点，组件加载成功后再通过 forceRender 重新渲染，这是异步组件的核心所在。

-   当在 createComponent 中发现是异步组件, 调用 resolveAsyncComponent, 这个是异步组件的核心



#### 5-5-1、工厂函数

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



#### 5-5-2、Promise

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



#### 5-5-3、高级异步组件

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



## 6、全局 API

全局 api 初始化入口：

> vue\src\core\global-api\index.js

```js
// Vue.js 在整个初始化过程中，除了给它的原型 prototype 上扩展方法
// 还会给 Vue 这个对象本身扩展全局的静态方法：
//   默认配置：Vue.config
//   一些工具方法：Vue.util.warn、Vue.util.extend、Vue.util.mergeOptions、Vue.util.defineReactive
//   Vue.set、Vue.delete、Vue.nextTick
//   响应式方法：Vue.observable
//   Vue.options.components、Vue.options.directives、Vue.options.filters、Vue.options._base
//   Vue.use、Vue.extend、Vue.mixin、Vue.component、Vue.directive、Vue.filter
export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }

  // Vue.config
  Object.defineProperty(Vue, 'config', configDef)

  // 一些工具方法
  // 轻易不要使用这些工具方法，除非你很清楚这些工具方法，以及知道使用的风险
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  // 响应式方法
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // 主要将是 components、directives、filters 挂载到 Vue.options
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // 将 Vue 构造函数挂载到 Vue.options._base 上
  Vue.options._base = Vue

  // 给 Vue.options.components 添加内置组件，例如 keep-alive
  extend(Vue.options.components, builtInComponents)

  initUse(Vue)              // Vue.use
  initMixin(Vue)            // Vue.mixin
  initExtend(Vue)           // Vue.extend
  initAssetRegisters(Vue)   //  component、directive、filter 挂载到 Vue
}
```



### 6-1、vue.set

从上面的初始化可以看出：

```js
import { set, del } from '../observer/index'

function initGlobalAPI (Vue: GlobalAPI) {
  // ...
    
 Vue.set = set 
}
```



那么来看看这个 set 函数：

> vue\src\core\observer\index.js

```js
// 通过 Vue.set 或 vm.$set 设置 target[key] = val
function set(target: Array < any > | Object, key: any, val: any): any {
  // ...

  // 如果 target 是数组，利用数组的 splice 变异方法触发响应式
  // Vue.set([1,2,3], 1, 5)
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 修改数组的长度, 避免数组索引 key 大于数组长度导致 splcie() 执行有误
    target.length = Math.max(target.length, key);

    target.splice(key, 1, val);
    return val;
  }

  // 如果 key 已经存在 target 中，更新 target[key] 的值为 val
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }

  // 读取一下 target.__ob__，这个主要用来判断 target 是否是响应式对象
  const ob = (target: any).__ob__;
  
  // 需要操作的目标对象不能是 Vue 实例或 Vue 实例的根数据对象
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid adding reactive properties to a Vue instance or its root $data " +
        "at runtime - declare it upfront in the data option."
      );
    return val;
  }

  // 当 target 不是响应式对象，并且对象本身不存在这个新属性 key
  // 新属性会被设置，但是不会做响应式处理
  if (!ob) {
    target[key] = val;
    return val;
  }

  // target 是响应式对象，并且对象本身不存在这个新属性 key
  // 给对象定义新属性，通过 defineReactive 方法将新属性设置为响应式
  // ob.dep.notify 通知更新
  defineReactive(ob.value, key, val);
  ob.dep.notify();
  return val;
}
```

**vue.set 原理：**

-   如果目标是数组，直接使用数组的变异方法 splice 触发相应式；
-   如果目标是对象：
    - 如果 key 本就存在 target 中，直接 target[key]=val 更新值
    - 如果 target 不是响应式对象，并且对象本身不存在这个新属性 key，新属性会被设置，但是不会做响应式处理
    - 如果 target 是响应式对象，并且对象本身不存在这个新属性 key，给对象定义新属性，通过 defineReactive 方法将新属性设置为响应式；最后通过 dep.notify 通知更新



### 6-2、Vue.delete

先看初始化：

```js
import { set, del } from '../observer/index'

function initGlobalAPI (Vue: GlobalAPI) {
  // ...
    
 Vue.delete = del
}
```



然后看这个 del 函数：

> vue\src\core\global-api\index.js

```js
// 通过 Vue.delete 或 vm.$delete 将 target 的 key 属性删除
function del(target: Array < any > | Object, key: any) {
  // ...

  // 如果 target 是数组，通过数组的变异方法 splice 删除对应对应的 key 项，并且触发响应式更新
  // Vue.delete([1,2,3], 1)
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }

  // 读取一下 target.__ob__，这个主要用来判断 target 是否是响应式对象
  const ob = (target: any).__ob__;

  // 需要操作的目标对象不能是 Vue 实例或 Vue 实例的根数据对象
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid deleting properties on a Vue instance or its root $data " +
        "- just set it to null."
      );
    return;
  }

  // 如果 target 上不存在 key 属性，直接结束
  if (!hasOwn(target, key)) {
    return;
  }

  // 直接通过 delete 删除对象的 key 项
  delete target[key];
  // target 不是响应式，不需要通知更新
  if (!ob) {
    return;
  }
  // target 是响应式对象，通知更新
  ob.dep.notify();
}
```

**Vue.delete 原理：**

- target 是数组，通过数组的变异方法 splice 删除对应对应的 key 项，并且触发响应式更新
- target 是对象：
  - 如果 target 上不存在 key 属性，直接结束
  - 如果 target 上存在 key 属性，直接通过 delete 删除对象的 key 项；target 是响应式对象，ob.dep.notify 通知更新，不是响应式对象，不做通知



### 6-3、Vue.nextTick

先看初始化：

```js
import { set, del } from '../observer/index'

function initGlobalAPI (Vue: GlobalAPI) {
  // ...
    
 Vue.nextTick = nextTick
}
```



在看看 nextTick 函数：

```js
const callbacks = [] // 用于存放回调函数数组
let pending = false

// 作为 微任务 或者 宏任务 的回调函数
// 例如：setTimeout(flushCallbacks, 0)
function flushCallbacks () {
  pending = false
  // 从 callbacks 中取出所有回调回调函数，slice(0)相当于复制一份
  const copies = callbacks.slice(0)
  // 将 callbacks 数组置空
  callbacks.length = 0
  // 遍历执行每一个回调函数 flushSchedulerQueue
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// timerFunc 的逻辑特别简单：
//  主要就是将 flushCallbacks 放进浏览器的异步任务队列里面。
//  中间通过降级的方式处理兼容问题，优先使用 Promise，其次是 MutationObserver，然后是 setImmediate，最后才是使用 setTimeout
//  也就是优先微任务处理，微任务不行逐步降级到宏任务处理
let timerFunc

if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 如果支持 Promise 则优先使用 Promise
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // 使用 MutationObserver
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
  // 使用 setImmediate，其实 setImmediate 已经算是宏任务了，但是性能会比 setTimeout 稍微好点
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // setTimeout 是最后的选择
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// cb：回调函数 flushSchedulerQueue
// ctx：上下文
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 将回调函数 cb（flushSchedulerQueue）放进 callbacks 数组中
  // 如果是直接通过 Vue.nextTick 或者 vm.$nextTick 调用，cb 就是调用时传的 callback
  //   this.$nextTick(() => {})
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
  
  // 如果 pending 为 false，代表浏览器任务队列为空（即没有 flushCallbacks）
  // 如果 pending 为 true，代表浏览器任务队列存在任务
  // 在执行 flushCallbacks 的时候会再次将 pending 标记为 false
  // 也就是说，pending 在这里的作用就是：保证在同一时刻，浏览器的任务队列中只有一个 flushCallbacks 函数
  if (!pending) {
    pending = true

    // 执行 timerFunc 函数
    // timerFunc 函数的主要作用就是：通过微任务或者宏任务的方式往浏览器添加任务队列
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
```

**Vue.nextTick 原理：**

其实 Vue.nextTick  主要做的就是将其回调函数放进浏览器异步任务队列里面，在放进异步队列的过程会通过降级的方式处理兼容问题，优先使用 Promise，其次是 MutationObserver，然后是 setImmediate，最后才是使用 setTimeout



### 6-4、Vue.mixin

主要就是通过 mergeOptions 将 mixin 的参数合并到全局的 Vue 配置中

```
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 通过 mergeOptions 将 mixin 的参数合并到全局的 Vue 配置中
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
```



### 6-5、vue.use

-   检查插件是否安装，如果安装了就不再安装
-   如果没有没有安装，那么调用插件的 install 方法，并传入 Vue 实例

要使用 Vue.use(), 要么是一个对象里面包含 install 方法，要么本身就是一个方法(自身就是 install 方法)。

```
export function initUse(Vue: GlobalAPI) {
  // 接受一个 plugin 参数
  Vue.use = function (plugin: Function | Object) {
    // this 就是 Vue 本身
    // _installedPlugins 存储了所有 plugin
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []);
    // 如果 plugin 存在，那么返回 this（即 Vue）
    if (installedPlugins.indexOf(plugin) > -1) {
      return this;
    }

    // additional parameters
    const args = toArray(arguments, 1);
    // 将Vue对象拼接到数组头部
    args.unshift(this);
    if (typeof plugin.install === "function") {
      // 如果 plugin.install 存在， 直接调用 plugin.install
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === "function") {
      // plugin 存在，调用 plugin
      plugin.apply(null, args);
    }
    // 将plugin 存储到 installedPlugins
    installedPlugins.push(plugin);
    // 返回 this（即 Vue）
    return this;
  };
}
```

**vue.use 原理：**

-   首次渲染的时候，除了再 <keep-alive> 中建立缓存，设置 vnode.data.keepAlive 为 true，其他的过程和普通组件一样。
-   缓存渲染的时候，会根据 vnode.componentInstance（首次渲染 vnode.componentInstance 为 undefined） 和 vnode.data.keepAlive 进行判断不会执行组件的 created、mounted 等钩子函数，而是对缓存的组件执行 patch 过程，最后直接把缓存的 DOM 对象直接插入到目标元素中，完成了数据更新的情况下的渲染过程。



## 7、Vue 的其他重要功能

### 7-1、Vue 的事件机制 event



### 7-2、Vue 的插槽



#### 7-2-1、普通插槽



#### 7-2-2、具名插槽



#### 7-2-3、作用域插槽



### 7-3、Vue 的 v-model

#### 7-3-1、v-model 实现机制

v-model 会把它关联的响应式数据（如 message），动态地绑定到表单元素的 value 属性上，然后监听表单元素的 input 事件：当 v-model 绑定的响应数据发生变化时，表单元素的 value 值也会同步变化；当表单元素接受用户的输入时，input 事件会触发，input 的回调逻辑会把表单元素 value 最新值同步赋值给 v-model 绑定的响应式数据

```
<input type="text" :value="message" @input="(e) => { this.message = e.target.value }" >
```



#### 7-3-2、v-model 实现原理

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

-   1.针对修饰符产生不同的事件处理字符串
-   2.为 v-model 产生的 AST 树添加属性和事件相关的属性，为下面两行

```
//  addProp 会为 AST 树添加 props 属性
addProp(el, 'value', ("(" + value + ")"))
// addHandler 会为 AST 树添加事件相关的属性, 在 v-model 相当于在 input 上绑定了 input 事件
addHandler(el, event, code, null, true)
```

总结：

-   1.在编译阶段，如果是 v-model 会被解析到 el.directives
-   2.在 render 阶段，对指令的处理会进入 genDirectives 流程，此时 genDirectives 中的 state.directives[dir.name] 就是 modle 函数
-   3.在 model 函数中，会区分不同表单 select、checkbox、普通表单等
-   4.普通表单在 genDefaultModel 中处理，genDefaultModel 有两部分逻辑，第一个是针对修饰符产生不同的事件处理字符串，第二个是为 v-model 产生的 AST 树添加属性和事件相关的属性，如下：

```
//  addProp 会为 AST 树添加 props 属性
addProp(el, 'value', ("(" + value + ")"))
// addHandler 会为 AST 树添加事件相关的属性, 在 v-model 相当于在 input 上绑定了 input 事件
addHandler(el, event, code, null, true)
```

-   5.然后在 patch 过程根据生成的 VNode 进行 value 绑定，事件 input 监听



### 7-4、Vue 的 keep-alive

被 keep-alive 包裹的组件不会重新渲染

#### 7-4-1、keep-alive 基本使用：

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



#### 7-4-2、keep-alive 首次渲染

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

-   keep-alive 本质上只是存缓存和拿缓存的过程

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

-   保存 VNode 到 cache
-   标记 vnode.data.keepAlive = true

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



#### 7-4-3、keep-alive 再次渲染

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

  props: {
    include: patternTypes, // 哪些需要缓存
    exclude: patternTypes, // 哪些不需要缓存
    max: [String, Number] // 缓存的数量上限，缓存的是vnode对象，它也会持有DOM，当我们缓存很多的时候，会比较占用内存，所以该配置允许我们指定缓存大小
  },

  created() {
    // 缓存组件 VNode
    this.cache = Object.create(null)
    // 缓存组件名
    this.keys = []
  },

  destroyed() {
    // 销毁所有 cache 中的组件实例
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted() {
    // 监听 include exclude，在变化的时候重新调整 cache 中的内容
    // 其实就是对 cache 做遍历，发现缓存的节点名称和新的规则没有匹配上的时候，就把这个缓存节点从缓存中摘除
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  // keep-alive 的渲染函数
  render() {
    // keep-alive 插槽的值
    const slot = this.$slots.default
    // 第一个 VNode 节点
    const vnode: VNode = getFirstComponentChild(slot)
    // 拿到第一个子组件实例
    // <keep-alive> 只处理第一个子元素，所以一般和它搭配使用的是 component 动态组件或者是 router-view
    const componentOptions: ? VNodeComponentOptions = vnode && vnode.componentOptions
    // 第一个子组件实例
    if (componentOptions) {
      // check pattern
      // 第一个 VNode 节点的 name
      const name: ? string = getComponentName(componentOptions)
      const {
        include,
        exclude
      } = this
      // 判断子组件是否能够缓存
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const {
        cache,
        keys
      } = this
      const key: ? string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ?
        componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '') :
        vnode.key
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
        // 配置了 max 并且缓存的长度超过了 this.max，则要从缓存中删除第一个
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



## 8、vue-router

### 8-1、vue-router 的注册

#### 8-1-1、Vue.use() 是插件的安装，通过它可以将一些功能或 API 入侵到 Vue 内部；在 Vue.use() 中，接收一个参数，如果这个参数有 install 方法，那么 Vue.use()会执行这个 install 方法，如果接收到的参数是一个函数，那么这个函数会作为 install 方法被执行

```
// 在 vue-router/src/install.js

function install (Vue) {

}
```

```
// 在 vue-router/src/index.js

class VueRouter {
    constructor(){

    }
}

VueRouter.install = install
```

#### 8-1-2、install 函数是真正的 vue-router 的注册流程

-   判断是否注册过，如果注册过不会再重新注册
-   \_Vue = Vue 将 Vue 保存，并导出 \_Vue，使 vue-router 在任何时候都能访问到 Vue
-   通过 Vue.mixin 全局混入，通过全局混入使得每一个组件执行 beforeCreate、destroyed 都会执行这里的 beforeCreate、destroyed 定义的逻辑；beforeCreate 中会判断是否在 new Vue 的时候传入 router。Vue.use() 会执行 install，会执行 install 的 beforeCreate 中的 this.\_router.init(this) [init 是 VueRouter 类上的方法]
-   定义了 Vue 原型上的 $router 与 $route
-   注册 router-view 和 router-link 这两个组件

```
// install.js

export let _Vue

export function install (Vue) {
  // 如果是多次注册，就会 return 不会进行重复的注册
  if (install.installed && _Vue === Vue) return
  // install.installed = true 代表已经注册过
  install.installed = true

  // 因为在上面通过 export let _Vue 将 Vue 导出，使 vue-router 在任何时候都能访问到 Vue，所以将 Vue 保存到 _Vue
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  /**
   * 通过 Vue.mixin 去做全局混入，通过全局混入使得每一个组件执行 beforeCreate、destroyed 都会执行这里的
   * beforeCreate、destroyed 定义的逻辑
   */
  Vue.mixin({
    beforeCreate () {
      // 判断是否在 new Vue 的时候是否把 router 传入
      // new Vue({ el: 'app', router })
      if (isDef(this.$options.router)) {
        this._routerRoot = this  // 将 Vue 赋值给 this._routerRoot
        this._router = this.$options.router // 将传入的 router 赋值给 this._router
        // 传入的 router 是通过 new VueRouter({mode: '', routes: [{}]}) 出来的，VueRouter 类身上有 init 方法
        this._router.init(this)
        // 将 _route 变成响应式的
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 定义了原型上的 $router 实例
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  // // 定义了原型上的 $route 参数
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 注册 router-view 和 router-link 这两个组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
```

### 8-2、VueRouter 对象

#### 8-2-1、VueRouter 是一个类，在 new VueRouter 的时候实际上就是执行这个 VueRouter 类

// const router = new VueRouter({
// mode: 'hash',
// routes: [
// {
// path: '/',
// name: 'home',
// component: Home
// }
// ]
// })

-   先根据 mode 来确定所选的模式，如果当前环境不支持 history 模式，会强制切换到 hash 模式
-   果当前环境不是浏览器环境，会切换到 abstract 模式下

```
// vue-router/src/index.js

export default class VueRouter {
  constructor (options: RouterOptions = {}) {
    ...

    let mode = options.mode || 'hash'
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false

    // 如果当前环境不支持 history 模式，会被强制转换到 hash 模式
    if (this.fallback) {
      mode = 'hash'
    }

    // 不是浏览器环境，会切换到 abstract 模式
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode

    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }
}
```

#### 8-2-2、VueRouter 的 init 函数

-   存储当前 app（Vue 实例）到 apps，并且在 VueRouter 上挂载 app 属性
-   transitionTo 对不同路由模式进行路由导航
-   history.listen 挂载了回调的 cb， 每次更新路由更新 \_route

```
class VueRouter {
  constructor() {

  }

  init (app: any /* Vue component instance */) {

    // this._router.init(this) 可知，app 是当前 Vue 实例
    this.apps.push(app)

    if (this.app) {
      return
    }

    // 在 VueRouter 上挂载 app 属性
    this.app = app

    const history = this.history

    // transitionTo 是进行路由导航的函数
    if (history instanceof HTML5History) {
      // history 模式
      history.transitionTo(history.getCurrentLocation())
    } else if (history instanceof HashHistory) {
      // hash 模式
      // 在hash模式下会在 transitionTo 的回调中调用 setupListeners
      // setupListeners 里会对 hashchange 事件进行监听
      const setupHashListener = () => {
        history.setupListeners()
      }
      history.transitionTo(
        history.getCurrentLocation(),
        setupHashListener,
        setupHashListener
      )
    }

    // 挂载了回调的 cb， 每次更新路由更新 _route
    history.listen(route => {
      this.apps.forEach((app) => {
        app._route = route
      })
    })
  }
}
```

#### 8-2-3、HashHistory(即 hash 模式)

大致流程

-   执行 transitionTo 函数，先得到需要跳转路由的 match 对象 route
-   执行 confirmTransition 函数
-   confirmTransition 函数内部判断是否是需要跳转，如果不需要跳转，则直接中断返回
-   confirmTransition 判断如果是需要跳转，则先得到钩子函数的任务队列 queue
-   通过 runQueue 函数来批次执行任务队列中的每个方法。
-   在执 queue 的钩子函数的时候，通过 iterator 来构造迭代器由用户传入 next 方法，确定执行的过程
-   一直到整个队列执行完毕后，开始处理完成后的回调函数。

*   首先，在 new HashHistory() 中所做的事: 针对于不支持 history api 的降级处理，以及保证默认进入的时候对应的 hash 值是以 / 开头的，如果不是则替换

```
//  vue-router/src/index.js

case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
```

```
// vue-router/src/history/hash.js

export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {

    // 调用基类构造器
    super(router, base)

    // check history fallback deeplinking
    // 如果说是从 history 模式降级来的
    // 需要做降级检查
    if (fallback && checkFallback(this.base)) {
      // 如果降级且做了降级处理直接 return
      return
    }

    // 保证 hash 是 / 开头
    ensureSlash()
  }
}

// 降级检查
function checkFallback (base) {
  // 得到除去 base 的 真正的 location 的值
  const location = getLocation(base)

  if (!/^\/#/.test(location)) {
    // 如果此时地址不是 /# 开头
    // 需要做一次降级处理 降级为 hash 模式下应有的 /# 开头
    window.location.replace(cleanPath(base + '/#' + location))
    return true
  }
}

// 保证 hash 是 / 开头
function ensureSlash (): boolean {
  // 拿到 hash 值
  const path = getHash()
  // 以 / 开头，返回 true
  if (path.charAt(0) === '/') {
    return true
  }
  // 替换成以 / 开头
  replaceHash('/' + path)
  return false
}
```

-   然后是 VueRouter 中的 init 对 hash 路由的处理, 会执行 history.transitionTo

```
// transitionTo 是进行路由导航的函数
if (history instanceof HTML5History) {
  // history 模式
  history.transitionTo(history.getCurrentLocation())
} else if (history instanceof HashHistory) {
  // hash 模式
  // 在hash模式下会在 transitionTo 的回调中调用 setupListeners
  // setupListeners 里会对 hashchange 事件进行监听
  const setupHashListener = () => {
    history.setupListeners()
  }
  history.transitionTo(
    history.getCurrentLocation(),
    setupHashListener,
    setupHashListener
  )
}
```

history.transitionTo 定义在 history/base.js 中, 由 class HashHistory extends History 可知 HashHistory 继承于 History，History 在 base.js 定义

transitionTo 中 首先会定义 route 变量，通过 const route = this.router.match(location, this.current)

```
export class History {
  constructor (router: Router, base: ?string) {
    ...
    this.current = START
  }

  listen (cb: Function) {
    this.cb = cb
  }

  // 主要就是路径切换
  transitionTo (
    location: RawLocation,
    onComplete?: Function,
    onAbort?: Function
  ) {
    // 先定义 route 变量
    // location 代表当前 hash 路径
    // this.current = START， START 由 createRoute 创建出来的
    const route = this.router.match(location, this.current)
    this.confirmTransition(
      route,
      () => {
        this.updateRoute(route)
        onComplete && onComplete(route)
        this.ensureURL()

        // fire ready cbs once
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        if (onAbort) {
          onAbort(err)
        }
        if (err && !this.ready) {
          this.ready = true
          this.readyErrorCbs.forEach(cb => {
            cb(err)
          })
        }
      }
    )
  }
}
```

在 index.js 中的 match 定义

```
match (
    raw: RawLocation,
    current?: Route,
    redirectedFrom?: Location
  ): Route {
    // this.mather.match 最终返回的就是 Route 对象，这个在 create-matcher.js 中定义
    return this.matcher.match(raw, current, redirectedFrom)
  }
```

在 create-matcher.js 中定义的 this.matcher.match，通过目标路径匹配定义的 route 数据，根据匹配到的记录，来进行\_createRoute 操作

```
function match (
    raw: RawLocation, // 目标 url
    currentRoute?: Route, // 当前 url 对应的 route 对象
    redirectedFrom?: Location // 重定向
  ): Route {
    // 解析当前 url，得到 hash、path、query 和 name 等信息
    const location = normalizeLocation(raw, currentRoute, false, router)
    const { name } = location

    // 如果是命名路由
    if (name) {
      // 获取路由记录
      const record = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      // 不存在记录，返回
      if (!record) return _createRoute(null, location)
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      if (typeof location.params !== 'object') {
        location.params = {}
      }

      // 复制 currentRoute.params 到 location.params
      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      // 不是命名路由
      location.params = {}
      // 这里会遍历 pathList，找到合适的 record，因此命名路由的 record 查找效率更高
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) {
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }
    // no match
    // 没有匹配到的情况
    return _createRoute(null, location)
  }
```

然后是定义在 create-matcher.js 的 \_createRoute，根据 RouteRecord 执行相关的路由操作，最后返回 Route 对象

```
function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match,
    addRoutes
  }
```

**总结： transitionTo 一开始定义的 route 是通过 match，match 的主要功能是通过目标路径匹配定义的 route 数据，根据匹配到的记录，来进行\_createRoute 操作。而\_createRoute 会根据 RouteRecord 执行相关的路由操作，最后返回 Route 对象**

transitionTo 接下来就是调用 confirmTransition 执行路由转换动作

```
confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {


    // 路由切换周期钩子队列
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
       // 得到即将被销毁组件的 beforeRouteLeave 钩子函数
      extractLeaveGuards(deactivated),
      // global before hooks
      // 全局 router before hooks
      this.router.beforeHooks,
      // in-component update hooks
      // 得到组件 updated 钩子
      extractUpdateHooks(updated),
      // in-config enter guards
      // 将要更新的路由的 beforeEnter 钩子
      activated.map(m => m.beforeEnter),
      // async components
      // 异步组件
      resolveAsyncComponents(activated)
    )


    // 执行队列里的钩子
    runQueue(queue, iterator, () => {}
  }
```

-   runQueue 执行完后，处理完成后的回调函数

```
this.confirmTransition(
      route,
      () => {
        // ...跳转完成, 更新 route
        this.updateRoute(route)
        onComplete && onComplete(route)
        this.ensureURL()

        // fire ready cbs once
        if (!this.ready) {
          this.ready = true
          this.readyCbs.forEach(cb => {
            cb(route)
          })
        }
      },
      err => {
        ...
      }
    )

updateRoute (route: Route) {
    const prev = this.current
    // 当前路由信息更新
    this.current = route
    // cb 执行
    this.cb && this.cb(route)
    // 调用 afterEach 钩子
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev)
    })
}
```

完成了对当前 route 的更新动作。之前，在 install 函数中设置了对 route 的数据劫持。此时会触发页面的重新渲染过程。还有一点需要注意，在完成路由的更新后，同时执行了 onComplete && onComplete(route)。而这个便是在我们之前篇幅中介绍的 setupHashListener

```
const setupHashListener = () => {
  history.setupListeners()
}
history.transitionTo(
  history.getCurrentLocation(),
  setupHashListener,
  setupHashListener
)


setupListeners () {
  const router = this.router
  // 处理滚动
  const expectScroll = router.options.scrollBehavior
  const supportsScroll = supportsPushState && expectScroll

  if (supportsScroll) {
    setupScroll()
  }
  // 通过 supportsPushState 判断监听popstate 还是 hashchange
  window.addEventListener(supportsPushState ? 'popstate' : 'hashchange', () => {
    const current = this.current
    // 判断路由格式
    if (!ensureSlash()) {
      return
    }
    this.transitionTo(getHash(), route => {
      if (supportsScroll) {
        handleScroll(this.router, route, current, true)
      }
      // 如果不支持 history 模式，则换成 hash 模式
      if (!supportsPushState) {
        replaceHash(route.fullPath)
      }
    })
  })
}
```

得出：setupListeners 这里主要做了 2 件事情，一个是对路由切换滚动位置的处理，具体的可以参考这里滚动行为。另一个是对路由变动做了一次监听 window.addEventListener(supportsPushState ? 'popstate' : 'hashchange', () => {})

#### 8-2-4、HTML5History(即 history 模式)

```
// index.js

this.history = new HTML5History(this, options.base)

// history/html5.js
export class HTML5History extends History {
  constructor (router: Router, base: ?string) {
    super(router, base)

    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      setupScroll()
    }

    const initLocation = getLocation(this.base)
    window.addEventListener('popstate', e => {
      const current = this.current

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      // 避免在有的浏览器中第一次加载路由就会触发 `popstate` 事件
      const location = getLocation(this.base)
      if (this.current === START && location === initLocation) {
        return
      }

      // 执行跳转动作
      this.transitionTo(location, route => {
        if (supportsScroll) {
          handleScroll(router, route, current, true)
        }
      })
    })
  }
}
```

在这种模式下，初始化作的工作相比 hash 模式少了很多，只是调用基类构造函数以及初始化监听事件

## 9、vuex