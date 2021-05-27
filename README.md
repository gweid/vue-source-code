> 阅读 vue、vue-router、vuex 的一些记录





# Vue 源码阅读

当前阅读的 vue 版本 2.6.11。基本源码目录结构：

```js
Vue
├── benchmarks                  性能、基准测试
├── dist                        构建打包的输出目录
├── examples                    案例代码
├── flow                        类型声明，vue2 使用的是 flow
├── packages                    一些其他包，、
│   ├── vue-server-renderer     服务端渲染
│   ├── vue-template-compiler   配合 vue-loader 使用的
│   ├── weex-template-compiler  weex 相关
│   └── weex-vue-framework      weex 相关
├── scripts                     配置文件，例如 rollup 打包相关的
├── src                         vue 核心源码目录
│   ├── compiler                编译相关
│   ├── core                    运行时的核心包
│   │   ├── components          全局组件，比如 keep-alive
│   │   ├── config.js           默认配置项
│   │   ├── global-api          全局 api，比如：Vue.filter、Vue.component 等
│   │   ├── instance            Vue 实例相关的，比如 Vue 构造函数就在这个目录下
│   │   ├── observer            响应式原理相关
│   │   ├── util                工具方法
│   │   └── vdom                虚拟 DOM 相关，比如 VNode 类、patch 过程的 diff
│   ├── platforms               平台相关的编译器代码
│   │   ├── web                 web 平台
│   │   └── weex                weex 平台
│   ├── server                  服务端渲染相关
├── test                        单元测试
├── types                       TS 类型声明
```



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



## 整体流程图：

![vue入口到构造函数整体流程](/imgs/img19.png)



附带一张网上经典的流程图：

![vue](/imgs/img0.png)



## 1、new Vue() 发生了什么

new Vue 就是执行了 Vue 的初始化



**首先，Vue 是 Function 出来的**

> vue\src\core\instance\index.js

```js
// Vue 本质： 实际就是一个 Function 实现的类
// 通过 new Vue({ el: '#app', data: { msg: 'Hello Vue' } }]) // 初始化
// options 就是 new Vue 时传进来的参数
function Vue (options) {
  // ...

  // 初始化 Vue
  // options = {
  //   el: "#app",
  //   data: {},
  //   methods: {},
  //   ...
  // }
  this._init(options)
}

// 这些函数以 Vue 为参数传入，主要就是给 Vue 的原型 prototype 上扩展方法 
// 思想：把 Vue 原型挂载不同方法拆分成不同文件去实现，使代码层次分明

// 定义了 Vue.prototype._init, 初始化 Vue，实际上 new Vue 就是执行的这个方法
initMixin(Vue)

// 定义了：
//  Vue.prototype.$data、Vue.prototype.$props
//  Vue.prototype.$set、Vue.prototype.$delete、Vue.prototype.$watch
stateMixin(Vue)

// 定义了事件播报相关方法：
//  Vue.prototype.$on, Vue.prototype.$once、Vue.prototype.$off、Vue.prototype.$emit
eventsMixin(Vue)

// 定义了：
//  Vue.prototype._update、Vue.prototype.$forceUpdate、Vue.prototype.$destroy
lifecycleMixin(Vue)

// 定义了：Vue.prototype.$nextTick、Vue.prototype._render
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

这里主要分析 web 平台，所以定义 $mount 的地方有两个

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

	  // 将 render 函数保存到 vm.options 中
      options.render = render
      options.staticRenderFns = staticRenderFns
    }
  }
  // 无论是 template 模板还是手写 render 函数最终调用缓存的 $mount 方法
  return mount.call(this, el, hydrating)
}
```

- 先是缓存了原型上的 \$mount 方法（原型的 $mount 就是 `src/platform/web/runtime/index.js` 这里定义的），再重新定义该方法

- 获取挂载元素，并且挂载元素不能为根节点 html、body 之类的，因为会覆盖

- 判断需不需要编译：

  - 组件通过 template 模板创建，需要编译，调用 compileToFunctions 方法进行模板编译，返回 render 函数，并将 render 函数保存到 vm.options 中

  - 当 render 函数是用户手写传入，不需要编译，例如：

    ```js
    Vue.component('anchored-heading', {
      data() {
        return {
          blogTitle: '标题'
        }
      }
      render: function (createElement) {
        return createElement('h1', this.blogTitle)
      }
    })
    ```

- 最后调用缓存的 mount，缓存的 mount 中会执行 mountComponent



对于调用 compileToFunctions 转换 template 为 render 函数的编译过程，这里暂时先不展开，后面再详细说明编译流程



### 2-2、执行 \$mount

上面说的调用缓存的 mount，实际就是执行了 `src/platform/web/runtime/index.js` 里面定义的 $mount ，这里面会执行 mountComponent

> vue\src\core\instance\lifecycle.js

```js
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


  // vm.$vnode 表示 Vue 实例的父虚拟 node，为 null 则表示 当前是根 Vue 实例
  // 设置 vm._isMounted 为 true，表示该实例已经挂载
  // 最后调用 mounted 生命周期钩子函数
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}
```

mountComponent 主要的作用：

- 定义 updateComponent 方法，在 watcher 回调时调用
- 实例化一个渲染 Watcher，在实例化Watcher 的过程会调用 updateComponent 函数：
  - updateComponent  中先调用 vm.\_render 方法先生成 VNode，然后 vm.\_update 转化为真实的 DOM

**Watcher 在这里起到两个作用，一个是初始化的时候会执行回调函数，另一个是当 vm 实例中的监测的数据发生变化的时候执行回调函数**



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

- new Watcher 创建 `渲染watcher`，这个 watcher 在这里有2个作用：

  - 初始化的时候会执行回调函数 updateComponent(首次渲染) 
  - 当 vm 实例中的监测的数据发生变化的时候执行回调函数 updateComponent 更新(响应式)

- 执行 updateComponent 方法

  1. vm._render() 生成虚拟 DOM

  2. vm._update 将虚拟 DOM 转换为真实 DOM

- 挂载 mount 生命周期钩子



### 2-3、updateComponent

> vue\src\core\instance\lifecycle.js

```js
updateComponent = function () {
  // vm._render 函数渲染成虚拟 DOM， vm._update 将虚拟 DOM 渲染成真实的 DOM
  vm._update(vm._render(), hydrating);
};
```

updateComponent 非常重要，里面有两步：

- vm._render() 生成 VNode
- vm._update 将 VNode 转换为真实 DOM



下面就来分析这个过程。



### 2-4、vm.\_render 生成 VNode

基本流程：

![vm._render](/imgs/img8.png)



#### 2-4-1、vm.\_render 的定义

首先，明确在什么时候定义了 `vm._render` 函数：主要是在初始化为 Vue 构造函数扩展方法的时候，通过 `renderMixin` 往 Vue.prototype 上挂载了 `_render` 函数

> vue\src\core\instance\index.js

```js
import { renderMixin } from './render'

function Vue (options) {
  // ...

  this._init(options)
}

renderMixin(Vue)
```

> vue\src\core\instance\render.js

```js
function renderMixin (Vue: Class<Component>) {
  // ...
    
  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    const { render, _parentVnode } = vm.$options
    
    try {
      // 执行 render 函数，生成 VNode
      //  vm.$createElement：在 initRender 中赋值
      //  vm._renderProxy：在 init 中处理 vm._renderProxy = vm
      vnode = render.call(vm._renderProxy, vm.$createElement)

    } catch (e) {/.../}

    // ...

    vnode.parent = _parentVnode
  }
}
```

可以看到，` Vue.prototype._render` 中，实际还是从 `vm.$options` 中取出 `render` 函数并执行，返回结果就是 VNode



#### 2-4-2、vm.options 中的 render 函数

render 函数什么时候被放到 vm.options 中的呢？这里有两种情况：

- 如果组件通过 template 创建，那么 render 函数是 compileToFunctions  编译 template 返回，并被保存到了 vm.options 中

  > vue\src\platforms\web\entry-runtime-with-compiler.js

  ```js
  Vue.prototype.$mount = function () {
    // ...
  
    // compileToFunctions 执行编译的函数（将 template 转化为 render）
    if (template) {
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
  
      // render 方法保存到 options 中
      options.render = render
    }
  }
  ```

- 用户手动调用 render 函数创建组件，例如：

  ```js
  Vue.component('custom-element', {
      data () {
          return {
              show: true
          }
      },
      methods: {
          clickHandler: function(){
              console.log('click');
          }
      },
      render: function (createElement) {
          return createElement(
              'div',
              {
                  class: {
                      show: this.show
                  },
                  attrs: {
                      id: 'wrapper'
                  },
                  on: {
                      click: this.handleClick
                  }
              }, 
              [
                  createElement('h1', 'Hello Vue!'),
                  createElement('p', 'Hello world!')
              ]
          )
      }
  })
  
  
  // 上面手动 render 创建的方式等价于
  <template>
    <div id="wrapper" :class="{show: show}" @click="clickHandler">
      <h1>Hello Vue!</h1>
      <p>Hello world!</p>
    </div>
  </template>
  <script>
  export default {
    name: 'custom-element',
    data(){
      return {
        show: true
      }
    },
    methods: {
      clickHandler: function(){
        console.log('click');
      }
    }
  }
  </script>
  ```



对于 compileToFunctions  编译 template 返回 render 函数的过程后面在编译的时候再说，这里先通过用户手动调用 render 函数创建组件，把渲染流程分析完。



#### 2-4-3、vm.$createElement

由上面可知，手动调用 render 函数创建组件的时候，需要拿到参数 `createElement`，而实际上，也是通过 `createElement` 这个函数去创建 VNode；

```js
render: function (createElement) {
  return createElement('h1', this.blogTitle)
}
```

这个 `createElement` 实际上是执行 render 的时候传进来的参数 `vm.$createElement`

```js
vnode = render.call(vm._renderProxy, vm.$createElement)
```



那么 `vm.$createElement` 是在什么时候被定义的呢？在 new Vue 的时候，就调用 this.\_init，这里面会调用 `initRender` 函数，`vm.$createElement` 就是在这里面被定义

> vue\src\core\instance\init.js

```js
import { initRender } from './render'

Vue.prototype._init = function (options?: Object) {
  // ...
    
  initRender(vm)
}
```

> vue\src\core\instance\render.js

```js
import { createElement } from '../vdom/create-element'

function initRender (vm: Component) {
  // ...
    
  // vm.$createElement 是手写 render 函数时调用的方法
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)
}
```

可以看到，`vm.$createElement` 是执行 `createElement(vm, a, b, c, d, true)` 后返回，下面来看看 `createElement` 干了什么



#### 2-4-4、createElement 函数

> vue\src\core\vdom\create-element.js

```js
// createElement 是对 _createElement 的封装，在 createElement 中先对参数做处理
export function createElement (
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  // 主要是判断 data 是否存在，不存在把后面的参数往前移
  // 主要就是为了兼容不传 data
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }

  // 如果 render 函数是用户手写
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}
```



#### 2-4-5、_createElement 函数

上面的 createElement 中对参数进行了处理，但是实际上真正创建 VNode 是在 _createElement 函数中：

> vue\src\core\vdom\create-element.js

```js
/**
 * 这个是真正创建 VNode 的函数
 *  context  VNode 的上下文环境，也就是 vm 实例
 *  tag  标签
 *  data  VNode 数据
 *  children  VNode 的子节点
 *  normalizationType  用来区分 render 函数手写还是编译返回
 */
export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // ...
  
  if (typeof tag === 'string') {
    // 如果 tab 是字符串类型
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)

    if (config.isReservedTag(tag)) {
      // 如果是符合 html 规范的标签
      // ...
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )

    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // 去 vm 的 components 上查找是否有这个标签的定义
      // 查找到，说明是组件，调用 createComponent 创建组件
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {

      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // 如果 tab 不是字符串类型，代表是组件
    vnode = createComponent(tag, data, context, children)
  }
}
```

可以看到，在 `_createElement` 中，通过 `new VNode` 创建 VNode



#### 2-4-6、VNode 类

> vue\src\core\vdom\vnode.js

```js
class VNode {
  // ...

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
  // 已弃用：向后兼容组件实例的别名
  get child (): Component | void {
    return this.componentInstance
  }
}
```

可以看到，VNode 最多可以接受 8 个参数。实例化后的对象有 23 个属性作为在 `vue` 内部一个节点的描述，大部分属性默认是 `false` 或 `undefined`，而通过这些属性**有效的值**就可以组装出不同的描述；通过描述可以确定将它创建为一个怎样的真实`Dom`。

一般来讲，VNode 可以具体分为以下几类：

- TextVNode：文本节点
- ElementVNode：普通元素节点
- ComponentVNode：组件节点
- EmptyVNode：没有内容的注释节点
- CloneVNode：克隆节点



### 2-5、vm.\_update 渲染真实 DOM（patch 过程）

经过上面的 vm.\_render 过程生成了 VNode，那么就下来就是怎么将 VNode 生成真实 Dom 渲染到页面的过程了，也就是常说的 Vue 的 patch 过程，这里面会发生新旧 VNode 的 diff 比对。



#### 2.5.1、一些前置知识

其实，在 Vue1.x 的时候，是没有 diff 算法的，那时的 Vue 只有响应式原理；这时的 watcher 和 Dom 是一一对应的关系，例如：

```js
<template>
  <div>
    // watcher 1
    <p>{{ name }}</p>
    // watcher 2
    <p>{{ age }}</p>
  </div>
</template>
```

当数据发生变化，dep 通知 watcher 去直接更新 Dom，watcher 可以非常明确的知道这个 key 在组件模版中的位置，因此可以做到定向更新，此时它的更新效率是非常高的。

但是，同时也带来了很大的问题，当页面特别复杂的时候，那么一个页面就需要绑定非常多的 watcher，这非常耗资源。

因此，在 Vue2.x 引入了 VNode 和 diff 算法去解决 1.x 中的问题。将 watcher 的粒度放大，变成一个组件一个 watcher，这时就算页面再大，watcher 也很少，这就解决了复杂页面 watcher 太多导致性能下降的问题。

当响应式数据更新时，dep 通知 watcher 去更新，这时候问题就来了，Vue 1.x 中 watcher 和 key 一一对应，可以明确知道去更新什么地方，但是 Vue 2.0 中 watcher 对应的是一整个组件，更新的数据在组件的的什么位置，watcher 并不知道。这时候就需要 VNode 发挥作用了，当组件中数据更新时，会为组件生成一个新的 VNode，通过比对新老两个 VNode，找出差异，然后对变化的地方进行更新。



#### 2.5.2、vm.\_update 的主要过程

