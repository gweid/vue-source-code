/* @flow */

import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError, isExtendedError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'
import { NavigationDuplicated } from './errors'

export class History {
  router: Router
  base: string
  current: Route
  pending: ?Route
  cb: (r: Route) => void
  ready: boolean
  readyCbs: Array<Function>
  readyErrorCbs: Array<Function>
  errorCbs: Array<Function>

  // implemented by sub-classes
  +go: (n: number) => void
  +push: (loc: RawLocation) => void
  +replace: (loc: RawLocation) => void
  +ensureURL: (push?: boolean) => void
  +getCurrentLocation: () => string

  constructor (router: Router, base: ?string) {
    this.router = router
    // 格式化 base 基础路径，保证 base 是以 / 开头，默认返回 /
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    // START 是 通过 createRoute 创建出来的
    // export const START = createRoute(null, {
    //   path: '/'
    // })
    this.current = START // 当前指向的 route 对象，默认为 START；即 from
    this.pending = null // 记录将要跳转的 route；即 to
    this.ready = false
    this.readyCbs = []
    this.readyErrorCbs = []
    this.errorCbs = []
  }

  // 绑定路由 route 参数 更新回调函数
  listen (cb: Function) {
    this.cb = cb
  }

  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  /**
   * 路径切换
   * 接收三个参数：
   *   location：跳转的路径，必传，可以是 '/user'，也可以是: { path: '', name: '', params: {} }
   *   onComplete：跳转成功回调，在路由跳转成功时调用
   *   onAbort：是跳转失败(取消)回调，在路由被取消时调用
   */
  transitionTo (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // 调用 router 实例的 match 方法，从路由映射表中取到将要跳转到的路由对象 route，也就是执行路由匹配
    //   location 代表当前 hash 路径
    //   this.current = START， START：当前指向的路由对象；即 from 的路由对象
    const route = this.router.match(location, this.current)

    // 调用 this.confirmTransition，执行路由转换动作
    this.confirmTransition(
      route,
      () => {
        // 跳转完成
        this.updateRoute(route) // 更新 route
        // 执行 transitionTo 的 onComplete
        onComplete && onComplete(route)

        // 更新 url 路径，在子类 HTML5History、HashHistory 中实现
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
        // 报错
        if (onAbort) {
          // 参数有传 onAbort，调用 onAbort 回调函数处理错误
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

  /**
   * 执行路由转换动作
   * 接收三个参数：
   *   route：目标路由对象
   *   onComplete：跳转成功回调
   *   onAbort：取消跳转、跳转失败回调（可选）
   */
  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    // this.current = START， START：当前指向的 route 对象；即 from
    // 先获取当前路由对象
    const current = this.current

    // 定义中断处理函数
    const abort = err => {
      // after merging https://github.com/vuejs/vue-router/pull/2771 we
      // When the user navigates through history through back/forward buttons
      // we do not want to throw the error. We only throw it if directly calling
      // push/replace. That's why it's not included in isError
      if (!isExtendedError(NavigationDuplicated, err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err)
          })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      // 如果有传 onAbort 错误处理函数，那么执行错误处理函数
      onAbort && onAbort(err)
    }

    /**
     * 判断重复跳转：
     *  isSameRoute 检测当前路由对象与目标路由对象是否相同
     *  并且检测两者匹配到的路由记录数量是否相同（route.matched 就是路由记录）在生成路由对象的时候把路由记录挂在了matched 上 
     *  如果相同，视为重复跳转，中断流程，并执行 abort 中断处理函数
     */
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      route.matched.length === current.matched.length
    ) {
      this.ensureURL()
      return abort(new NavigationDuplicated(route))
    }

    // 对比前后 route 对象的 matched(matched 就是路由记录)
    // 找出需要 更新(updated)、失活(deactivated)、激活(activated) 的路由记录
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    )

    // 路由守卫钩子队列
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      extractLeaveGuards(deactivated), // 即将被销毁组件的 beforeRouteLeave 守卫
      // global before hooks
      this.router.beforeHooks, // 全局的 beforeEach 守卫
      // in-component update hooks
      extractUpdateHooks(updated), // 组件中所有 beforeRouteUpdate 守卫
      // in-config enter guards
      activated.map(m => m.beforeEnter), // 将要更新的路由的独享守卫 beforeEnter
      // async components
      resolveAsyncComponents(activated) // 解析异步组件
    )

    // 记录目标路由对象，方便取消对比用
    this.pending = route

    // 迭代器
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort()
      }
      try {
        hook(/* to*/route, /* from*/current, /* next*/(to: any) => {
          if (to === false || isError(to)) {
            // next(false) -> abort navigation, ensure current URL
            // next(false) -> 取消跳转，添加一个新历史记录(但由于url地址未发生变化，所以并未添加记录)
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort()
            if (typeof to === 'object' && to.replace) {
              // 调用子类方法的替换记录
              this.replace(to)
            } else {
              // 调用子类方法的添加记录
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            next(to)
          }
        })
      } catch (e) {
        abort(e)
      }
    }

    // 执行队列里的钩子
    runQueue(queue, iterator, () => {
      const postEnterCbs = []
      const isValid = () => this.current === route
      // wait until async components are resolved before
      // extracting in-component enter guards
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort()
        }
        this.pending = null

        // 执行 onComplete 回调，onComplete 中会调用:
        //  updateRoute 方法更新 route 信息，内部会触发 afterEach 结束钩子
        onComplete(route)

        if (this.router.app) {
          this.router.app.$nextTick(() => {
            postEnterCbs.forEach(cb => {
              cb()
            })
          })
        }
      })
    })
  }

  // 更新路由参数 route
  updateRoute (route: Route) {
    const prev = this.current
    this.current = route
    // 执行路由参数 route 更新
    this.cb && this.cb(route)
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev)
    })
  }
}

function normalizeBase (base: ?string): string {
  // 没有 base，默认返回 /
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }

  // 保证 base 是 / 开头
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

/**
 * 对比前后 route 对象 路由记录
 * 找出需要 更新(updated)、失活(deactivated)、激活(activated) 的路由记录
 * @param {*} current 当前路由记录
 * @param {*} next 目标路由记录
 * @returns 
 */
function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  // 找到两个的最大值
  const max = Math.max(current.length, next.length)
  // 以这个最大值为最大循环次数，遍历，找出首个不相等的索引
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  // 例如：current:[1,2,3] next:[1,2,3,4]
  // 那么最后一个就不同，此时 i=3
  // 那么需要更新的是 [1,2,3]，需要激活的是 [4], 失效的是 []
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

function extractGuards (
  records: Array<RouteRecord>,
  name: string,
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    const guard = extractGuard(def, name)
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  return flatten(reverse ? guards.reverse() : guards)
}

function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}

function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  return extractGuards(
    activated,
    'beforeRouteEnter',
    (guard, _, match, key) => {
      return bindEnterGuard(guard, match, key, cbs, isValid)
    }
  )
}

function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    return guard(to, from, cb => {
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          poll(cb, match.instances, key, isValid)
        })
      }
      next(cb)
    })
  }
}

function poll (
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    cb(instances[key])
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
