# vuex 源码阅读

当前阅读的 vux 版本 3.1.3。基本源码目录结构：

```
Vuex
├── src                                   源码目录
│   ├── module                            与模块 module 相关的操作
│   │   ├── module-collection.js          用于递归收集并注册根模块和嵌套模块
│   │   └── module.js                     定义 Module 类，存储模块内的一些信息，例如: state...
│   ├── plugins                           插件
│   │   ├── devtool.js                    用于 devtool 调试
│   │   └── logger.js                     日志
│   ├── helpers.js                        辅助函数，例如：mapState、mapGetters、mapMutations...
│   ├── index.esm.js                      es6 module 打包入口
│   ├── index.js                          入口文件
│   ├── mixin.js                          通过 mixin 将 vuex 全局混入
│   ├── store.js                          定义了 Store 类，核心
│   ├── util.js                           工具函数
```



## 调试方式

1. 将 vuex 源码 clone 下来

2. 修改 `vuex/examples/webpack.config.js`，添加一行代码 `devtool: 'source-map'`

   ![](../imgs/img31.png)

3. 在 vuex 根目录执行 `npm install` 装包，后运行 `npm run dev`，打开 `http://localhost:8080`，就可以利用 vuex 的 example 示例进行调试

   ![](../imgs/img32.png)

4. 在 examples 里面对应的示例打 debugger 即可，例如这里利用 shopping-cart 示例进行调试（或者在源码内部进行 debugger）

   ![](../imgs/img33.png)



## 1、Vue.use 安装 Vuex

首先，来看看在 vue 中使用 vuex 的初始化工作：

```js
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 0
  },
  mutations: {
    increment (state) {
      state.count++
    }
  }
})

export default store
```

然后在 main.js 中：

```js
import store from './store'

new Vue({
  el: '#app',
  store
})
```



一开始，就是执行了 `Vue.use(Vuex)` 安装 Vuex



### 1-1、Vue.use

简单回顾一下 Vue.use：

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

基本上，Vue.use 做的事：

- 检查插件是否安装，如果安装了就不再安装
- 如果没有没有安装，安装插件，执行插件的 install 方法
- 将已安装过的插件保存到 `vue._installedPlugins` 中

并且，接受的参数可以是函数或者对象，如果是函数，那么这个函数本身就是 install，如果是对象，那么就执行对象的 install 方法



再来看看，vuex 的入口文件导出的：

> vuex\src\index.js

```js
import { Store, install } from './store'
import { mapState, mapMutations, mapGetters, mapActions, createNamespacedHelpers } from './helpers'

export default {
  Store,
  install,
  version: '__VERSION__',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers
}
```

导出了一个对象，对象身上有 install 方法，那么 Vue.use 就是执行的这上面的 install 方法



### 1-2、install

> vuex\src\store.js

```js
let Vue // bind on install

// 暴露 install 方法，在 Vue.use(Vuex) 的时候，执行这里的 install 方法
function install (_Vue) {
  // Vue 已经存在并且与传入的相等，说明已经使用 Vue.use 安装过 Vuex
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }

  // 将 Vue.use(Vuex) 时传入的 vue 赋值给 Vue，用于判断是否重复安装 vuex
  Vue = _Vue

  // 如果没有被注册过，调用 applyMixin
  // 执行 mixin 混入，将 $store 对象注入到到每个组件实例
  applyMixin(Vue)
}
```

- 首先会判断 vuex 有没有注册过
- 没有注册过，执行 applyMixin(Vue)



### 1-3、applyMixin

> vuex\src\mixin.js

```js
export default function (Vue) {
  // 获取 vue 的版本
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    // 通过在每一个组件的 beforeCreate 生命周期混入 vuexInit
    // vuexInit 就是使每个 Vue 的实例对象，都有一个 $store 属性
    // 但是注意的是，这里只是将 vuexInit 初始化函数挂载到 beforeCreate 上
    // 真正开始执行 vuexInit 会是：
    //  1、new Vue({ el: '#app', store }) 挂载 vue 根 <App /> 的时候，执行 beforeCreate
    //  2、在每个组件实例化的时候，执行 beforeCreate
    Vue.mixin({
      beforeCreate: vuexInit
    })
  } else {
    // 兼容 vue1.x 版本（不用太过关注）
  }


  // 最终每个 Vue 的实例对象，都有一个 $store 属性。且是同一个 Store 实例
  // 这也是为什么在每一个组件内部都可以通过 this.$store.xxx 调用的原因
  // 在进行组件实例化的时候，通过 new Vue({ el: '#app', store }) 的方式将 store 对象放到 vue.$options 上
  function vuexInit() {
    const options = this.$options
    // store injection
    // store 注入到 Vue 实例中
    // 下面两种做法都是：保证在任意组件访问的 $store 属性都指向同一个 store 对象
    if (options.store) {
      // 若当前组件的 $options 上已存在 store，则将 $options.store 赋值给 this.$store
      // 这个是用于根组件的
      this.$store = typeof options.store === 'function' ?
        options.store() :
        options.store
    } else if (options.parent && options.parent.$store) {
      // 当前组件的 $options 上没有 store，则获取父组件上的 $store，并将其赋值给 this.$store
      // 这个是用于子组件
      this.$store = options.parent.$store
    }
  }
}
```