-   主要作用：把生成的 VNode 转化为真实的 DOM
-   调用时机: 有两个，一个是发生在初次渲染阶段，这个时候没有旧的虚拟 dom；另一个发生数据更新阶段，存在新的虚拟 dom 和旧的虚拟 dom
-   核心方法 patch，patch 的本质是将新旧 vnode 进行比较，创建、删除或者更新 DOM 节点/组件实例



#### 2.5.3、入口

> vue\src\core\instance\lifecycle.js

```js
function mountComponent (vm: Component,el: ?Element,hydrating?: boolean): Component {
  // ...
    
  // 定义 updateComponent 函数作为 Watcher 的回调函数
  updateComponent = () => {
    // vm._render 函数渲染成虚拟 DOM， vm._update 将虚拟 DOM 渲染成真实的 DOM
    vm._update(vm._render(), hydrating)
  }

  new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
}
```

执行完 `vm._render()` 的到 VNode 后，执行 `vm._update` 将 VNode 转换为真实 Dom；接下来看看 `vm._update` 的定义



#### 2.5.4、vm._update

> vue\src\core\instance\lifecycle.js

```js
function lifecycleMixin (Vue: Class<Component>) {
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    // 保存当前 vm 实例
    const vm: Component = this

    // 页面挂载的根节点
    const prevEl = vm.$el

    // 保存一份老的 VNode
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)

    // 将新的 VNode 挂载到 vm._vnode 上
    vm._vnode = vnode

    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // 老 VNode 不存在，表示首次渲染，即初始化页面时走这里
      // 使用 vm.__patch__ 进行 dom diff 并且生成真实 dom，最后挂载到 vm.$el 上
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // 老 VNode 不存在，代表是更新操作，即页面更新走这里
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }
}
```

`vm._update` 里面核心的方法还是调用 `vm.__patch__` 函数进行 dom diff 并生成真实 dom，挂载到 vm.$el 上



#### 2.5.5、vm.\_\_patch\_\_

> vue\src\platforms\web\runtime\index.js

```js
import { patch } from './patch'

Vue.prototype.__patch__ = inBrowser ? patch : noop
```

可以看出，`vm.__patch__` 是一个挂载在 Vue 原型上的 patch 函数



#### 2.5.6、patch

> vue\src\platforms\web\runtime\patch.js

```js
import { createPatchFunction } from 'core/vdom/patch'

export const patch: Function = createPatchFunction({ nodeOps, modules })
```

可以看出，patch 函数由执行 createPatchFunction 得到



> vue\src\core\vdom\patch.js

```js
function createPatchFunction(backend) {
  // ...
    
  return function patch(oldVnode, vnode, hydrating, removeOnly) {
    // 如果新节点不存在，但是老节点存在，调用 destroy，直接销毁老节点
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue = []

    if (isUndef(oldVnode)) {
      // 新节点存在，老节点不存在，那么是首次渲染，创建一个新节点
      // empty mount (likely as component), create new root element
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } else {
      // 检查老节点是否是真实 DOM（真实 DOM 就是没有动态节点）
      const isRealElement = isDef(oldVnode.nodeType)
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // 老节点不是真实 DOM 并且新旧 VNode 节点判定为同一节点时会进行 patchVnode 这个过程
        // 这个过程主要就是进行 dom diff（也就是更新阶段，执行 patch 更新节点）
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        // 新老节点不是同一节点

        // 老节点是真实 DOM
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 老节点是真实 DOM，
          // 如果不是服务端渲染或者合并到真实 DOM 失败，将老节点转换为 VNode
          oldVnode = emptyNodeAt(oldVnode)
        }

        // 获取到老节点的真实元素
        const oldElm = oldVnode.elm
        // 找到父节点，对于初始化的节点来说，那就是 body
        const parentElm = nodeOps.parentNode(oldElm)

        // 基于新 VNode 创建整棵 DOM 树并插入到老 VNode 的父元素下
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode)
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            ancestor.elm = vnode.elm
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }

        // 删除老节点
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }

    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)

    // 返回 VNode.elm，为真实 DOM 内容
    return vnode.elm
  }
}
```

createPatchFunction 这个函数很复杂，里面还定义了很多其他辅助函数，但是最后返回了一个 patch 函数，这里面就是 patch 的核心内容，大体上的 patch 流程是：

- 如果新节点不存在，但是老节点存在，调用 destroy，直接销毁老节点

-   新节点存在，老节点不存在，代表首次渲染，根据新的 VNode 创建调用 createElm 创建新节点
-   新老节点都存在：

    -   老节点不是真实 DOM 并且和新 VNode 节点判定为同一节点(都是 Vnode，又是相同类型节点，才有必要 diff)

        -   调用 patchVnode 修改现有节点，这一步是 diff

    -   新老节点不不是同一节点（就是创建新节点，销毁老节点）
        -   如果老节点是真实 DOM，先将老节点转换为 VNode
        -   基于新 VNode 创建新节点 DOM 并插入到老 VNode 的父元素下
        -   最后移除老节点



##### createElm

将 VNode 转换为真实 DOM，并插入到对应的父节点上

> vue\src\core\vdom\patch.js

```js
// 根据 vnode 创建真实 DOM，并插入到父节点
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

    // 如果 VNode 是组件，递归创建子组件真实节点，直到完成所有子组件的渲染才进行根节点的真实节点插入
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag
    if (isDef(tag)) {
      // ...

      // 创建新节点
      vnode.elm = vnode.ns ?
        nodeOps.createElementNS(vnode.ns, tag) :
        nodeOps.createElement(tag, vnode)

      setScope(vnode)

      // 递归调用 createChildren 去创建所有子节点
      createChildren(vnode, children, insertedVnodeQueue)
        
      // 执行 created 生命周期钩子
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }

      // 将节点插入父节点
      insert(parentElm, vnode.elm, refElm)

      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {
      // 注释节点，创建注释节点并插入父节点
      vnode.elm = nodeOps.createComment(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    } else {
      // 文本节点，创建文本节点并插入父节点
      vnode.elm = nodeOps.createTextNode(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    }
  }
```

创建 VNode 的 VNode.elm，不同类型的 VNode，其 VNode.elm 创建过程也不一样。对于组件占位 VNode，会调用 createComponent 来创建组件占位 VNode 的组件实例；对于非组件占位 VNode 会创建对应的 DOM 节点

-   元素类型的 VNode:

    -   创建 vnode 对应的 DOM 元素节点 vnode.elm
    -   设置 vnode 的 scope
    -   递归调用 createChildren 去创建子节点
    -   执行 create 钩子函数
    -   将 DOM 元素插入到父元素中

-   注释和本文节点

    -   创建注释/文本节点 vnode.elm，并插入到父元素中

-   组件节点：调用 createComponent



##### patchVnode

> vue\src\core\vdom\patch.js

```js
function patchVnode(
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly
  ) {
    // 新老 VNode 相同，直接返回
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

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    /*
      跳过静态节点
      如果新旧 VNode 都是静态的，同时它们的 key 相同（代表同一节点），
      并且新的 VNode 是 clone 或者是标记了 once（标记 v-once 属性，只渲染一次），
      那么重用这部分节点
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

    // 老节点的字节点
    const oldCh = oldVnode.children
    // 新节点的字节点
    const ch = vnode.children
    // 全量更新新节点的【属性】，Vue 3.0 在这里做了很多的优化
    if (isDef(data) && isPatchable(vnode)) {
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
    }

    if (isUndef(vnode.text)) {
      // 新节点不是文本节点
      if (isDef(oldCh) && isDef(ch)) {
        // 新老节点均有 children 子节点，调用 updateChildren 对子节点进行 diff 操作
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        if (process.env.NODE_ENV !== 'production') {
          checkDuplicateKeys(ch)
        }
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        // 如果老节点没有子节点而新节点存在子节点，先清空 elm 的文本内容，然后为当前节点加入子节点
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 当新节点没有子节点而老节点有子节点的时候，则移除所有 ele 的子节点
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        // 老节点是文本节点，将文本清空
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      // 新节点是文本节点，更新文本节点
      nodeOps.setTextContent(elm, vnode.text)
    }

    // 调用 postpatch 钩子
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
    }
  }
```

patchVnode 主要做的事：

- 新老 VNode 相同，直接返回

-   如果新旧 VNode 都是静态的，同时它们的 key 相同（代表同一节点），并且新的 VNode 是 clone 或者是标记了 once（标记 v-once 属性，只渲染一次），那么重用这部分节点
-   全量更新新节点的属性（vue3 在这里做了很多优化）
-   新节点不是文本节点：
    - 新老节点均有 children 子节点，调用 updateChildren 对子节点进行 diff
    - 老节点没有子节点而新节点存在子节点，先清空 elm 的文本内容，然后为当前节点加入子节点
    - 当新节点没有子节点而老节点有子节点的时候，则移除所有 ele 的子节点
-   新节点是文本节点，更新文本节点



##### updateChildren：

当新旧 VNode 都有 children 子节点，对子节点进行 diff。

初步看看 diff 算法：首先假设 Web UI 中 DOM 节点跨层级的移动很少，那么就可以只对同一层级的 DOM 进行比较，对于同一层级的一组子节点，它们可以通过唯一 id 进行区分

![diff](/imgs/img9.png)

具体看看执行 diff 的 updateChildren 函数：

> vue\src\core\vdom\patch.js

```
// 执行子节点 diff
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
        // 获取旧开始到结束节点的 key 和下表集合
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        idxInOld = isDef(newStartVnode.key) ? // 获取新节点key在旧节点key集合里的下标
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
      // 如果旧节点列表先处理完，则表示剩余的节点是新增的节点，然后添加这些节点
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue) // 添加
    } else if (newStartIdx > newEndIdx) {
      // 如果新节点列表先处理完，则剩余旧节点是多余的，删除
      removeVnodes(oldCh, oldStartIdx, oldEndIdx) // 删除废弃节点
    }
  }
```

**diff 规则：**

a、跳过 undefined

-   如果旧开始节点为 undefined，就后移一位；如果旧结束节点为 undefined，就前移一位

b、快捷首尾查找(下面四种按顺序)：做了四种假设，假设新老节点开头结尾有相同节点的情况，一旦命中假设，就避免了一次循环，提高执行效率

-   旧开始和新开始节点比对: 如果匹配，表示它们位置是对的，Dom 不用改，将新旧节点开始的下标后移一位
-   旧结束和新结束节点比对: 如果匹配，表示它们位置是对的，Dom 不用改，将新旧节点结束的下标前移一位
-   旧开始和新结束节点比对: 如果匹配，位置不对需要更新 Dom 视图，将旧开始节点对应的真实 Dom 插入到最后一位，旧开始节点下标后移一位，新结束节点下标前移一位
-   旧结束和新开始节点比对: 如果匹配，位置不对需要更新 Dom 视图，将旧结束节点对应的真实 Dom 插入到旧开始节点对应真实 Dom 的前面，旧结束节点下标前移一位，新开始节点下标后移一位

c、key 值查找

-   如果和已有 key 值匹配: 说明是已有的节点，只是位置不对，就移动节点位置
-   如果和已有 key 值不匹配: 再已有的 key 值集合内找不到，那就说明是新的节点，就创建一个对应的真实 Dom 节点，插入到旧开始节点对应的真实 Dom 前面

