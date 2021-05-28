# vue-router 源码阅读

当前阅读的 vue-router 版本 3.1.6。基本源码目录结构：

```
Vue-Router
├── src                         源码目录
│   ├── components              vue-router 提供的组件
│   │   ├── link.js             <router-link /> 组件
│   │   └── view.js             <router-view /> 组件
│   ├── history                 路由的封装方式
│   │   ├── abstract.js         非浏览器环境下的，抽象路由模式
│   │   ├── base.js             定义 History 基类
│   │   ├── hash.js             hash 模式，#
│   │   └── html5.js            html5 history 模式
│   ├── create-matcher.js       路由匹配规则
│   ├── create-route-map.js     路由匹配规则
│   ├── index.js                声明 VueRouter 构造函数，并导出
│   ├── install.js              定义 VueRouter 通过插件安装到 Vue 上
│   ├── util                    各种功能函数
│   │   ├── async.js            
│   │   ├── dom.js            
│   │   ├── errors.js             
│   │   ├── location.js
│   │   ├── misc.js
│   │   ├── params.js
│   │   ├── path.js
│   │   ├── push-state.js
│   │   ├── query.js
│   │   ├── resolve-components.js
│   │   ├── route.js
│   │   ├── scroll.js
│   │   ├── state-key.js
│   │   └── warn.js
```



## 1、前置知识

在阅读 vue-router 源码之前，先来了解一下 hash 和 histroy 相关的知识。



### 1-1、hash



#### 1-1-1、浏览器 url 中的 hash

浏览器中 URL 的 hash，比如：

```js
http://www.example.com/#home
```

#后面的就是 url 的 hash，比如这里的 #home

hash 的特点：hash 虽然出现在 URL 中，但不会被包括在 HTTP 请求中，对后端完全没有影响，因此改变 hash 不会重新加载页面。

改变#后的部分，浏览器只会滚动到相应位置（如果存在该节点），不会重新加载网页。

每一次改变#后的部分，都会在浏览器的访问历史中增加一个记录，使用浏览器"后退"按钮，就可以回到上一个位置。



#### 1-2-2、读取 hash 值

可以通过：

```js
window.location.hash
```

读取浏览器 url 中的 hash 值



#### 1-1-3、监听 hash 变化

可以通过 **window.onhashchange 事件** 监听浏览器 url 的 hash 值的变化：这是一个 HTML5 新增的事件，当 hash 值发生变化时，就会触发该事件

```js
window.addEventListener('hashchange', () => {
   // 监听 hash 变化，读取最新的 hash 值
   console.log(window.location.hash)
})
```



### 1-2、history

HTML5 为浏览器的 history 对象新增了两个方法：history.pushState() 和 history.replaceState()，用来在浏览历史中添加和修改记录。这两个方法都可以**修改浏览器的 url 地址而无须重新加载页面**。



这两者的区别：

- pushState：会在浏览器 history 栈中添加一个新的记录
- replaceState：会在浏览器 history 栈中修改历史记录项而不是新建一个



#### 1-2-1、pushState  用法

```js
window.history.pushState(state,title,url)
```

- state：需要保存的数据，这个数据在触发 popstate 事件时，可以在 event.state 里获取
- title：标题，基本没用，一般传 null
- url：设定新的历史纪录的 url。新的 url 与当前 url 的 origin 必须是一样的，否则会抛出错误。url可以是绝对路径，也可以是相对路径。如当前url是 https://www.baidu.com/a/ （注意，开启本地服务测试：127.0.0.1，不要使用 file:// 协议）
  - 执行 history.pushState(null, null, './qq/')，变成 https://www.baidu.com/a/qq/
  - 执行history.pushState(null, null, '/qq/')，变成 https://www.baidu.com/qq/

使用实例：

```js
history.pushState({ page: 1 }, null, "?page=1")
```



#### 1-2-2、replaceState 使用

```js
window.history.replaceState(state,title,url)
```

参数与 pushState 的一样，不一样的地方是：replaceState 是修改当前历史纪录，而 pushState 是创建新的历史纪录



#### 1-2-3、popstate 监听

通过 popstate 进行监听：

```js
window.addEventListener('popstate', (event) => {
  console.log('触发了 popstate')
  console.log(event.state)
})
```

注意：**仅仅调用 pushState 方法或 replaceState 方法，并不会触发该事件**，只有用户**点击浏览器后退和前进按钮时**，或者使用 js 调用history.back、history.forward、history.go 方法时才会触发



