/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

// HashHistory 继承了 History 基类
export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    // 调用基类构造器
    super(router, base)

    // check history fallback deeplinking
    // 如果说是从 history 模式降级来的，需要做降级检查
    // 如果需要回退，则将 url 换为 hash 模式(/#开头)
    // checkFallback 就是将 history 模式的 url 替换为 hash 模式的 url
    if (fallback && checkFallback(this.base)) {
      // 如果降级且做了降级处理直接 return
      return
    }

    // 保证 hash 是 / 开头
    ensureSlash()
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  // hash 的监听在这里实现，会延迟到应用程序挂载之后
  // 如果 beforeEnter 是异步的话，beforeEnter 就会触发两次
  // 这是因为在初始化时，hash 值不是 / 开头的话就会补上 #/，这个过程会触发 hashchange 事件
  // 所以会再走一次生命周期钩子，导致再次调用 beforeEnter 钩子函数
  // 所以只能将hashChange事件的监听延迟到初始路由跳转完成后
  setupListeners () {
    const router = this.router

    // 判断是否需要支持路由滚动行为
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll
    // 若支持路由滚动行为，初始化 scroll 相关逻辑
    if (supportsScroll) {
      setupScroll()
    }

    // 监听 url 改变
    // 这里即使使用了 mode=hash，还是会判断当前环境是否支持 pushState，
    // 支持优先使用 popstate 监听
    window.addEventListener(
      supportsPushState ? 'popstate' : 'hashchange',
      () => {
        const current = this.current
        if (!ensureSlash()) {
          return
        }
        // 路由跳转
        this.transitionTo(getHash(), route => {
          if (supportsScroll) {
            handleScroll(this.router, route, current, true)
          }
          if (!supportsPushState) {
            replaceHash(route.fullPath)
          }
        })
      }
    )
  }

  // hash 模式的 push
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        pushHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  // hash 模式的 replace
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(
      location,
      route => {
        replaceHash(route.fullPath)
        handleScroll(this.router, route, fromRoute, false)
        onComplete && onComplete(route)
      },
      onAbort
    )
  }

  // hash 模式的 go
  go (n: number) {
    window.history.go(n)
  }

  ensureURL (push?: boolean) {
    const current = this.current.fullPath
    if (getHash() !== current) {
      push ? pushHash(current) : replaceHash(current)
    }
  }

  // 后去当前 hash 路径
  // 例如：http://127.0.0.0.1:9000/#/user/info，得到的是 /user/info
  getCurrentLocation () {
    return getHash()
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

// 保证 hash 是 /# 开头
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

export function getHash (): string {
  // 因为兼容性问题 这里没有直接使用 window.location.hash
  // 因为 Firefox decode hash 值
  let href = window.location.href
  const index = href.indexOf('#')
  // empty path
  if (index < 0) return ''

  href = href.slice(index + 1)
  // decode the hash but not the search or hash
  // as search(query) is already decoded
  // https://github.com/vuejs/vue-router/issues/2708
  const searchIndex = href.indexOf('?')
  if (searchIndex < 0) {
    const hashIndex = href.indexOf('#')
    if (hashIndex > -1) {
      href = decodeURI(href.slice(0, hashIndex)) + href.slice(hashIndex)
    } else href = decodeURI(href)
  } else {
    href = decodeURI(href.slice(0, searchIndex)) + href.slice(searchIndex)
  }

  return href
}

function getUrl (path) {
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href
  return `${base}#${path}`
}

// location.hash
function pushHash (path) {
  // 如果支持 pushState，使用 pushState
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    // 不支持，替换 hash
    window.location.hash = path
  }
}

function replaceHash (path) {
  if (supportsPushState) {
    replaceState(getUrl(path))
  } else {
    window.location.replace(getUrl(path))
  }
}