**图示说明：**

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

      ```js
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

在上一节渲染流程的时候说过，如果没有手写 render 函数，那么就需要编译 template 模板，编译过程主要做的就是：将 HTML 模板解析为 AST 节点树，通过 AST 节点树生成 render 函数。



在 example 目录下新建 test-compile.html 用于调试 compile 过程



### 3-1、编译的入口

在 $mount 的时候，会调用 compileToFunctions 对 template 模板进行编译

> vue\src\platforms\web\entry-runtime-with-compiler.js

```
const mount = Vue.prototype.$mount
// 再重新定义 $mount
Vue.prototype.$mount = function (){
  ...

  // 如果有 render 函数，直接执行 mount.call(this, el, hydrating)
  // 没有 render，代表的是 template 模式，就编译 template，转化为 render 函数，再调用 mount
  if (!options.render) {
    // 没有 render 函数
    let template = options.template

	// 获取到 template 模板
    if (template) {
      // 如果创建的时候有传 template，以 template 为准，没传，就取 el
      if (typeof template === 'string') {
        // 如果 template 是 '#xxx'，那么根据 id 选择器获取 template 内容
        if (template.charAt(0) === '#') {
          // template 是一个 id 选择器，则获取该元素的 innerHtml 作为模版
          // { template: '#app' }
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 如果 tempalte 是一个正常的元素，那么通过 template.innerHTML 得到 template
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 如果没有传入 template 模板，则默认以 el 元素所属的根节点作为基础模板
      // new Vue({ el: '#app' })
      template = getOuterHTML(el)
    }

    // 模板准备就绪，进入编译阶段
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // compileToFunctions 执行编译的函数（将 template 转化为 render）
      // compileToFunctions 方法会返回 render 函数方法，render 方法会保存到 vm.$options 中
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)

      // render 方法保存到 options 中
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }

  // 调用原先原型上的 $mount 方法挂载, 此时实际也是调用重新定义的 mount，这样做主要是为了复用
  return mount.call(this, el, hydrating)
}
```

可以看到，主要流程：

- 判断 vm.options 中有没有 render 函数，没有，代表是通过 template 模板创建，那么需要进行编译

- 获取到 template 模板，这里会根据不同 template 创建形式获取模板，基本就是四种：

  - 第一种：有传 template，并且 template 是 `#xxx` 的形式

    ```js
    <div id="app">
      <div>test1</div>
      <script type="x-template" id="test">
        <p>test</p>
      </script>
    </div>
    
    new Vue({
      el: '#app',
      template: '#test'
    })
    ```

  - 第二种：有传 template，并且 template 是字符串模板

    ```js
    new Vue({
      el: '#app',
      template: '<div>模板字符串</div>'
    })
    ```

  - 第三种：有传 template，并且 template 是 dom 形式

    ```js
    <div id="app">
      <div>test1</div>
      <span id="test"><div class="test2">test2</div></span>
    </div>
    
    new Vue({
      el: '#app',
      template: document.querySelector('#test')
    })
    ```

  - 第四种：没有传 template，默认以 el 元素所属的根节点作为基础模板

    ```js
    new Vue({
      el: '#app'
    })
    ```

- compileToFunctions 编译 template 模板，返回 render 函数



#### 3-1-1、创建 compileToFunctions 的过程

compileToFunctions 函数是通过一系列的高阶函数生成的：

1. > vue\src\platforms\web\compiler\index.js

   ```js
   import { baseOptions } from './options'
   import { createCompiler } from 'compiler/index'
   
   const { compile, compileToFunctions } = createCompiler(baseOptions)
   ```

   可以看到，compileToFunctions 是经过执行 createCompiler 函数返回的结果 

2. > vue\src\compiler\index.js

   ```js
   import { createCompilerCreator } from './create-compiler'
   
   export const createCompiler = createCompilerCreator(function baseCompile () {
     // ...
   })
   ```

   可以看到，createCompiler 又是由执行 createCompilerCreator 得到

3. 再看看 createCompilerCreator 执行会 返回 createCompiler

   > vue\src\compiler\create-compiler.js

   ```js
   import { createCompileToFunctionFn } from './to-function'
   
   export function createCompilerCreator (baseCompile: Function): Function {
     return function createCompiler (baseOptions: CompilerOptions) {
       function compile (template: string,options?: CompilerOptions): CompiledResult {
         // ...
       }
   
       return {
         compile,
         compileToFunctions: createCompileToFunctionFn(compile)
       }
     }
   }
   ```

   而执行这个返回的 createCompiler 可以得到一个对象：

   ```js
   {
     compile,
     compileToFunctions: createCompileToFunctionFn(compile)
   }
   ```

   所以，可以发现，compileToFunctions 实际上是由 createCompileToFunctionFn 函数创建。

4. 最后，看看 createCompileToFunctionFn 函数

   > vue\src\compiler\to-function.js

   ```js
   export function createCompileToFunctionFn (compile: Function): Function {
     const cache = Object.create(null)
   
     return function compileToFunctions () {
       // ...
     }
   }
   ```

   简单明了，就是返回了一个 compileToFunctions 函数



所以，创建 compileToFunctions 绕了一大个圈子，主要顺序是：createCompilerCreator -> createCompiler -> createCompileToFunctionFn -> compileToFunctions



接下来，从执行 compileToFunctions 开始，进入编译流程



### 3-2、compileToFunctions 

> vue\src\compiler\to-function.js

```js
// 主要就是执行编译函数 compile 得到编译结果
// 处理编译结果的 render 代码串，得到可以执行的 render 函数
function compileToFunctions (
    template: string, // template 字符串模版
    options?: CompilerOptions, // 编译选项
    vm?: Component // vm 实例
  ): CompiledFunctionResult {
    options = extend({}, options)
    const warn = options.warn || baseWarn
    delete options.warn
 
    // ...

    // check cache
    // 编译是耗时的，通过 key 做一些缓存
    // 如果有缓存，直接跳过编译，从上一次缓存中读取编译结果
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    if (cache[key]) {
      return cache[key]
    }

    // compile
    // 执行编译函数 compile 得到编译结果
    const compiled = compile(template, options)

    // ...

    // turn code into functions
    const res = {}
    const fnGenErrors = []

    // 将编译结果中的 render 字符串代码转换为可执行的 render 函数
    res.render = createFunction(compiled.render, fnGenErrors)
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction(code, fnGenErrors)
    })

    // ...

    // 缓存编译结果，并返回
    return (cache[key] = res)
  }
}
```

可以看出，compileToFunctions 中重要的逻辑是：

- 执行编译函数 compile 得到编译结果
- 将编译结果的 render 代码串转换为可执行的 render 函数，并保存到 res 中
- 缓存 res，并返回（如果下次编译时发现有缓存，直接从缓存读取）



### 3-3、compile

createCompilerCreator -> createCompiler -> createCompileToFunctionFn -> compileToFunctions -> compile 



> vue\src\compiler\create-compiler.js

```js
/**
 * 编译函数，主要做了：
 *   合并 finalOptions（即baseOptions）和 options，得到一份最终的编译配置
 *   调用 baseCompile 得到编译结果（真正编译的核心是在 baseCompile 中）
 * @param {*} template 模板 template 字符串
 * @param {*} options 编译配置
 * @returns 
*/
function compile (template: string, options?: CompilerOptions): CompiledResult {
    // 基于 baseOptions 创建 finalOptions
    const finalOptions = Object.create(baseOptions)
    const errors = []
    const tips = []

    let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
    }

    // 如果有 options，那么 options 与 finalOptions 合并
    if (options) {
        // ...

        // merge custom modules
        // 合并自定义模块
        if (options.modules) {
            finalOptions.modules =
                (baseOptions.modules || []).concat(options.modules)
        }

        // merge custom directives
        // 合并自定义指令
        if (options.directives) {
            finalOptions.directives = extend(
                Object.create(baseOptions.directives || null),
                options.directives
            )
        }

        // copy other options
        // options 的其他配置拷贝 finalOptions
        for (const key in options) {
            if (key !== 'modules' && key !== 'directives') {
                finalOptions[key] = options[key]
            }
        }
    }

    finalOptions.warn = warn

    // 执行 baseCompile，真正执行编译三步 parse、optimize、generate
    const compiled = baseCompile(template.trim(), finalOptions)

    if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn)
    }

    // 将编译期间的 error 和 tip，挂载到编译结果上
    compiled.errors = errors
    compiled.tips = tips

    // 将编译结果返回
    return compiled
}
```

compile 函数做了两件重要的事情：

- 合并 finalOptions（即baseOptions）和 options，得到一份最终的编译配置
- 调用 baseCompile 得到编译结果（真正编译的核心是在 baseCompile 中）



来看看 baseOptions

> vue\src\platforms\web\compiler\options.js

```js
export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules, // 处理 class、style、v-model
  directives, // 处理指令
  isPreTag, // 是否是 pre 标签 【什么是 pre 标签：https://www.runoob.com/tags/tag-pre.html】
  isUnaryTag, // 是否自闭合标签
  mustUseProp, // 规定了一些应该使用 props 进行绑定的属性
  canBeLeftOpenTag, // 可以只写开始标签的标签，结束标签浏览器会自动补全
  isReservedTag, // 是否是保留标签（html + svg）
  getTagNamespace, // 获取标签的命名空间
  staticKeys: genStaticKeys(modules)
}
```



### 3-4、baseCompile（编译的核心）

createCompilerCreator -> createCompiler -> createCompileToFunctionFn -> compileToFunctions -> compile -> baseCompile



在 baseCompile 前做的所有的事情，只是为了构建某个平台特有的编译选项（options），比如 web 平台，而真正的编译核心是 baseCompile 函数，这个函数里面进行编译三步曲 ：

- parse：将 html 模版解析成 ast
- optimize：对 ast 树进行静态标签标记
- generate：将 ast 生成 render 代码串，后面通过 createFunction 将 render 代码串生成 render 函数

> vue\src\compiler\index.js

```js
function baseCompile (template: string, options: CompilerOptions): CompiledResult {

  // parse 过程：将 html 转换为 ast 树
  // 每个节点的 ast 树都设置了元素的所有信息：标签信息、属性信息、插槽信息、父节点、子节点等
  const ast = parse(template.trim(), options)

  // optimize：遍历 ast，当遇到静态节点打上静态节点标记，然后进一步标记出静态根节点
  // 这样在后续更新中就可以跳过这些静态节点了
  // 标记静态根节点：在生成渲染函数阶段，生成静态根节点的渲染函数
  if (options.optimize !== false) {
    optimize(ast, options)
  }

  // generate: 将 ast 生成 render 代码串、staticRenderFns 静态根节点代码串
  // 比如：
  //  <div id="app">
  //    <div>{{msg}}</div>
  //    <div>
  //      <p>静态节点</p>
  //    </div>
  //  </div>
  // 经过编译后的 code 是：
  //   code = {
  //     render: 'with(this){return _c('div',{attrs:{\"id\":\"app\"}},[_c('div',[_v(_s(msg))]),_v(\" \"),_m(0)])}',
  //     staticRenderFns: ['with(this){return _c('div',[_c('p',[_v(\"静态节点\")])])}']
  //   }
  const code = generate(ast, options)

  // 将 ast、render 代码串、staticRenderFns 静态根节点代码串
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

这里建议通过 debugger 调试，看看 parse 后的 ast、优化静态节点后的 ast、还有转换后的 code 长什么样。



### 3-5、parse：将 template 解析成 AST

parse 的过程就是将 template 模板转换为 ast 的过程。



#### 3-5-1、parse 函数概览

parse 过程是一个非常复杂的过程，现在先来大概看看 parse 函数做了什么：

> vue\src\compiler\parser\index.js

```js
/**
 * 将 template 字符串模板转换为 ast
 * @param {*} template template 字符串模板
 * @param {*} options 编译配置
 * @returns 
 */
export function parse (template: string, options: CompilerOptions): ASTElement | void {
  warn = options.warn || baseWarn

  // 是否 pre 标签（no 是一个直接返回 false 的函数）
  platformIsPreTag = options.isPreTag || no
  // 是否必须要使用 props 进行绑定的属性
  platformMustUseProp = options.mustUseProp || no
  // 获取命名空间
  platformGetTagNamespace = options.getTagNamespace || no
  // 是否是保留标签（html + svg）
  const isReservedTag = options.isReservedTag || no
  // 是否是组件
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)

  // 
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  const whitespaceOption = options.whitespace
  // 根节点，处理后的节点都会按照层级挂载到 root 下，最后将 root 返回
  let root
  // 当前元素的父元素
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg, range) {/.../}

  function closeElement (element) {/.../}

  function trimEndingWhitespace (el) {/.../}

  function checkRootConstraints (el) {/.../}

  // 解析所有标签，处理标签以及标签上的属性
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,

    start (tag, attrs, unary, start, end) {/.../},
    end (tag, start, end) {/.../},
    chars (text: string, start: number, end: number) {/.../},
    comment (text: string, start, end) {/.../}
  })

  // 将生成的 ast 对象返回
  return root
}
```

可以看出，整个 template => ast 的过程都在 parse 中完成了：

- parseHTML 之前，主要处理了一些 options 配置以及定义了一些函数（这里暂时不关心这些函数干了什么，后面用到再解析）
- 真正解析 template 的是 parseHTML，parseHTML接受 template 模板字符串以及 parseHTMLOptions 对象作为参数，这个 parseHTMLOptions  对象里面主要是一些**从 options 中取到的编译配置**及**定义了一些函数**，用于在解析 template 的时候使用
- 最后，将解析好的 ast 对象 root 返回



#### 3-5-2、parseHTML

parseHTML：解析所有标签，处理标签以及标签上的属性

> vue\src\compiler\parser\html-parser.js

```js
function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  // 是否是自闭合标签
  const isUnaryTag = options.isUnaryTag || no
  // 是否可以只有开始标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 记录当前在原始 html 字符串中的开始位置索引，一开始为0
  let index = 0
  let last, lastTag
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 确保 这个标签 不是 <script>、<style>、<textarea> 中的文本，例如 <textarea>div</textarea>
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 找 "<" 字符的索引
      let textEnd = html.indexOf('<')
      // textEnd === 0 ，代表模板的第一个字符是 "<"，分下面几种情况：
      // 每处理完一种情况，就会中断这一轮（continue）循环
      // 并且利用函数 advance 重置 html 字符串，将处理过的标签截掉，下一次循环处理剩余的 html 字符串
      if (textEnd === 0) {
        // 如果是注释标签  <!--xx-->
        // const comment = /^<!\--/
        if (comment.test(html)) {
          // 找到注释文字结束位置索引
          // 注意，这里是注释文字的结束位置索引，不是注释标签的，注释标签的结束索引需要在这个基础上加3
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 如果需要保留注释
            if (options.shouldKeepComment) {
              // 调用 parseHTMLOptions 的 comment 函数，得到注释内容、注释节点开始索引和结束索引
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 调整 html 字符串（将处理过的标签截掉）和 index 位置
            advance(commentEnd + 3)
            // 中断这一轮循环
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 如果是条件注释标签：<!--[if IE]>
        // const conditionalComment = /^<!\[/
        if (conditionalComment.test(html)) {
          // 找到条件注释标签结束位置索引
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            // 调整 html 字符串（将处理过的标签截掉）和 index 位置
            advance(conditionalEnd + 2)
            // 中断这一轮循环
            continue
          }
        }

        // 如果是 Doctype 标签：<!DOCTYPE html>
        // const doctype = /^<!DOCTYPE [^>]+>/i
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // 接下来是处理结束标签和开始标签，这才是 parseHTML 核心部分，上面的是处理一些边界

        // 处理结束标签，例如：</div>、</p> 等
        const endTagMatch = html.match(endTag) // 结果类似 ['</div>', 'div']
        if (endTagMatch) {
          const curIndex = index

          // 调整 html 字符串（将处理过的标签截掉）和 index 位置
          advance(endTagMatch[0].length)

          // 调用 parseEndTag 处理结束标签
          // endTagMatch=['</div>', 'div']，那么 endTagMatch[1]=div
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // 处理开始标签：
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          // 拿到经过 parseStartTag 解析后的 match 对象，进一步处理
          // 这里面调用 parseHTMLOptions.start 真正进行标签解析
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // 找到 '<' 符号，但是并不符合上面几种情况，可能是 '<文本' 这些，就认为它是一段纯文本
      // 继续从 html 字符串中找到下一个 <，直到 <xx 是上述几种情况的标签，则结束
      // 整个过程中一直在调整 textEnd 的值，作为 html 中下一个有效标签的开始位置
      if (textEnd >= 0) {
        // 截取 html 字符串 textEnd 后面的部分
        rest = html.slice(textEnd)

        // 这个 while 循环就是处理 <xx 之后的纯文本情况
        // 截取文本内容，并找到有效标签的开始位置（textEnd）
        // endTag: 结束标签正则
        // startTagOpen: 开始标签正则
        // comment: 注释标签
        // conditionalComment: 条件注释标签
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // 在这些纯文本中查找下一个 <
          next = rest.indexOf('<', 1)
          // 没找到，结束循环
          if (next < 0) break
          // 找到了 <，索引位置为 textEnd
          textEnd += next
          // 截取 html 字符串 textEnd 之后的内容，继续循环判断之后的字符串是否符合上面三几种情况
          rest = html.slice(textEnd)
        }
        // 遍历结束，有两种情况
        //  '<' 之后就是一段纯文本，没有有效标签
        //  '<' 之后找到了有效标签，有效标签的开始位置索引是 textEnd，索引之前的是文本，截取文本
        text = html.substring(0, textEnd)
      }

      // 如果 textEnd 小于 0，那么代表 html 字符串中没找到 '<'
      // 那么说明 html 就是一段文本
      if (textEnd < 0) {
        text = html
      }

      // 将 文本内容从 html 字符串上截取掉
      if (text) {
        advance(text.length)
      }

      // 调用 parseHTMLOptions.chars 处理文本
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 处理 script、style、textarea 标签中的文本和结束标签
      let endTagLength = 0
      // 将标签转换为小写
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))

      // 匹配并处理开始标签和结束标签之间的所有文本，比如 <script>xx</script>
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }

        // 使用 parseHTMLOptions.chars 处理标签之间的所有文本  <script>xxaacc</script>
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      // 处理 script、style、textarea 的结束标签
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }
}
```

上面这个是 parseHTML 主体函数，主要做的就是：

- 用正则表达式匹配出开始标签、结束标签、文本、注释等内容
- 在匹配出这些内容后，结合各自对应的回调函数进行处理，生成 AST 节点

基本流程就是：while 循环解析 template，用正则做匹配，根据匹配情况做不同的处理，直到整个 template 解析完



parseHTML 里面还有几个辅助函数：用于解析不同情况的标签：

##### advance

> vue\src\compiler\parser\html-parser.js

```js
// 主要用来重置 html，html 为从索引 n 位置开始的向后的所有字符，通过 substring 截取
// 并使用 index 记录下一次处理 html 字符的开始位置
function advance (n) {
  index += n
  html = html.substring(n)
}
```



##### parseStartTag

> vue\src\compiler\parser\html-parser.js

```js
// 解析开始标签，返回 match 对象
// match = { tagName: '', attrs: [[xxx], ...], start: xx, end: xx }
function parseStartTag() {
  // 比如刚开始的标签 <div id="app">，start=['<div', 'div']
  const start = html.match(startTagOpen)
  if (start) {
    const match = {
      tagName: start[1], // 标签名
      attrs: [], // 属性
      start: index // 标签的开始索引
    }

    // 调整 html 字符串（将处理过的标签截掉）和 index 位置
    advance(start[0].length)

    let end, attr
    // 处理 开始标签 内的各个属性，并将这些属性放到 match.attrs 数组中
    // 例如：<div id="app"> 里面的 id="app"
    while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
      attr.start = index

      // 调整 html 字符串（将处理过的标签截掉）和 index 位置
      advance(attr[0].length)
      attr.end = index
      match.attrs.push(attr)
    }
    // 开始标签的结束符，例如：'>' 或者 '/>'
    if (end) {
      match.unarySlash = end[1]

      // 调整 html 字符串（将处理过的标签截掉）和 index 位置
      advance(end[0].length)
      match.end = index
      // 最后将 match 对象返回，包括标签名、属性和标签开始索引
      return match
    }
  }
}
```

解析开始标签，将开始标签的标签名、标签上的属性、开始索引、结束索引组成 match 对象返回，比如：`<div id="app">` 被解析后的 match 是：

![](/imgs/img22.png)



##### handleStartTag

> vue\src\compiler\parser\html-parser.js

```js
/**
 * 进一步处理开始标签返回的 match 对象
 * @param {*} match 
 */
