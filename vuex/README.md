# vuex 源码阅读

当前阅读的 vux 版本 3.1.3。基本源码目录结构：

```
Vuex
├── src                                   源码目录
│   ├── module                            与模块 module 相关的操作
│   │   ├── module-collection.js          用于收集并注册根模块和嵌套模块
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

4. 在 examples 里面对应的示例打 debugger 即可，例如这里利用 shopping-cart 示例进行调试

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





