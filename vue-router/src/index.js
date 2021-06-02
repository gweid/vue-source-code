/* @flow */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'


// const router = new VueRouter({
//   mode: 'hash',
//   routes: [
//     {
//       path: '/',
//       name: 'home',
//       component: Home
//     }
//   ]
// })
// 导出 VueRouter 类
export default class VueRouter {
  static install: () => void;
  static version: string;

  app: any;
  apps: Array<any>;
  ready: boolean;
  readyCbs: Array<Function>;
  options: RouterOptions;
  mode: string;
  history: HashHistory | HTML5History | AbstractHistory;
  matcher: Matcher;
  fallback: boolean;
  beforeHooks: Array<?NavigationGuard>;
  resolveHooks: Array<?NavigationGuard>;
  afterHooks: Array<?AfterNavigationHook>;

  constructor (options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []

    // 创建路由 matcher 对象
    // 主要用来处理传进来的路由配置 routes 的，创建路由配置表匹配器
    // new VueRouter({ routes: [{ path: '/', component: Home }] })
    // 将 routes 配置数组和 VueRouter 类传进去
    this.matcher = createMatcher(options.routes || [], this)

    // new VueRouter 的时候是否传入 mode，没有默认使用 hash 模式
    let mode = options.mode || 'hash'

    // 如果使用 history 模式，会做一层判断
    // 判断当前环境支不支持 history 模式，不支持会被强制转换到 hash 模式（降级处理）
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }

    // 不是浏览器环境，会切换到 abstract 模式
    if (!inBrowser) {
      mode = 'abstract'
    }

    this.mode = mode

    // 根据不同 mode，实例化不同 history 实例，并将 history 实例挂载到 VueRouter 类上的 history  属性中
    // 上面会判断，如果不传 mode，mode 默认为 hash
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        // this.fallback：
        //  当浏览器不支持 history.pushState 控制路由是否应该回退到 hash 模式。
        //  可以在 new VueRouter 时可以手动传进来，会在上面进行判断
        // this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
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

  match (raw: RawLocation,current?: Route,redirectedFrom?: Location): Route {
    // this.mather.match 最终返回的就是 Route 对象，这个在 create-matcher.js 中定义
    return this.matcher.match(raw, current, redirectedFrom)
  }

  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  // 路由初始化，初始化时 app 是 vue 实例
  init (app: any /* Vue component instance */) {
    // 先判断有没有安装 vue-router
    process.env.NODE_ENV !== 'production' && assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    )

    // 将各个组件实例保存到 this.apps 数组中
    // 初始化时是 vue 根实例，后面是各个组件实例
    this.apps.push(app)

    // set up app destroyed handler
    // https://github.com/vuejs/vue-router/issues/2639
    // 注册一个一次性的 destroyed 钩子
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      // 当组件实例销毁，
      const index = this.apps.indexOf(app)
      if (index > -1) this.apps.splice(index, 1)

      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      if (this.app === app) this.app = this.apps[0] || null
    })

    // main app previously initialized
    // return as we don't need to set up new history listener
    // VueRouter 上有 app（vue实例），不再执行后面逻辑
    // 主要就是 VueRouter 初始化只进行一次
    // beforeCreate 首次触发是在 Vue 根组件 <App /> 实例实例化的时候
    // 所以 this.app 一直都是 vue 根实例
    if (this.app) {
      return
    }

    // 首次触发 beforeCreate 也就是 Vue 根组件 <App /> 实例实例化的时候
    // 就在 VueRouter 上挂载 app（vue实例） 属性，所以 this.app 一直都是 vue 根实例
    this.app = app

    // 拿到 history 实例
    const history = this.history

    // transitionTo 是进行路由导航的函数
    if (history instanceof HTML5History) {
      // 如果是 history 模式
      // 先使用 history.getCurrentLocation() 获取到需要跳转的路径
      // 使用 history.transitionTo 进行首次路由跳转
      history.transitionTo(history.getCurrentLocation())
    } else if (history instanceof HashHistory) {
      // 如果是 hash 模式
      // 在 hash 模式下会在 transitionTo 的回调中调用 setupListeners
      // setupListeners 里会对 hashchange 事件进行监听
      const setupHashListener = () => {
        history.setupListeners()
      }
      // 使用 history.transitionTo 进行首次路由跳转
      history.transitionTo(
        history.getCurrentLocation(),
        setupHashListener,
        setupHashListener
      )
    }

    // 挂载了回调的 cb，每次更新路由时更新 app._route
    history.listen(route => {
      this.apps.forEach((app) => {
        app._route = route
      })
    })
  }

  // 注册 beforeEach 钩子
  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  // 注册 beforeResolve 钩子
  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }

  // 注册 afterEach 钩子
  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }

  // 注册 onReady 钩子
  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }

  // 注册 onError 钩子
  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }

  // 路由的方法 push、replace、go、back、forward
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.push(location, resolve, reject)
      })
    } else {
      this.history.push(location, onComplete, onAbort)
    }
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // $flow-disable-line
    if (!onComplete && !onAbort && typeof Promise !== 'undefined') {
      return new Promise((resolve, reject) => {
        this.history.replace(location, resolve, reject)
      })
    } else {
      this.history.replace(location, onComplete, onAbort)
    }
  }

  go (n: number) {
    this.history.go(n)
  }

  back () {
    this.go(-1)
  }

  forward () {
    this.go(1)
  }

  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply([], route.matched.map(m => {
      return Object.keys(m.components).map(key => {
        return m.components[key]
      })
    }))
  }

  resolve (
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    current = current || this.history.current
    const location = normalizeLocation(
      to,
      current,
      append,
      this
    )
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }

  // 动态添加路由
  addRoutes (routes: Array<RouteConfig>) {
    // 通过 matcher 对象的 addRoutes 方法动态添加路由
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

function createHref (base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

// 路由身上加 install 函数，因为 路由是插件形式被 Vue.use()
VueRouter.install = install
VueRouter.version = '__VERSION__'

if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