function handleStartTag (match) {
  const tagName = match.tagName // 标签名
  const unarySlash = match.unarySlash

  if (expectHTML) {
    if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
      parseEndTag(lastTag)
    }
    if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
      parseEndTag(tagName)
    }
  }

  // 是否一元标签，例如 <hr />
  const unary = isUnaryTag(tagName) || !!unarySlash

  const l = match.attrs.length
  const attrs = new Array(l)
  // 遍历处理 attrs，得到更完整的描述信息:
  // arrts = [{ name: 'xx', value: 'xx', start: xx, end: xx }, ...]
  for (let i = 0; i < l; i++) {
    const args = match.attrs[i]
    const value = args[3] || args[4] || args[5] || ''
    const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
      ? options.shouldDecodeNewlinesForHref
      : options.shouldDecodeNewlines
    attrs[i] = {
      name: args[1],
      value: decodeAttr(value, shouldDecodeNewlines)
    }
    if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
      attrs[i].start = args.start + args[0].match(/^\s*/).length
      attrs[i].end = args.end
    }
  }

  // 如果不是一元标签（自闭合标签），那么将这些标签放进 stack 数组，例如 <div>、<p> 之类的
  if (!unary) {
    stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
    lastTag = tagName
  }

  // 调用 parseHTMLOptions 的 start 处理开始标签
  if (options.start) {
    options.start(tagName, attrs, unary, match.start, match.end)
  }
}
```

handleStartTag 的主要逻辑：

- 进一步处理 parseStartTag 返回的开始标签的 match 对象
- 将继续处理过的开始标签对象放进 stack 数组（主要是为处理结束标签的时候，可以找到对应的开始标签）
- parseHTMLOptions 的 start 方法处理开始标签



##### parseEndTag

> vue\src\compiler\parser\html-parser.js

```js
/**
 * 解析结束标签：
 *  处理 stack 数组，从 stack 中找到当前结束标签对应的开始标签，如果找到的开始标签位置不对说明有标签没有闭合，发出警告
 *  调用 parseHTMLOptions 的 end 函数处理结束标签
 *  处理完结束标签之后调整 stack 数组，保证在正常情况下 stack 数组中的最后一个是下一个结束标签对应的开始标签
 * @param {*} tagName 结束标签名，例如：div
 * @param {*} start 结束标签的开始索引
 * @param {*} end 结束标签的结束索引
 */
function parseEndTag (tagName, start, end) {
  let pos, lowerCasedTagName
  if (start == null) start = index
  if (end == null) end = index

  // Find the closest opened tag of the same type
  // 倒序遍历 stack 数组，找到第一个和当前结束标签相同的标签，该标签就是结束标签对应的开始标签
  // 没有异常情况下，stack 数组中的最后一个元素就是当前结束标签的开始标签
  if (tagName) {
    lowerCasedTagName = tagName.toLowerCase()
    for (pos = stack.length - 1; pos >= 0; pos--) {
      if (stack[pos].lowerCasedTag === lowerCasedTagName) {
        break
      }
    }
  } else {
    // If no tag name is provided, clean shop
    pos = 0
  }

  if (pos >= 0) {
    // Close all the open elements, up the stack
    // 假设 stack = ['div', 'p', 'span']，当前处理的结束标签 tagName='p'
    // 那么匹配到的索引是 1，并不是最后一位，代表 span 没有关闭标签，那么发出警告
    for (let i = stack.length - 1; i >= pos; i--) {
      if (process.env.NODE_ENV !== 'production' &&
        (i > pos || !tagName) &&
        options.warn
      ) {
        options.warn(
          `tag <${stack[i].tag}> has no matching end tag.`,
          { start: stack[i].start, end: stack[i].end }
        )
      }

      // 调用 parseHTMLOptions 的 end 函数处理结束标签
      if (options.end) {
        options.end(stack[i].tag, start, end)
      }
    }

    // Remove the open elements from the stack
    // 从 stack 中移除处理过的标签，保证数组的最后一个是下一个结束标签对应的开始标签
    stack.length = pos
    // 记录 stack 中未处理的最后一个开始标签
    lastTag = pos && stack[pos - 1].tag
  } else if (lowerCasedTagName === 'br') {
    // 处理 <br /> 标签
    if (options.start) {
      options.start(tagName, [], true, start, end)
    }
  } else if (lowerCasedTagName === 'p') {
    if (options.start) {
      // 处理 <p> 标签
      options.start(tagName, [], false, start, end)
    }
    if (options.end) {
      // 处理 </p> 标签
      options.end(tagName, start, end)
    }
  }
}
```





#### 3-5-3、parseHTML 的 options 中的回调函数

上面一直说 parseHTMLOptions ，它是什么呢？回头来看看调用 parseHTML 的时候：

> vue\src\compiler\parser\index.js

```js
parseHTML(template, {
  warn,
  expectHTML: options.expectHTML,
  isUnaryTag: options.isUnaryTag,
  canBeLeftOpenTag: options.canBeLeftOpenTag,
  shouldDecodeNewlines: options.shouldDecodeNewlines,
  shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
  shouldKeepComment: options.comments,
  outputSourceRange: options.outputSourceRange,

  start (tag, attrs, unary, start, end) {/.../},
  end (tag, start, end) {/.../},
  chars (text: string, start: number, end: number) {/.../},
  comment (text: string, start, end) {/.../}
})
```

> vue\src\compiler\parser\html-parser.js

```js
function parseHTML (html, options) {
  // ...

  // 调用 parseHTMLOptions 的 comment 函数，得到注释内容、注释节点开始索引和结束索引
  options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)

  // ...
}
```

所以 parseHTMLOptions 实际上就是调用 parseHTML 是传进来的 options 对象，最重要的就是里面的 start、end、chars、comment 这四个回调函数：



##### start

> vue\src\compiler\parser\index.js

```js
/**
 * 真正将开始标签转换成 ast 的方法：
 * @param {*} tag 标签名
 * @param {*} attrs [{ name: 'id', value: 'app', start: 5, end: 13 }, ...] 形式的属性数组
 * @param {*} unary 是否自闭合标签，类似 <hr />
 * @param {*} start 开始索引
 * @param {*} end 结束索引
 */
start(tag, attrs, unary, start, end) {
  // check namespace.
  // inherit parent ns if there is one
  // 检查命名空间，如果存在，则继承父命名空间
  const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

  // handle IE svg bug
  /* istanbul ignore if */
  if (isIE && ns === 'svg') {
    attrs = guardIESVGBug(attrs)
  }

  // 通过 createASTElement 创建当前标签的 AST 对象
  let element: ASTElement = createASTElement(tag, attrs, currentParent)

  // 如果命名空间存在，设置命名空间
  if (ns) {
    element.ns = ns
  }

  // ...

  if (isForbiddenTag(element) && !isServerRendering()) {
    // 非服务端渲染，在 ast 对象 element 标记 forbidden 为 true
    element.forbidden = true
    // ...
  }

  // apply pre-transforms
  /**
   * 为 element 对象分别执行 class、style、model 模块中的 preTransforms 方法
   * 在 web 平台只有 model 模块有 preTransforms
   * 用来处理存在 v-model 的 input 标签，但没处理 v-model 属性
   * 分别处理了 input 的 type 为 checkbox、radio 及 其它的情况
   */
  for (let i = 0; i < preTransforms.length; i++) {
    element = preTransforms[i](element, options) || element
  }

  // ast 对象 element 是否存在 v-pre 指令，存在则设置 inVPre = true
  if (!inVPre) {
    processPre(element)
    if (element.pre) {
      inVPre = true
    }
  }

  // 如果是 pre 标签，设置 inPre = true，注意这里与上面 v-pre 的区别，这里是 inPre，上面是 inVPre
  if (platformIsPreTag(element.tag)) {
    inPre = true
  }

  if (inVPre) {
    // 代表标签上存在 v-pre 指令
    // 这样的节点只会渲染一次，将节点上的属性都设置到 el.attrs 数组对象中，作为静态属性，数据更新时不会渲染这部分内容
    processRawAttrs(element)
  } else if (!element.processed) {
    // 处理 v-for 指令
    // 例如: <div v-for="item in list">
    // 解析后得到：element.for="list"、element.alias="item"
    processFor(element)

    // 处理 v-if、v-else-if、v-else
    // 例如，<div v-if="msg">，处理后得到 element.if="msg"
    processIf(element)

    //  处理 v-once 指令，element.once=true
    processOnce(element)
  }

  // 如果根元素不存在，那么将当前元素设置为根元素
  if (!root) {
    root = element
    if (process.env.NODE_ENV !== 'production') {
      checkRootConstraints(root)
    }
  }

  if (!unary) {
    // 不是自闭合标签，用 currentParent 记录当前标签
    // 处理下一个元素时，可以知道自己的父元素是谁
    // 因为 ast 是一个树状结构，最终子元素是要挂在父元素的 children 上的
    currentParent = element

    // 将当前元素 ast 存到 stack 数组，将来处理到当前元素的闭合标签时再拿出来
    // 注意这里的 stack 数组，在调用 options.start 方法之前也发生过一次 push 操作
    // 那个 stack 数组与这个 stack 不是同一个
    stack.push(element)
  } else {
    // 如果当前元素为自闭合标签，例如 <hr />
    //   如果元素没有被处理过，即 el.processed 为 false，则调用 processElement 方法处理节点上的众多属性
    //   让自己和父元素产生关系，将自己放到父元素的 children 数组中，并设置自己的 parent 属性为 currentParent
    //   设置自己的子元素，将自己所有非插槽的子元素放到自己的 children 数组中
    closeElement(element)
  }
}
```

这个是真正将开始标签转化为 ast 的地方，主要做的事：

 *  创建 AST 对象
 *  处理存在 v-model 指令的 input 标签，分别处理 input 的 type 为 checkbox、radio、其它的情况
 *  处理标签上的一些指令，比如 v-pre、v-for、v-if、v-once
 *  如果根节点 root 不存在则设置当前元素为根节点
 *  如果当前元素为非自闭合标签则将自己 push 到 stack 数组，并记录 currentParent，在接下来处理子元素时用来告诉子元素自己的父节点是谁
 *  如果当前元素为自闭合标签，则表示该标签要处理结束了，让自己和父元素产生关系，以及设置自己的子元素



##### end

> vue\src\compiler\parser\index.js

```js
/**
 * 处理结束标签
 * @param {*} tag 结束标签名
 * @param {*} start 结束标签开始位置索引
 * @param {*} end 结束标签结束位置索引
 */
