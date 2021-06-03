/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { START } from '../util/route'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

// 这种模式下，初始化作的工作相比 hash 模式少了很多
// 只是调用基类构造函数以及初始化监听事件，不需要再做额外的工作
export class HTML5History extends History {
  constructor (router: Router, base: ?string) {
    // 调用基类构造器
    super(router, base)

    // 判断是否需要支持路由滚动行为
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll
    // 若支持路由滚动行为，初始化 scroll 相关逻辑
    if (supportsScroll) {
      setupScroll()
    }

    // 初始化的时候，获取初始的路径
    const initLocation = getLocation(this.base)

    // 监听 popstate 事件
    window.addEventListener('popstate', e => {
      const current = this.current

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      // 避免在有的浏览器中第一次加载路由就会触发 `popstate` 事件
      const location = getLocation(this.base)
      if (this.current === START && location === initLocation) {
        return
      }

      // 监听到路由发生变化，执行跳转
      this.transitionTo(location, route => {
        if (supportsScroll) {
          handleScroll(router, route, current, true)
        }
      })
    })
  }

  // 定义 history 模式的 go
  go (n: number) {
    window.history.go(n)
  }

  // 定义 history 模式的 push
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      // pushState 这里主要就是 history 的 replaceState 和 pushState
      pushState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  // 定义 history 模式的 replace
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      replaceState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  // 更新路径信息
  ensureURL (push?: boolean) {
    if (getLocation(this.base) !== this.current.fullPath) {
      const current = cleanPath(this.base + this.current.fullPath)
      push ? pushState(current) : replaceState(current)
    }
  }

  // 获取当前路径(域名端口之后的路径)
  // 例如：http://127.0.0.0.1:9000/user/info，得到的是 /user/info
  getCurrentLocation (): string {
    return getLocation(this.base)
  }
}

export function getLocation (base: string): string {
  let path = decodeURI(window.location.pathname)
  if (base && path.indexOf(base) === 0) {
    path = path.slice(base.length)
  }
  return (path || '/') + window.location.search + window.location.hash
}