## 2、vue-router 的注册

接下来，看看 vue-router 是怎么被注册到 vue 上的。



平时在使用 `vue-router` 的时候通常需要在 `main.js` 中初始化 `Vue` 实例时将 `vue-router` 实例对象当做参数传入

```js
import Vue from 'vue'
import Router from 'vue-router'
import Home from './views/Home.vue'

Vue.use(Router)

export default new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/about',
      name: 'about',
      component: () => import(/* webpackChunkName: "about" */ './views/About.vue')
    }
  ]
})
```

```js
import Vue from 'vue'
import router from './router'

let a = new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
```



### 2-1、Vue.use()

在使用的时候，会通过 `Vue.use(Router)` 的形式将 vue-router 当做插件安装到 vue 身上，来看看 vue 源码是怎么定义 Vue.use 的：

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



### 2-2、install

由 Vue.use 可知，`Vue` 注册插件其实就是在执行插件的 `install` 方法，那么 vue-router 也需要一个 install 方法

> vue-router\src\index.js

```js
import { install } from './install'

export default class VueRouter {
  
}

VueRouter.install = install
```

明显，定义了 VueRouter 类，并且往 VueRouter 类上挂载 install 方法，接下来看看这个 install



> vue-router\src\install.js

```js
import View from './components/view'
import Link from './components/link'

// 保存 Vue 的局部变量，并导出，使 vue-router 在任何地方都能访问到 Vue
export let _Vue

export function install (Vue) {
  // 如果是多次注册，就会 return 不会进行重复的注册
  if (install.installed && _Vue === Vue) return
  // install.installed = true 代表已经注册过
  install.installed = true

  // 因为在上面通过 export let _Vue 将 Vue 导出，使 vue-router 在任何时候都能访问到 Vue
  // 好处: 在其它模块中，可以导入这个 _Vue，这样既能访问到 Vue，又避免了将 Vue 做为依赖打包
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 通过 Vue.mixin 去做全局混入，通过全局混入使得每一个组件
  // 当组件实例化执行到 beforeCreate、destroyed 钩子时都会执行这里定义的逻辑
  Vue.mixin({
    beforeCreate () {
      // 判断是否在 new Vue 的时候是否把 router 传入
      // 传进来了，会在 Vue.$options 上挂载有 router
      // new Vue({ el: 'app', router })
      if (isDef(this.$options.router)) {
        // 将 Vue 赋值给 this._routerRoot 
        this._routerRoot = this
        // 将传入的 router 赋值给 this._router
        this._router = this.$options.router 
        // 传入的 router 是通过 new VueRouter({mode: '', routes: [{}]}) 出来的
        // VueRouter 类身上有 init 方法，主要是进行 VueRouter 的初始化
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

  // 通过 Object.defineProperty 代理的方式往 Vue 原型上加入 $router 实例
  // 这样在使用的时候可以通过 this.$router 访问
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  // 通过 Object.defineProperty 代理的方式往 Vue 原型上加入 $route
  // 这样在使用的时候可以通过 this.$route 访问
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 全局注册 router-view 和 router-link 这两个组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // 设置路由组件的 beforeRouteEnter、beforeRouteLeave、beforeRouteUpdate 守卫的合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}

```

-   判断是否注册过，如果注册过不会再重新注册
-   \_Vue = Vue 将 Vue 保存，并导出 \_Vue，使 vue-router 在任何时候都能访问到 Vue
-   通过 Vue.mixin 全局混入，通过全局混入使得每一个组件执行 beforeCreate、destroyed 都会执行这里的 beforeCreate、destroyed 定义的逻辑；beforeCreate 中会判断是否在 new Vue 的时候是否传入 router，`new Vue({ el: 'app', router })`。当组件实例化执行到 beforeCreate 会调用 `this._router.init(this)` 进行 vue-router 的初始化。
-   往 Vue 原型上注入 $router 与 $route，这样在使用的时候可以通过 this.$router、this.$route 的方式方便调用
-   全局注册 router-view 和 router-link 这两个组件
-   设置路由组件的 beforeRouteEnter、beforeRouteLeave、beforeRouteUpdate 守卫的合并策略



## 3、VueRouter 对象



### 3-1、VueRouter 是一个类，在 new VueRouter 的时候实际上就是执行这个 VueRouter 类

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



### 3-2、VueRouter 的 init 函数

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



### 3-3、HashHistory(即 hash 模式)

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



### 3-4、HTML5History(即 history 模式)

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