end(tag, start, end) {
  // 取出 stack 中最后一个 开始标签 ast 对象
  // 这个 开始标签 ast 对象 对应的就是当前结束元素的开始标签
  const element = stack[stack.length - 1]
  // pop stack
  stack.length -= 1
  currentParent = stack[stack.length - 1]
  if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
    element.end = end
  }

  // 处理这个标签（包含开始结束）的 ast
  //  如果元素没有被处理过，则调用 processElement 方法处理节点上的众多属性
  //  让自己和父元素产生关系，将自己放到父元素的 children 数组中，并设置自己的 parent 属性为 currentParent
  //  设置自己的子元素，将自己所有非插槽的子元素放到自己的 children 数组中
  closeElement(element)
}
```



##### chars

> vue\src\compiler\parser\index.js

```js
/**
* 处理文本：
*  基于文本生成 ast，并且将这个 ast 放到父元素的 children 上
* @param {*} text // 文本内容
* @param {*} start // 文本开始位置索引
* @param {*} end // 文本结束位置索引
* @returns 
*/
chars(text: string, start: number, end: number) {
  // currentParent 不存在，代表这段文本没有父元素，报错
  if (!currentParent) {
    // ...
  }
    
  // ...

  // 获取父元素的 children
  const children = currentParent.children

  // 对 text 进行一些处理，例如 trim 删除前后空格
  if (inPre || text.trim()) {
    text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
  } else if (!children.length) {
    // remove the whitespace-only node right after an opening tag
    text = ''
  } else if (whitespaceOption) {
    if (whitespaceOption === 'condense') {
      // in condense mode, remove the whitespace node if it contains
      // line break, otherwise condense to a single space
      text = lineBreakRE.test(text) ? '' : ' '
    } else {
      text = ' '
    }
  } else {
    text = preserveWhitespace ? ' ' : ''
  }

  // 经过处理后，text 还存在，将 text 转换成 AST 对象 child
  if (text) {
    if (!inPre && whitespaceOption === 'condense') {
      // condense consecutive whitespaces into single space
      text = text.replace(whitespaceRE, ' ')
    }
    let res
    let child: ?ASTNode
    if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
      child = {
        type: 2,
        expression: res.expression,
        tokens: res.tokens,
        text
      }
    } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
      child = {
        type: 3,
        text
      }
    }

    // 如果 AST 对象 child 存在，将其加入到父元素的 children 中
    if (child) {
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        child.start = start
        child.end = end
      }
      children.push(child)
    }
  }
}
```



##### comment

> vue\src\compiler\parser\index.js

```js
// 处理注释节点
comment (text: string, start, end) {
  // adding anyting as a sibling to the root node is forbidden
  // comments should still be allowed, but ignored
  // 禁止将任何内容作为 root 同级进行添加，注释节点除外，但是会被忽略
  // currentParent 是父元素，父元素存在，代表注释与 root 不同级
  // 父元素不存在，代表代表注释与 root 同级，忽略
  if (currentParent) {
    // 创建注释节点 ast
    const child: ASTText = {
      type: 3, // 节点类型
      text, // 注释内容
      isComment: true // isComment=true 代表是注释节点
    }
    if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
      // 记录注释节点的开始和结束位置索引
      child.start = start
      child.end = end
    }

    // 将当前注释节点 ast 放到父元素的 children 中
    currentParent.children.push(child)
  }
}
```



#### 3-5-4、createASTElement

> vue\src\compiler\parser\index.js

```js
/**
 * 为指定标签元素创建 ast 对象
 * @param {*} tag 元素标签
 * @param {*} attrs // attrs 属性数组，[{ name: 'id', value: 'app', start, end }, ...]
 * @param {*} parent 父元素 ast
 * @returns 
 */
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1, // 节点类型
    tag, // 标签名
    attrsList: attrs, // 标签属性数组 [{ name: 'id', value: 'app', start, end }, ...]
    attrsMap: makeAttrsMap(attrs), // 将属性数组转换为属性对象形式，{ id: 'app' }
    rawAttrsMap: {}, // 原始属性对象
    parent, // 父元素 ast
    children: [] // 子元素数组
  }
}
```

主要用来给指定标签元素创建 ast 对象，例如开始标签转换为 ast



#### 3-5-5、closeElement

> vue\src\compiler\parser\index.js

```js
function closeElement (element) {
  trimEndingWhitespace(element)
  // 当前元素不在 pre 节点内，并且没有被处理过
  if (!inVPre && !element.processed) {
    // 分别调用不同方法处理元素节点的 key、ref、插槽、自闭合的 slot 标签、动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
    element = processElement(element, options)
  }

  // tree management
  // 处理根节点上有 v-if、v-else-if、v-else 的情况
  // 如果根节点有 v-if，那么必须要有一个具有 v-else-if、v-else 的同级节点，防止根元素不存在
  if (!stack.length && element !== root) {
    // allow root elements with v-if, v-else-if and v-else
    if (root.if && (element.elseif || element.else)) {
      if (process.env.NODE_ENV !== 'production') {
        checkRootConstraints(element)
      }
      addIfCondition(root, {
        exp: element.elseif,
        block: element
      })
    } else if (process.env.NODE_ENV !== 'production') {
      warnOnce(
        `Component template should contain exactly one root element. ` +
        `If you are using v-if on multiple elements, ` +
        `use v-else-if to chain them instead.`,
        { start: element.start }
      )
    }
  }

  // 让自己与父元素产生联系
  // 将自己放到父元素的 children 数组中，然后设置自己的 parent 属性为 currentParent
  if (currentParent && !element.forbidden) {
    if (element.elseif || element.else) {
      processIfConditions(element, currentParent)
    } else {
      if (element.slotScope) {
        // scoped slot
        // keep it in the children list so that v-else(-if) conditions can
        // find it as the prev node.
        const name = element.slotTarget || '"default"'
        ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
      }
      currentParent.children.push(element)
      element.parent = currentParent
    }
  }

  // final children cleanup
  // filter out scoped slots
  // 设置自己的子元素
  // 将自己的所有非插槽的子元素设置到 element.children 数组中
  element.children = element.children.filter(c => !(c: any).slotScope)
  // remove trailing whitespace node again
  trimEndingWhitespace(element)

  // check pre state
  if (element.pre) {
    inVPre = false
  }
  if (platformIsPreTag(element.tag)) {
    inPre = false
  }

  // apply post-transforms
  for (let i = 0; i < postTransforms.length; i++) {
    postTransforms[i](element, options)
  }
}
```

closeElement 主要做的事：

- 如果元素没有被处理过，调用 processElement 方法处理节点上的众多属性
  - processElement 会分别调用不同方法处理元素节点的 key、ref、插槽、自闭合的 slot 标签、动态组件、class、style、v-bind、v-on、其它指令以及一些原生属性
- 让自己与父元素产生联系，将自己放到父元素的 children 数组中，并设置自己的 parent 属性为 currentParent
- 设置自己的子元素，将自己所有非插槽的子元素放到自己的 children 数组中



#### 3-5-6、processElement 

> vue\src\compiler\parser\index.js

```js
/**
 * 调用不同的函数处理元素节点的 key、ref、插槽、自闭合的 slot 标签、动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
 * 如果标签上有相应属性被处理，例如标签上有 key、ref、:class 这三个属性
 * 那么处理过后，会给 ast 添加上 key、ref、bindingClass 这三个属性
 * @param {*} element ast
 * @param {*} options 
 * @returns 
 */
export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  // 处理 key，得到 element.key = xxx
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  // 确定 element 是否为一个普通元素
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )

  // 处理 ref，得到 element.ref = xxx, element.refInFor = boolean
  processRef(element)

  // 处理作为插槽传递给组件的内容
  // 得到插槽名称、是否为动态插槽、作用域插槽的值，以及插槽中的所有子元素，子元素放到插槽对象的 children 属性中
  processSlotContent(element)
  processSlotOutlet(element)

  // 处理动态组件，<component :is="compoName">，得到 element.component = compName
  // 标记是否存在内联模版，element.inlineTemplate = boolean
  processComponent(element)

  // 为 ast 分别执行 class、style、model 模块中的 transformNode 方法，具体在：src\platforms\web\compiler\modules
  // 不过 web 平台只有 class、style 模块有 transformNode 方法，分别用来处理 class 属性和 style 属性
  // 得到 element.staticStyle 存放静态 style 属性的值、 element.styleBinding 存放动态 style 属性的值
  // element.staticClass 存放静态 class 属性的值、element.classBinding 存放动态 class 属性的值
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }

  /**
   * 处理 v-bind、v-on、其他指令（例如 v-model 归入其他指令）
   * v-bind 指令变成：el.dynamicAttrs = [{ name, value, start, end, dynamic }, ...]，
   *                或者是使用 props 的属性，变成了 el.props = [{ name, value, start, end, dynamic }, ...]
   * v-on 指令变成：el.events = { eventName: { value, start, end, dynamic },  }
   * 其它指令：el.directives = [{name, rawName, value, arg, isDynamicArg, modifier, start, end }, ...]
   */
  processAttrs(element)
  return element
}
```



#### 3-5-7、总结

**parse 将 template 模板字符串模版变成 AST 对象的过程：**

1. 遍历 template 模版字符串，通过正则表达式匹配标签开始符号 "<"

2. 跳过某些不需要处理的标签，比如：注释标签、条件注释标签、Doctype 类型标签。

3. 解析开始标签（核心就是解析开始标签和结束标签）
   - 用 match 对象形式去描述当前标签，这个对象包括 标签名（tagName）、所有的属性（attrs）、标签在 html 模版字符串中的索引位置
   - 进一步处理上一步得到的 attrs 属性，将其变成 [{ name: attrName, value: attrVal, start: xx, end: xx }, ...] 的形式
   - 通过标签名、属性对象和当前元素的父元素生成 AST 对象，其实就是一个 普通的 JS 对象，通过 key、value 的形式记录了该元素的一些信息
   - 接下来进一步处理开始标签上的一些指令，比如 v-pre、v-for、v-if、v-once，并将处理结果放到 AST 对象上
   - 处理结束将 ast 对象存放到 stack 数组
   - 处理完成后会截断 html 字符串，将已经处理掉的字符串截掉

4. 解析闭合标签
   - 如果匹配到结束标签，就从 stack 数组中拿出最后一个元素，它和当前匹配到的结束标签是一对。
   - 再次处理开始标签上的属性，这些属性和前面处理的不一样，比如：key、ref、scopedSlot、样式等，并将处理结果放到元素的 AST 对象上
   - 然后将当前元素和父元素产生联系，给当前元素的 ast 对象设置 parent 属性，然后将自己放到父元素的 ast 对象的 children 数组中

5. 最后遍历完整个 template 模版字符串以后，返回 ast 对象



### 3-6、optimize 静态节点优化



#### 3-6-1、入口

> vue\src\compiler\index.js

```js
function baseCompile (template: string,options: CompilerOptions): CompiledResult {

  // parse 过程：将 html 转换为 ast 树
  // 每个节点的 ast 树都设置了元素的所有信息：标签信息、属性信息、插槽信息、父节点、子节点等
  const ast = parse(template.trim(), options)

  // optimize：遍历 ast，当遇到静态节点打上静态节点标记，然后进一步标记出静态根节点
  // 这样在后续更新进行 dom diff 比对的时候就可以跳过这些静态节点
  // 标记静态根节点：在生成渲染函数阶段，生成静态根节点的渲染函数
  if (options.optimize !== false) {
    optimize(ast, options)
  }

  // generate: 将 ast 生成 render 代码串、staticRenderFns 静态根节点代码串
  const code = generate(ast, options)

  // 将 ast、render 代码串、staticRenderFns 静态根节点代码串
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
```

可以发现，对静态节点做优化主要是调用了 optimize 函数，将 ast 和 编译配置 options 传进去



#### 3-6-2、optimize 

> vue\src\compiler\optimizer.js

```js
function optimize (root: ?ASTElement, options: CompilerOptions) {
  // 不存在 ast，直接退出
  if (!root) return

  isStaticKey = genStaticKeysCached(options.staticKeys || '')

  // 是否是平台保留标签
  isPlatformReservedTag = options.isReservedTag || no

  // 第一步：递归所有节点，为节点添加 static 属性
  // static=flase 代表动态节点； static=true 代表静态节点
  markStatic(root)

  // 第二步：标记静态根，一个节点要成为静态根节点需要的条件：
  //  节点本身是静态节点，并且有子节点，并且子节点不是文本节点，则标记为静态根
  //   例子：<div>hello</div>，这种就不符合 子节点不是文本节点 的条件，div 不会被标记为静态根
  //   例子：<div><p>hello</p></div> 这种符合，标记 div 为静态根
  markStaticRoots(root, false)
}
```

optimize 函数主要做了两件事：

- 递归所有节点，为节点添加 static 属性，static=flase 代表动态节点； static=true 代表静态节点
- 标记静态根



#### 3-6-3、markStatic

> vue\src\compiler\optimizer.js

```js
/**
 * 递归 ast，为所有节点添加 static 属性，static=false 代表动态节点，static=true 代表静态节点
 *  如果有子节点为动态节点，父节点也会被改为动态节点
 * @param {*} node 
 * @returns 
 */
function markStatic (node: ASTNode) {
  // 通过 node.static 来标识节点是否为 静态节点
  // isStatic 函数返回 boolean
  node.static = isStatic(node)

  // node 的 type=1 说明是 元素节点
  if (node.type === 1) {

    // 不要将组件的插槽内容设置为静态节点，这样可以避免：
    //  1、组件不能改变插槽节点
    //  2、静态插槽内容在热重载时失败
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      // 不是平台保留标签(div、p 这些是浏览器平台标签)、不是 slot 插槽标签、不是内联模板 uinline-template
      // 结束递归
      return
    }

    // 遍历子节点，递归调用 markStatic 标记子节点的 static 属性
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)

      // 如果字节点是非静态节点，那么父节点更改为非静态节点
      if (!child.static) {
        node.static = false
      }
    }

    // 如果节点存在 v-if、v-else-if、v-else 这些指令
    // 则标记 node.ifConditions 中 block 中节点的 static=false
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}
```



#### 3-6-4、isStatic

> vue\src\compiler\optimizer.js

```js
/**
 * 判断节点是否为静态节点：
 *  通过 node.type 来判断，type=2: 表达式{{msg}}，那么为动态；type=3: 纯文本，静态
 *  凡是有 v-bind、v-if、v-for 等指令的都属于动态节点
 *  组件为动态节点
 *  父节点为含有 v-for 指令的 template 标签，则为动态节点
 * @param {*} node 
 * @returns boolean
 */