- 首先，会获取 vue 版本，vuex 会兼容到 vue1.x 版本（这里不讨论 vue1.x 版本的 vuex）
- 当 vue 版本大于 2，通过 `Vue.minxin` 方法做了一个全局的混入，在每个组件 `beforeCreate` 生命周期时会调用 `vuexInit` 方法
- `vuexInit` 方法：
  - 判断当前组件实例的 options 上是否有 store，有，将 $options.store 赋值给 this.$store，这里一般是根组建上面会有 options.store，因为在 `new Vue({ el: '#app', store })` 时将 store 挂载到 options 上
  - options 没有 store，这种一般是子组件，将父组件的 $store拿到，赋值给当前的 this.$store
  - 上面两步，可以做到：保证在任意组件访问的 $store 属性都指向同一个 store 对象



## 2、Vuex.store 构造类

根据上面的例子，在 `Vue.use(Vuex)` 之后，是：

```js
const store = new Vuex.Store({
  state: {
    count: 0
  },
  mutations: {
    increment (state) {
      state.count++
    }
  }
})
```

通过 `new Vuex.Store()` 的方式得到 store 实例，下面来看看这一步做了什么



 ### 2-1、new Vuex.Store

new Vuex.Store 主要就是执行 Store 构造类的 constructor 构造方法

> vuex\src\store.js

```js
export class Store {
  constructor (options = {}) {
    // 如果是通过 script 标签的方式引入的 vuex，那么直接调用 install 安装，而不需要 Vue.use 安装
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    // 开发环境的一些错误提示
    // export function assert (condition, msg) {
    //   if (!condition) throw new Error(`[vuex] ${msg}`)
    // }
    if (process.env.NODE_ENV !== 'production') {
      // 在创建 store 实例之前必须先安装 vuex
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      // 当前环境不支持Promise，报错：vuex 需要 Promise polyfill
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      // store 必须使用 new 进行实例化
      assert(this instanceof Store, `store must be called with the new operator.`)
    }

    const {
      plugins = [], // vuex 插件
      // 是否严格模式，默认 false
      // 如果是严格模式，无论何时发生了状态变更且不是由 mutation 函数引起的，都会抛出错误
      strict = false
    } = options

    // 表示提交的状态，当通过 mutations 方法改变 state 时，该状态为 true，state 值改变完后，该状态变为 false; 
    // 在严格模式下会监听 state值 的改变，当改变时，_committing 为 false 时，会发出警告，state 值的改变没有经过 mutations
    // 也就是说，_committing 主要用来判断严格模式下 state 是否是通过 mutation 修改的 state
    this._committing = false
    // 用来存储 actions 方法名称(包括全局和命名空间内的)
    this._actions = Object.create(null)
    // 用来存储 actions 订阅函数
    this._actionSubscribers = []
    // 用来存储 mutations 方法名称(包括全局和命名空间内的)
    this._mutations = Object.create(null)
    // 用来存储 gette
    this._wrappedGetters = Object.create(null)
    // 根据传进来的 options 配置，注册各个模块，构造模块树形结构
    // 注意：此时只是构建好了各个模块的关系，定义了各个模块的 state 状态下
    // 但 getter、mutation 等各个方法还没有注册
    this._modules = new ModuleCollection(options)
    // 存储定义了命名空间的模块
    this._modulesNamespaceMap = Object.create(null)
    // 存放 mutation 的订阅函数
    this._subscribers = []
    // 实例化一个 Vue，主要用 $watch 对 state、getters 进行监听
    this._watcherVM = new Vue()
    // getter 本地缓存
    this._makeLocalGettersCache = Object.create(null)

    // 将 dispatch 和 commit 方法绑定到 store 实例上
    // 避免后续使用 dispatch 或 commit 时改变了 this 指向
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    // 严格模式，默认是 false
    this.strict = strict

    // 获取 根模块 的 state 值
    const state = this._modules.root.state

    // 初始化根模块，并且递归处理所有子模块
    installModule(this, state, [], this._modules.root)

    // 实现数据的响应式
    // 通过 Vue 生成一个 _vm 实例，将 getter 和 state 交给 _vm 托管，作用：
    //  store.state 赋值给 _vm.data.$$state
    //  getter 通过转化后赋值给 _vm.computed
    //  这样一来，就实现了 state 的响应式，getters 实现了类似 computed 的功能
    resetStoreVM(this, state)

    // 注册插件
    plugins.forEach(plugin => plugin(this))

    // 调试工具注册
    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }

  // ...
}
```

1. 判断如果是通过 script 标签的方式引入的 vuex，那么直接调用 install 安装，而不需要 Vue.use 安装
2. 在开发环境下的一些错误提示：
   - 在创建 store 实例前必须先安装 Vuex
   - 当前环境不支持Promise，报错：vuex 需要 Promise polyfill
   - store 必须使用 new 进行实例化
3. 进行一系列属性的初始化，例如：actions、mutations、getters 等，其中最重要的是调用 ModuleCollection 构造 module 对象。这个后面再分析
4. 处理 dispatch 和 commit：改变两个方法中的 this 指向，将其指向当前的 store，避免后续使用 dispatch 或 commit 时改变了 this 指向
5. 调用 installModule 进行根模块处理，并且递归处理各个子模块【后面分析模块化时再分析】
6. 调用 resetStoreVM 进行响应式处理【后面详细分析】
7. 注册插件
8. 调试工具注册

以上，就是 new Vuex.Store 的初始化过程，其中比较重要的是：初始化各种属性、模块化的处理、数据响应式



### 2-2、modules 模块化