function isStatic (node: ASTNode): boolean {
  // 如果是表达式，返回 false，代表是动态节点
  // 例如 {{ msg }}
  if (node.type === 2) { // expression
    return false
  }

  // 如果是文本节点，返回 true，代表是静态节点
  // 例如：hello world
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}
```



#### 3-6-5、markStaticRoots

> vue\src\compiler\optimizer.js

```js
/**
 * 标记静态根节点，静态根节点的条件：
 *   节点本身是静态节点，并且有子节点，并且子节点不是文本节点，则标记为静态根
 *   其实还有隐藏条件：子节点必须是静态节点，但是在上面标记静态节点的时候
 *   如果字节点存在动态节点，当前节点会被更新为动态节点
 *     例子：<div>hello</div>，这种就不符合 子节点不是文本节点 的条件，div 不会被标记为静态根
 *     例子：<div><p>hello</p></div> 这种符合，标记 div 为静态根
 * @param {*} node ast
 * @param {*} isInFor 当前节点是否被包裹在 v-for 指令所在的节点内
 * @returns 
 */
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  // 如果是元素节点
  if (node.type === 1) {
    if (node.static || node.once) {
      // 节点是静态的 或者 节点上有 v-once 指令，标记 node.staticInFor = true or false
      node.staticInFor = isInFor
    }

    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 节点本身是静态节点，并且有子节点，并且子节点不是文本节点，则标记为静态根
    //  例子：<div>hello</div>，这种就不符合 '子节点不是文本节点' 的条件，div 不会被标记为静态根
    //  例子：<div><p>hello</p></div> 这种符合，标记 div 为静态根
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 标记为静态根
      node.staticRoot = true
      // 退出当前函数
      return
    } else {
      node.staticRoot = false
    }

    // 当前节点不是静态根是，递归子节点，查找子节点是否有符合静态根条件的节点
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }

    // 如果节点存在 v-if、v-else-if、v-else 指令，则为 block 节点标记静态根
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}
```



#### 3-6-6、总结

vue 的编译中，标记静态节点分为两步：

- 标记静态节点
  - 递归 ast 所有元素节点，为所有节点添加 static 属性；static=false，代表动态节点；static=true，代表态节点
  - 如果节点本身是静态节点，但是存在非静态的子节点，则将节点更新为非静态节点
- 标记静态根
  - 如果节点本身是静态节点，并且有子节点，并且子节点是静态节点，并且子节点不全是文本节点，则标记为静态根节点
  - 如果节点本身不是静态根节点，则递归的遍历所有子节点，在子节点中查找符合静态根的节点标记



### 3-7、generate 将 ast 转换为渲染函数代码串

vue2.x 生成的渲染函数可以利用网站查看： https://template-explorer.vuejs.org/

![](/imgs/img23.png)



#### 3-7-1、入口

> vue\src\compiler\index.js

```js
function baseCompile (template: string,options: CompilerOptions): CompiledResult {

  // parse 过程：将 html 转换为 ast 树
  // 每个节点的 ast 树都设置了元素的所有信息：标签信息、属性信息、插槽信息、父节点、子节点等
  const ast = parse(template.trim(), options)

  // optimize：遍历 ast，当遇到静态节点打上静态节点标记，然后进一步标记出静态根节点
  // 这样在后续更新进行 dom diff 比对的时候就可以跳过这些静态节点
  // 标记静态根节点：在生成渲染函数阶段，生成静态根节点的渲染函数
  if (options.optimize !== false) {
    optimize(ast, options)
  }

  // generate: 将 ast 生成 render 代码串、staticRenderFns 静态根节点代码串
  const code = generate(ast, options)

  // 将 ast、render 代码串、staticRenderFns 静态根节点代码串
  return {
    ast,
    render: code.render, // 动态节点渲染函数
    staticRenderFns: code.staticRenderFns // 静态节点渲染函数
  }
}
```

可以发现，将 ast 生成 render 代码串主要调用了 generate 函数，将处理后的 ast 还有编译配置 options 当做参数。



#### 3-7-2、generate 

> vue\src\compiler\codegen\index.js

```js
// 将 ast 转换为 render 代码串
// 例如：
// <div id="app"><p>{{msg}}</p></div> 转换为：
// {
//   render: 'with(this){return _c('div', { attr: {id: 'app'}}, [_c('p', [_v(_s(msg))])])}',
//   staticRenderFns: state.staticRenderFns
// }
export function generate (
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  // 实例化 CodegenState，里面会初始化一些东西，例如 staticRenderFns
  const state = new CodegenState(options)

  // 生成字符串格式的代码串，例如：'_c(tag, data, children, normalizationType)'
  //   tag: 标签名
  //   data: 例如 { id: 'app' }
  //   children: 所有子节点的的字符串代码
  //   normalizationType: 节点的规范化类型
  // 比如生成了：'_c('div', { attr: {id: 'app'}}, [_c('p', [_v(_s(msg))])])'
  // code 并不一定就是 _c，也有可能是其它的，比如整个组件都是静态的，那么就是 _m(0)
  const code = ast ? genElement(ast, state) : '_c("div")'
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}
```



#### 3-7-3、genElement

> vue\src\compiler\codegen\index.js

```js
// getElement 函数会根据不同指令类型处理不同的分支
function genElement (el: ASTElement, state: CodegenState): string {
  if (el.parent) {
    el.pre = el.pre || el.parent.pre
  }

  if (el.staticRoot && !el.staticProcessed) {
    // 处理静态根节点，将静态节点的渲染函数放到 staticRenderFns 数组中
    // 返回一个可执行函数 _m(index, true or '')，index 是渲染函数在 staticRenderFns 数组中的下标
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    // 处理 v-once 的情况
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    // 处理 v-for，得到：
    // `_l(exp, function(alias, iterator1, iterator2){return _c(tag, data, children)})`
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    // 处理 v-if，得到一个三元表达式，例如：
    // <p v-if="show"></p> <p v-else></p>
    // 得到 (_vm.show) ? _c('p') : _c('p')
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    // 当前节点是 template 标签，并且不是插槽也没有 v-pre，生成所有子节点的渲染函数
    // 得到的是一个数组：[_c(tag, data, children, normalizationType), ...]
    // <template>
    //   <p><p></p></p>
    // </template>
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    // 处理插槽，得到：_t(slotName, children, attrs, bind)
    return genSlot(el, state)
  } else {
    // component or element
    // 处理动态组件和普通元素（自定义组件、原生标签）
    let code
    // 组件
    if (el.component) {
      // 处理动态组件，得到：_c(compName, data, children)
      code = genComponent(el.component, el, state)
    } else {
      // 
      let data
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        // 处理节点上的众多属性，不包括 v-if、v-for 这些上面处理过的
        // 会处理 id、class、@click 等等属性，最后生成的类似：
        // data = { key: xxx, attrs: { id: aaa }, ... }
        data = genData(el, state)
      }

      // 处理子节点，得到所有子节点字符串格式的代码组成的数组
      // 例如: [_c(tag, data, children, normalizationType), ...] 
      const children = el.inlineTemplate ? null : genChildren(el, state, true)

      // 得到最终的字符串格式的代码，类似：'_c(tag, data, children)'
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }

    return code
  }
}
```



#### 3-7-4、genStatic

用来处理静态节点

> vue\src\compiler\codegen\index.js

```js
/**
 * 生成静态节点的渲染函数字符串
 *  将当前静态节点的渲染函数放到 staticRenderFns 数组中
 *  返回一个可执行函数 _m(index, true or '')，index 是渲染函数字符串在 staticRenderFns 数组中下标
 */
function genStatic (el: ASTElement, state: CodegenState): string {
  // 用于标记当前节点已经被处理过了
  el.staticProcessed = true

  // Some elements (templates) need to behave differently inside of a v-pre
  // node.  All pre nodes are static roots, so we can use this as a location to
  // wrap a state change and reset it upon exiting the pre node.
  const originalPreState = state.pre
  if (el.pre) {
    state.pre = el.pre
  }

  // 将静态节点的渲染函数放进 state.staticRenderFns 数组中
  // 例如: state.staticRenderFns = ['_c(tag, data, children)']
  state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`)
  state.pre = originalPreState

  // 返回一个函数 _m(index, true or '')
  // index 是当前静态节点的渲染函数在 staticRenderFns 数组中下标
  return `_m(${
    state.staticRenderFns.length - 1
  }${
    el.staticInFor ? ',true' : ''
  })`
}
```



#### 3-7-5、genFor

用来处理 v-for 的情况

> vue\src\compiler\codegen\index.js

```js
// 处理 v-for，例如：
// <p v-for="item in list" :key="item">1111</p>，得到：
// _l((list), function(item){return _c('p', {key:item}, [_v(\"1111\")])})])
export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  // v-for 的迭代器，比如: v-for="item in list", 这个 el.for 就是 list
  const exp = el.for
  // 迭代的别名
  const alias = el.alias
  // v-for="(item, index) in list"
  // iterator1 是 item
  // iterator2 是 index
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  // 提示，v-for 需要有 key
  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  // 标记当前节点上的 v-for 已被处理过
  el.forProcessed = true // avoid recursion

  // <p v-for="item in list" :key="item">1111</p>，得到：
  // _l((list), function(item){return _c('p', {key:item}, [_v(\"1111\")])})])
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` +
    '})'
}
```



#### 3-7-6、genIf

用于处理 v-if 的情况

> vue\src\compiler\codegen\index.js

```js
// 处理 v-if，得到一个三元表达式，例如：
//   <p v-if="show"></p> <p v-else></p> 得到三元表达式：
//   (_vm.show) ? _c('p') : _c('p')
export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  // 标记当前节点 v-if 指令已被处理过
  el.ifProcessed = true // avoid recursion

  // 得到三元表达式
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}


function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) {
    return altEmpty || '_e()'
  }

  const condition = conditions.shift()
  if (condition.exp) {
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty)
    }`
  } else {
    return `${genTernaryExp(condition.block)}`
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
}
```



#### 3-7-7、genData

> vue\src\compiler\codegen\index.js

```js
// 处理节点上的众多属性（不包括 v-if、v-for 之类已经处理过的）
// 生成属性对象，{ key: xxx, attrs: { id: aaa }, ... }
export function genData (el: ASTElement, state: CodegenState): string {
  let data = '{'

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  // 处理指令，例如：v-text、v-html、v-model
  // 例如：v-html="htmlStr" 得到：_c('div', { domProps: { "innerHTML": _vm._s(_vm.htmlStr) } })
  // 当指令在运行时还有任务时，比如 v-model，有 <input v-model="msg">，最终生成的是： 
  //   _c('input', {
  //     directives: [{ name: "model", rawName: "v-model", value: (_vm.msg), expression: "msg" }],
  //     domProps: { "value": (_vm.msg) },
  //     on: {
  //       "input": function ($event) {
  //         if ($event.target.composing) {
  //           return;
  //         }
  //         _vm.msg = $event.target.value
  //       }
  //     }
  //   })
  //   表单元素的 v-model 在这里处理
  const dirs = genDirectives(el, state)
  if (dirs) data += dirs + ','

  // key
  // 处理 key，data = { key:xxx }
  if (el.key) {
    data += `key:${el.key},`
  }

  // ref
  // 处理 ref， data = { ref:xxx }
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  if (el.refInFor) {
    data += `refInFor:true,`
  }

  // pre
  // 处理 v-pre，data = { pre:true }
  if (el.pre) {
    data += `pre:true,`
  }

  // record original tag name for components using "is" attribute
  // 处理动态组件，data = { tag: 'compoment' }
  if (el.component) {
    data += `tag:"${el.tag}",`
  }

  // module data generation functions
  // 处理(class、style)
  // 得到 data = { staticClass: xx, class: xx, staticStyle: xx, style: xx }
  // staticClass 代表 <p class="test"></p>;  class 代表 <p :class="test"></p>
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }

  // attributes
  // 处理其他的一些属性，例如：<p id="test"></p>
  // 得到 data = { attrs: { id: 'test' } }
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }

  // DOM props，得到：data = { domProps: { xx: aa } }
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }

  // event handlers
  // 处理事件绑定，例如：<p @click="testFun"></p>
  // 得到 data = { on: { 'click': testFun } }
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }

  // slot target
  // only for non-scoped slots
  // 处理非作用域插槽，得到：data = { slot: slotName }
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }

  // scoped slots
  // 处理作用于插槽，得到 data = { scopedSlots: '_u(xxx)' }
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }

  // component v-model
  // 处理组件上的 v-model，比如 <my-compoment v-model="msg" />
  // 得到: { model: { value: (hshs), callback: function ($$v) { msg = $$v }, expression: "msg"}
  // 表单的 v-model 在上面已经处理
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }

  // inline-template
  // 处理内联模板
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}
```



#### 3-7-8、总结

**渲染函数的生成过程：**

说到渲染函数，很可能都会说是 render 函数，其实编译器生成的渲染函数有两类：

- 第一类：就是一个 render 函数，负责生成动态节点的 vnode
- 第二类：放在 staticRenderFns 数组中的静态渲染函数，这些函数负责生成静态节点的 vnode

渲染函数生成的过程，实际上是在遍历 AST 节点树，递归处理每个节点，最后生成的每一个标签渲染函数类似：`_c(tag, attr, children, normalizationType)` 。

- tag 是标签名
- attr 是属性对象
- children 是子节点组成的数组
- normalization 表示节点的规范化类型，是一个数字 0、1、2。



**静态节点的处理分为两步：**

- 将生成静态节点 vnode 函数放到 staticRenderFns 数组中
- 返回一个 _m(idx) 的可执行函数，意思是执行 staticRenderFns 数组中下标为 idx 的函数，生成静态节点的 vnode



v-once、v-if、v-for、组件 等的处理：

- 单纯的 v-once 节点处理方式和静态节点一致
- v-if 节点的处理结果是一个三元表达式
- v-for 节点的处理结果是可执行的 _l 函数，该函数负责生成 v-for 节点的 vnode
- 组件的处理结果和普通元素一样，得到的是形如 `_c(compName)` 的可执行代码，生成组件的 vnode



v-model 的处理：这里先不展开，后面在 v-model 一节再详细说明



### 3-8、编译完成

编译完成，将 template 模板生成了 render 函数，然后就是继续上一节的渲染流程：render 函数 --> VNode --> 真实 Dom 的过程



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



### 5-1、组件的 VNode 

(create-element.js、create-component.js、vnode.js、extend.js)

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



### 5-2、组件的 patch 过程 

(patch.js、create-component.js、init.js)

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

#### 5-4-1、全局注册：

全局注册组件就是 Vue 实例化前创建一个基于 Vue 的子类构造器，并将组件的信息加载到实例 options.components 对象中

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



#### 5-4-2、局部注册: 

在 createElement 中, 发现是组件标签，就调用 createComponent

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



## 6、Vue 常用全局 API

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



下面来看看一些常用的 Vue 全局 api



### 6-1、Vue.set

**基本使用：**

```js
Vue.set(object, key, val)
```



**先看初始化：**

```js
import { set, del } from '../observer/index'

function initGlobalAPI (Vue: GlobalAPI) {
  // ...
    
 Vue.set = set 
}
```



**接着看看这个 set 函数：**

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

**基本使用：**

```js
Vue.delete(object, key)
```



**先看初始化：**

```js
import { set, del } from '../observer/index'

function initGlobalAPI (Vue: GlobalAPI) {
  // ...
    
 Vue.delete = del
}
```



**然后看这个 del 函数：**

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

**基本使用：**

```js
Vue.nextTick(() => {})
```



**先看初始化：**

```js
import { nextTick } from '../util/index'

function initGlobalAPI (Vue: GlobalAPI) {
  // ...
    
 Vue.nextTick = nextTick
}
```



**再看看 nextTick 函数：**

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



### 6-4、Vue.use

**Vue.use 作用：**

- 用于安装 Vue.js 插件
  - 如果插件是一个对象，**必须提供 `install` 方法**
  - 如果插件是一个函数，它会被作为 install 方法
  - install 方法调用时，会将 Vue 作为参数传入
- 该方法需要在调用 `new Vue()` 之前被调用
- 当 install 方法被同一个插件多次调用，插件将只会被安装一次



**基本使用：**

```js
const MyPlugin = {}
MyPlugin.install = function (Vue, options) {
  // 1. 添加全局方法或 property
  Vue.myGlobalMethod = function () {
    // 逻辑...
  }
  // 2. 添加全局资源
  Vue.directive('my-directive', {
    bind (el, binding, vnode, oldVnode) {
      // 逻辑...
    }
    ...
  })
  // 3. 注入组件选项
  Vue.mixin({
    created: function () {
      // 逻辑...
    }
    ...
  })
  // 4. 添加实例方法
  Vue.prototype.$myMethod = function (methodOptions) {
    // 逻辑...
  }
}


// 使用 Vue.use 注册插件
Vue.use(MyPlugin)
```



**先来看看初始化：**

```js
import { initUse } from './use'

function initGlobalAPI (Vue: GlobalAPI) {
 // ...

 initUse(Vue);
}
```



**接着看看 initUse 函数：initUse 函数会将当前 Vue 实例当做参数**

> vue\src\core\global-api\use.js

```js
// 用于安装 vue 插件：
//   1、检查插件是否安装，如果安装了就不再安装
//   2、如果没有没有安装，安装插件，执行插件的 install 方法
export function initUse(Vue: GlobalAPI) {
  // 接受一个 plugin 参数
  Vue.use = function (plugin: Function | Object) {
    // this 就是 Vue 本身
    // _installedPlugins 存储了所有 plugin
    // installedPlugins 与 this._installedPlugins 指向同一个数组
    // 那么只要 installedPlugins 或者 this._installedPlugins 其中一个改变，肯定会影响另外一个
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []);

    // 如果 plugin 在 installedPlugins 已存在，那么返回 Vue（说明安装过，不再重复安装）
    if (installedPlugins.indexOf(plugin) > -1) {
      return this;
    }

    // additional parameters
    const args = toArray(arguments, 1);
    // 将 Vue 实例放到参数数组的首位，后面将这些参数传递给 install 方法
    args.unshift(this);

    if (typeof plugin.install === "function") {
      // plugin 是对象形式，执行 plugin.install, args 的第一项就是 Vue
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === "function") {
      // plugin 是函数形式，直接将 plugin 本身当做 install 来执行
      plugin.apply(null, args);
    }

    // 在插件列表 installedPlugins 和 vue._installedPlugins 中添加新安装的插件
    // 因为上面说过 installedPlugins 和 vue._installedPlugins 指向同一个数组
    installedPlugins.push(plugin);

    // 返回 this（即 Vue）
    return this;
  };
}
```



**vue.use 原理：**

-   检查插件是否安装，如果安装了就不再安装
-   如果没有没有安装，安装插件，执行插件的 install 方法
-   将已安装过的插件保存到 `vue._installedPlugins` 中



### 6-5、Vue.mixin

全局注册一个混入，谨慎使用，影响注册之后所有创建的每个 Vue 实例



**基本使用：**

```js
Vue.mixin({
  created: function () {
    var myOption = this.$options.myOption
    if (myOption) {
      console.log(myOption)
    }
  }
})

new Vue({
  myOption: 'hello!'
})
// 会输出 "hello!"
```



**先看看初始化：**

```js
import { initMixin } from './mixin'

function initGlobalAPI (Vue: GlobalAPI) {
 // ...

 initMixin(Vue);
}
```



**接着看看 initMixin 函数：**

> vue\src\core\global-api\mixin.js

```
// 全局混入选项，影响之后所有创建的 Vue 实例
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 通过 mergeOptions 将 mixin 对象合并到全局的 Vue 配置 options 中
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
```



**mergeOptions 函数：**

> vue\src\core\util\options.js

```js
// 合并两个对象
// 如果子选项与父选项存在相同配置，子选项的配置会覆盖父选项配置
function mergeOptions (parent: Object, child: Object, vm?: Component): Object {
  // 如果子选项是函数，那么取 child.options
  if (typeof child === 'function') {
    child = child.options
  }

  // 标准化 props、inject、directive 选项，方便后续程序的处理
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)

  // 对于 child 继承过来的的 extends 和 mixins，分别调用 mergeOptions，合并到 parent 中
  // 被 mergeOptions 处理过的会有 _base 属性
  if (!child._base) {
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  const options = {}
  let key
  // 遍历父选项
  for (key in parent) {
    mergeField(key)
  }

  // 遍历子选项，如果父选项不存在该配置，那么合并
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }

  // 合并选项，父子选项有相同选项，子选项覆盖父选项
  function mergeField (key) {
    // 合并策略，data、生命周期、methods 等合并策略不一致
    const strat = strats[key] || defaultStrat
    // 执行合并策略
    // 虽然不同情况合并策略不一样，但是都遵循一条原则：如果子选项存在则优先使用子选项，否则使用父选项
    options[key] = strat(parent[key], child[key], vm, key)
  }

  return options
}
```



**不同的合并策略：**

> vue\src\core\util\options.js

```js
const strats = config.optionMergeStrategies

function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal

  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    // in case the object is already observed...
    if (key === '__ob__') continue
    toVal = to[key]
    fromVal = from[key]
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    } else if (
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

// data 合并策略
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}

// 生命周期合并策略
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal
  return res
    ? dedupeHooks(res)
    : res
}

function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

// component、directive、filter 合并策略
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

// watch 合并策略
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = {}
  extend(ret, parentVal)
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

// props、methods、inject、computed 合并策略
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}

// provide 合并策略
strats.provide = mergeDataOrFn

// 默认合并策略
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}
```



**Vue.mixins 原理：**

Vue.mixins 的原理很简单，会根据不同情况（data、methods、生命周期等）使用不同的合并策略，但是这些合并策略基本都遵循一条原则：如果子选项与父选项存在相同配置，子选项的配置会覆盖父选项配置



### 6-6、Vue.extend

使用 Vue 构造器，创建一个“子类”。参数是一个包含组件选项的对象。



**基本使用：**

```js
var Profile = Vue.extend({
  template: '<p>{{firstName}} {{lastName}}</p>',
  data: function () {
    return {
      firstName: 'Walter',
      lastName: 'White'
    }
  }
})
```



**先看初始化：**

```js
import { initExtend } from './extend'

function initGlobalAPI (Vue: GlobalAPI) {
 // ...

 initExtend(Vue);
}
```



**再看 initExtend 函数：**

> vue\src\core\global-api\extend.js

```js
export function initExtend (Vue: GlobalAPI) {
  // 每个构造函数（包括vue）都有一个唯一的 cid，可用于缓存
  Vue.cid = 0
  let cid = 1

  // 使用基础 Vue 构造器，创建一个“子类”，该子类同样支持进一步的扩展
  // 扩展时可以传递一些默认配置，就像 Vue 也会有一些默认配置
  // 默认配置如果和基类有冲突则会进行选项合并（mergeOptions)
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this
    const SuperId = Super.cid

    // 判断缓存中有没有存在，有就直接使用
    // 比如：多次调用 Vue.extend 传入同一个配置项（extendOptions），这时就会启用该缓存
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      // 校验组件名
      validateComponentName(name)
    }

    // 定义 Sub 构造函数，和 Vue 构造函数一致
    const Sub = function VueComponent (options) {
      // 里面也是和 Vue 构造函数一样，使用 this._init 进行初始化
      this._init(options)
    }
    // 通过寄生组合继承 Vue
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 将 Vue 的配置合并到自己的配置里
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    Sub['super'] = Super

    // 将 props 代理到 Sub.prototype._props 对象上
    // 在组件内可以通过 this._props 的方式访问
    if (Sub.options.props) {
      initProps(Sub)
    }
    // 将 computed 代理到 Sub.prototype 对象上
    // 在组件内可以通过 this.computed[key] 的方式访问
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // 定义组件的 extend、mixin、use，允许在 Sub 基础上再进一步构造子类
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // 定义 component、filter、directive 三个静态方法
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })

    // enable recursive self-lookup
    // 如果组件设置了 name 属性，将自己注册到自己的 components 选项中，这也是递归组件的原理
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 把继承后的 Sub 缓存，好处： 当下次创建 Sub 时，发现已有，就直接使用
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
```



**Vue.extend 原理：**

- 使用 Vue 构造器，创建一个“子类”，该子类同样支持进一步的扩展

- 扩展时可以传递一些默认配置，就像 Vue 也会有一些默认配置

- 默认配置如果和基类有冲突则会进行选项合并（mergeOptions)



### 6-7、Vue.component、Vue.filter、Vue.directive

**基本使用：**

- Vue.component：注册全局组件

  ```js
  Vue.component('button-counter', {
    data: function () {
      return {
        count: 0
      }
    },
    template: '<button v-on:click="count++">You clicked me {{ count }} times.</button>'
  })
  ```

- Vue.filter：注册全局过滤器

  ```js
  Vue.filter('my-filter', function (value) {
    // 返回处理后的值
  })
  ```

- Vue.directive：注册全局指令

  ```js
  Vue.directive('my-directive', {
    bind: function () {},
    inserted: function () {},
    update: function () {},
    componentUpdated: function () {},
    unbind: function () {}
  })
  ```



**先看初始化：**

```js
import { initAssetRegisters } from './assets'

function initGlobalAPI (Vue: GlobalAPI) {
 // ...

 initAssetRegisters(Vue);
}
```



**再看 initAssetRegisters 函数：**

> vue\src\shared\constants.js

```js
export const ASSET_TYPES = [
  'component',
  'directive',
  'filter'
]
```

> vue\src\core\global-api\assets.js

```js
import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

// 定义全局 api：Vue.component、Vue.filter、Vue.directive
// 主要逻辑就是：往 Vue.options 上存放对应的配置
// 例如：Vue.filter('myFilter', func)，结果就是 Vue.options.filters.myFilter = func
// 最后，在 new Vue 的时候，通过 mergeOptions 将全局注册的组件合并到每个组件的配置对象中
export function initAssetRegisters (Vue: GlobalAPI) {
  // 创建注册方法
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (id: string,definition: Function | Object): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        if (type === 'component' && isPlainObject(definition)) {
          // 组件名称设置：组件配置中有 name，使用组件配置中的 name，没有，使用 id
          definition.name = definition.name || id
          // 通过Vue.extend() 创建子组件，返回子类构造器
          definition = this.options._base.extend(definition)
        }

        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }

        // this.options.compoments[id] = definition
        // this.options.directives[id] = definition
        // this.options.filters[id] = definition
        // 在 new Vue 时通过 mergeOptions 将全局注册的组件合并到每个组件的配置对象中
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
```



**Vue.component、Vue.filter、Vue.directive 原理：**

- 主要逻辑就是：往 Vue.options 上存放对应的配置
- 例如：Vue.filter('myFilter', func)，结果就是 Vue.options.filters.myFilter = func
- 最后，在 new Vue 的时候，通过 mergeOptions 将全局注册的组件合并到每个组件的配置对象中

这也就是为什么 Vue.component、Vue.filter、Vue.directive 需要在 new Vue 之前注册。



## 7、Vue 的一些实例方法

先从定义各种实例方法的入口文件开始：

> vue\src\core\instance\index.js

```js
import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'

// Vue 本质： 实际就是一个 Function 实现的类
// 通过 new Vue({ el: '#app', data: { msg: 'Hello Vue' } }]) // 初始化
// options 就是 new Vue 时传进来的参数
function Vue (options) {
  // ...

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

// 定义了：
//  Vue.prototype.$data、Vue.prototype.$props
//  Vue.prototype.$set、Vue.prototype.$delete、Vue.prototype.$watch
stateMixin(Vue)

// 定义了事件播报相关方法：
//  Vue.prototype.$on, Vue.prototype.$once、Vue.prototype.$off、Vue.prototype.$emit
eventsMixin(Vue)

// 定义了：
//  Vue.prototype._update、Vue.prototype.$forceUpdate、Vue.prototype.$destroy
lifecycleMixin(Vue)

// 定义了：Vue.prototype.$nextTick、Vue.prototype._render
// _render方法会调用 vm.$createElement 创建虚拟 DOM，如果返回值 vnode 不是虚拟 DOM 类型，将创建一个空的虚拟 DOM
renderMixin(Vue)
```



下面来看看一些常用的实例方法



### 7-1、vm.$data、vm.$props

vm.$data、vm.$props 的实现很简单，就是使用 Object.defineProperty 劫持了对这两个的访问，当访问到这两者，返回的是 Vue.\_data 和 Vue.\_props

> vue\src\core\instance\state.js

```js
function stateMixin(Vue: Class < Component > ) {
  // ...

  const dataDef = {}
  dataDef.get = function () {
    return this._data
  }
  const propsDef = {}
  propsDef.get = function () {
    return this._props
  }

  // 实现实例方法：Vue.prototype.$data 和 Vue.prototype.$props
  // 实际上就是进行了劫持，当通过 vm.$data 或者 vm.$props 访问，劫持返回的是 Vue._data 和 Vue._props
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)
}
```



### 7-2、vm.$set、vm.$delete

与全局方法基本一致，区别只是实例方法定义在 Vue.prototype



**初始化入口：**

> vue\src\core\instance\index.js

```js
stateMixin(Vue)
```



> vue\src\core\instance\state.js

```js
import { set, del } from '../observer/index'

function stateMixin(Vue: Class < Component > ) {
  // ...

  Vue.prototype.$set = set
  Vue.prototype.$delete = del
}
```



### 7-3、vm.$watch

详细可以查看 watch 响应式原理



### 7-4、vm.$on、vm.$emit、vm.$off、vm.$once

这些主要是与事件播报相关的实例方法



**初始化入口：**

> vue\src\core\instance\index.js

```js
// 定义了事件播报相关方法：
//  Vue.prototype.$on, Vue.prototype.$once、Vue.prototype.$off、Vue.prototype.$emit
eventsMixin(Vue)
```



**eventsMixin 函数：**

> vue\src\core\instance\events.js

```js
// 定义事件播报相关函数
function eventsMixin (Vue: Class<Component>) {
  // $on 用来监听事件
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      // 如果 event 是由多个事件名组成的数组，那么遍历这个 event 数组，逐个调用 vm.$on
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 将事件及回调函数以键值对形式存储，例如：vm._events = { event: [fn] }
      (vm._events[event] || (vm._events[event] = [])).push(fn)

      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }


  // $emit 方法用来触发事件，并将之前 $on 存储在 vm._events 的对应事件回调拿出来执行
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this

    // ...

    // 从 vm._events 拿到事件 event 对应的回调函数数组
    let cbs = vm._events[event]
    // 如果 cbs 存在
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // 获取到 emit 传进来的参数
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      // 遍历事件数组中的回调函数，并逐一执行
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }

    return vm
  }


  // $off 用来解除事件监听
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this

    // 如果 $off 没有传递任何参数，将 vm._events 属性清空，即 vm._events = {}
    // 也就是移除所有监听
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }

    // 如果event 是数组，event=[event1, ...]，遍历，逐个调用 vm.$off
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }

    // specific event
    // 找到制定事件数组
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    // 如果没有指定事件的回调函数，则移除该事件的所有回调函数
    if (!fn) {
      vm._events[event] = null
      return vm
    }

    // 移除指定事件的指定回调函数
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }


  // $once 用来监听事件，但是只会触发一次，触发后将会移除监听事件
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    // 对 fn 做一层包装，先解除绑定再执行 fn 回调
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }
}
```



这是 vue 提供的最基本的`发布-订阅模式`，通过 $on 监听事件，通过 $emit 触发事件，执行回调，通过 $off 移除事件监听





## 8、Vue 的其他重要功能

### 8-1、Vue 的事件机制 event



### 8-2、Vue 的插槽



#### 8-2-1、普通插槽



#### 8-2-2、具名插槽



#### 8-2-3、作用域插槽



### 8-3、Vue 的 v-model

#### 8-3-1、v-model 实现机制

v-model 会把它关联的响应式数据（如 message），动态地绑定到表单元素的 value 属性上，然后监听表单元素的 input 事件：当 v-model 绑定的响应数据发生变化时，表单元素的 value 值也会同步变化；当表单元素接受用户的输入时，input 事件会触发，input 的回调逻辑会把表单元素 value 最新值同步赋值给 v-model 绑定的响应式数据

```
<input type="text" :value="message" @input="(e) => { this.message = e.target.value }" >
```



#### 8-3-2、v-model 实现原理

首先，在模板解析阶段，v-model 跟其他指令一样，会被解析到 el.directives（这里的 el 是 ast 对象）

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



### 8-4、Vue 的 keep-alive

在性能优化上，最常见的手段就是缓存。对需要经常访问的资源进行缓存，减少请求或者是初始化的过程，从而降低时间或内存的消耗。`Vue` 为我们提供了缓存组件 `keep-alive`，它可用于路由级别或组件级别的缓存。



**基本使用：**

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



#### 8-4-1、keep-alive 基本原理

> vue\src\core\components\keep-alive.js

```js
export default {
  name: 'keep-alive',
  // 标记为抽象组件
  // 抽象组件：只对包裹的子组件做处理，并不会和子组件建立父子关系，也不会作为节点渲染到页面上
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

      const { include, exclude } = this

      // 判断子组件是否符合缓存条件
      // 组件名与 include 不匹配或与 exclude 匹配都会直接退出并返回 VNode，不走缓存机制
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const { cache, keys } = this
      const key: ? string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ?
        componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '') :
        vnode.key

      if (cache[key]) {
        // 再次命中缓存，直接取出缓存组件
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // keys 命中的组件名移到数组末端，这里使用 LRU 缓存策略
        remove(keys, key)
        keys.push(key)
      } else {
        // 初次渲染时，将 VNode 缓存
        cache[key] = vnode
        keys.push(key)
        // 配置了 max 并且缓存的长度超过了 this.max，则从缓存中删除第一个，即 keys[0]
        // 并调用 $destroy 销毁组件实例
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      // 为被 keep-alive 包裹的缓存组件打上标志
      vnode.data.keepAlive = true
    }

    // 将渲染的vnode返回
    return vnode || (slot && slot[0])
  }
}
```

在一开始的时候，就会将 keep-alive 标记为抽象组件 `abstract: true`，抽象组件代表：只对包裹的子组件做处理，并不会和子组件建立父子关系，也不会作为节点渲染到页面上。在初始化阶段会调用 `initLifecycle`，里面判断父级是否为抽象组件，如果是抽象组件，就选取抽象组件的上一级作为父级，忽略与抽象组件和子组件之间的层级关系

> vue\src\core\instance\lifecycle.js

```js
export function initLifecycle (vm: Component) {
  // 这个 vm 是子组件实例
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent  // 此时的 parent 其实是 activeInstance，也是父组件 vm 实例
  if (parent && !options.abstract) {
    // 判断父组件是否是抽象组件
    // 如果是抽象组件，就选取抽象组件的上一级作为父级，忽略与抽象组件和子组件之间的层级关系
    // 主要是 keep-alive 包裹状态下
    // keep-alive 会被定义为抽象组件，不会作为节点渲染到页面上
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 将子组件实例放到父组件的 $children
    parent.$children.push(vm)
  }

  // 父组件挂载到子组件的 $parent 上
  vm.$parent = parent

  // ...
}
```



keep-alive 没有 template 模板，而是由 render 函数来决定渲染结果。



#### 8-4-2、LRU 缓存策略

keep-alive 在使用时，可以添加 `prop` 属性 `include`、`exclude`、`max` 允许组件有条件的缓存，旧的组件需要删除缓存，新的组件需要加入到最新缓存，采用的是 LRU 缓存策略。

**LRU（Least recently used，最近最少使用）策略：**根据数据的历史访问记录来进行淘汰数据。LRU 策略的设计原则是，如果一个数据在最近一段时间没有被访问到，那么在将来它被访问的可能性也很小。也就是说，当限定的空间已存满数据时，应当把最久没有被访问到的数据淘汰。

![](/imgs/img24.png)

1. 假设当前允许最大缓存 3 个组件，ABC 三个组件依次进入缓存，没有任何问题

2. 当 D 组件被访问时，内存空间不足，A 是最早进入也是最旧的组件，所以 A 组件从缓存中删除，D 组件加入到最新的位置

3. 当 B 组件被再次访问时，由于 B 还在缓存中，B 移动到最新的位置，其他组件相应的往后一位

4. 当 E 组件被访问时，内存空间不足，C 变成最久未使用的组件，C 组件从缓存中删除，E 组件加入到最新的位置



#### 8-4-3、keep-alive 首次渲染

这里以下面代码为例：

```js
<keep-alive>
  <A />
</keep-alive>
```

1、在组件的 patch 阶段，会调用 createCompoment 来挂载组件，`<A />` 组件也是此时进行挂载的

> vue\src\core\vdom\patch.js

```js
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

在初始化渲染时，`<A />` 组件还没有初始化构造完成，`componentInstance` 还是 `undefined`。**而 `<A />` 组件的 `keepAlive` 是 `true`，因为 `keep-alive` 作为父级包裹组件，会先于 `<A />` 组件 组件挂载，也就是 `kepp-alive` 会先执行 `render` 的过程，A组件被缓存起来**，之后对插槽内第一个组件 `<A />` 组件的 `keepAlive` 属性赋值为 `true`



2、createComponent 会调用组件内部钩子 init 进行初始化，在 init 过程会有判断是否有 keep-alive 缓存，但是首次渲染，肯定不会有 keep-alive 缓存，调用`createComponentInstanceForVnode` 执行 `new Vue` 构造组件实例并赋值到 `componentInstance`，随后调用 `$mount` 挂载 `<A />` 组件

> vue\src\core\vdom\create-component.js

```js
// 首次渲染只会标记需要缓存
const componentVNodeHooks = {
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
      // createComponentInstanceForVnode 会 new Vue 构造组件实例并赋值到 componentInstance
      const child = (vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ));
      // 挂载组件
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



3、最后，又回到回 `createComponent`，继续走下面的逻辑

```js
function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data // 这个是 组件的 VNodeData
    if (isDef(i)) {
      // ...

      if (isDef(vnode.componentInstance)) {
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm) // 插入顺序：先子后父
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
```

调用 `initComponent` 将 `vnode.elm` 赋值为真实dom，然后调用 `insert` 将组件的真实dom插入到父元素中



**总结：**在初始化渲染中，`keep-alive` 将 `<A />` 组件缓存起来，然后正常的渲染 `<A />` 组件



#### 8-4-4、keep-alive 缓存渲染

还是以这段代码为例：

```js
<keep-alive>
  <A />
</keep-alive>
```

经过了初始化渲染， 组件 A 已被 keep-alive 缓存。



当从其他页面切换回 A 组件页面时，A 组件命中缓存被重新激活，再次经历 `patch` 过程，非初始渲染，`patch` 会调用 `patchVnode` 对比新旧节点

> vue\src\core\vdom\patch.js

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



patchVnode 内会执行 prepatch 钩子时会拿到新旧组件的实例并执行 updateChildComponent 函数。

> vue\src\core\vdom\create-component.js

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
```



> vue\src\core\instance\lifecycle.js

```js
// instance/lifecycle.js
export function updateChildComponent () {
  // ...

  // 组件内有插槽，那么标记 needsForceUpdate 为 true，代表需要强制更新
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  // 存在插槽，强制更新
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

当有插槽时，调用 `$forceUpdate` 重新渲染，keep-alive 符合有插槽的条件，因为他 render 函数上就是通过插槽去获取子组件的。

vm.\$forceUpdate() 强迫 keep-alive 重新执行本身的 render，这一次由于 A 组件在初始化已经缓存了，`keep-alive` 直接返回缓存好的A组件 `VNode`，接下来就是这个 A 组件 VNode 的 patch

> vue\src\core\vdom\patch.js

```js
return function patch(oldVnode, vnode, hydrating, removeOnly) {
    // 如果新节点不存在，但是老节点存在，调用 destroy，直接销毁老节点
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue = []

    if (isUndef(oldVnode)) {
      // 新节点存在，老节点不存在，那么是首次渲染，创建一个新节点
      // empty mount (likely as component), create new root element
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } else {
      // 检查老节点是否是真实 DOM（真实 DOM 就是没有动态节点）
      const isRealElement = isDef(oldVnode.nodeType)
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // 老节点不是真实 DOM 并且新旧 VNode 节点判定为同一节点时会进行 patchVnode 这个过程
        // 这个过程主要就是进行 dom diff（也就是更新阶段，执行 patch 更新节点）
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        // 新老节点不是同一节点
        // ...

        // 获取到老节点的真实元素
        const oldElm = oldVnode.elm
        // 找到父节点，对于初始化的节点来说，那就是 body
        const parentElm = nodeOps.parentNode(oldElm)

        // 基于新 VNode 创建整棵 DOM 树并插入到老 VNode 的父元素下
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )
          
        // ...
      }
    }
  }
```

因为是从另外一个页面切回到 A 组件页面，那么新老节点不是同一节点肯定不是同一节点，那么调用 createElm，createElm 里面发现是组件，又会调用 createComponent



> vue\src\core\vdom\patch.js

```js
function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data // 这个是 组件的 VNodeData
    if (isDef(i)) {
       // isReactivated 用来判断组件是否缓存。
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      if (isDef(i = i.hook) && isDef(i = i.init)) {
        // 执行组件初始化的内部钩子 init
        i(vnode, false /* hydrating */ )
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
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

**此时的`vnode`是缓存取出的子组件`vnode`**，并且由于在第一次渲染时对组件进行了标记 `vnode.data.keepAlive = true;`

并且在再次渲染的时候：

```js
export default {
  name: 'keep-alive',
  // 标记为抽象组件
  // 抽象组件：只对包裹的子组件做处理，并不会和子组件建立父子关系，也不会作为节点渲染到页面上
  abstract: true,

  // keep-alive 的渲染函数
  render() {

      if (cache[key]) {
        // 再次命中缓存，直接取出缓存组件
        vnode.componentInstance = cache[key].componentInstance
      }

      // 为被 keep-alive 包裹的缓存组件打上标志
      vnode.data.keepAlive = true
    }

    // 将渲染的vnode返回
    return vnode || (slot && slot[0])
  }
}
```

componentInstance 已经取到。所以`isReactivated`的值为`true`，`i.init` 依旧会执行子组件的初始化过程。但是这个过程由于有缓存，只调用 prepatch 更新实例属性。

> vue\src\core\vdom\create-component.js

```js
const componentVNodeHooks = {
  init(vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode; // work around flow
      // 只调用 prepatch 更新实例属性
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      // createComponentInstanceForVnode 会 new Vue 构造组件实例并赋值到 componentInstance
      const child = (vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ));
      // 挂载组件
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  },

  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions;
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
```



最后回到 createComponent 调用 reactivateComponent 执行 `insert` 插入组件的dom节点，至此缓存渲染流程完成

```js
function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
  let i
  // hack for #4339: a reactivated component with inner transition
  // does not trigger because the inner node's created hooks are not called
  // again. It's not ideal to involve module-specific logic in here but
  // there doesn't seem to be a better way to do it.
  let innerNode = vnode
  while (innerNode.componentInstance) {
    innerNode = innerNode.componentInstance._vnode
    if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
      for (i = 0; i < cbs.activate.length; ++i) {
        cbs.activate[i](emptyNode, innerNode)
      }
      insertedVnodeQueue.push(innerNode)
      break
    }
  }
  // unlike a newly created component,
  // a reactivated keep-alive component doesn't insert itself
  insert(parentElm, vnode.elm, refElm)
}
```

组件首次渲染时，`keep-alive` 会将组件缓存起来。等到缓存渲染时，`keep-alive` 会更新插槽内容，之后 `$forceUpdate` 重新渲染。这样在 `render` 时就获取到最新的组件，如果命中缓存则从缓存中返回 `VNode`。



**总结：**

-   首次渲染的时候，除了再 `<keep-alive>` 中建立缓存，设置 vnode.data.keepAlive 为 true，其他的过程和普通组件一样。
-   缓存渲染的时候，会根据 vnode.componentInstance（首次渲染 vnode.componentInstance 为 undefined） 和 vnode.data.keepAlive 进行判断不会执行组件的 created、mounted 等钩子函数，而是对缓存的组件执行 patch 过程，最后直接把缓存的 DOM 对象直接插入到目标元素中，完成了数据更新的情况下的渲染过程。



#### 8-4-5、总结

`keep-alive` 组件是抽象组件，在对应父子关系时会跳过抽象组件，它只对包裹的子组件做处理，主要是根据LRU策略缓存组件 `VNode`，最后在 `render` 时返回子组件的 `VNode`。缓存渲染过程会更新 `keep-alive` 插槽，重新再 `render` 一次，从缓存中读取之前的组件 `VNode` 实现状态缓存。